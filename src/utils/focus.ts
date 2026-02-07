import { execFileSync } from 'node:child_process';
import type { Session } from '../types/index.js';
import { findPaneByTty } from './tmux.js';

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
 * Focus a session by context: tmux_target (Codex N-key) or TTY (Claude Code).
 */
export function focusSessionByContext(session: Session): boolean {
  if (session.tmux_target) {
    if (!isLinux()) return false;
    if (!isTmuxAvailable()) return false;
    if (focusTmuxPane(session.tmux_target)) {
      return true;
    }
  }

  if (session.tty && focusSession(session.tty)) {
    return true;
  }

  return false;
}

/**
 * Get list of supported terminal environments
 */
export function getSupportedTerminals(): string[] {
  return ['tmux'];
}

export interface NewSessionInfo {
  tty: string;
  tmuxTarget: string;
  paneId: string;
}

/**
 * Create a new tmux window and launch Claude Code or Codex
 * @returns TTY, tmux target, and pane ID of the new window, or null if failed
 */
export function createNewSession(command: 'claude' | 'codex' = 'claude'): NewSessionInfo | null {
  if (!isLinux()) return null;
  if (!isTmuxAvailable()) return null;
  if (!isInsideTmux()) return null;

  try {
    const targetSession = process.env.HQM_TMUX_SESSION;

    // -P -F でウィンドウターゲットを取得
    const newWindowArgs = targetSession
      ? ['new-window', '-t', targetSession, '-P', '-F', '#{session_name}:#{window_index}', command]
      : ['new-window', '-P', '-F', '#{session_name}:#{window_index}', command];

    const newWindowTarget = execFileSync('tmux', newWindowArgs, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    // Get TTY, target, and pane ID in a single call
    const info = execFileSync(
      'tmux',
      [
        'display',
        '-t',
        newWindowTarget,
        '-p',
        '#{pane_tty}\t#{pane_id}\t#{session_name}:#{window_index}.#{pane_index}',
      ],
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();

    const [tty, paneId, tmuxTarget] = info.split('\t');

    // 新ウィンドウにフォーカスを移動
    execFileSync('tmux', ['switch-client', '-t', newWindowTarget], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (!tty || !paneId || !tmuxTarget) return null;

    return { tty, tmuxTarget, paneId };
  } catch {
    return null;
  }
}
