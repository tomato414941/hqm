import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_DIR = join(tmpdir(), `hqm-client-test-${process.pid}`);
const TEST_SOCKET_PATH = join(TEST_DIR, '.hqm', 'test.sock');

vi.mock('../src/constants.js', () => ({
  DAEMON_SOCKET_FILENAME: 'test.sock',
}));

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => TEST_DIR,
  };
});

describe('daemon-client', () => {
  let mockServer: Server | null = null;

  beforeEach(() => {
    vi.resetModules();
    mkdirSync(join(TEST_DIR, '.hqm'), { recursive: true });
  });

  afterEach(async () => {
    const s = mockServer;
    if (s) {
      await new Promise<void>((resolve) => {
        s.close(() => resolve());
      });
      mockServer = null;
    }

    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it('isDaemonRunning returns false when socket does not exist', async () => {
    const { isDaemonRunning } = await import('../src/server/daemon-client.js');
    expect(isDaemonRunning()).toBe(false);
  });

  it('isDaemonRunning returns true when socket file exists', async () => {
    const { isDaemonRunning } = await import('../src/server/daemon-client.js');

    // Create a mock server to create the socket file
    mockServer = createServer();
    await new Promise<void>((resolve) => {
      mockServer?.listen(TEST_SOCKET_PATH, resolve);
    });

    expect(isDaemonRunning()).toBe(true);
  });

  it('sendToDaemon should send request and receive response', async () => {
    const { sendToDaemon } = await import('../src/server/daemon-client.js');

    mockServer = createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          socket.end(`${JSON.stringify({ ok: true })}\n`);
        }
      });
    });

    await new Promise<void>((resolve) => {
      mockServer?.listen(TEST_SOCKET_PATH, resolve);
    });

    const response = await sendToDaemon({ type: 'clearSessions' });
    expect(response.ok).toBe(true);
  });

  it('sendToDaemon should reject when socket does not exist', async () => {
    const { sendToDaemon } = await import('../src/server/daemon-client.js');

    await expect(sendToDaemon({ type: 'clearSessions' })).rejects.toThrow(
      'daemon socket not found'
    );
  });

  it('sendToDaemon should reject on connection error', async () => {
    const { sendToDaemon, isDaemonRunning } = await import('../src/server/daemon-client.js');
    const { writeFileSync } = await import('node:fs');

    // Create a socket file without a server (stale socket)
    writeFileSync(TEST_SOCKET_PATH, '');

    expect(isDaemonRunning()).toBe(true);
    await expect(sendToDaemon({ type: 'clearSessions' })).rejects.toThrow();
  });
});
