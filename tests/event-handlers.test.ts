import { describe, expect, it } from 'vitest';
import { getFieldUpdates } from '../src/store/event-handlers.js';
import type { HookEvent } from '../src/types/index.js';

describe('event-handlers', () => {
  describe('getFieldUpdates', () => {
    describe('UserPromptSubmit', () => {
      it('should set last_prompt from event', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'UserPromptSubmit',
          prompt: 'Fix the bug',
        };

        const result = getFieldUpdates(event, {});

        expect(result.lastPrompt).toBe('Fix the bug');
      });

      it('should clear notification_type', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'UserPromptSubmit',
          prompt: 'Continue',
        };

        const result = getFieldUpdates(event, {
          notification_type: 'permission_prompt',
        });

        expect(result.notificationType).toBeUndefined();
      });

      it('should preserve current_tool', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'UserPromptSubmit',
          prompt: 'Test',
        };

        const result = getFieldUpdates(event, {
          current_tool: 'Read',
        });

        expect(result.currentTool).toBe('Read');
      });

      it('should preserve existing last_prompt if event has no prompt', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'UserPromptSubmit',
        };

        const result = getFieldUpdates(event, {
          last_prompt: 'Previous prompt',
        });

        expect(result.lastPrompt).toBe('Previous prompt');
      });
    });

    describe('PreToolUse', () => {
      it('should set current_tool from event', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse',
          tool_name: 'Bash',
        };

        const result = getFieldUpdates(event, {});

        expect(result.currentTool).toBe('Bash');
      });

      it('should preserve last_prompt and notification_type', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse',
          tool_name: 'Read',
        };

        const result = getFieldUpdates(event, {
          last_prompt: 'Existing prompt',
          notification_type: 'some_notification',
        });

        expect(result.lastPrompt).toBe('Existing prompt');
        expect(result.notificationType).toBe('some_notification');
      });
    });

    describe('PostToolUse', () => {
      it('should clear current_tool', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'PostToolUse',
        };

        const result = getFieldUpdates(event, {
          current_tool: 'Bash',
        });

        expect(result.currentTool).toBeUndefined();
      });

      it('should preserve last_prompt and notification_type', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'PostToolUse',
        };

        const result = getFieldUpdates(event, {
          last_prompt: 'Existing prompt',
          notification_type: 'some_notification',
        });

        expect(result.lastPrompt).toBe('Existing prompt');
        expect(result.notificationType).toBe('some_notification');
      });
    });

    describe('Notification', () => {
      it('should set notification_type from event', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'Notification',
          notification_type: 'permission_prompt',
        };

        const result = getFieldUpdates(event, {});

        expect(result.notificationType).toBe('permission_prompt');
      });

      it('should preserve last_prompt and current_tool', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'Notification',
          notification_type: 'info',
        };

        const result = getFieldUpdates(event, {
          last_prompt: 'Existing prompt',
          current_tool: 'Bash',
        });

        expect(result.lastPrompt).toBe('Existing prompt');
        expect(result.currentTool).toBe('Bash');
      });
    });

    describe('Stop', () => {
      it('should clear current_tool', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'Stop',
        };

        const result = getFieldUpdates(event, {
          current_tool: 'Bash',
        });

        expect(result.currentTool).toBeUndefined();
      });

      it('should clear notification_type', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'Stop',
        };

        const result = getFieldUpdates(event, {
          notification_type: 'permission_prompt',
        });

        expect(result.notificationType).toBeUndefined();
      });

      it('should preserve last_prompt', () => {
        const event: HookEvent = {
          session_id: 'test',
          cwd: '/tmp',
          hook_event_name: 'Stop',
        };

        const result = getFieldUpdates(event, {
          last_prompt: 'Final prompt',
        });

        expect(result.lastPrompt).toBe('Final prompt');
      });
    });
  });
});
