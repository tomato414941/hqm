import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleHookEvent } from '../src/hook/handler.js';
import {
  isNonEmptyString,
  isValidHookEventName,
  VALID_HOOK_EVENTS,
} from '../src/utils/type-guards.js';

// Mock the file-store module
vi.mock('../src/store/file-store.js', () => ({
  updateSession: vi.fn(),
  flushPendingWrites: vi.fn().mockResolvedValue(undefined),
}));

// Mock daemon-client (default: daemon not running, falls back to direct write)
vi.mock('../src/server/daemon-client.js', () => ({
  isDaemonRunning: vi.fn().mockReturnValue(false),
  sendToDaemon: vi.fn().mockResolvedValue({ ok: true }),
}));

// Mock team utility
vi.mock('../src/utils/team.js', () => ({
  getTeamContext: vi.fn().mockReturnValue(undefined),
}));

describe('handler', () => {
  describe('VALID_HOOK_EVENTS', () => {
    it('should contain all expected hook event names', () => {
      expect(VALID_HOOK_EVENTS.has('SessionStart')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('PreToolUse')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('PostToolUse')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('Notification')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('Stop')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('UserPromptSubmit')).toBe(true);
    });

    it('should contain SessionEnd', () => {
      expect(VALID_HOOK_EVENTS.has('SessionEnd')).toBe(true);
    });

    it('should have exactly 7 valid events', () => {
      expect(VALID_HOOK_EVENTS.size).toBe(7);
    });
  });

  describe('isValidHookEventName', () => {
    it('should return true for valid event names', () => {
      expect(isValidHookEventName('SessionStart')).toBe(true);
      expect(isValidHookEventName('PreToolUse')).toBe(true);
      expect(isValidHookEventName('PostToolUse')).toBe(true);
      expect(isValidHookEventName('Notification')).toBe(true);
      expect(isValidHookEventName('Stop')).toBe(true);
      expect(isValidHookEventName('UserPromptSubmit')).toBe(true);
      expect(isValidHookEventName('SessionEnd')).toBe(true);
    });

    it('should return false for invalid event names', () => {
      expect(isValidHookEventName('Invalid')).toBe(false);
      expect(isValidHookEventName('')).toBe(false);
      expect(isValidHookEventName('pretooluse')).toBe(false);
      expect(isValidHookEventName('PRETOOLUSE')).toBe(false);
      expect(isValidHookEventName('pre_tool_use')).toBe(false);
    });
  });

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
      expect(isNonEmptyString('abc123')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
      expect(isNonEmptyString(true)).toBe(false);
    });
  });

  describe('handleHookEvent', () => {
    let originalStdin: typeof process.stdin;
    let mockExit: ReturnType<typeof vi.spyOn>;
    let mockConsoleError: ReturnType<typeof vi.spyOn>;

    function createMockStdin(data: string): Readable {
      const readable = new Readable({
        read() {
          this.push(Buffer.from(data));
          this.push(null);
        },
      });
      return readable;
    }

    beforeEach(() => {
      originalStdin = process.stdin;
      mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });
      mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        writable: true,
        configurable: true,
      });
      mockExit.mockRestore();
      mockConsoleError.mockRestore();
      vi.clearAllMocks();
    });

    it('should exit with code 1 for invalid event name', async () => {
      const mockStdin = createMockStdin('{}');
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await expect(handleHookEvent('InvalidEvent')).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Invalid event name: InvalidEvent');
    });

    it('should exit with code 1 for invalid JSON input', async () => {
      const mockStdin = createMockStdin('not valid json');
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await expect(handleHookEvent('PreToolUse')).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Invalid JSON input');
    });

    it('should exit with code 1 for missing session_id', async () => {
      const mockStdin = createMockStdin(JSON.stringify({ cwd: '/tmp' }));
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await expect(handleHookEvent('PreToolUse')).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Invalid or missing session_id');
    });

    it('should exit with code 1 for empty session_id', async () => {
      const mockStdin = createMockStdin(JSON.stringify({ session_id: '' }));
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await expect(handleHookEvent('PreToolUse')).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Invalid or missing session_id');
    });

    it('should exit with code 1 for invalid cwd type', async () => {
      const mockStdin = createMockStdin(JSON.stringify({ session_id: 'test-123', cwd: 123 }));
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await expect(handleHookEvent('PreToolUse')).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Invalid cwd: must be a string');
    });

    it('should exit with code 1 for invalid notification_type type', async () => {
      const mockStdin = createMockStdin(
        JSON.stringify({ session_id: 'test-123', notification_type: 123 })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await expect(handleHookEvent('Notification')).rejects.toThrow('process.exit called');
      expect(mockExit).toHaveBeenCalledWith(1);
      expect(mockConsoleError).toHaveBeenCalledWith('Invalid notification_type: must be a string');
    });

    it('should call updateSession for valid event', async () => {
      const { updateSession, flushPendingWrites } = await import('../src/store/file-store.js');

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-session-123',
          cwd: '/home/user/project',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('PreToolUse', '/dev/pts/1');

      expect(updateSession).toHaveBeenCalledWith({
        session_id: 'test-session-123',
        cwd: '/home/user/project',
        tty: '/dev/pts/1',
        hook_event_name: 'PreToolUse',
        notification_type: undefined,
        prompt: undefined,
        tool_name: undefined,
      });
      expect(flushPendingWrites).toHaveBeenCalled();
    });

    it('should use process.cwd() when cwd is not provided', async () => {
      const { updateSession } = await import('../src/store/file-store.js');

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-session-456',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('UserPromptSubmit');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-456',
          cwd: process.cwd(),
          hook_event_name: 'UserPromptSubmit',
        })
      );
    });

    it('should handle Notification event with notification_type', async () => {
      const { updateSession } = await import('../src/store/file-store.js');

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-session-789',
          notification_type: 'permission_prompt',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('Notification');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-789',
          hook_event_name: 'Notification',
          notification_type: 'permission_prompt',
        })
      );
    });

    it('should handle Stop event', async () => {
      const { updateSession } = await import('../src/store/file-store.js');

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-session-stop',
          cwd: '/tmp',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('Stop');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-stop',
          hook_event_name: 'Stop',
        })
      );
    });

    it('should handle PostToolUse event', async () => {
      const { updateSession } = await import('../src/store/file-store.js');

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-session-post',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('PostToolUse', '/dev/tty1');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-post',
          tty: '/dev/tty1',
          hook_event_name: 'PostToolUse',
        })
      );
    });

    it('should send via daemon when running', async () => {
      const { isDaemonRunning, sendToDaemon } = await import('../src/server/daemon-client.js');
      const { updateSession } = await import('../src/store/file-store.js');

      vi.mocked(isDaemonRunning).mockReturnValue(true);
      vi.mocked(sendToDaemon).mockResolvedValue({ ok: true });

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-daemon',
          cwd: '/tmp',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('PreToolUse');

      expect(sendToDaemon).toHaveBeenCalledWith(expect.objectContaining({ type: 'hookEvent' }));
      // Should NOT call updateSession directly when daemon succeeds
      expect(updateSession).not.toHaveBeenCalled();
    });

    it('should fallback to direct write when daemon fails', async () => {
      const { isDaemonRunning, sendToDaemon } = await import('../src/server/daemon-client.js');
      const { updateSession } = await import('../src/store/file-store.js');

      vi.mocked(isDaemonRunning).mockReturnValue(true);
      vi.mocked(sendToDaemon).mockRejectedValue(new Error('connection refused'));

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-fallback',
          cwd: '/tmp',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('PreToolUse');

      // Should fallback to direct write
      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: 'test-fallback' })
      );
    });

    it('should include team context when env vars are set', async () => {
      const { getTeamContext } = await import('../src/utils/team.js');
      const { updateSession } = await import('../src/store/file-store.js');

      vi.mocked(getTeamContext).mockReturnValue({
        teamName: 'cleanup',
        agentName: 'redis-removal',
      });

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-team-session',
          cwd: '/home/dev/projects/hqm',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('PreToolUse', '/dev/pts/5');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-team-session',
          team_name: 'cleanup',
          agent_name: 'redis-removal',
        })
      );
    });

    it('should pass reason field for SessionEnd event', async () => {
      const { updateSession } = await import('../src/store/file-store.js');

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-session-end',
          cwd: '/tmp',
          reason: 'prompt_input_exit',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('SessionEnd');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-end',
          hook_event_name: 'SessionEnd',
          reason: 'prompt_input_exit',
        })
      );
    });

    it('should have undefined team fields when no team context', async () => {
      const { getTeamContext } = await import('../src/utils/team.js');
      const { updateSession } = await import('../src/store/file-store.js');

      vi.mocked(getTeamContext).mockReturnValue(undefined);

      const mockStdin = createMockStdin(
        JSON.stringify({
          session_id: 'test-no-team',
          cwd: '/tmp',
        })
      );
      Object.defineProperty(process, 'stdin', {
        value: mockStdin,
        writable: true,
        configurable: true,
      });

      await handleHookEvent('Stop');

      expect(updateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-no-team',
          team_name: undefined,
          agent_name: undefined,
        })
      );
    });
  });
});
