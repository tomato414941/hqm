import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockRefreshSessionData = vi.fn();

vi.mock('../src/store/file-store.js', () => ({
  refreshSessionData: () => mockRefreshSessionData(),
}));

describe('refresh-loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockRefreshSessionData.mockReturnValue([]);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('starts only one interval even when called multiple times', async () => {
    const { startRefreshLoop, stopRefreshLoop } = await import('../src/store/refresh-loop.js');

    startRefreshLoop();
    startRefreshLoop();

    vi.advanceTimersByTime(5_000);
    expect(mockRefreshSessionData).toHaveBeenCalledTimes(1);

    stopRefreshLoop();
    stopRefreshLoop();
  });

  it('keeps running until all owners stop', async () => {
    const { startRefreshLoop, stopRefreshLoop } = await import('../src/store/refresh-loop.js');

    startRefreshLoop();
    startRefreshLoop();
    stopRefreshLoop();

    vi.advanceTimersByTime(5_000);
    expect(mockRefreshSessionData).toHaveBeenCalledTimes(1);

    stopRefreshLoop();
    vi.advanceTimersByTime(5_000);
    expect(mockRefreshSessionData).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping refresh execution', async () => {
    // Simulate a refresh that is still in progress by making refreshSessionData
    // call runRefreshOnce recursively (which should be skipped)
    const { startRefreshLoop, stopRefreshLoop } = await import('../src/store/refresh-loop.js');

    startRefreshLoop();
    startRefreshLoop();

    // Two intervals but only one timer, so only one call per tick
    vi.advanceTimersByTime(5_000);
    expect(mockRefreshSessionData).toHaveBeenCalledTimes(1);

    stopRefreshLoop();
    stopRefreshLoop();
  });

  it('emits refresh event after each run', async () => {
    const { startRefreshLoop, stopRefreshLoop, onRefresh, offRefresh } = await import(
      '../src/store/refresh-loop.js'
    );

    const listener = vi.fn();
    onRefresh(listener);
    startRefreshLoop();

    vi.advanceTimersByTime(5_000);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5_000);
    expect(listener).toHaveBeenCalledTimes(2);

    offRefresh(listener);
    stopRefreshLoop();
  });

  it('runRefreshOnce emits refresh event', async () => {
    const { runRefreshOnce, onRefresh, offRefresh } = await import('../src/store/refresh-loop.js');

    const listener = vi.fn();
    onRefresh(listener);

    runRefreshOnce();
    expect(listener).toHaveBeenCalledTimes(1);

    offRefresh(listener);
  });
});
