import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));

describe('tmux', () => {
  let execFileSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const childProcess = await import('node:child_process');
    execFileSyncMock = childProcess.execFileSync as ReturnType<typeof vi.fn>;
    execFileSyncMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('listTmuxPanes', () => {
    it('returns list of panes with tty and target', async () => {
      execFileSyncMock.mockReturnValue('/dev/pts/0 main:0.0\n/dev/pts/1 main:0.1\n');
      const { listTmuxPanes, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = listTmuxPanes();

      expect(result).toEqual([
        { tty: '/dev/pts/0', target: 'main:0.0' },
        { tty: '/dev/pts/1', target: 'main:0.1' },
      ]);
    });

    it('returns empty array when tmux command fails', async () => {
      execFileSyncMock.mockImplementation(() => {
        throw new Error('tmux not running');
      });
      const { listTmuxPanes, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = listTmuxPanes();

      expect(result).toEqual([]);
    });

    it('filters empty lines', async () => {
      execFileSyncMock.mockReturnValue('/dev/pts/0 main:0.0\n\n/dev/pts/1 main:0.1\n\n');
      const { listTmuxPanes, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = listTmuxPanes();

      expect(result).toHaveLength(2);
    });
  });

  describe('getAttachedSessions', () => {
    it('returns list of attached session names', async () => {
      execFileSyncMock
        .mockReturnValueOnce('/dev/pts/0 main:0.0\n')
        .mockReturnValueOnce('main\ndev\n');
      const { getAttachedSessions, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = getAttachedSessions();

      expect(result).toEqual(['main', 'dev']);
    });

    it('returns empty array when no clients connected', async () => {
      execFileSyncMock.mockReturnValueOnce('/dev/pts/0 main:0.0\n').mockReturnValueOnce('');
      const { getAttachedSessions, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = getAttachedSessions();

      expect(result).toEqual([]);
    });
  });

  describe('findPaneByTty', () => {
    it('finds pane by tty in attached session first', async () => {
      execFileSyncMock
        .mockReturnValueOnce('/dev/pts/0 detached:0.0\n/dev/pts/0 main:0.0\n')
        .mockReturnValueOnce('main\n');
      const { findPaneByTty, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = findPaneByTty('/dev/pts/0');

      expect(result).toEqual({ tty: '/dev/pts/0', target: 'main:0.0' });
    });

    it('falls back to first match when not in attached session', async () => {
      execFileSyncMock
        .mockReturnValueOnce('/dev/pts/0 detached:0.0\n/dev/pts/1 main:0.0\n')
        .mockReturnValueOnce('main\n');
      const { findPaneByTty, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = findPaneByTty('/dev/pts/0');

      expect(result).toEqual({ tty: '/dev/pts/0', target: 'detached:0.0' });
    });

    it('returns undefined when tty not found', async () => {
      execFileSyncMock.mockReturnValueOnce('/dev/pts/0 main:0.0\n').mockReturnValueOnce('main\n');
      const { findPaneByTty, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = findPaneByTty('/dev/pts/99');

      expect(result).toBeUndefined();
    });
  });

  describe('findPaneByTtySimple', () => {
    it('finds pane by tty without session priority', async () => {
      execFileSyncMock
        .mockReturnValueOnce('/dev/pts/0 detached:0.0\n/dev/pts/0 main:0.0\n')
        .mockReturnValueOnce('main\n');
      const { findPaneByTtySimple, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      const result = findPaneByTtySimple('/dev/pts/0');

      expect(result).toEqual({ tty: '/dev/pts/0', target: 'detached:0.0' });
    });
  });

  describe('cache behavior', () => {
    it('uses cached data within TTL', async () => {
      execFileSyncMock.mockReturnValueOnce('/dev/pts/0 main:0.0\n').mockReturnValueOnce('main\n');
      const { listTmuxPanes, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      listTmuxPanes();
      listTmuxPanes();
      listTmuxPanes();

      // Only called twice: once for list-panes, once for list-clients
      expect(execFileSyncMock).toHaveBeenCalledTimes(2);
    });

    it('refreshes cache after TTL expires', async () => {
      vi.useFakeTimers();
      execFileSyncMock.mockReturnValue('/dev/pts/0 main:0.0\n');
      const { listTmuxPanes, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      listTmuxPanes();
      expect(execFileSyncMock).toHaveBeenCalledTimes(2);

      // Advance time past TTL (1000ms)
      vi.advanceTimersByTime(1100);

      listTmuxPanes();
      expect(execFileSyncMock).toHaveBeenCalledTimes(4);

      vi.useRealTimers();
    });

    it('clearTmuxCache resets the cache', async () => {
      execFileSyncMock.mockReturnValue('/dev/pts/0 main:0.0\n');
      const { listTmuxPanes, clearTmuxCache } = await import('../src/utils/tmux.js');
      clearTmuxCache();

      listTmuxPanes();
      expect(execFileSyncMock).toHaveBeenCalledTimes(2);

      clearTmuxCache();

      listTmuxPanes();
      expect(execFileSyncMock).toHaveBeenCalledTimes(4);
    });
  });
});
