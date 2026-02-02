/**
 * Generate a unique key for a session
 * Uses session_id only (TTY is stored as an attribute for focus functionality)
 */
export function getSessionKey(sessionId: string): string {
  return sessionId;
}
