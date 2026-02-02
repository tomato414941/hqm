import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createNewSession,
  isInsideTmux,
  isLinux,
  isTmuxAvailable,
  isValidTtyPath,
} from '../src/utils/focus.js';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

const mockExecFileSync = vi.mocked(execFileSync);

describe('focus', () => {
  describe('isValidTtyPath', () => {
    it('accepts valid pts paths', () => {
      expect(isValidTtyPath('/dev/pts/0')).toBe(true);
      expect(isValidTtyPath('/dev/pts/99')).toBe(true);
    });

    it('accepts valid tty paths', () => {
      expect(isValidTtyPath('/dev/tty1')).toBe(true);
      expect(isValidTtyPath('/dev/tty99')).toBe(true);
    });

    it('rejects invalid paths', () => {
      expect(isValidTtyPath('/dev/null')).toBe(false);
      expect(isValidTtyPath('/tmp/pts/0')).toBe(false);
      expect(isValidTtyPath('pts/0')).toBe(false);
      expect(isValidTtyPath('')).toBe(false);
    });
  });

  describe('createNewSession', () => {
    const originalPlatform = process.platform;
    const originalEnv = { ...process.env };

    beforeEach(() => {
      vi.resetAllMocks();
      Object.defineProperty(process, 'platform', { value: 'linux' });
      process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
      process.env = { ...originalEnv };
    });

    it('should create new window in target session when HQM_TMUX_SESSION is set', () => {
      process.env.HQM_TMUX_SESSION = 'work';
      mockExecFileSync.mockImplementation((cmd, args) => {
        if (cmd === 'which') return '/usr/bin/tmux';
        if (cmd === 'tmux' && args?.[0] === 'new-window') return 'work:1\n';
        if (cmd === 'tmux' && args?.[0] === 'display') return '/dev/pts/5\n';
        return '';
      });

      const result = createNewSession();

      expect(result).toBe('/dev/pts/5');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['new-window', '-t', 'work', '-P', '-F', '#{session_name}:#{window_index}', 'claude'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['display', '-t', 'work:1', '-p', '#{pane_tty}'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['switch-client', '-t', 'work:1'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('should create new window in current session when HQM_TMUX_SESSION is not set', () => {
      delete process.env.HQM_TMUX_SESSION;
      mockExecFileSync.mockImplementation((cmd, args) => {
        if (cmd === 'which') return '/usr/bin/tmux';
        if (cmd === 'tmux' && args?.[0] === 'new-window') return 'main:2\n';
        if (cmd === 'tmux' && args?.[0] === 'display') return '/dev/pts/3\n';
        return '';
      });

      const result = createNewSession();

      expect(result).toBe('/dev/pts/3');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['new-window', '-P', '-F', '#{session_name}:#{window_index}', 'claude'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['display', '-t', 'main:2', '-p', '#{pane_tty}'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'tmux',
        ['switch-client', '-t', 'main:2'],
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('should return null when not inside tmux', () => {
      delete process.env.TMUX;
      mockExecFileSync.mockReturnValue('/usr/bin/tmux');

      const result = createNewSession();

      expect(result).toBe(null);
    });

    it('should return null when tmux is not available', () => {
      mockExecFileSync.mockImplementation((cmd) => {
        if (cmd === 'which') throw new Error('not found');
        return '';
      });

      const result = createNewSession();

      expect(result).toBe(null);
    });

    it('should return null when not on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      const result = createNewSession();

      expect(result).toBe(null);
    });

    it('should return null when tmux command fails', () => {
      mockExecFileSync.mockImplementation((cmd) => {
        if (cmd === 'which') return '/usr/bin/tmux';
        if (cmd === 'tmux') throw new Error('tmux error');
        return '';
      });

      const result = createNewSession();

      expect(result).toBe(null);
    });
  });

  describe('isInsideTmux', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns true when TMUX env var is set', () => {
      process.env.TMUX = '/tmp/tmux-1000/default,12345,0';
      expect(isInsideTmux()).toBe(true);
    });

    it('returns false when TMUX env var is not set', () => {
      delete process.env.TMUX;
      expect(isInsideTmux()).toBe(false);
    });
  });

  describe('isTmuxAvailable', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('returns true when tmux is available', () => {
      mockExecFileSync.mockReturnValue('/usr/bin/tmux');
      expect(isTmuxAvailable()).toBe(true);
    });

    it('returns false when tmux is not available', () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('not found');
      });
      expect(isTmuxAvailable()).toBe(false);
    });
  });

  describe('isLinux', () => {
    const originalPlatform = process.platform;

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('returns true on Linux', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      expect(isLinux()).toBe(true);
    });

    it('returns false on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      expect(isLinux()).toBe(false);
    });

    it('returns false on Windows', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(isLinux()).toBe(false);
    });
  });
});
