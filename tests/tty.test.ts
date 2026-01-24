import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock execFileSync before importing the module
vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(),
}));
vi.mock('node:fs', () => ({
  readlinkSync: vi.fn(),
}));

describe('tty', () => {
  let mockExecFileSync: ReturnType<typeof vi.fn>;
  let mockReadlinkSync: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();

    const childProcess = await import('node:child_process');
    const fs = await import('node:fs');
    mockExecFileSync = childProcess.execFileSync as ReturnType<typeof vi.fn>;
    mockReadlinkSync = fs.readlinkSync as ReturnType<typeof vi.fn>;
    mockExecFileSync.mockReset();
    mockReadlinkSync.mockReset();
    mockReadlinkSync.mockImplementation(() => {
      throw new Error('not a tty');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getTtyFromAncestors', () => {
    it('should return /dev/pts/0 when valid pts TTY found', async () => {
      mockExecFileSync.mockReturnValueOnce('pts/0 1234');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/pts/0');
      expect(mockExecFileSync).toHaveBeenCalledWith(
        'ps',
        ['-o', 'tty=,ppid=', '-p', expect.any(String)],
        expect.objectContaining({ encoding: 'utf-8' })
      );
    });

    it('should return TTY from fd without calling ps', async () => {
      mockReadlinkSync.mockReturnValueOnce('/dev/pts/9');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/pts/9');
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it('should ignore non-tty fd targets and fall back to ps', async () => {
      mockReadlinkSync.mockReturnValueOnce('pipe:[12345]');
      mockExecFileSync.mockReturnValueOnce('pts/2 1234');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/pts/2');
      expect(mockExecFileSync).toHaveBeenCalled();
    });

    it('should return /dev/tty1 when valid tty found', async () => {
      mockExecFileSync.mockReturnValueOnce('tty1 1234');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/tty1');
    });

    it('should return undefined when no TTY found (? marker)', async () => {
      // Return no TTY for all 5 iterations (MAX_ANCESTOR_DEPTH)
      mockExecFileSync
        .mockReturnValueOnce('? 1234')
        .mockReturnValueOnce('? 1233')
        .mockReturnValueOnce('? 1232')
        .mockReturnValueOnce('? 1231')
        .mockReturnValueOnce('? 1230');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBeUndefined();
    });

    it('should return undefined when empty TTY returned', async () => {
      mockExecFileSync
        .mockReturnValueOnce('  1234')
        .mockReturnValueOnce('  1233')
        .mockReturnValueOnce('  1232')
        .mockReturnValueOnce('  1231')
        .mockReturnValueOnce('  1230');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBeUndefined();
    });

    it('should return undefined when exception occurs', async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('ps command failed');
      });

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBeUndefined();
    });

    it('should traverse parent processes when first process has no TTY', async () => {
      // First process has no TTY, second process has TTY
      mockExecFileSync
        .mockReturnValueOnce('? 2000') // First check - no TTY, ppid found
        .mockReturnValueOnce('pts/1 1999'); // Second check - has TTY

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/pts/1');
      expect(mockExecFileSync).toHaveBeenCalledTimes(2);
    });

    it('should stop when empty ppid is returned', async () => {
      mockExecFileSync.mockReturnValueOnce('? ');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBeUndefined();
      expect(mockExecFileSync).toHaveBeenCalledTimes(1);
    });

    it('should respect MAX_ANCESTOR_DEPTH limit', async () => {
      // Return no TTY for all 5 iterations (MAX_ANCESTOR_DEPTH)
      mockExecFileSync
        .mockReturnValueOnce('? 1000')
        .mockReturnValueOnce('? 999')
        .mockReturnValueOnce('? 998')
        .mockReturnValueOnce('? 997')
        .mockReturnValueOnce('? 996');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBeUndefined();
      // 5 iterations * 1 call = 5 calls
      expect(mockExecFileSync).toHaveBeenCalledTimes(5);
    });

    it('should handle whitespace in tty output', async () => {
      mockExecFileSync.mockReturnValueOnce('  pts/2    1234 \n');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/pts/2');
    });

    it('should handle whitespace in ppid output', async () => {
      mockExecFileSync.mockReturnValueOnce('?   1234  \n').mockReturnValueOnce('pts/3 1233');

      const { getTtyFromAncestors } = await import('../src/utils/tty.js');
      const result = getTtyFromAncestors();

      expect(result).toBe('/dev/pts/3');
    });
  });
});
