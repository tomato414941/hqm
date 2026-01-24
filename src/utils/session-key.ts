import type { Session } from '../types/index.js';

/**
 * Generate a unique key for a session
 * Uses sessionId:tty format if tty is available
 */
export function getSessionKey(sessionId: string, tty?: string): string {
  return tty ? `${sessionId}:${tty}` : sessionId;
}

/**
 * Remove old sessions on the same TTY
 * Called when a new session starts to clean up stale sessions
 */
export function removeOldSessionsOnSameTty(
  sessions: Record<string, Session>,
  newSessionId: string,
  tty: string
): void {
  for (const [key, session] of Object.entries(sessions)) {
    if (session.tty === tty && session.session_id !== newSessionId) {
      delete sessions[key];
    }
  }
}
