import { basename, dirname } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { SELF_WRITE_SUPPRESSION_MS, SESSION_UPDATE_DEBOUNCE_MS } from '../constants.js';
import { getProjects, getSessionsLight, getStorePath } from '../store/file-store.js';
import { getLastWriteTimestampMs } from '../store/write-cache.js';
import { broadcastToClients } from './websocket.js';

export function createFileWatcher(wss: WebSocketServer): FSWatcher {
  const storePath = getStorePath();
  const storeBasename = basename(storePath);
  const watcher = chokidar.watch(dirname(storePath), {
    ignoreInitial: true,
    depth: 0,
  });

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleChange = () => {
    const elapsed = Date.now() - getLastWriteTimestampMs();
    if (elapsed < SELF_WRITE_SUPPRESSION_MS) return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const sessions = getSessionsLight();
      const projects = getProjects();
      broadcastToClients(wss, { type: 'sessions', data: sessions, projects });
    }, SESSION_UPDATE_DEBOUNCE_MS);
  };

  watcher.on('change', (filePath) => {
    if (basename(filePath) === storeBasename) handleChange();
  });
  watcher.on('add', (filePath) => {
    if (basename(filePath) === storeBasename) handleChange();
  });
  return watcher;
}
