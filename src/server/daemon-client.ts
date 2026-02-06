import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import type { DaemonRequest, DaemonResponse } from './daemon-socket.js';
import { getDaemonSocketPath } from './daemon-socket.js';

const TIMEOUT_MS = 1000;

export function isDaemonRunning(): boolean {
  return existsSync(getDaemonSocketPath());
}

export function sendToDaemon(request: DaemonRequest): Promise<DaemonResponse> {
  return new Promise((resolve, reject) => {
    const socketPath = getDaemonSocketPath();

    if (!existsSync(socketPath)) {
      reject(new Error('daemon socket not found'));
      return;
    }

    const socket = connect(socketPath);
    let buffer = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error('daemon request timed out'));
      }
    }, TIMEOUT_MS);

    socket.on('connect', () => {
      socket.write(`${JSON.stringify(request)}\n`);
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;

      const line = buffer.slice(0, newlineIndex);
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        try {
          resolve(JSON.parse(line));
        } catch {
          reject(new Error('invalid response from daemon'));
        }
        socket.destroy();
      }
    });

    socket.on('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    });

    socket.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error('daemon connection closed'));
      }
    });
  });
}
