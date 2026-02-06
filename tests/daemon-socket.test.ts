import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaemonRequest, DaemonResponse } from '../src/server/daemon-socket.js';

const TEST_SOCKET_DIR = join(tmpdir(), `hqm-daemon-test-${process.pid}`);

vi.mock('../src/constants.js', () => ({
  DAEMON_SOCKET_FILENAME: 'test.sock',
}));

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => TEST_SOCKET_DIR,
  };
});

vi.mock('../src/store/file-store.js', () => ({
  updateSession: vi.fn(),
  clearSessions: vi.fn(),
  clearAll: vi.fn(),
  clearProjects: vi.fn(),
}));

vi.mock('../src/store/write-cache.js', () => ({
  flushPendingWrites: vi.fn().mockResolvedValue(undefined),
}));

describe('daemon-socket', () => {
  beforeEach(async () => {
    vi.resetModules();
    const { mkdirSync } = await import('node:fs');
    mkdirSync(TEST_SOCKET_DIR, { recursive: true });
    // Create the .hqm subdirectory that getDaemonSocketPath expects
    mkdirSync(join(TEST_SOCKET_DIR, '.hqm'), { recursive: true });
  });

  afterEach(async () => {
    // Try to stop the daemon socket if running
    try {
      const { stopDaemonSocket } = await import('../src/server/daemon-socket.js');
      await stopDaemonSocket();
    } catch {
      // Ignore
    }

    if (existsSync(TEST_SOCKET_DIR)) {
      rmSync(TEST_SOCKET_DIR, { recursive: true, force: true });
    }
  });

  it('should start and stop the daemon socket', async () => {
    const { startDaemonSocket, stopDaemonSocket, getDaemonSocketPath } = await import(
      '../src/server/daemon-socket.js'
    );

    startDaemonSocket();
    const socketPath = getDaemonSocketPath();

    // Give the server time to start listening
    await new Promise((r) => setTimeout(r, 100));

    expect(existsSync(socketPath)).toBe(true);

    await stopDaemonSocket();

    expect(existsSync(socketPath)).toBe(false);
  });

  it('should handle hookEvent requests', async () => {
    const { startDaemonSocket, stopDaemonSocket, getDaemonSocketPath } = await import(
      '../src/server/daemon-socket.js'
    );
    const { updateSession } = await import('../src/store/file-store.js');
    const { connect } = await import('node:net');

    startDaemonSocket();
    await new Promise((r) => setTimeout(r, 100));

    const response = await new Promise<DaemonResponse>((resolve, reject) => {
      const socket = connect(getDaemonSocketPath());
      let buffer = '';

      socket.on('connect', () => {
        const request: DaemonRequest = {
          type: 'hookEvent',
          payload: {
            session_id: 'test-123',
            cwd: '/tmp',
            hook_event_name: 'PreToolUse',
          },
        };
        socket.write(`${JSON.stringify(request)}\n`);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          resolve(JSON.parse(buffer.slice(0, idx)));
          socket.destroy();
        }
      });

      socket.on('error', reject);
    });

    expect(response.ok).toBe(true);
    expect(updateSession).toHaveBeenCalledWith(expect.objectContaining({ session_id: 'test-123' }));

    await stopDaemonSocket();
  });

  it('should handle clearSessions requests', async () => {
    const { startDaemonSocket, stopDaemonSocket, getDaemonSocketPath } = await import(
      '../src/server/daemon-socket.js'
    );
    const { clearSessions } = await import('../src/store/file-store.js');
    const { connect } = await import('node:net');

    startDaemonSocket();
    await new Promise((r) => setTimeout(r, 100));

    const response = await new Promise<DaemonResponse>((resolve, reject) => {
      const socket = connect(getDaemonSocketPath());
      let buffer = '';

      socket.on('connect', () => {
        socket.write(`${JSON.stringify({ type: 'clearSessions' })}\n`);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          resolve(JSON.parse(buffer.slice(0, idx)));
          socket.destroy();
        }
      });

      socket.on('error', reject);
    });

    expect(response.ok).toBe(true);
    expect(clearSessions).toHaveBeenCalled();

    await stopDaemonSocket();
  });

  it('should return error for hookEvent without payload', async () => {
    const { startDaemonSocket, stopDaemonSocket, getDaemonSocketPath } = await import(
      '../src/server/daemon-socket.js'
    );
    const { connect } = await import('node:net');

    startDaemonSocket();
    await new Promise((r) => setTimeout(r, 100));

    const response = await new Promise<DaemonResponse>((resolve, reject) => {
      const socket = connect(getDaemonSocketPath());
      let buffer = '';

      socket.on('connect', () => {
        socket.write(`${JSON.stringify({ type: 'hookEvent' })}\n`);
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          resolve(JSON.parse(buffer.slice(0, idx)));
          socket.destroy();
        }
      });

      socket.on('error', reject);
    });

    expect(response.ok).toBe(false);
    expect(response.error).toContain('missing payload');

    await stopDaemonSocket();
  });

  it('should return error for invalid JSON', async () => {
    const { startDaemonSocket, stopDaemonSocket, getDaemonSocketPath } = await import(
      '../src/server/daemon-socket.js'
    );
    const { connect } = await import('node:net');

    startDaemonSocket();
    await new Promise((r) => setTimeout(r, 100));

    const response = await new Promise<DaemonResponse>((resolve, reject) => {
      const socket = connect(getDaemonSocketPath());
      let buffer = '';

      socket.on('connect', () => {
        socket.write('not-json\n');
      });

      socket.on('data', (chunk) => {
        buffer += chunk.toString();
        const idx = buffer.indexOf('\n');
        if (idx !== -1) {
          resolve(JSON.parse(buffer.slice(0, idx)));
          socket.destroy();
        }
      });

      socket.on('error', reject);
    });

    expect(response.ok).toBe(false);
    expect(response.error).toContain('invalid JSON');

    await stopDaemonSocket();
  });

  it('should not start twice', async () => {
    const { startDaemonSocket, stopDaemonSocket, getDaemonSocketPath } = await import(
      '../src/server/daemon-socket.js'
    );

    startDaemonSocket();
    await new Promise((r) => setTimeout(r, 100));
    expect(existsSync(getDaemonSocketPath())).toBe(true);

    // Second call should be a no-op
    startDaemonSocket();
    await new Promise((r) => setTimeout(r, 50));
    expect(existsSync(getDaemonSocketPath())).toBe(true);

    await stopDaemonSocket();
  });

  it('stopDaemonSocket should be a no-op when not started', async () => {
    const { stopDaemonSocket } = await import('../src/server/daemon-socket.js');
    // Should not throw
    await stopDaemonSocket();
  });
});
