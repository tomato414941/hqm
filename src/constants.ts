/**
 * Shared constants for hqm
 */

/** Package name used for npx commands */
export const PACKAGE_NAME = 'hqm';

/** Default session timeout in milliseconds (0 = no timeout) */
export const DEFAULT_SESSION_TIMEOUT_MS = 0;

/** TTY cache TTL in milliseconds (30 seconds) */
export const TTY_CACHE_TTL_MS = 30_000;

/** Maximum number of entries in TTY cache */
export const MAX_TTY_CACHE_SIZE = 100;

/** Debounce delay for useSessions updates in milliseconds */
export const SESSION_UPDATE_DEBOUNCE_MS = 250;

/** Debounce delay for JSON file writes in milliseconds */
export const WRITE_DEBOUNCE_MS = 100;

/** Periodic refresh interval for timeout detection in milliseconds (60 seconds) */
export const SESSION_REFRESH_INTERVAL_MS = 60_000;

/** Hook event types supported by Claude Code */
export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];

/** Minimum terminal height to display QR code */
export const MIN_HEIGHT_FOR_QR = 30;

/** Minimum terminal width to display QR code */
export const MIN_WIDTH_FOR_QR = 80;

/** Quick select keys for session navigation (1-9) */
export const QUICK_SELECT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Height of each session card in rows */
export const SESSION_CARD_HEIGHT = 3;
