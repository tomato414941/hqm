import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { WRITE_DEBOUNCE_MS } from '../constants.js';
import type { StoreData } from '../types/index.js';

/** Maximum number of retry attempts for write operations */
const MAX_WRITE_RETRIES = 3;

/** Delay between retries in milliseconds */
const RETRY_DELAY_MS = 50;

/** Write cache state */
let cachedStore: StoreData | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let storeDir: string = '';
let storeFile: string = '';

/**
 * Initialize the write cache with the store paths
 */
export function initWriteCache(dir: string, file: string): void {
  storeDir = dir;
  storeFile = file;
}

/**
 * Get the cached store data if available
 */
export function getCachedStore(): StoreData | null {
  return cachedStore;
}

/**
 * Ensure the store directory exists
 */
function ensureStoreDir(): void {
  if (!existsSync(storeDir)) {
    mkdirSync(storeDir, { recursive: true, mode: 0o700 });
  }
}

/**
 * Log a write error to the error log file
 */
function logWriteError(error: unknown, attempt: number): void {
  try {
    const errorLogFile = storeDir ? `${storeDir}/error.log` : '/tmp/hqm-error.log';
    const errorMessage = error instanceof Error ? error.message : String(error);
    const logEntry = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      type: 'write_error',
      attempt,
      error: errorMessage,
    })}\n`;
    appendFileSync(errorLogFile, logEntry);
  } catch {
    // Ignore logging errors to avoid recursive failures
  }
}

/**
 * Attempt to write with retry (async version)
 * Returns true if write succeeded, false otherwise
 */
async function attemptWriteAsync(data: StoreData): Promise<boolean> {
  for (let attempt = 1; attempt <= MAX_WRITE_RETRIES; attempt++) {
    try {
      ensureStoreDir();
      data.updated_at = new Date().toISOString();
      writeFileSync(storeFile, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 });
      return true;
    } catch (error) {
      logWriteError(error, attempt);
      if (attempt < MAX_WRITE_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }
  return false;
}

/**
 * Flush pending write to disk (async version)
 */
async function flushWriteAsync(): Promise<void> {
  if (cachedStore) {
    await attemptWriteAsync(cachedStore);
    cachedStore = null;
    writeTimer = null;
  } else {
    writeTimer = null;
  }
}

/**
 * Schedule a write with debouncing
 */
export function scheduleWrite(data: StoreData): void {
  cachedStore = data;

  // Cancel previous timer and schedule new write
  if (writeTimer) {
    clearTimeout(writeTimer);
  }
  writeTimer = setTimeout(() => {
    flushWriteAsync();
  }, WRITE_DEBOUNCE_MS);
}

/**
 * Immediately flush any pending writes (useful for testing and cleanup)
 */
export async function flushPendingWrites(): Promise<void> {
  if (writeTimer) {
    clearTimeout(writeTimer);
    await flushWriteAsync();
  }
}

/**
 * Reset the in-memory cache (useful for testing)
 */
export function resetStoreCache(): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  cachedStore = null;
}
