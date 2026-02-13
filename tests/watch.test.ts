import type { render } from 'ink';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('ink', () => ({
  render: vi.fn(),
}));

vi.mock('../src/components/Dashboard.js', () => ({
  Dashboard: () => null,
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn(),
  },
}));

describe('runWithAltScreen', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('restores alternate screen on normal completion', async () => {
    const { runWithAltScreen } = await import('../src/bin/commands/watch.js');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null
    ) => {
      throw new Error(`process.exit(${code ?? ''}) should not be called`);
    }) as typeof process.exit);
    const waitUntilExit = vi.fn().mockResolvedValue(undefined);
    const renderResult = { waitUntilExit } as unknown as ReturnType<typeof render>;

    await runWithAltScreen(() => renderResult);

    expect(waitUntilExit).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('[?1049h'));
    expect(writeSpy).toHaveBeenLastCalledWith(expect.stringContaining('[?1049l'));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('propagates waitUntilExit errors and still restores alternate screen', async () => {
    const { runWithAltScreen } = await import('../src/bin/commands/watch.js');
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null
    ) => {
      throw new Error(`process.exit(${code ?? ''}) should not be called`);
    }) as typeof process.exit);
    const error = new Error('wait failed');
    const waitUntilExit = vi.fn().mockRejectedValue(error);
    const renderResult = { waitUntilExit } as unknown as ReturnType<typeof render>;

    await expect(runWithAltScreen(() => renderResult)).rejects.toThrow('wait failed');

    expect(waitUntilExit).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenNthCalledWith(1, expect.stringContaining('[?1049h'));
    expect(writeSpy).toHaveBeenLastCalledWith(expect.stringContaining('[?1049l'));
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
