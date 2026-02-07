import type { Session, StoreData } from '../types/index.js';
import { logger } from '../utils/logger.js';
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
      // tmux sessions are managed by syncTmuxSessionsOnce (removed when pane disappears)
      if (session.source === 'tmux') {
        return { key, session, shouldRemove: false, reason: null };
      }

      const lastUpdateMs = parseISOTimestamp(session.updated_at);

      // Skip sessions with invalid timestamps (don't delete them)
      if (lastUpdateMs === null) {
        logger.warn('Invalid timestamp for session', {
          session_id: session.session_id,
          updated_at: session.updated_at,
        });
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
