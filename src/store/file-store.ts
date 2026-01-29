import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { HookEvent, Session, StoreData } from '../types/index.js';
import { endPerf, startPerf } from '../utils/perf.js';
import { getSessionKey, removeOldSessionsOnSameTty } from '../utils/session-key.js';
import { determineStatus } from '../utils/session-status.js';
import { parseISOTimestamp } from '../utils/time.js';
import { buildTranscriptPath, getLastAssistantMessage } from '../utils/transcript.js';
import { getSessionTimeoutMs } from './config.js';
import { getFieldUpdates } from './event-handlers.js';
import { checkSessionsForCleanup } from './session-cleanup.js';
import { syncTranscripts } from './transcript-sync.js';
import { getCachedStore, initWriteCache, scheduleWrite } from './write-cache.js';

// Re-export for backward compatibility
export { getSessionKey, removeOldSessionsOnSameTty } from '../utils/session-key.js';
export { determineStatus } from '../utils/session-status.js';
export { isTtyAliveAsync } from '../utils/tty.js';
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
  if (event.tty) {
    removeOldSessionsOnSameTty(store.sessions, event.session_id, event.tty);
  }

  const existing = store.sessions[key];

  // Get field updates based on event type
  const updates = getFieldUpdates(event, {
    last_prompt: existing?.last_prompt,
    current_tool: existing?.current_tool,
    notification_type: existing?.notification_type,
  });

  // Get last assistant message from transcript
  let lastMessage = existing?.lastMessage;
  const initialCwd = existing?.initial_cwd ?? event.cwd;
  const transcriptPath = buildTranscriptPath(initialCwd, event.session_id);
  const message = getLastAssistantMessage(transcriptPath);
  if (message) {
    lastMessage = message;
  }

  const session: Session = {
    session_id: event.session_id,
    cwd: event.cwd,
    initial_cwd: existing?.initial_cwd ?? event.cwd,
    tty: event.tty ?? existing?.tty,
    status: determineStatus(event, existing?.status),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    last_prompt: updates.lastPrompt,
    current_tool: updates.currentTool,
    notification_type: updates.notificationType,
    lastMessage,
  };

  store.sessions[key] = session;
  writeStore(store);

  return session;
}

export async function getSessions(): Promise<Session[]> {
  const span = startPerf('getSessions');
  const store = readStore();
  const timeoutMs = getSessionTimeoutMs();
  const entries = Object.entries(store.sessions);

  // Check sessions for cleanup
  const cleanupResults = await checkSessionsForCleanup(store, timeoutMs);

  let hasChanges = false;
  let removedCount = 0;
  for (const { key, session, shouldRemove, reason, elapsed } of cleanupResults) {
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

  // Sort sessions by creation time
  const result = Object.values(store.sessions).sort((a, b) => {
    const aTime = parseISOTimestamp(a.created_at) ?? 0;
    const bTime = parseISOTimestamp(b.created_at) ?? 0;
    return aTime - bTime;
  });

  // Sync lastMessage from transcripts
  if (syncTranscripts(result, store)) {
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

/**
 * Update session with summary
 */
export function updateSessionSummary(
  sessionId: string,
  tty: string | undefined,
  summary: string
): void {
  const store = readStore();
  const key = getSessionKey(sessionId, tty);
  const session = store.sessions[key];

  if (session) {
    session.summary = summary;
    session.updated_at = new Date().toISOString();
    store.sessions[key] = session;
    writeStore(store);
  }
}
