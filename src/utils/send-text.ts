import { execFileSync } from 'node:child_process';
import { isLinux, isTmuxAvailable, isValidTtyPath } from './focus.js';

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

interface TmuxPane {
  tty: string;
  target: string;
}

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

function findPaneByTty(tty: string): TmuxPane | undefined {
  const panes = listTmuxPanes();
  return panes.find((pane) => pane.tty === tty);
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

  const pane = findPaneByTty(tty);
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

  const pane = findPaneByTty(tty);
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
