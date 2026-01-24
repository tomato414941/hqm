import { execFileSync } from 'node:child_process';

/**
 * Validate TTY path format.
 * Only allows paths like /dev/pts/0, /dev/tty1, etc.
 * @internal
 */
export function isValidTtyPath(tty: string): boolean {
  return /^\/dev\/(pts\/\d+|tty\d+)$/.test(tty);
}

/**
 * Check if tmux is available
 * @internal
 */
export function isTmuxAvailable(): boolean {
  try {
    execFileSync('which', ['tmux'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we're inside a tmux session
 * @internal
 */
export function isInsideTmux(): boolean {
  return !!process.env.TMUX;
}

interface TmuxPane {
  tty: string;
  target: string; // session_name:window_index.pane_index
}

/**
 * List all tmux panes with their TTYs
 * @internal
 */
function listTmuxPanes(): TmuxPane[] {
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
 * Get currently attached tmux session names
 * @internal
 */
function getAttachedSessions(): string[] {
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
 * Find tmux pane by TTY, prioritizing attached sessions
 * @internal
 */
function findPaneByTty(tty: string): TmuxPane | undefined {
  const panes = listTmuxPanes();
  const attachedSessions = getAttachedSessions();

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
 * Focus a tmux pane by its target (session:window.pane)
 * Uses switch-client to support switching between different tmux sessions.
 * @internal
 */
function focusTmuxPane(target: string): boolean {
  try {
    // switch-client works for both same-session and cross-session switching
    execFileSync('tmux', ['switch-client', '-t', target], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Check if running on Linux
 */
export function isLinux(): boolean {
  return process.platform === 'linux';
}

/**
 * Focus a terminal session by its TTY using tmux
 * @param tty - The TTY path (e.g., /dev/pts/0)
 * @returns true if focus was successful, false otherwise
 */
export function focusSession(tty: string): boolean {
  if (!isLinux()) return false;
  if (!isValidTtyPath(tty)) return false;
  if (!isTmuxAvailable()) return false;

  const pane = findPaneByTty(tty);
  if (!pane) return false;

  return focusTmuxPane(pane.target);
}

/**
 * Get list of supported terminal environments
 */
export function getSupportedTerminals(): string[] {
  return ['tmux'];
}

/**
 * Create a new tmux window and launch Claude Code
 * @returns true if successful
 */
export function createNewSession(): boolean {
  if (!isLinux()) return false;
  if (!isTmuxAvailable()) return false;
  if (!isInsideTmux()) return false;

  try {
    const targetSession = process.env.HQM_TMUX_SESSION;

    // -P -F でウィンドウターゲットを取得
    const newWindowArgs = targetSession
      ? ['new-window', '-t', targetSession, '-P', '-F', '#{session_name}:#{window_index}', 'claude']
      : ['new-window', '-P', '-F', '#{session_name}:#{window_index}', 'claude'];

    const newWindowTarget = execFileSync('tmux', newWindowArgs, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // 新ウィンドウにフォーカスを移動
    execFileSync('tmux', ['switch-client', '-t', newWindowTarget], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    return true;
  } catch {
    return false;
  }
}
