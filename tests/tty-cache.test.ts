import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TTY_CACHE_SIZE, TTY_CACHE_TTL_MS } from '../src/constants.js';

// Mock fs.statSync and fs.stat
vi.mock('node:fs', () => ({
  statSync: vi.fn(),
  stat: vi.fn(),
  readlinkSync: vi.fn(() => {
    throw new Error('not a tty');
  }),
}));

describe('tty-cache', () => {
  let statSyncMock: ReturnType<typeof vi.fn>;
  let statMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    const fs = await import('node:fs');
    statSyncMock = fs.statSync as ReturnType<typeof vi.fn>;
    statMock = fs.stat as ReturnType<typeof vi.fn>;
    statSyncMock.mockReset();
    statMock.mockReset();
  });

  afterEach(async () => {
    vi.useRealTimers();
    // Clear cache after each test
    const { clearTtyCache } = await import('../src/utils/tty.js');
    clearTtyCache();
    vi.resetModules();
  });

  describe('isTtyAlive', () => {
    it('returns true for undefined TTY', async () => {
      const { isTtyAlive } = await import('../src/utils/tty.js');
      expect(isTtyAlive(undefined)).toBe(true);
      expect(statSyncMock).not.toHaveBeenCalled();
    });

    it('returns true for existing TTY', async () => {
      statSyncMock.mockReturnValue({});
      const { isTtyAlive } = await import('../src/utils/tty.js');
      expect(isTtyAlive('/dev/pts/0')).toBe(true);
      expect(statSyncMock).toHaveBeenCalledWith('/dev/pts/0');
    });

    it('returns false for non-existing TTY', async () => {
      statSyncMock.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const { isTtyAlive } = await import('../src/utils/tty.js');
      expect(isTtyAlive('/dev/pts/999')).toBe(false);
      expect(statSyncMock).toHaveBeenCalledWith('/dev/pts/999');
    });

    it('uses cached result within TTL', async () => {
      statSyncMock.mockReturnValue({});
      const { isTtyAlive } = await import('../src/utils/tty.js');

      // First call should check the TTY
      expect(isTtyAlive('/dev/pts/1')).toBe(true);
      expect(statSyncMock).toHaveBeenCalledTimes(1);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(TTY_CACHE_TTL_MS - 1000);

      // Second call should use cache
      expect(isTtyAlive('/dev/pts/1')).toBe(true);
      expect(statSyncMock).toHaveBeenCalledTimes(1);
    });

    it('refreshes cache after TTL expires', async () => {
      statSyncMock.mockReturnValue({});
      const { isTtyAlive } = await import('../src/utils/tty.js');

      // First call
      expect(isTtyAlive('/dev/pts/2')).toBe(true);
      expect(statSyncMock).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      vi.advanceTimersByTime(TTY_CACHE_TTL_MS + 1);

      // Second call should re-check
      expect(isTtyAlive('/dev/pts/2')).toBe(true);
      expect(statSyncMock).toHaveBeenCalledTimes(2);
    });

    it('evicts oldest entries when cache exceeds max size', async () => {
      statSyncMock.mockReturnValue({});
      const { isTtyAlive } = await import('../src/utils/tty.js');

      // Fill cache to max size
      for (let i = 0; i <= MAX_TTY_CACHE_SIZE; i++) {
        vi.advanceTimersByTime(1); // Ensure different timestamps
        isTtyAlive(`/dev/pts/${i}`);
      }

      // statSync should have been called for all entries
      expect(statSyncMock).toHaveBeenCalledTimes(MAX_TTY_CACHE_SIZE + 1);

      // Reset mock to check which entries are still cached
      statSyncMock.mockClear();

      // The first entry (oldest) should have been evicted
      isTtyAlive('/dev/pts/0');
      expect(statSyncMock).toHaveBeenCalledTimes(1);

      // The last entry should still be cached
      isTtyAlive(`/dev/pts/${MAX_TTY_CACHE_SIZE}`);
      expect(statSyncMock).toHaveBeenCalledTimes(1); // No additional call
    });
  });

  describe('clearTtyCache', () => {
    it('clears all cached entries', async () => {
      statSyncMock.mockReturnValue({});
      const { isTtyAlive, clearTtyCache } = await import('../src/utils/tty.js');

      // Add entry to cache
      isTtyAlive('/dev/pts/10');
      expect(statSyncMock).toHaveBeenCalledTimes(1);

      // Should use cache
      isTtyAlive('/dev/pts/10');
      expect(statSyncMock).toHaveBeenCalledTimes(1);

      // Clear cache
      clearTtyCache();

      // Should re-check after cache clear
      isTtyAlive('/dev/pts/10');
      expect(statSyncMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('isTtyAliveAsync', () => {
    it('returns true for undefined TTY', async () => {
      const { isTtyAliveAsync } = await import('../src/utils/tty.js');
      const result = await isTtyAliveAsync(undefined);
      expect(result).toBe(true);
      expect(statMock).not.toHaveBeenCalled();
    });

    it('returns true for existing TTY (async)', async () => {
      statMock.mockImplementation((_path: string, callback: (err: Error | null) => void) => {
        callback(null);
      });
      const { isTtyAliveAsync } = await import('../src/utils/tty.js');

      const result = await isTtyAliveAsync('/dev/pts/async0');

      expect(result).toBe(true);
      expect(statMock).toHaveBeenCalledWith('/dev/pts/async0', expect.any(Function));
    });

    it('returns false for non-existing TTY (async)', async () => {
      statMock.mockImplementation((_path: string, callback: (err: Error | null) => void) => {
        callback(new Error('ENOENT'));
      });
      const { isTtyAliveAsync } = await import('../src/utils/tty.js');

      const result = await isTtyAliveAsync('/dev/pts/async999');

      expect(result).toBe(false);
      expect(statMock).toHaveBeenCalledWith('/dev/pts/async999', expect.any(Function));
    });

    it('uses cached result within TTL (async)', async () => {
      statMock.mockImplementation((_path: string, callback: (err: Error | null) => void) => {
        callback(null);
      });
      const { isTtyAliveAsync } = await import('../src/utils/tty.js');

      // First call should check the TTY
      const result1 = await isTtyAliveAsync('/dev/pts/async1');
      expect(result1).toBe(true);
      expect(statMock).toHaveBeenCalledTimes(1);

      // Advance time but stay within TTL
      vi.advanceTimersByTime(TTY_CACHE_TTL_MS - 1000);

      // Second call should use cache
      const result2 = await isTtyAliveAsync('/dev/pts/async1');
      expect(result2).toBe(true);
      expect(statMock).toHaveBeenCalledTimes(1);
    });

    it('refreshes cache after TTL expires (async)', async () => {
      statMock.mockImplementation((_path: string, callback: (err: Error | null) => void) => {
        callback(null);
      });
      const { isTtyAliveAsync } = await import('../src/utils/tty.js');

      // First call
      await isTtyAliveAsync('/dev/pts/async2');
      expect(statMock).toHaveBeenCalledTimes(1);

      // Advance time past TTL
      vi.advanceTimersByTime(TTY_CACHE_TTL_MS + 1);

      // Second call should re-check
      await isTtyAliveAsync('/dev/pts/async2');
      expect(statMock).toHaveBeenCalledTimes(2);
    });
  });
});
