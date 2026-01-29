import { describe, expect, it } from 'vitest';
import type { Session } from '../src/types/index.js';
import { getExtendedStatusDisplay, getStatusDisplay } from '../src/utils/status-display.js';

function createSession(overrides: Partial<Session>): Session {
  return {
    session_id: 'test-session',
    cwd: '/test',
    status: 'running',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('status', () => {
  describe('getStatusDisplay', () => {
    it('returns correct display for running status', () => {
      const result = getStatusDisplay('running');
      expect(result).toEqual({
        symbol: '●',
        color: 'green',
        label: 'Running',
      });
    });

    it('returns correct display for waiting_input status', () => {
      const result = getStatusDisplay('waiting_input');
      expect(result).toEqual({
        symbol: '◐',
        color: 'yellow',
        label: 'Waiting',
      });
    });

    it('returns correct display for stopped status', () => {
      const result = getStatusDisplay('stopped');
      expect(result).toEqual({
        symbol: '✓',
        color: 'cyan',
        label: 'Done',
      });
    });
  });

  describe('getExtendedStatusDisplay', () => {
    it('shows tool name when running with current_tool', () => {
      const session = createSession({
        status: 'running',
        current_tool: 'Bash',
      });
      const result = getExtendedStatusDisplay(session);
      expect(result.label).toBe('Running: Bash');
      expect(result.color).toBe('green');
    });

    it('shows Permission for permission_prompt notification', () => {
      const session = createSession({
        status: 'waiting_input',
        notification_type: 'permission_prompt',
      });
      const result = getExtendedStatusDisplay(session);
      expect(result.label).toBe('Permission');
      expect(result.color).toBe('yellow');
    });

    it('shows Idle for idle_prompt notification', () => {
      const session = createSession({
        status: 'waiting_input',
        notification_type: 'idle_prompt',
      });
      const result = getExtendedStatusDisplay(session);
      expect(result.label).toBe('Idle');
    });

    it('falls back to base display when no context available', () => {
      const session = createSession({ status: 'running' });
      const result = getExtendedStatusDisplay(session);
      expect(result.label).toBe('Running');
    });

    it('shows raw notification type for unknown types', () => {
      const session = createSession({
        status: 'waiting_input',
        notification_type: 'custom_type',
      });
      const result = getExtendedStatusDisplay(session);
      expect(result.label).toBe('custom_type');
    });
  });
});
