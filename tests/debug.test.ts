import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn(),
  },
}));

describe('debugLog (shim)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates to logger.debug', async () => {
    const { logger } = await import('../src/utils/logger.js');
    const { debugLog } = await import('../src/utils/debug.js');

    debugLog('test message');

    expect(logger.debug).toHaveBeenCalledWith('test message');
  });
});

describe('serverLog (shim)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps STARTUP to logger.info', async () => {
    const { logger } = await import('../src/utils/logger.js');
    const { serverLog } = await import('../src/utils/debug.js');

    serverLog('STARTUP', 'Server started', { port: 3000 });

    expect(logger.info).toHaveBeenCalledWith('Server started', { port: 3000 });
  });

  it('maps WS_ERROR to logger.warn', async () => {
    const { logger } = await import('../src/utils/logger.js');
    const { serverLog } = await import('../src/utils/debug.js');

    serverLog('WS_ERROR', 'Connection failed', { code: 1006 });

    expect(logger.warn).toHaveBeenCalledWith('Connection failed', { code: 1006 });
  });

  it('maps HTTP_ERROR to logger.warn', async () => {
    const { logger } = await import('../src/utils/logger.js');
    const { serverLog } = await import('../src/utils/debug.js');

    serverLog('HTTP_ERROR', 'Not found');

    expect(logger.warn).toHaveBeenCalledWith('Not found', undefined);
  });

  it('maps SHUTDOWN to logger.info', async () => {
    const { logger } = await import('../src/utils/logger.js');
    const { serverLog } = await import('../src/utils/debug.js');

    serverLog('SHUTDOWN', 'Server stopped');

    expect(logger.info).toHaveBeenCalledWith('Server stopped', undefined);
  });
});
