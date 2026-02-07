import { basename, dirname } from 'node:path';
import chokidar from 'chokidar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SESSION_REFRESH_INTERVAL_MS, SESSION_UPDATE_DEBOUNCE_MS } from '../constants.js';
import {
  cleanupStaleSessions,
  getProjects,
  getSessions,
  getStorePath,
} from '../store/file-store.js';
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

  const loadSessions = useCallback(() => {
    try {
      const data = getSessions();
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
      loadSessions();
      debounceTimerRef.current = null;
    }, SESSION_UPDATE_DEBOUNCE_MS);
  }, [loadSessions]);

  useEffect(() => {
    // Initial load (immediate, no debounce)
    loadSessions();

    // Watch file changes (debounced)
    const storePath = getStorePath();
    const storeBasename = basename(storePath);
    const watcher = chokidar.watch(dirname(storePath), {
      persistent: true,
      ignoreInitial: true,
      usePolling: false, // Use native inotify on Linux instead of polling
      depth: 0,
    });

    watcher.on('change', (filePath) => {
      if (basename(filePath) === storeBasename) debouncedLoadSessions();
    });
    watcher.on('add', (filePath) => {
      if (basename(filePath) === storeBasename) debouncedLoadSessions();
    });

    // Periodic cleanup for TTY close detection and timeout
    // cleanup → writeStore → chokidar detects change → debouncedLoadSessions fires
    const cleanupInterval = setInterval(cleanupStaleSessions, SESSION_REFRESH_INTERVAL_MS);

    return () => {
      watcher.close();
      clearInterval(cleanupInterval);
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadSessions, debouncedLoadSessions]);

  return { sessions, projects, loading, error };
}
