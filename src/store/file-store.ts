import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DisplayOrderItem, HookEvent, Project, Session, StoreData } from '../types/index.js';
import { isValidStoreData } from '../utils/type-guards.js';
import {
  assignSessionToProject,
  cleanupStoreDisplayOrder,
  getDisplayOrderFromStore,
  getSessionProjectFromStore,
  moveSessionInDisplayOrder,
  reorderProjectInStore,
  UNGROUPED_PROJECT_ID,
} from './display-order.js';
import { migrateSessionKeys, migrateToDisplayOrder } from './migrations.js';
import {
  clearAllProjectsFromStore,
  createProjectInStore,
  deleteProjectFromStore,
  getProjectsFromStore,
} from './project-store.js';
import {
  clearSessionsFromStore,
  getSessionFromStore,
  getSessionsFromStore,
  removeSessionFromStore,
  updateSessionInStore,
  updateSessionSummaryInStore,
} from './session-store.js';
import { getCachedStore, initWriteCache, scheduleWrite } from './write-cache.js';

// Re-export for backward compatibility
export { getSessionKey } from '../utils/session-key.js';
export { determineStatus } from '../utils/session-status.js';
export { isTtyAliveAsync } from '../utils/tty.js';
export { UNGROUPED_PROJECT_ID } from './display-order.js';
export { flushPendingWrites, resetStoreCache } from './write-cache.js';

const STORE_DIR = join(homedir(), '.hqm');
const STORE_FILE = join(STORE_DIR, 'sessions.json');

// Initialize write cache with store paths
initWriteCache(STORE_DIR, STORE_FILE);

function ensureStoreDir(): void {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true, mode: 0o700 });
  }
}

function getEmptyStoreData(): StoreData {
  return {
    sessions: {},
    displayOrder: [{ type: 'project', id: UNGROUPED_PROJECT_ID }],
    updated_at: new Date().toISOString(),
  };
}

export function readStore(): StoreData {
  // Return cached data if available (for batched writes consistency)
  const cached = getCachedStore();
  if (cached) {
    return cached;
  }

  ensureStoreDir();
  if (!existsSync(STORE_FILE)) {
    return getEmptyStoreData();
  }
  try {
    const content = readFileSync(STORE_FILE, 'utf-8');
    const parsed: unknown = JSON.parse(content);
    if (!isValidStoreData(parsed)) {
      return getEmptyStoreData();
    }
    // Migrate old data structure if needed
    migrateToDisplayOrder(parsed);
    // Migrate session keys from session_id:tty to session_id only
    migrateSessionKeys(parsed);
    return parsed;
  } catch {
    return getEmptyStoreData();
  }
}

export function writeStore(data: StoreData): void {
  scheduleWrite(data);
}

// Session operations
export function updateSession(event: HookEvent): Session {
  const store = readStore();
  return updateSessionInStore(store, event, writeStore);
}

export async function getSessions(): Promise<Session[]> {
  const store = readStore();
  return getSessionsFromStore(store, writeStore);
}

export function getSession(sessionId: string): Session | undefined {
  const store = readStore();
  return getSessionFromStore(store, sessionId);
}

export function removeSession(sessionId: string): void {
  const store = readStore();
  removeSessionFromStore(store, sessionId, writeStore);
}

export function clearSessions(): void {
  const store = readStore();
  clearSessionsFromStore(store, writeStore);
}

export function updateSessionSummary(
  sessionId: string,
  _tty: string | undefined,
  summary: string,
  transcriptSize?: number
): void {
  const store = readStore();
  updateSessionSummaryInStore(store, sessionId, summary, transcriptSize, writeStore);
}

// Project operations
export function createProject(name: string): Project {
  const store = readStore();
  const project = createProjectInStore(store, name);
  writeStore(store);
  return project;
}

export function getProjects(): Project[] {
  const store = readStore();
  return getProjectsFromStore(store);
}

export function deleteProject(id: string): void {
  const store = readStore();
  deleteProjectFromStore(store, id);
  writeStore(store);
}

export function clearProjects(): void {
  const store = readStore();
  clearAllProjectsFromStore(store);
  writeStore(store);
}

export function clearAll(): void {
  const store = readStore();
  clearSessionsFromStore(store, writeStore);
  clearAllProjectsFromStore(store);
  writeStore(store);
}

// DisplayOrder operations
export function getDisplayOrder(): DisplayOrderItem[] {
  const store = readStore();
  return getDisplayOrderFromStore(store);
}

export function getSessionProject(sessionKey: string): string | undefined {
  const store = readStore();
  return getSessionProjectFromStore(store, sessionKey);
}

export function moveInDisplayOrder(sessionKey: string, direction: 'up' | 'down'): boolean {
  const store = readStore();
  const result = moveSessionInDisplayOrder(store, sessionKey, direction);
  if (result) {
    writeStore(store);
  }
  return result;
}

export function assignSessionToProjectInOrder(
  sessionKey: string,
  projectId: string | undefined
): void {
  const store = readStore();
  assignSessionToProject(store, sessionKey, projectId);
  writeStore(store);
}

export function cleanupDisplayOrder(): boolean {
  const store = readStore();
  const result = cleanupStoreDisplayOrder(store);
  if (result) {
    writeStore(store);
  }
  return result;
}

export function reorderProject(projectId: string, direction: 'up' | 'down'): void {
  const store = readStore();
  reorderProjectInStore(store, projectId, direction);
  writeStore(store);
}

export function getStorePath(): string {
  return STORE_FILE;
}
