import { execFileSync } from 'node:child_process';

export interface TmuxPane {
  tty: string;
  target: string; // session_name:window_index.pane_index
}

// TTL cache for tmux data to reduce subprocess overhead
const TMUX_CACHE_TTL_MS = 1000;
let panesCache: { panes: TmuxPane[]; attachedSessions: string[]; updatedAt: number } | null = null;

/**
 * List all tmux panes with their TTYs (raw, no caching)
 */
function listTmuxPanesRaw(): TmuxPane[] {
  try {
    const output = execFileSync(
      'tmux',
      ['list-panes', '-a', '-F', '#{pane_tty} #{session_name}:#{window_index}.#{pane_index}'],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    return output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [tty, target] = line.split(' ');
        return { tty, target };
      });
  } catch {
    return [];
  }
}

/**
 * Get currently attached tmux session names (raw, no caching)
 */
function getAttachedSessionsRaw(): string[] {
  try {
    const output = execFileSync('tmux', ['list-clients', '-F', '#{client_session}'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Get cached tmux data (panes and attached sessions)
 */
function getCachedPanes(): { panes: TmuxPane[]; attachedSessions: string[] } {
  const now = Date.now();
  if (panesCache && now - panesCache.updatedAt < TMUX_CACHE_TTL_MS) {
    return panesCache;
  }
  const panes = listTmuxPanesRaw();
  const attachedSessions = getAttachedSessionsRaw();
  panesCache = { panes, attachedSessions, updatedAt: now };
  return panesCache;
}

/**
 * List all tmux panes with their TTYs (cached)
 */
export function listTmuxPanes(): TmuxPane[] {
  return getCachedPanes().panes;
}

/**
 * Get currently attached tmux session names (cached)
 */
export function getAttachedSessions(): string[] {
  return getCachedPanes().attachedSessions;
}

/**
 * Clear the tmux cache (useful for testing)
 */
export function clearTmuxCache(): void {
  panesCache = null;
}

/**
 * Find tmux pane by TTY, prioritizing attached sessions
 */
export function findPaneByTty(tty: string): TmuxPane | undefined {
  const { panes, attachedSessions } = getCachedPanes();

  // First, look for a pane in an attached session
  const attachedPane = panes.find(
    (pane) =>
      pane.tty === tty && attachedSessions.some((session) => pane.target.startsWith(`${session}:`))
  );
  if (attachedPane) return attachedPane;

  // Fall back to the first match (original behavior)
  return panes.find((pane) => pane.tty === tty);
}

/**
 * Find tmux pane by TTY (simple version without session priority)
 */
export function findPaneByTtySimple(tty: string): TmuxPane | undefined {
  const panes = listTmuxPanes();
  return panes.find((pane) => pane.tty === tty);
}
