import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import type { WebSocketServer } from 'ws';
import { generateSessionSummaryIfNeeded } from '../services/summary.js';
import { getProjects, getSessions, getStorePath } from '../store/file-store.js';
import { broadcastToClients } from './websocket.js';

// Track sessions that are currently generating summaries
const generatingSummaries = new Set<string>();

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
      const projects = getProjects();
      broadcastToClients(wss, { type: 'sessions', data: sessions, projects });

      // Clean up stale entries from generatingSummaries
      const activeSessionIds = new Set(sessions.map((s) => s.session_id));
      for (const id of generatingSummaries) {
        if (!activeSessionIds.has(id)) {
          generatingSummaries.delete(id);
        }
      }

      // Generate summaries for stopped sessions without summary (in background)
      for (const session of sessions) {
        if (session.status === 'stopped' && !session.summary) {
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
  });

  return watcher;
}
