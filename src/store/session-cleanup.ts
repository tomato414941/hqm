import type { Session, StoreData } from '../types/index.js';
import { parseISOTimestamp } from '../utils/time.js';
import { isTtyAliveAsync } from '../utils/tty.js';

export interface CleanupResult {
  key: string;
  session: Session;
  shouldRemove: boolean;
  reason: 'timeout' | 'tty_closed' | null;
  elapsed?: number;
}

/**
 * Check sessions for cleanup (TTY closed or timeout)
 */
export async function checkSessionsForCleanup(
  store: StoreData,
  timeoutMs: number
): Promise<CleanupResult[]> {
  const now = Date.now();
  const entries = Object.entries(store.sessions);

  return Promise.all(
    entries.map(async ([key, session]): Promise<CleanupResult> => {
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
      const elapsed = now - lastUpdateMs;

      return { key, session, shouldRemove, reason, elapsed };
    })
  );
}
