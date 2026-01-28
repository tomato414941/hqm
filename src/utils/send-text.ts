import { execFileSync } from 'node:child_process';
import { isLinux, isTmuxAvailable, isValidTtyPath } from './focus.js';
import { findPaneByTtySimple } from './tmux.js';

const MAX_TEXT_LENGTH = 10000;

export function validateTextInput(text: string): { valid: boolean; error?: string } {
  if (!text || text.trim().length === 0) {
    return { valid: false, error: 'Text cannot be empty' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` };
  }

  return { valid: true };
}

function sendKeysToTmux(target: string, keys: string): boolean {
  try {
    execFileSync('tmux', ['send-keys', '-t', target, keys], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

function sendLiteralToTmux(target: string, text: string): boolean {
  try {
    execFileSync('tmux', ['send-keys', '-t', target, '-l', text], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Send text to a terminal session and execute it (press Enter).
 * Uses tmux send-keys for Linux.
 */
export function sendTextToTerminal(
  tty: string,
  text: string
): { success: boolean; error?: string } {
  if (!isLinux()) {
    return { success: false, error: 'This feature is only available on Linux' };
  }

  if (!isValidTtyPath(tty)) {
    return { success: false, error: 'Invalid TTY path' };
  }

  if (!isTmuxAvailable()) {
    return { success: false, error: 'tmux is required for this feature' };
  }

  const validation = validateTextInput(text);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const pane = findPaneByTtySimple(tty);
  if (!pane) {
    return { success: false, error: 'Could not find tmux pane for TTY' };
  }

  // Send text literally (without interpreting special characters)
  if (!sendLiteralToTmux(pane.target, text)) {
    return { success: false, error: 'Failed to send text to terminal' };
  }

  // Send Enter key
  if (!sendKeysToTmux(pane.target, 'Enter')) {
    return { success: false, error: 'Failed to send Enter key' };
  }

  return { success: true };
}

const ALLOWED_KEYS = new Set([
  'y',
  'n',
  'a',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'escape',
]);

/**
 * Send a single keystroke to a terminal session.
 * Used for responding to permission prompts (y/n/a), Ctrl+C to abort, or Escape to cancel.
 */
export function sendKeystrokeToTerminal(
  tty: string,
  key: string,
  useControl = false
): { success: boolean; error?: string } {
  if (!isLinux()) {
    return { success: false, error: 'This feature is only available on Linux' };
  }

  if (!isValidTtyPath(tty)) {
    return { success: false, error: 'Invalid TTY path' };
  }

  if (!isTmuxAvailable()) {
    return { success: false, error: 'tmux is required for this feature' };
  }

  const lowerKey = key.toLowerCase();
  const isEscapeKey = lowerKey === 'escape';

  if (!isEscapeKey && (!key || key.length !== 1)) {
    return { success: false, error: 'Key must be a single character or "escape"' };
  }

  if (!useControl && !ALLOWED_KEYS.has(lowerKey)) {
    return { success: false, error: 'Invalid key. Allowed: y, n, a, 1-9, escape' };
  }

  if (useControl && lowerKey !== 'c') {
    return { success: false, error: 'Only Ctrl+C is supported' };
  }

  const pane = findPaneByTtySimple(tty);
  if (!pane) {
    return { success: false, error: 'Could not find tmux pane for TTY' };
  }

  let tmuxKey: string;
  if (useControl) {
    tmuxKey = 'C-c';
  } else if (isEscapeKey) {
    tmuxKey = 'Escape';
  } else {
    tmuxKey = key;
  }

  if (!sendKeysToTmux(pane.target, tmuxKey)) {
    return { success: false, error: 'Failed to send keystroke to terminal' };
  }

  return { success: true };
}
