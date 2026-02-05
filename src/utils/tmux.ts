import { execFileSync } from 'node:child_process';

export interface TmuxPane {
  tty: string;
  target: string; // session_name:window_index.pane_index
}

export interface TmuxPaneDetails extends TmuxPane {
  paneId: string;
  cwd: string;
  command: string;
  lastActive: number;
  active: boolean;
}

// TTL cache for tmux data to reduce subprocess overhead
const TMUX_CACHE_TTL_MS = 1000;
let panesCache: { panes: TmuxPane[]; attachedSessions: string[]; updatedAt: number } | null = null;
let panesDetailsCache: { panes: TmuxPaneDetails[]; updatedAt: number } | null = null;

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
 * List all tmux panes with detailed info (raw, no caching)
 */
function listTmuxPanesDetailsRaw(): TmuxPaneDetails[] {
  try {
    const output = execFileSync(
      'tmux',
      [
        'list-panes',
        '-a',
        '-F',
        '#{pane_id}\t#{pane_tty}\t#{session_name}:#{window_index}.#{pane_index}\t#{pane_current_path}\t#{pane_pid}\t#{pane_current_command}\t#{pane_last_active}\t#{pane_active}',
      ],
      {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    const raw = output
      .trim()
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => {
        const [
          paneId = '',
          tty = '',
          target = '',
          cwd = '',
          pid = '0',
          command = '',
          lastActive = '0',
          active = '0',
        ] = line.split('\t');
        return {
          paneId,
          tty,
          target,
          cwd,
          pid: Number(pid) || 0,
          command,
          lastActive: Number(lastActive) || 0,
          active: active === '1',
        };
      });

    const candidatePids = raw
      .filter((pane) => GENERIC_PANE_COMMANDS.has(pane.command))
      .map((pane) => pane.pid)
      .filter((pid) => pid > 0);
    const childArgsByPpid = buildChildArgsByPpid(candidatePids);

    return raw.map((pane) => ({
      paneId: pane.paneId,
      tty: pane.tty,
      target: pane.target,
      cwd: pane.cwd,
      command: inferPaneCommand(pane.command, pane.pid, childArgsByPpid),
      lastActive: pane.lastActive,
      active: pane.active,
    }));
  } catch {
    return [];
  }
}

const GENERIC_PANE_COMMANDS = new Set(['bash', 'zsh', 'fish', 'sh', 'node']);
const CODEX_ARG_PATTERN = /\/codex(\s|$)/i;

function buildChildArgsByPpid(pids: number[]): Map<number, string[]> {
  const result = new Map<number, string[]>();
  if (pids.length === 0) return result;

  try {
    const output = execFileSync('ps', ['-o', 'pid=,ppid=,args=', '--ppid', pids.join(',')], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    output
      .trim()
      .split('\n')
      .filter((line) => line.trim().length > 0)
      .forEach((line) => {
        const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
        if (!match) return;
        const ppid = Number(match[2]) || 0;
        const args = match[3] ?? '';
        if (!ppid) return;
        const existing = result.get(ppid);
        if (existing) {
          existing.push(args);
        } else {
          result.set(ppid, [args]);
        }
      });
  } catch {
    return result;
  }

  return result;
}

function inferPaneCommand(
  baseCommand: string,
  panePid: number,
  childArgsByPpid: Map<number, string[]>
): string {
  if (!GENERIC_PANE_COMMANDS.has(baseCommand)) return baseCommand;
  if (!panePid) return baseCommand;

  const argsList = childArgsByPpid.get(panePid);
  if (!argsList || argsList.length === 0) return baseCommand;

  if (argsList.some((args) => CODEX_ARG_PATTERN.test(args))) {
    return 'codex';
  }

  return baseCommand;
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
 * Get cached tmux pane details
 */
function getCachedPaneDetails(): TmuxPaneDetails[] {
  const now = Date.now();
  if (panesDetailsCache && now - panesDetailsCache.updatedAt < TMUX_CACHE_TTL_MS) {
    return panesDetailsCache.panes;
  }
  const panes = listTmuxPanesDetailsRaw();
  panesDetailsCache = { panes, updatedAt: now };
  return panes;
}

/**
 * List all tmux panes with their TTYs (cached)
 */
export function listTmuxPanes(): TmuxPane[] {
  return getCachedPanes().panes;
}

/**
 * List all tmux panes with detailed info (cached)
 */
export function listTmuxPanesDetails(): TmuxPaneDetails[] {
  return getCachedPaneDetails();
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
  panesDetailsCache = null;
}

/**
 * Find tmux pane by TTY, prioritizing attached sessions.
 * Use this when switching focus - it prefers panes in attached sessions
 * to avoid switching to detached sessions unexpectedly.
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
 * Find tmux pane by TTY (simple version without session priority).
 * Use this when sending keys/text - session priority doesn't matter
 * since we're targeting a specific pane directly.
 */
export function findPaneByTtySimple(tty: string): TmuxPane | undefined {
  const panes = listTmuxPanes();
  return panes.find((pane) => pane.tty === tty);
}

function normalizePath(path: string): string {
  if (!path) return '';
  return path.replace(/\/+$/, '');
}

function matchesCwd(paneCwd: string, targetCwd: string): boolean {
  const pane = normalizePath(paneCwd);
  const target = normalizePath(targetCwd);
  if (!pane || !target) return false;
  if (pane === target) return true;
  if (pane.startsWith(`${target}/`)) return true;
  if (target.startsWith(`${pane}/`)) return true;
  return false;
}

function sortPanesByActivity(
  a: TmuxPaneDetails,
  b: TmuxPaneDetails,
  targetTimeMs?: number
): number {
  if (a.active !== b.active) {
    return a.active ? -1 : 1;
  }
  if (targetTimeMs !== undefined) {
    const aDelta = Math.abs(targetTimeMs - a.lastActive * 1000);
    const bDelta = Math.abs(targetTimeMs - b.lastActive * 1000);
    if (aDelta !== bDelta) {
      return aDelta - bDelta;
    }
  }
  return b.lastActive - a.lastActive;
}

/**
 * Find tmux pane by cwd, optionally preferring command matches.
 * Prioritizes panes in attached sessions and most recently active panes.
 */
export function findPaneByCwd(
  cwd: string,
  preferCommand?: RegExp,
  targetTimeMs?: number
): TmuxPaneDetails | undefined {
  const panes = listTmuxPanesDetails();
  if (panes.length === 0) return undefined;

  let candidates = panes.filter((pane) => matchesCwd(pane.cwd, cwd));
  if (candidates.length === 0) return undefined;

  if (preferCommand) {
    const commandMatches = candidates.filter((pane) => preferCommand.test(pane.command));
    if (commandMatches.length > 0) {
      candidates = commandMatches;
    }
  }

  const attachedSessions = getAttachedSessions();
  const attachedCandidates = candidates.filter((pane) =>
    attachedSessions.some((session) => pane.target.startsWith(`${session}:`))
  );

  const ranked = (attachedCandidates.length > 0 ? attachedCandidates : candidates).sort((a, b) =>
    sortPanesByActivity(a, b, targetTimeMs)
  );

  return ranked[0];
}
