import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockCleanupStaleSessions = vi.fn();

vi.mock('../src/store/file-store.js', () => ({
  cleanupStaleSessions: () => mockCleanupStaleSessions(),
}));

describe('cleanup-loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockCleanupStaleSessions.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
  });

  it('starts only one interval even when called multiple times', async () => {
    const { startCleanupLoop, stopCleanupLoop } = await import('../src/store/cleanup-loop.js');

    startCleanupLoop();
    startCleanupLoop();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(mockCleanupStaleSessions).toHaveBeenCalledTimes(1);

    stopCleanupLoop();
    stopCleanupLoop();
  });

  it('keeps running until all owners stop', async () => {
    const { startCleanupLoop, stopCleanupLoop } = await import('../src/store/cleanup-loop.js');

    startCleanupLoop();
    startCleanupLoop();
    stopCleanupLoop();

    await vi.advanceTimersByTimeAsync(15_000);
    expect(mockCleanupStaleSessions).toHaveBeenCalledTimes(1);

    stopCleanupLoop();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mockCleanupStaleSessions).toHaveBeenCalledTimes(1);
  });

  it('prevents overlapping cleanup execution', async () => {
    let resolveCleanup: (() => void) | undefined;
    mockCleanupStaleSessions.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveCleanup = resolve;
        })
    );

    const { runCleanupOnce } = await import('../src/store/cleanup-loop.js');

    const first = runCleanupOnce();
    const second = runCleanupOnce();

    expect(mockCleanupStaleSessions).toHaveBeenCalledTimes(1);

    resolveCleanup?.();
    await first;
    await second;
  });
});
