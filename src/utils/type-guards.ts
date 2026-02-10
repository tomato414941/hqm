import type { HookEventName } from '../constants.js';
import type { StoreData } from '../types/index.js';

/**
 * Check if a value is a non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Check if a value is a valid object (not null, not array)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Allowed hook event names (whitelist)
 */
export const VALID_HOOK_EVENTS: ReadonlySet<string> = new Set<HookEventName>([
  'SessionStart',
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'UserPromptSubmit',
  'SessionEnd',
]);

/**
 * Check if a string is a valid hook event name
 */
export function isValidHookEventName(name: string): name is HookEventName {
  return VALID_HOOK_EVENTS.has(name);
}

/**
 * Check if data matches StoreData structure
 */
export function isValidStoreData(data: unknown): data is StoreData {
  if (!isObject(data)) return false;
  return (
    typeof data.sessions === 'object' &&
    data.sessions !== null &&
    typeof data.updated_at === 'string'
  );
}

/**
 * Check if a value is a valid hook payload
 */
export interface HookPayload {
  session_id: string;
  cwd?: string;
  notification_type?: string;
  prompt?: string;
  tool_name?: string;
}

export function isValidHookPayload(data: unknown): data is HookPayload {
  if (!isObject(data)) return false;
  if (!isNonEmptyString(data.session_id)) return false;

  const optionalStringFields = ['cwd', 'notification_type', 'prompt', 'tool_name'];
  for (const field of optionalStringFields) {
    if (data[field] !== undefined && typeof data[field] !== 'string') {
      return false;
    }
  }
  return true;
}
