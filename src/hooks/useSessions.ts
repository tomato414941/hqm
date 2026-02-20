import { basename, dirname } from 'node:path';
import chokidar from 'chokidar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SELF_WRITE_SUPPRESSION_MS, SESSION_UPDATE_DEBOUNCE_MS } from '../constants.js';
import { runCleanupOnce, startCleanupLoop, stopCleanupLoop } from '../store/cleanup-loop.js';
import {
  getProjects,
  getSessionsLight,
  getStorePath,
  refreshSessionData,
} from '../store/file-store.js';
import {
  offRefresh,
  onRefresh,
  runRefreshOnce,
  startRefreshLoop,
  stopRefreshLoop,
} from '../store/refresh-loop.js';
import { getLastWriteTimestampMs } from '../store/write-cache.js';
import type { Project, Session } from '../types/index.js';

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

  const loadSessionsLight = useCallback(() => {
    try {
      const data = getSessionsLight();
      const projectData = getProjects();
      setSessions(data);
      setProjects(projectData);
      setError(null);
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
      loadSessionsLight();
      debounceTimerRef.current = null;
    }, SESSION_UPDATE_DEBOUNCE_MS);
  }, [loadSessionsLight]);

  useEffect(() => {
    // Initial load: full refresh to get Codex statuses + transcripts
    refreshSessionData();
    loadSessionsLight();
    void runCleanupOnce();
    startCleanupLoop();
    startRefreshLoop();

    // Refresh loop listener: reload light data when heavy refresh completes
    const handleRefresh = () => loadSessionsLight();
    onRefresh(handleRefresh);

    // Initial heavy refresh
    runRefreshOnce();

    // Watch file changes (debounced, with self-write suppression)
    const storePath = getStorePath();
    const storeBasename = basename(storePath);
    const watcher = chokidar.watch(dirname(storePath), {
      persistent: true,
      ignoreInitial: true,
      usePolling: false,
      depth: 0,
    });

    const handleChange = (filePath: string) => {
      if (basename(filePath) !== storeBasename) return;
      const elapsed = Date.now() - getLastWriteTimestampMs();
      if (elapsed < SELF_WRITE_SUPPRESSION_MS) return;
      debouncedLoadSessions();
    };

    watcher.on('change', handleChange);
    watcher.on('add', handleChange);

    return () => {
      watcher.close();
      stopCleanupLoop();
      stopRefreshLoop();
      offRefresh(handleRefresh);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadSessionsLight, debouncedLoadSessions]);

  return { sessions, projects, loading, error };
}
