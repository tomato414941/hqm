import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

describe('debugLog', () => {
  let mkdirSyncMock: ReturnType<typeof vi.fn>;
  let appendFileSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs');
    mkdirSyncMock = fs.mkdirSync as ReturnType<typeof vi.fn>;
    appendFileSyncMock = fs.appendFileSync as ReturnType<typeof vi.fn>;
    mkdirSyncMock.mockReset();
    appendFileSyncMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('creates directory and writes log entry', async () => {
    const { debugLog } = await import('../src/utils/debug.js');

    debugLog('test message');

    expect(mkdirSyncMock).toHaveBeenCalledTimes(1);
    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('.hqm'), {
      recursive: true,
    });

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    expect(appendFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining('debug.log'),
      expect.stringMatching(/^\[\d{4}-\d{2}-\d{2}T.+\] test message\n$/)
    );
  });

  it('does not throw when mkdirSync fails', async () => {
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const { debugLog } = await import('../src/utils/debug.js');

    expect(() => debugLog('test message')).not.toThrow();
  });

  it('does not throw when appendFileSync fails', async () => {
    appendFileSyncMock.mockImplementation(() => {
      throw new Error('Disk full');
    });

    const { debugLog } = await import('../src/utils/debug.js');

    expect(() => debugLog('test message')).not.toThrow();
  });
});
