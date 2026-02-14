import { SESSION_REFRESH_INTERVAL_MS } from '../constants.js';
import { cleanupStaleSessions } from './file-store.js';

let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let cleanupOwnerCount = 0;
let cleanupInProgress = false;

async function runCleanupSafely(): Promise<void> {
  if (cleanupInProgress) {
    return;
  }
  cleanupInProgress = true;
  try {
    await cleanupStaleSessions();
  } finally {
    cleanupInProgress = false;
  }
}

export function startCleanupLoop(): void {
  cleanupOwnerCount++;
  if (cleanupTimer) {
    return;
  }

  cleanupTimer = setInterval(() => {
    void runCleanupSafely();
  }, SESSION_REFRESH_INTERVAL_MS);
}

export function stopCleanupLoop(): void {
  if (cleanupOwnerCount > 0) {
    cleanupOwnerCount--;
  }

  if (cleanupOwnerCount > 0 || !cleanupTimer) {
    return;
  }

  clearInterval(cleanupTimer);
  cleanupTimer = null;
}

export async function runCleanupOnce(): Promise<void> {
  await runCleanupSafely();
}
