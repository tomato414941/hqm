import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { WRITE_DEBOUNCE_MS } from '../constants.js';
import type { StoreData } from '../types/index.js';

/** Maximum number of retry attempts for write operations */
const MAX_WRITE_RETRIES = 3;

/** Delay between retries in milliseconds */
const RETRY_DELAY_MS = 50;

export class WriteCache {
  private cachedStore: StoreData | null = null;
  private writeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storeDir: string,
    private readonly storeFile: string
  ) {}

  getCachedStore(): StoreData | null {
    return this.cachedStore;
  }

  private ensureStoreDir(): void {
    if (!existsSync(this.storeDir)) {
      mkdirSync(this.storeDir, { recursive: true, mode: 0o700 });
    }
  }

  private logWriteError(error: unknown, attempt: number): void {
    try {
      const errorLogFile = this.storeDir ? `${this.storeDir}/error.log` : '/tmp/hqm-error.log';
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

  private async attemptWriteAsync(data: StoreData): Promise<boolean> {
    for (let attempt = 1; attempt <= MAX_WRITE_RETRIES; attempt++) {
      try {
        this.ensureStoreDir();
        data.updated_at = new Date().toISOString();
        writeFileSync(this.storeFile, JSON.stringify(data), { encoding: 'utf-8', mode: 0o600 });
        return true;
      } catch (error) {
        this.logWriteError(error, attempt);
        if (attempt < MAX_WRITE_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }
    return false;
  }

  private async flushWriteAsync(): Promise<void> {
    if (this.cachedStore) {
      await this.attemptWriteAsync(this.cachedStore);
      this.cachedStore = null;
      this.writeTimer = null;
    } else {
      this.writeTimer = null;
    }
  }

  scheduleWrite(data: StoreData): void {
    this.cachedStore = data;

    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
    }
    this.writeTimer = setTimeout(() => {
      this.flushWriteAsync();
    }, WRITE_DEBOUNCE_MS);
  }

  async flushPendingWrites(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      await this.flushWriteAsync();
    }
  }

  resetStoreCache(): void {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer);
      this.writeTimer = null;
    }
    this.cachedStore = null;
  }
}

// Backward compatible singleton instance
let defaultInstance: WriteCache | null = null;

/**
 * Initialize the write cache with the store paths
 */
export function initWriteCache(dir: string, file: string): void {
  defaultInstance = new WriteCache(dir, file);
}

/**
 * Get the cached store data if available
 */
export function getCachedStore(): StoreData | null {
  return defaultInstance?.getCachedStore() ?? null;
}

/**
 * Schedule a write with debouncing
 */
export function scheduleWrite(data: StoreData): void {
  if (!defaultInstance) {
    throw new Error('WriteCache not initialized. Call initWriteCache first.');
  }
  defaultInstance.scheduleWrite(data);
}

/**
 * Immediately flush any pending writes (useful for testing and cleanup)
 */
export async function flushPendingWrites(): Promise<void> {
  if (defaultInstance) {
    await defaultInstance.flushPendingWrites();
  }
}

/**
 * Reset the in-memory cache (useful for testing)
 */
export function resetStoreCache(): void {
  if (defaultInstance) {
    defaultInstance.resetStoreCache();
  }
}
