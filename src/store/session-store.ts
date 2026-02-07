import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isCodexSessionId } from '../codex/paths.js';
import type { HookEvent, Session, StoreData } from '../types/index.js';
import { endPerf, startPerf } from '../utils/perf.js';
import { getSessionKey } from '../utils/session-key.js';
import { determineStatus } from '../utils/session-status.js';
import { parseISOTimestamp } from '../utils/time.js';
import { getSessionTimeoutMs } from './config.js';
import {
  addSessionToDisplayOrder,
  assignSessionToProject,
  getSessionProjectFromStore,
  removeSessionFromDisplayOrder,
} from './display-order.js';
import { getFieldUpdates } from './event-handlers.js';
import { checkSessionsForCleanup } from './session-cleanup.js';

const STORE_DIR = join(homedir(), '.hqm');
const LOG_FILE = join(STORE_DIR, 'deletion.log');

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

/**
 * Remove other sessions on the same TTY (they are stale)
 * Returns the project ID of the first removed session for inheritance
 */
function removeOtherSessionsOnSameTty(
  store: StoreData,
  currentSessionId: string,
  tty: string | undefined
): string | undefined {
  if (!tty) return undefined;
  let inheritedProjectId: string | undefined;

  for (const [key, session] of Object.entries(store.sessions)) {
    if (session.session_id !== currentSessionId && session.tty === tty) {
      if (!inheritedProjectId) {
        inheritedProjectId = getSessionProjectFromStore(store, key);
      }
      delete store.sessions[key];
      removeSessionFromDisplayOrder(store, key);
    }
  }
  return inheritedProjectId;
}

/**
 * Update or create a session from a hook event
 */
export function updateSessionInStore(
  store: StoreData,
  event: HookEvent,
  writeStore: (data: StoreData) => void
): Session {
  const key = getSessionKey(event.session_id);
  const now = new Date().toISOString();

  const existing = store.sessions[key];

  // When a new session starts on a TTY, remove stale sessions on that TTY
  // and inherit their project assignment
  let inheritedProjectId: string | undefined;
  if (!existing && event.tty) {
    inheritedProjectId = removeOtherSessionsOnSameTty(store, event.session_id, event.tty);
  }

  // Get field updates based on event type
  const updates = getFieldUpdates(event, {
    last_prompt: existing?.last_prompt,
    current_tool: existing?.current_tool,
    notification_type: existing?.notification_type,
  });

  const session: Session = {
    session_id: event.session_id,
    cwd: event.cwd,
    initial_cwd: existing?.initial_cwd ?? event.cwd,
    tty: event.tty ?? existing?.tty,
    agent: existing?.agent ?? (isCodexSessionId(event.session_id) ? 'codex' : 'claude'),
    source: existing?.source,
    tmux_target: existing?.tmux_target,
    tmux_pane_id: existing?.tmux_pane_id,
    status: determineStatus(event, existing?.status),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    last_prompt: updates.lastPrompt,
    current_tool: updates.currentTool,
    notification_type: updates.notificationType,
    lastMessage: existing?.lastMessage,
  };

  store.sessions[key] = session;

  // Add new session to displayOrder (after ungrouped project, at the end)
  if (!existing) {
    addSessionToDisplayOrder(store, key);
    // Inherit project from previous session on the same TTY
    if (inheritedProjectId) {
      assignSessionToProject(store, key, inheritedProjectId);
    }
  }

  writeStore(store);

  return session;
}

/**
 * Get all sessions from the store sorted by displayOrder (pure read, no side effects)
 */
export function getSessionsFromStore(store: StoreData): Session[] {
  const span = startPerf('getSessions');
  const entries = Object.entries(store.sessions);

  // Sort sessions by displayOrder
  const displayOrder = store.displayOrder || [];
  const sessionKeyOrder = new Map<string, number>();
  let orderIndex = 0;
  for (const item of displayOrder) {
    if (item.type === 'session') {
      sessionKeyOrder.set(item.key, orderIndex++);
    }
  }

  const result = entries
    .map(([key, session]) => ({ key, session }))
    .sort((a, b) => {
      const aOrder = sessionKeyOrder.get(a.key) ?? Number.MAX_SAFE_INTEGER;
      const bOrder = sessionKeyOrder.get(b.key) ?? Number.MAX_SAFE_INTEGER;
      if (aOrder !== bOrder) {
        return aOrder - bOrder;
      }
      // Fallback: by creation time
      const aTime = parseISOTimestamp(a.session.created_at) ?? 0;
      const bTime = parseISOTimestamp(b.session.created_at) ?? 0;
      return aTime - bTime;
    })
    .map(({ session }) => session);

  endPerf(span, {
    session_count: entries.length,
    remaining_count: result.length,
  });
  return result;
}

/**
 * Cleanup stale sessions (TTY closed or timeout) — extracted from getSessionsFromStore
 */
export async function cleanupStaleSessionsInStore(
  store: StoreData,
  writeStore: (data: StoreData) => void
): Promise<void> {
  const timeoutMs = getSessionTimeoutMs();
  const cleanupResults = await checkSessionsForCleanup(store, timeoutMs);

  let hasChanges = false;
  for (const { key, session, shouldRemove, reason, elapsed } of cleanupResults) {
    if (shouldRemove) {
      if (reason === 'tty_closed') {
        logDeletion(session, 'tty_closed', { tty: session.tty });
      } else if (reason === 'timeout') {
        logDeletion(session, 'timeout', { elapsed });
      }
      delete store.sessions[key];
      removeSessionFromDisplayOrder(store, key);
      hasChanges = true;
    }
  }

  if (hasChanges) {
    writeStore(store);
  }
}

/**
 * Get a single session by ID
 */
export function getSessionFromStore(store: StoreData, sessionId: string): Session | undefined {
  const key = getSessionKey(sessionId);
  return store.sessions[key];
}

/**
 * Remove a session from the store
 */
export function removeSessionFromStore(
  store: StoreData,
  sessionId: string,
  writeStore: (data: StoreData) => void
): void {
  const key = getSessionKey(sessionId);
  delete store.sessions[key];
  removeSessionFromDisplayOrder(store, key);
  writeStore(store);
}

/**
 * Clear all sessions from the store
 */
export function clearSessionsFromStore(
  store: StoreData,
  writeStore: (data: StoreData) => void
): void {
  store.sessions = {};
  // Keep only projects in displayOrder
  if (store.displayOrder) {
    store.displayOrder = store.displayOrder.filter((item) => item.type === 'project');
  }
  store.updated_at = new Date().toISOString();
  writeStore(store);
}

/**
 * Update session with latest assistant message
 * Note: Searches by session_id only, ignoring TTY.
 */
export function updateSessionLastMessageInStore(
  store: StoreData,
  sessionId: string,
  message: string,
  writeStore: (data: StoreData) => void,
  updatedAt?: string
): void {
  const entry = Object.entries(store.sessions).find(
    ([, session]) => session.session_id === sessionId
  );

  if (entry) {
    const [key, session] = entry;
    if (session.lastMessage === message) return;
    session.lastMessage = message;
    session.updated_at = updatedAt ?? new Date().toISOString();
    store.sessions[key] = session;
    writeStore(store);
  }
}
