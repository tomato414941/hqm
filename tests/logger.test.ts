import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  appendFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 0 })),
  unlinkSync: vi.fn(),
}));

describe('logger', () => {
  let appendFileSyncMock: ReturnType<typeof vi.fn>;
  let existsSyncMock: ReturnType<typeof vi.fn>;
  let statSyncMock: ReturnType<typeof vi.fn>;
  let renameSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.unstubAllEnvs();
    const fs = await import('node:fs');
    appendFileSyncMock = fs.appendFileSync as ReturnType<typeof vi.fn>;
    existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    statSyncMock = fs.statSync as ReturnType<typeof vi.fn>;
    renameSyncMock = fs.renameSync as ReturnType<typeof vi.fn>;
    appendFileSyncMock.mockReset();
    existsSyncMock.mockReset().mockReturnValue(true);
    statSyncMock.mockReset().mockReturnValue({ size: 0 });
    renameSyncMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('writes JSONL format with all required fields', async () => {
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('Server started', { port: 3000 });
    flush();

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const written = appendFileSyncMock.mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());
    expect(entry).toMatchObject({
      level: 'info',
      message: 'Server started',
      data: { port: 3000 },
    });
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(entry.pid).toBe(process.pid);
  });

  it('omits data field when not provided', async () => {
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('No data');
    flush();

    const written = appendFileSyncMock.mock.calls[0][1] as string;
    const entry = JSON.parse(written.trim());
    expect(entry.data).toBeUndefined();
  });

  it('respects level hierarchy — filters lower priority', async () => {
    const { logger, _resetForTest, setLevel, flush } = await import('../src/utils/logger.js');
    _resetForTest();
    setLevel('warn');

    logger.debug('should be filtered');
    logger.info('should be filtered');
    logger.warn('should appear');
    logger.error('should appear');
    flush();

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const written = appendFileSyncMock.mock.calls[0][1] as string;
    const lines = written.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).level).toBe('warn');
    expect(JSON.parse(lines[1]).level).toBe('error');
  });

  it('does not write when level is too low', async () => {
    const { logger, _resetForTest, setLevel, flush } = await import('../src/utils/logger.js');
    _resetForTest();
    setLevel('error');

    logger.debug('nope');
    logger.info('nope');
    logger.warn('nope');
    flush();

    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });

  it('buffers entries and writes on flush', async () => {
    const { logger, _resetForTest, _getBuffer, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('one');
    logger.info('two');
    expect(_getBuffer()).toHaveLength(2);
    expect(appendFileSyncMock).not.toHaveBeenCalled();

    flush();
    expect(_getBuffer()).toHaveLength(0);
    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const written = appendFileSyncMock.mock.calls[0][1] as string;
    const lines = written.trim().split('\n');
    expect(lines).toHaveLength(2);
  });

  it('auto-flushes when buffer reaches 100 entries', async () => {
    const { logger, _resetForTest, _getBuffer } = await import('../src/utils/logger.js');
    _resetForTest();
    // Set level to debug so all entries pass
    const { setLevel } = await import('../src/utils/logger.js');
    setLevel('debug');

    for (let i = 0; i < 100; i++) {
      logger.debug(`entry ${i}`);
    }

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    expect(_getBuffer()).toHaveLength(0);
  });

  it('flush is a no-op when buffer is empty', async () => {
    const { flush, _resetForTest } = await import('../src/utils/logger.js');
    _resetForTest();

    flush();

    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });

  it('never throws on write failure', async () => {
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();
    appendFileSyncMock.mockImplementation(() => {
      throw new Error('Disk full');
    });

    logger.error('this should not throw');
    expect(() => flush()).not.toThrow();
  });

  it('never throws on mkdir failure', async () => {
    const fs = await import('node:fs');
    const mkdirSyncMock = fs.mkdirSync as ReturnType<typeof vi.fn>;
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('Permission denied');
    });
    existsSyncMock.mockReturnValue(false);

    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.error('should not throw');
    expect(() => flush()).not.toThrow();
  });

  it('triggers rotation when file exceeds 5MB', async () => {
    statSyncMock.mockReturnValue({ size: 6 * 1024 * 1024 });
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('trigger rotation');
    flush();

    expect(renameSyncMock).toHaveBeenCalled();
    expect(appendFileSyncMock).toHaveBeenCalled();
  });

  it('does not rotate when file is under 5MB', async () => {
    statSyncMock.mockReturnValue({ size: 1024 });
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('no rotation');
    flush();

    expect(renameSyncMock).not.toHaveBeenCalled();
  });

  it('handles rotation rename failures gracefully', async () => {
    statSyncMock.mockReturnValue({ size: 6 * 1024 * 1024 });
    renameSyncMock.mockImplementation(() => {
      throw new Error('rename failed');
    });
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('should not throw');
    expect(() => flush()).not.toThrow();
  });

  it('respects HQM_LOG_LEVEL env variable', async () => {
    vi.stubEnv('HQM_LOG_LEVEL', 'debug');
    const { getLevel } = await import('../src/utils/logger.js');

    expect(getLevel()).toBe('debug');
  });

  it('ignores invalid HQM_LOG_LEVEL values', async () => {
    vi.stubEnv('HQM_LOG_LEVEL', 'invalid');
    const { getLevel } = await import('../src/utils/logger.js');

    expect(getLevel()).toBe('info');
  });

  it('initLogger accepts explicit level', async () => {
    const { initLogger, getLevel, _resetForTest } = await import('../src/utils/logger.js');
    _resetForTest();

    initLogger('warn');
    expect(getLevel()).toBe('warn');
  });

  it('env override takes precedence over explicit level', async () => {
    vi.stubEnv('HQM_LOG_LEVEL', 'error');
    const { initLogger, getLevel, _resetForTest } = await import('../src/utils/logger.js');
    _resetForTest();

    initLogger('debug');
    expect(getLevel()).toBe('error');
  });

  it('batches multiple entries into single write', async () => {
    const { logger, _resetForTest, flush } = await import('../src/utils/logger.js');
    _resetForTest();

    logger.info('first');
    logger.warn('second');
    logger.error('third');
    flush();

    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);
    const written = appendFileSyncMock.mock.calls[0][1] as string;
    const lines = written.trim().split('\n');
    expect(lines).toHaveLength(3);
  });
});
