import { HOOK_EVENTS, PACKAGE_NAME } from '../constants.js';
import type { HookEntry, Settings } from './settings.js';

/**
 * Check if a command string is a hqm hook command for the given event
 * @internal
 */
function isHqmHookCommand(command: string, eventName: string): boolean {
  return command === `hqm hook ${eventName}` || command === `npx ${PACKAGE_NAME} hook ${eventName}`;
}

/**
 * Check if the hqm hook is already configured for the given event
 * @internal
 */
export function hasHqmHookForEvent(entries: HookEntry[] | undefined, eventName: string): boolean {
  if (!entries) return false;
  return entries.some((entry) => entry.hooks.some((h) => isHqmHookCommand(h.command, eventName)));
}

/**
 * Create a hook entry for the given event
 * @internal
 */
export function createHookEntry(eventName: string, baseCommand: string): HookEntry {
  const entry: HookEntry = {
    hooks: [
      {
        type: 'command',
        command: `${baseCommand} hook ${eventName}`,
      },
    ],
  };
  // Events other than UserPromptSubmit require a matcher
  if (eventName !== 'UserPromptSubmit') {
    entry.matcher = '';
  }
  return entry;
}

/**
 * Determine which hooks need to be added or skipped
 * @internal
 */
export function categorizeHooks(settings: Settings): { toAdd: string[]; toSkip: string[] } {
  const toAdd: string[] = [];
  const toSkip: string[] = [];

  for (const eventName of HOOK_EVENTS) {
    if (hasHqmHookForEvent(settings.hooks?.[eventName], eventName)) {
      toSkip.push(eventName);
    } else {
      toAdd.push(eventName);
    }
  }

  return { toAdd, toSkip };
}

/**
 * Apply hooks to settings
 */
export function applyHooksToSettings(
  settings: Settings,
  hooksToAdd: string[],
  baseCommand: string
): void {
  if (!settings.hooks) {
    settings.hooks = {};
  }

  for (const eventName of hooksToAdd) {
    const existing = settings.hooks[eventName];
    if (!existing) {
      settings.hooks[eventName] = [createHookEntry(eventName, baseCommand)];
    } else {
      existing.push(createHookEntry(eventName, baseCommand));
    }
  }
}

/**
 * Check if all required hooks are configured
 */
export function areAllHooksConfigured(settings: Settings): boolean {
  if (!settings.hooks) {
    return false;
  }

  for (const eventName of HOOK_EVENTS) {
    if (!hasHqmHookForEvent(settings.hooks[eventName], eventName)) {
      return false;
    }
  }

  return true;
}
