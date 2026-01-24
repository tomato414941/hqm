import { stat, statSync } from 'node:fs';
import { MAX_TTY_CACHE_SIZE, TTY_CACHE_TTL_MS } from '../constants.js';

// TTY check cache to avoid repeated statSync calls
const ttyCache = new Map<string, { alive: boolean; checkedAt: number }>();

/**
 * Evict oldest entries when cache exceeds max size
 * Uses FIFO eviction based on Map insertion order (O(1))
 */
function evictOldestIfNeeded(): void {
  if (ttyCache.size <= MAX_TTY_CACHE_SIZE) {
    return;
  }

  // Map の挿入順序を利用して O(1) で最も古いエントリを削除
  const oldestKey = ttyCache.keys().next().value;
  if (oldestKey !== undefined) {
    ttyCache.delete(oldestKey);
  }
}

/**
 * Check if a TTY device is still alive (exists in filesystem)
 * Results are cached for TTY_CACHE_TTL_MS to avoid repeated stat calls
 * @internal
 */
export function isTtyAlive(tty: string | undefined): boolean {
  if (!tty) return true; // Treat unknown TTY as alive

  const now = Date.now();
  const cached = ttyCache.get(tty);

  // Return cached result if still valid
  if (cached && now - cached.checkedAt < TTY_CACHE_TTL_MS) {
    return cached.alive;
  }

  // Check TTY and cache result
  let alive: boolean;
  try {
    statSync(tty);
    alive = true;
  } catch {
    alive = false;
  }
  ttyCache.set(tty, { alive, checkedAt: now });
  evictOldestIfNeeded();
  return alive;
}

/**
 * Check if a TTY device is still alive (async version for TUI)
 * Results are cached for TTY_CACHE_TTL_MS to avoid repeated stat calls
 * @internal
 */
export async function isTtyAliveAsync(tty: string | undefined): Promise<boolean> {
  if (!tty) return true; // Treat unknown TTY as alive

  const now = Date.now();
  const cached = ttyCache.get(tty);

  // Return cached result if still valid
  if (cached && now - cached.checkedAt < TTY_CACHE_TTL_MS) {
    return cached.alive;
  }

  // Check TTY asynchronously and cache result
  const alive = await new Promise<boolean>((resolve) => {
    stat(tty, (err) => {
      resolve(!err);
    });
  });

  ttyCache.set(tty, { alive, checkedAt: now });
  evictOldestIfNeeded();
  return alive;
}

/**
 * Clear the TTY cache (useful for testing)
 * @internal
 */
export function clearTtyCache(): void {
  ttyCache.clear();
}
