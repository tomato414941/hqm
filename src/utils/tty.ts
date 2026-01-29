import { execFileSync } from 'node:child_process';
import { readlinkSync, stat, statSync } from 'node:fs';
import { MAX_TTY_CACHE_SIZE, TTY_CACHE_TTL_MS } from '../constants.js';
import { endPerf, startPerf } from './perf.js';

/** Maximum depth to search ancestor processes for TTY */
const MAX_ANCESTOR_DEPTH = 5;
const TTY_PATH_REGEX = /^\/dev\/(pts\/\d+|tty\d+)$/;

// TTY check cache to avoid repeated stat calls
const ttyCache = new Map<string, { alive: boolean; checkedAt: number }>();

/**
 * Evict oldest entries when cache exceeds max size
 * Uses FIFO eviction based on Map insertion order (O(1))
 */
function evictOldestIfNeeded(): void {
  if (ttyCache.size <= MAX_TTY_CACHE_SIZE) {
    return;
  }

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

function getTtyFromFds(): { tty: string; fd: number } | undefined {
  for (const fd of [0, 1, 2]) {
    try {
      const target = readlinkSync(`/proc/self/fd/${fd}`);
      if (TTY_PATH_REGEX.test(target)) {
        return { tty: target, fd };
      }
    } catch {
      // Ignore and try next fd
    }
  }
  return undefined;
}

/**
 * Get TTY from ancestor processes
 * Traverses parent process chain to find the controlling TTY
 */
export function getTtyFromAncestors(): string | undefined {
  const span = startPerf('getTtyFromAncestors', { max_depth: MAX_ANCESTOR_DEPTH });
  const fdResult = getTtyFromFds();
  if (fdResult) {
    endPerf(span, { found: true, source: 'fd', fd: fdResult.fd });
    return fdResult.tty;
  }
  let psCalls = 0;
  let depth = 0;
  try {
    let currentPid = process.ppid;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      depth = i + 1;
      psCalls++;
      const output = execFileSync('ps', ['-o', 'tty=,ppid=', '-p', String(currentPid)], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      const match = output.match(/^(\S*)\s+(\S+)?/);
      const ttyName = match?.[1] ?? '';
      const ppidRaw = match?.[2];
      const isValidTty = ttyName && ttyName !== '?' && ttyName !== '';
      if (isValidTty) {
        const resolvedTty = `/dev/${ttyName}`;
        endPerf(span, { found: true, depth, ps_calls: psCalls, source: 'ps' });
        return resolvedTty;
      }
      const ppid = ppidRaw?.trim();
      if (!ppid) break;
      currentPid = parseInt(ppid, 10);
    }
  } catch {
    endPerf(span, { found: false, error: true, depth, ps_calls: psCalls, source: 'ps' });
    return undefined;
  }
  endPerf(span, { found: false, depth, ps_calls: psCalls, source: 'ps' });
  return undefined;
}
