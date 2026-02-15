import { basename, dirname } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { SESSION_UPDATE_DEBOUNCE_MS } from '../constants.js';
import { getProjects, getSessions, getStorePath } from '../store/file-store.js';
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
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      const sessions = getSessions();
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
