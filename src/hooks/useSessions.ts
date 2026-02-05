import chokidar from 'chokidar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { startCodexWatcher } from '../codex/ingest.js';
import {
  SESSION_REFRESH_INTERVAL_MS,
  SESSION_UPDATE_DEBOUNCE_MS,
  TMUX_REFRESH_INTERVAL_MS,
} from '../constants.js';
import { generateSessionSummaryIfNeeded } from '../services/summary.js';
import { getSessionTimeoutMs } from '../store/config.js';
import {
  getProjects,
  getSessions,
  getStorePath,
  syncTmuxSessionsIfNeeded,
  syncTmuxSessionsOnce,
} from '../store/file-store.js';
import type { Project, Session } from '../types/index.js';

// Track sessions that are currently generating summaries
const generatingSummaries = new Set<string>();

export function useSessions(): {
  sessions: Session[];
  projects: Project[];
  loading: boolean;
  error: Error | null;
} {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      const projectData = getProjects();
      setSessions(data);
      setProjects(projectData);
      setError(null);

      // Clean up stale entries from generatingSummaries
      const activeSessionIds = new Set(data.map((s) => s.session_id));
      for (const id of generatingSummaries) {
        if (!activeSessionIds.has(id)) {
          generatingSummaries.delete(id);
        }
      }

      // Generate summaries for sessions that need it (in background)
      for (const session of data) {
        if (session.needs_summary) {
          if (generatingSummaries.has(session.session_id)) {
            continue; // Already generating
          }
          generatingSummaries.add(session.session_id);
          generateSessionSummaryIfNeeded(session)
            .then((summary) => {
              if (summary) {
                // Trigger re-render with updated sessions
                getSessions().then(setSessions);
              }
            })
            .finally(() => {
              generatingSummaries.delete(session.session_id);
            });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Failed to load sessions'));
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedLoadSessions = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      loadSessions();
      debounceTimerRef.current = null;
    }, SESSION_UPDATE_DEBOUNCE_MS);
  }, [loadSessions]);

  useEffect(() => {
    startCodexWatcher();
    syncTmuxSessionsOnce();

    // Initial load (immediate, no debounce)
    loadSessions();

    // Watch file changes (debounced)
    const storePath = getStorePath();
    const watcher = chokidar.watch(storePath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: false, // Use native inotify on Linux instead of polling
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    watcher.on('change', debouncedLoadSessions);
    watcher.on('add', debouncedLoadSessions);

    // Periodic refresh for timeout detection (only if timeout is enabled)
    const timeoutMs = getSessionTimeoutMs();
    let interval: ReturnType<typeof setInterval> | undefined;
    if (timeoutMs > 0) {
      interval = setInterval(loadSessions, SESSION_REFRESH_INTERVAL_MS);
    }

    const tmuxInterval = setInterval(syncTmuxSessionsIfNeeded, TMUX_REFRESH_INTERVAL_MS);

    return () => {
      watcher.close();
      if (interval) {
        clearInterval(interval);
      }
      clearInterval(tmuxInterval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadSessions, debouncedLoadSessions]);

  return { sessions, projects, loading, error };
}
