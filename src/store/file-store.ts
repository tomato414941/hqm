import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HookEvent, Session, StoreData } from '../types/index.js';
import { endPerf, startPerf } from '../utils/perf.js';
import { getSessionKey, removeOldSessionsOnSameTty } from '../utils/session-key.js';
import { determineStatus } from '../utils/session-status.js';
import { parseISOTimestamp } from '../utils/time.js';
import { buildTranscriptPath, getLastAssistantMessage } from '../utils/transcript.js';
import { isTtyAliveAsync } from '../utils/tty-cache.js';
import { getSessionTimeoutMs } from './config.js';
import { getCachedStore, initWriteCache, scheduleWrite } from './write-cache.js';

// Re-export for backward compatibility
export { getSessionKey, removeOldSessionsOnSameTty } from '../utils/session-key.js';
export { determineStatus } from '../utils/session-status.js';
export { isTtyAliveAsync } from '../utils/tty-cache.js';
export { flushPendingWrites, resetStoreCache } from './write-cache.js';

const STORE_DIR = join(homedir(), '.hqm');
const STORE_FILE = join(STORE_DIR, 'sessions.json');
const LOG_FILE = join(STORE_DIR, 'deletion.log');

// Initialize write cache with store paths
initWriteCache(STORE_DIR, STORE_FILE);

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function logDeletion(
  session: Session,
  reason: 'timeout' | 'tty_closed',
  details: Record<string, unknown>
): void {
  ensureStoreDir();
  const logEntry = {
    timestamp: new Date().toISOString(),
    session_id: session.session_id,
    cwd: session.cwd,
    tty: session.tty,
    reason,
    details,
    last_updated: session.updated_at,
  };
  const logLine = `${JSON.stringify(logEntry)}\n`;
  appendFileSync(LOG_FILE, logLine);
}

function getEmptyStoreData(): StoreData {
  return {
    sessions: {},
    updated_at: new Date().toISOString(),
  };
}

export function readStore(): StoreData {
  // Return cached data if available (for batched writes consistency)
  const cached = getCachedStore();
  if (cached) {
    return cached;
  }

  ensureStoreDir();
  if (!existsSync(STORE_FILE)) {
    return getEmptyStoreData();
  }
  try {
    const content = readFileSync(STORE_FILE, 'utf-8');
    return JSON.parse(content) as StoreData;
  } catch {
    return getEmptyStoreData();
  }
}

export function writeStore(data: StoreData): void {
  scheduleWrite(data);
}

export function updateSession(event: HookEvent): Session {
  const store = readStore();
  const key = getSessionKey(event.session_id, event.tty);
  const now = new Date().toISOString();

  // Remove old session if a different session exists on the same TTY
  // (e.g., when a new session starts after /clear)
  if (event.tty) {
    removeOldSessionsOnSameTty(store.sessions, event.session_id, event.tty);
  }

  const existing = store.sessions[key];

  // Determine new field values based on event type
  let lastPrompt = existing?.last_prompt;
  let currentTool = existing?.current_tool;
  let notificationType = existing?.notification_type;

  switch (event.hook_event_name) {
    case 'UserPromptSubmit':
      if (event.prompt) {
        lastPrompt = event.prompt;
      }
      // Clear notification when user submits new prompt
      notificationType = undefined;
      break;
    case 'PreToolUse':
      if (event.tool_name) {
        currentTool = event.tool_name;
      }
      break;
    case 'PostToolUse':
      currentTool = undefined;
      break;
    case 'Notification':
      if (event.notification_type) {
        notificationType = event.notification_type;
      }
      break;
    case 'Stop':
      currentTool = undefined;
      notificationType = undefined;
      break;
  }

  // Get last assistant message from transcript
  let lastMessage = existing?.lastMessage;
  if (event.transcript_path) {
    const message = getLastAssistantMessage(event.transcript_path);
    if (message) {
      lastMessage = message;
    }
  }

  const session: Session = {
    session_id: event.session_id,
    cwd: event.cwd,
    tty: event.tty ?? existing?.tty,
    status: determineStatus(event, existing?.status),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    last_prompt: lastPrompt,
    current_tool: currentTool,
    notification_type: notificationType,
    lastMessage,
  };

  store.sessions[key] = session;
  writeStore(store);

  return session;
}

export async function getSessions(): Promise<Session[]> {
  const span = startPerf('getSessions');
  const store = readStore();
  const now = Date.now();
  const timeoutMs = getSessionTimeoutMs();

  // 並列で TTY チェックを実行
  const entries = Object.entries(store.sessions);
  const ttyChecks = await Promise.all(
    entries.map(async ([key, session]) => {
      const lastUpdateMs = parseISOTimestamp(session.updated_at);

      // Skip sessions with invalid timestamps (don't delete them)
      if (lastUpdateMs === null) {
        return { key, session, shouldRemove: false, reason: null };
      }

      // Check timeout only if timeoutMs > 0 (0 means no timeout)
      const isSessionActive = timeoutMs === 0 || now - lastUpdateMs <= timeoutMs;
      const isTtyStillAlive = await isTtyAliveAsync(session.tty);

      const shouldRemove = !isSessionActive || !isTtyStillAlive;
      const reason = !isTtyStillAlive ? 'tty_closed' : !isSessionActive ? 'timeout' : null;

      return { key, session, shouldRemove, reason, elapsed: now - lastUpdateMs };
    })
  );

  let hasChanges = false;
  let removedCount = 0;
  for (const { key, session, shouldRemove, reason, elapsed } of ttyChecks) {
    if (shouldRemove) {
      removedCount += 1;
      if (reason === 'tty_closed') {
        logDeletion(session, 'tty_closed', { tty: session.tty });
      } else if (reason === 'timeout') {
        logDeletion(session, 'timeout', { elapsed });
      }
      delete store.sessions[key];
      hasChanges = true;
    }
  }

  if (hasChanges) {
    writeStore(store);
  }

  const result = Object.values(store.sessions).sort((a, b) => {
    const aTime = parseISOTimestamp(a.created_at) ?? 0;
    const bTime = parseISOTimestamp(b.created_at) ?? 0;
    return aTime - bTime;
  });

  // Update lastMessage from transcripts for active sessions
  let transcriptUpdated = false;
  for (const session of result) {
    if (session.status !== 'stopped') {
      const transcriptPath = buildTranscriptPath(session.cwd, session.session_id);
      const message = getLastAssistantMessage(transcriptPath);
      if (message && message !== session.lastMessage) {
        session.lastMessage = message;
        const key = getSessionKey(session.session_id, session.tty);
        store.sessions[key] = session;
        transcriptUpdated = true;
      }
    }
  }

  if (transcriptUpdated) {
    writeStore(store);
  }

  endPerf(span, {
    session_count: entries.length,
    removed_count: removedCount,
    remaining_count: result.length,
    timeout_ms: timeoutMs,
    tty_checks: entries.length,
  });
  return result;
}

export function getSession(sessionId: string, tty?: string): Session | undefined {
  const store = readStore();
  const key = getSessionKey(sessionId, tty);
  return store.sessions[key];
}

export function removeSession(sessionId: string, tty?: string): void {
  const store = readStore();
  const key = getSessionKey(sessionId, tty);
  delete store.sessions[key];
  writeStore(store);
}

export function clearSessions(): void {
  writeStore(getEmptyStoreData());
}

export function getStorePath(): string {
  return STORE_FILE;
}
