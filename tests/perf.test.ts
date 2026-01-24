import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

describe('perf (HQM_PROFILE not set)', () => {
  let mkdirSyncMock: ReturnType<typeof vi.fn>;
  let appendFileSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    delete process.env.HQM_PROFILE;

    const fs = await import('node:fs');
    mkdirSyncMock = fs.mkdirSync as ReturnType<typeof vi.fn>;
    appendFileSyncMock = fs.appendFileSync as ReturnType<typeof vi.fn>;
    mkdirSyncMock.mockReset();
    appendFileSyncMock.mockReset();
  });

  afterEach(() => {
    delete process.env.HQM_PROFILE;
    vi.resetModules();
  });

  it('startPerf returns null when profiling is disabled', async () => {
    const { startPerf } = await import('../src/utils/perf.js');

    const result = startPerf('test_event');

    expect(result).toBeNull();
  });

  it('endPerf does nothing when span is null', async () => {
    const { endPerf } = await import('../src/utils/perf.js');

    expect(() => endPerf(null)).not.toThrow();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });

  it('logPerfEvent does nothing when profiling is disabled', async () => {
    const { logPerfEvent } = await import('../src/utils/perf.js');

    logPerfEvent('test_event', { key: 'value' });

    expect(mkdirSyncMock).not.toHaveBeenCalled();
    expect(appendFileSyncMock).not.toHaveBeenCalled();
  });
});

describe('perf (HQM_PROFILE=1)', () => {
  let mkdirSyncMock: ReturnType<typeof vi.fn>;
  let appendFileSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    process.env.HQM_PROFILE = '1';

    const fs = await import('node:fs');
    mkdirSyncMock = fs.mkdirSync as ReturnType<typeof vi.fn>;
    appendFileSyncMock = fs.appendFileSync as ReturnType<typeof vi.fn>;
    mkdirSyncMock.mockReset();
    appendFileSyncMock.mockReset();
  });

  afterEach(() => {
    delete process.env.HQM_PROFILE;
    vi.resetModules();
  });

  it('startPerf returns PerfSpan object when profiling is enabled', async () => {
    const { startPerf } = await import('../src/utils/perf.js');

    const span = startPerf('test_event', { extra: 'data' });

    expect(span).not.toBeNull();
    expect(span?.event).toBe('test_event');
    expect(span?.data).toEqual({ extra: 'data' });
    expect(typeof span?.start).toBe('bigint');
  });

  it('endPerf writes to file when given valid span', async () => {
    const { startPerf, endPerf } = await import('../src/utils/perf.js');

    const span = startPerf('test_event');
    endPerf(span, { result: 'success' });

    expect(mkdirSyncMock).toHaveBeenCalledWith(expect.stringContaining('.hqm'), {
      recursive: true,
      mode: 0o700,
    });
    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);

    const writtenData = appendFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenData.trim());
    expect(parsed.event).toBe('test_event');
    expect(parsed.result).toBe('success');
    expect(parsed.duration_ms).toBeDefined();
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.pid).toBe(process.pid);
  });

  it('logPerfEvent writes event to file', async () => {
    const { logPerfEvent } = await import('../src/utils/perf.js');

    logPerfEvent('custom_event', { custom: 'data' });

    expect(mkdirSyncMock).toHaveBeenCalled();
    expect(appendFileSyncMock).toHaveBeenCalledTimes(1);

    const writtenData = appendFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenData.trim());
    expect(parsed.event).toBe('custom_event');
    expect(parsed.custom).toBe('data');
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.pid).toBe(process.pid);
  });

  it('does not throw when mkdirSync fails', async () => {
    mkdirSyncMock.mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const { logPerfEvent } = await import('../src/utils/perf.js');

    expect(() => logPerfEvent('test_event')).not.toThrow();
  });

  it('does not throw when appendFileSync fails', async () => {
    appendFileSyncMock.mockImplementation(() => {
      throw new Error('Disk full');
    });

    const { logPerfEvent } = await import('../src/utils/perf.js');

    expect(() => logPerfEvent('test_event')).not.toThrow();
  });

  it('endPerf includes span data and additional data', async () => {
    const { startPerf, endPerf } = await import('../src/utils/perf.js');

    const span = startPerf('test_event', { initial: 'value' });
    endPerf(span, { final: 'result' });

    const writtenData = appendFileSyncMock.mock.calls[0][1] as string;
    const parsed = JSON.parse(writtenData.trim());
    expect(parsed.initial).toBe('value');
    expect(parsed.final).toBe('result');
  });
});
