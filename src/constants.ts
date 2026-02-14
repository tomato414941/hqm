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

/** Periodic refresh interval for timeout detection in milliseconds (15 seconds) */
export const SESSION_REFRESH_INTERVAL_MS = 15_000;

/** Hook event types supported by Claude Code */
export const HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'SessionEnd',
] as const;

export type HookEventName = (typeof HOOK_EVENTS)[number];

/** Minimum terminal height to display QR code */
export const MIN_HEIGHT_FOR_QR = 30;

/** Minimum terminal width to display QR code */
export const MIN_WIDTH_FOR_QR = 80;

/** Minimum width to keep the main panel readable */
export const MIN_MAIN_PANEL_WIDTH = 60;

/** QR panel layout constants (keep in sync with Dashboard) */
export const QR_PANEL_MARGIN_LEFT = 2;
export const QR_PANEL_PADDING_X = 1;
export const QR_PANEL_BORDER_WIDTH = 2;
export const QR_PANEL_BORDER_HEIGHT = 2;
export const QR_PANEL_HEADER_HEIGHT = 1;
export const QR_PANEL_MARGIN_TOP = 1;

/** Quick select keys for session navigation (1-9) */
export const QUICK_SELECT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Height of each session card in rows */
export const SESSION_CARD_HEIGHT = 3;

/** Timeout for pending project assignment in milliseconds (30 seconds) */
export const PENDING_ASSIGNMENT_TIMEOUT_MS = 30_000;

/** Maximum number of visible sessions in the dashboard */
export const MAX_VISIBLE_SESSIONS = 9;

/** Maximum text length for send-text feature */
export const MAX_SEND_TEXT_LENGTH = 10_000;

/** Session registry cache TTL in milliseconds (30 seconds) */
export const SESSION_REGISTRY_CACHE_TTL_MS = 30_000;

/** Codex idle threshold in milliseconds (30 seconds without transcript activity) */
export const CODEX_IDLE_THRESHOLD_MS = 30_000;

/** Unix domain socket filename for daemon IPC */
export const DAEMON_SOCKET_FILENAME = 'hqm.sock';
