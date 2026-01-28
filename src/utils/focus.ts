import { execFileSync } from 'node:child_process';
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
