import { basename, dirname } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { startCodexWatcher } from '../codex/ingest.js';
import { SESSION_REFRESH_INTERVAL_MS, TMUX_REFRESH_INTERVAL_MS } from '../constants.js';
import { getSessionTimeoutMs } from '../store/config.js';
import {
  cleanupStaleSessions,
  getProjects,
  getSessions,
  getStorePath,
  syncTmuxSessionsIfNeeded,
  syncTmuxSessionsOnce,
} from '../store/file-store.js';
import { broadcastToClients } from './websocket.js';

export function createFileWatcher(wss: WebSocketServer): FSWatcher {
  startCodexWatcher();
  syncTmuxSessionsOnce();

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

  const tmuxInterval = setInterval(syncTmuxSessionsIfNeeded, TMUX_REFRESH_INTERVAL_MS);

  // Periodic cleanup for timeout detection
  const timeoutMs = getSessionTimeoutMs();
  const cleanupInterval =
    timeoutMs > 0 ? setInterval(cleanupStaleSessions, SESSION_REFRESH_INTERVAL_MS) : undefined;

  const originalClose = watcher.close.bind(watcher);
  watcher.close = () => {
    clearInterval(tmuxInterval);
    if (cleanupInterval) clearInterval(cleanupInterval);
    return originalClose();
  };

  return watcher;
}
