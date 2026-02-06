import { basename, dirname } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { startCodexWatcher } from '../codex/ingest.js';
import { TMUX_REFRESH_INTERVAL_MS } from '../constants.js';
import { generateSessionSummaryIfNeeded } from '../services/summary.js';
import {
  getProjects,
  getSessions,
  getStorePath,
  syncTmuxSessionsIfNeeded,
  syncTmuxSessionsOnce,
} from '../store/file-store.js';
import { broadcastToClients } from './websocket.js';

// Track sessions that are currently generating summaries
const generatingSummaries = new Set<string>();

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
    void (async () => {
      const sessions = await getSessions();
      const projects = getProjects();
      broadcastToClients(wss, { type: 'sessions', data: sessions, projects });

      // Clean up stale entries from generatingSummaries
      const activeSessionIds = new Set(sessions.map((s) => s.session_id));
      for (const id of generatingSummaries) {
        if (!activeSessionIds.has(id)) {
          generatingSummaries.delete(id);
        }
      }

      // Generate summaries for sessions that need it (in background)
      for (const session of sessions) {
        if (session.needs_summary) {
          if (generatingSummaries.has(session.session_id)) {
            continue; // Already generating
          }
          generatingSummaries.add(session.session_id);
          generateSessionSummaryIfNeeded(session)
            .then((summary) => {
              if (summary) {
                // Re-broadcast with updated summary
                void getSessions().then((updated) => {
                  const updatedProjects = getProjects();
                  broadcastToClients(wss, {
                    type: 'sessions',
                    data: updated,
                    projects: updatedProjects,
                  });
                });
              }
            })
            .finally(() => {
              generatingSummaries.delete(session.session_id);
            });
        }
      }
    })();
  };

  watcher.on('change', (filePath) => {
    if (basename(filePath) === storeBasename) handleChange();
  });
  watcher.on('add', (filePath) => {
    if (basename(filePath) === storeBasename) handleChange();
  });

  const tmuxInterval = setInterval(syncTmuxSessionsIfNeeded, TMUX_REFRESH_INTERVAL_MS);
  const originalClose = watcher.close.bind(watcher);
  watcher.close = () => {
    clearInterval(tmuxInterval);
    return originalClose();
  };

  return watcher;
}
