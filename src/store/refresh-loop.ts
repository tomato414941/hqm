import { EventEmitter } from 'node:events';
import { SESSION_DATA_REFRESH_INTERVAL_MS } from '../constants.js';
import { refreshSessionData } from './file-store.js';

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let refreshOwnerCount = 0;
let refreshInProgress = false;

const emitter = new EventEmitter();

function runRefreshSafely(): void {
  if (refreshInProgress) {
    return;
  }
  refreshInProgress = true;
  try {
    refreshSessionData();
    emitter.emit('refresh');
  } finally {
    refreshInProgress = false;
  }
}

export function startRefreshLoop(): void {
  refreshOwnerCount++;
  if (refreshTimer) {
    return;
  }

  refreshTimer = setInterval(() => {
    runRefreshSafely();
  }, SESSION_DATA_REFRESH_INTERVAL_MS);
}

export function stopRefreshLoop(): void {
  if (refreshOwnerCount > 0) {
    refreshOwnerCount--;
  }

  if (refreshOwnerCount > 0 || !refreshTimer) {
    return;
  }

  clearInterval(refreshTimer);
  refreshTimer = null;
}

export function runRefreshOnce(): void {
  runRefreshSafely();
}

export function onRefresh(listener: () => void): void {
  emitter.on('refresh', listener);
}

export function offRefresh(listener: () => void): void {
  emitter.off('refresh', listener);
}
