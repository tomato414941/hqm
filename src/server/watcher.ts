import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { getSessions, getStorePath } from '../store/file-store.js';
import { broadcastToClients } from './websocket.js';

export function createFileWatcher(wss: WebSocketServer): FSWatcher {
  const storePath = getStorePath();
  const watcher = chokidar.watch(storePath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('change', () => {
    void (async () => {
      const sessions = await getSessions();
      broadcastToClients(wss, { type: 'sessions', data: sessions });
    })();
  });

  return watcher;
}
