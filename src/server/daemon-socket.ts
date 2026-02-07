import { existsSync, unlinkSync } from 'node:fs';
import { createServer, type Server, type Socket } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DAEMON_SOCKET_FILENAME } from '../constants.js';
import { clearAll, clearProjects, clearSessions, updateSession } from '../store/file-store.js';
import { flushPendingWrites } from '../store/write-cache.js';
import type { HookEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';

export interface DaemonRequest {
  type: 'hookEvent' | 'clearSessions' | 'clearAll' | 'clearProjects';
  payload?: HookEvent;
}

export interface DaemonResponse {
  ok: boolean;
  error?: string;
}

const SOCKET_PATH = join(homedir(), '.hqm', DAEMON_SOCKET_FILENAME);

let server: Server | null = null;

function handleRequest(request: DaemonRequest): DaemonResponse {
  try {
    switch (request.type) {
      case 'hookEvent': {
        if (!request.payload) {
          return { ok: false, error: 'missing payload for hookEvent' };
        }
        updateSession(request.payload);
        return { ok: true };
      }
      case 'clearSessions':
        clearSessions();
        return { ok: true };
      case 'clearAll':
        clearAll();
        return { ok: true };
      case 'clearProjects':
        clearProjects();
        return { ok: true };
      default:
        return { ok: false, error: `unknown request type: ${(request as DaemonRequest).type}` };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn('daemon-socket handleRequest error', { error: message });
    return { ok: false, error: message };
  }
}

function handleConnection(socket: Socket): void {
  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk.toString();
    const newlineIndex = buffer.indexOf('\n');
    if (newlineIndex === -1) return;

    const line = buffer.slice(0, newlineIndex);
    buffer = buffer.slice(newlineIndex + 1);

    let request: DaemonRequest;
    try {
      request = JSON.parse(line);
    } catch {
      const response: DaemonResponse = { ok: false, error: 'invalid JSON' };
      socket.end(`${JSON.stringify(response)}\n`);
      return;
    }

    const response = handleRequest(request);
    socket.end(`${JSON.stringify(response)}\n`);
  });

  socket.on('error', () => {
    // Client disconnected unexpectedly - ignore
  });
}

export function startDaemonSocket(): void {
  if (server) return;

  // Remove stale socket file
  if (existsSync(SOCKET_PATH)) {
    try {
      unlinkSync(SOCKET_PATH);
    } catch {
      // Ignore removal errors
    }
  }

  server = createServer(handleConnection);

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      logger.warn('daemon-socket: EADDRINUSE - another daemon may be running');
    } else {
      logger.warn('daemon-socket error', { error: error.message });
    }
  });

  server.listen(SOCKET_PATH, () => {
    logger.info('daemon-socket listening', { path: SOCKET_PATH });
  });
}

export async function stopDaemonSocket(): Promise<void> {
  const s = server;
  if (!s) return;

  await flushPendingWrites();

  return new Promise((resolve) => {
    s.close(() => {
      server = null;
      if (existsSync(SOCKET_PATH)) {
        try {
          unlinkSync(SOCKET_PATH);
        } catch {
          // Ignore removal errors
        }
      }
      resolve();
    });
  });
}

export function getDaemonSocketPath(): string {
  return SOCKET_PATH;
}
