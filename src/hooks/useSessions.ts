import chokidar from 'chokidar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { SESSION_REFRESH_INTERVAL_MS, SESSION_UPDATE_DEBOUNCE_MS } from '../constants.js';
import { getSessionTimeoutMs } from '../store/config.js';
import { getSessions, getStorePath } from '../store/file-store.js';
import type { Session } from '../types/index.js';

export function useSessions(): {
  sessions: Session[];
  loading: boolean;
  error: Error | null;
} {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await getSessions();
      setSessions(data);
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
    const watcher = chokidar.watch(storePath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: false, // Use native inotify on Linux instead of polling
      // awaitWriteFinish removed - debounce handles write stability
    });

    watcher.on('change', debouncedLoadSessions);
    watcher.on('add', debouncedLoadSessions);

    // Periodic refresh for timeout detection (only if timeout is enabled)
    const timeoutMs = getSessionTimeoutMs();
    let interval: ReturnType<typeof setInterval> | undefined;
    if (timeoutMs > 0) {
      interval = setInterval(loadSessions, SESSION_REFRESH_INTERVAL_MS);
    }

    return () => {
      watcher.close();
      if (interval) {
        clearInterval(interval);
      }
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [loadSessions, debouncedLoadSessions]);

  return { sessions, loading, error };
}
