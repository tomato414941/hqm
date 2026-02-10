import { describe, expect, it } from 'vitest';
import {
  applyHooksToSettings,
  areAllHooksConfigured,
  categorizeHooks,
  createHookEntry,
  hasHqmHookForEvent,
} from '../src/setup/hooks.js';
import type { HookEntry, Settings } from '../src/setup/settings.js';

describe('hooks', () => {
  describe('hasHqmHookForEvent', () => {
    it('should return false when entries is undefined', () => {
      expect(hasHqmHookForEvent(undefined, 'UserPromptSubmit')).toBe(false);
    });

    it('should return false when entries is empty', () => {
      expect(hasHqmHookForEvent([], 'UserPromptSubmit')).toBe(false);
    });

    it('should return true when hqm hook exists', () => {
      const entries: HookEntry[] = [
        {
          hooks: [{ type: 'command', command: 'hqm hook UserPromptSubmit' }],
        },
      ];
      expect(hasHqmHookForEvent(entries, 'UserPromptSubmit')).toBe(true);
    });

    it('should return true when npx hqm hook exists', () => {
      const entries: HookEntry[] = [
        {
          hooks: [{ type: 'command', command: 'npx hqm hook UserPromptSubmit' }],
        },
      ];
      expect(hasHqmHookForEvent(entries, 'UserPromptSubmit')).toBe(true);
    });

    it('should return false for other hooks', () => {
      const entries: HookEntry[] = [
        {
          hooks: [{ type: 'command', command: 'echo hello' }],
        },
      ];
      expect(hasHqmHookForEvent(entries, 'UserPromptSubmit')).toBe(false);
    });

    it('should return false when event name does not match', () => {
      const entries: HookEntry[] = [
        {
          hooks: [{ type: 'command', command: 'hqm hook PreToolUse' }],
        },
      ];
      expect(hasHqmHookForEvent(entries, 'UserPromptSubmit')).toBe(false);
    });

    it('should return true when hqm hook is among multiple hooks', () => {
      const entries: HookEntry[] = [
        {
          hooks: [
            { type: 'command', command: 'echo before' },
            { type: 'command', command: 'hqm hook Stop' },
            { type: 'command', command: 'echo after' },
          ],
        },
      ];
      expect(hasHqmHookForEvent(entries, 'Stop')).toBe(true);
    });

    it('should return true when hqm hook is in one of multiple entries', () => {
      const entries: HookEntry[] = [
        {
          hooks: [{ type: 'command', command: 'echo first' }],
        },
        {
          hooks: [{ type: 'command', command: 'hqm hook Notification' }],
        },
      ];
      expect(hasHqmHookForEvent(entries, 'Notification')).toBe(true);
    });
  });

  describe('createHookEntry', () => {
    it('should create entry with matcher for SessionStart', () => {
      const entry = createHookEntry('SessionStart', 'hqm');
      expect(entry).toEqual({
        hooks: [{ type: 'command', command: 'hqm hook SessionStart' }],
        matcher: '',
      });
    });

    it('should create entry without matcher for UserPromptSubmit', () => {
      const entry = createHookEntry('UserPromptSubmit', 'hqm');
      expect(entry).toEqual({
        hooks: [{ type: 'command', command: 'hqm hook UserPromptSubmit' }],
      });
      expect(entry.matcher).toBeUndefined();
    });

    it('should create entry with matcher for PreToolUse', () => {
      const entry = createHookEntry('PreToolUse', 'hqm');
      expect(entry).toEqual({
        hooks: [{ type: 'command', command: 'hqm hook PreToolUse' }],
        matcher: '',
      });
    });

    it('should create entry with matcher for PostToolUse', () => {
      const entry = createHookEntry('PostToolUse', 'npx hqm');
      expect(entry).toEqual({
        hooks: [{ type: 'command', command: 'npx hqm hook PostToolUse' }],
        matcher: '',
      });
    });

    it('should create entry with matcher for Notification', () => {
      const entry = createHookEntry('Notification', 'hqm');
      expect(entry).toEqual({
        hooks: [{ type: 'command', command: 'hqm hook Notification' }],
        matcher: '',
      });
    });

    it('should create entry with matcher for Stop', () => {
      const entry = createHookEntry('Stop', 'hqm');
      expect(entry).toEqual({
        hooks: [{ type: 'command', command: 'hqm hook Stop' }],
        matcher: '',
      });
    });
  });

  describe('categorizeHooks', () => {
    it('should return all events as toAdd when settings has no hooks', () => {
      const settings: Settings = {};
      const result = categorizeHooks(settings);

      expect(result.toAdd).toEqual([
        'SessionStart',
        'UserPromptSubmit',
        'PreToolUse',
        'PostToolUse',
        'Notification',
        'Stop',
        'SessionEnd',
      ]);
      expect(result.toSkip).toEqual([]);
    });

    it('should return all events as toAdd when hooks object is empty', () => {
      const settings: Settings = { hooks: {} };
      const result = categorizeHooks(settings);

      expect(result.toAdd).toHaveLength(7);
      expect(result.toSkip).toHaveLength(0);
    });

    it('should categorize partially configured hooks correctly', () => {
      const settings: Settings = {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'hqm hook UserPromptSubmit' }],
            },
          ],
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook PreToolUse' }],
            },
          ],
        },
      };
      const result = categorizeHooks(settings);

      expect(result.toSkip).toContain('UserPromptSubmit');
      expect(result.toSkip).toContain('PreToolUse');
      expect(result.toAdd).toContain('PostToolUse');
      expect(result.toAdd).toContain('Notification');
      expect(result.toAdd).toContain('Stop');
    });

    it('should return all events as toSkip when fully configured', () => {
      const settings: Settings = {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook SessionStart' }],
            },
          ],
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'hqm hook UserPromptSubmit' }],
            },
          ],
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook PreToolUse' }],
            },
          ],
          PostToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook PostToolUse' }],
            },
          ],
          Notification: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook Notification' }],
            },
          ],
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook Stop' }],
            },
          ],
          SessionEnd: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook SessionEnd' }],
            },
          ],
        },
      };
      const result = categorizeHooks(settings);

      expect(result.toAdd).toHaveLength(0);
      expect(result.toSkip).toHaveLength(7);
    });
  });

  describe('applyHooksToSettings', () => {
    it('should initialize hooks object if undefined', () => {
      const settings: Settings = {};
      applyHooksToSettings(settings, ['UserPromptSubmit'], 'hqm');

      expect(settings.hooks).toBeDefined();
      expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
    });

    it('should add hooks to empty settings', () => {
      const settings: Settings = { hooks: {} };
      applyHooksToSettings(settings, ['UserPromptSubmit', 'Stop'], 'hqm');

      expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
      expect(settings.hooks?.Stop).toHaveLength(1);
    });

    it('should append to existing hooks', () => {
      const settings: Settings = {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'echo existing' }],
            },
          ],
        },
      };
      applyHooksToSettings(settings, ['UserPromptSubmit'], 'hqm');

      expect(settings.hooks?.UserPromptSubmit).toHaveLength(2);
      expect(settings.hooks?.UserPromptSubmit?.[0].hooks[0].command).toBe('echo existing');
      expect(settings.hooks?.UserPromptSubmit?.[1].hooks[0].command).toBe(
        'hqm hook UserPromptSubmit'
      );
    });

    it('should not modify existing hooks for events not in hooksToAdd', () => {
      const settings: Settings = {
        hooks: {
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'echo existing' }],
            },
          ],
        },
      };
      applyHooksToSettings(settings, ['UserPromptSubmit'], 'hqm');

      expect(settings.hooks?.PreToolUse).toHaveLength(1);
      expect(settings.hooks?.PreToolUse?.[0].hooks[0].command).toBe('echo existing');
      expect(settings.hooks?.UserPromptSubmit).toHaveLength(1);
    });

    it('should use correct base command', () => {
      const settings: Settings = {};
      applyHooksToSettings(settings, ['Stop'], 'npx hqm');

      expect(settings.hooks?.Stop?.[0].hooks[0].command).toBe('npx hqm hook Stop');
    });
  });

  describe('areAllHooksConfigured', () => {
    it('should return false when hooks is undefined', () => {
      const settings: Settings = {};
      expect(areAllHooksConfigured(settings)).toBe(false);
    });

    it('should return false when hooks is empty', () => {
      const settings: Settings = { hooks: {} };
      expect(areAllHooksConfigured(settings)).toBe(false);
    });

    it('should return false when some hooks are missing', () => {
      const settings: Settings = {
        hooks: {
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'hqm hook UserPromptSubmit' }],
            },
          ],
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook PreToolUse' }],
            },
          ],
        },
      };
      expect(areAllHooksConfigured(settings)).toBe(false);
    });

    it('should return true when all hooks are configured', () => {
      const settings: Settings = {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook SessionStart' }],
            },
          ],
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'hqm hook UserPromptSubmit' }],
            },
          ],
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook PreToolUse' }],
            },
          ],
          PostToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook PostToolUse' }],
            },
          ],
          Notification: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook Notification' }],
            },
          ],
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook Stop' }],
            },
          ],
          SessionEnd: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'hqm hook SessionEnd' }],
            },
          ],
        },
      };
      expect(areAllHooksConfigured(settings)).toBe(true);
    });

    it('should return true when using npx format', () => {
      const settings: Settings = {
        hooks: {
          SessionStart: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx hqm hook SessionStart' }],
            },
          ],
          UserPromptSubmit: [
            {
              hooks: [{ type: 'command', command: 'npx hqm hook UserPromptSubmit' }],
            },
          ],
          PreToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx hqm hook PreToolUse' }],
            },
          ],
          PostToolUse: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx hqm hook PostToolUse' }],
            },
          ],
          Notification: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx hqm hook Notification' }],
            },
          ],
          Stop: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx hqm hook Stop' }],
            },
          ],
          SessionEnd: [
            {
              matcher: '',
              hooks: [{ type: 'command', command: 'npx hqm hook SessionEnd' }],
            },
          ],
        },
      };
      expect(areAllHooksConfigured(settings)).toBe(true);
    });
  });
});
