import { basename, dirname } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { SESSION_REFRESH_INTERVAL_MS } from '../constants.js';
import {
  cleanupStaleSessions,
  getProjects,
  getSessions,
  getStorePath,
} from '../store/file-store.js';
import { broadcastToClients } from './websocket.js';

export function createFileWatcher(wss: WebSocketServer): FSWatcher {
  const storePath = getStorePath();
  const storeBasename = basename(storePath);
  const watcher = chokidar.watch(dirname(storePath), {
    ignoreInitial: true,
    depth: 0,
  });

  const handleChange = () => {
    const sessions = getSessions();
    const projects = getProjects();
    broadcastToClients(wss, { type: 'sessions', data: sessions, projects });
  };

  watcher.on('change', (filePath) => {
    if (basename(filePath) === storeBasename) handleChange();
  });
  watcher.on('add', (filePath) => {
    if (basename(filePath) === storeBasename) handleChange();
  });

  // Periodic cleanup for TTY close detection and timeout
  const cleanupInterval = setInterval(cleanupStaleSessions, SESSION_REFRESH_INTERVAL_MS);

  const originalClose = watcher.close.bind(watcher);
  watcher.close = () => {
    clearInterval(cleanupInterval);
    return originalClose();
  };

  return watcher;
}
