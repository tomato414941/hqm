import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DisplayOrderItem, HookEvent, Project, Session, StoreData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { isValidStoreData } from '../utils/type-guards.js';
import {
  addSessionToDisplayOrder,
  assignSessionToProject,
  cleanupStoreDisplayOrder,
  getDisplayOrderFromStore,
  getSessionProjectFromStore,
  moveSessionInDisplayOrder,
  reorderProjectInStore,
  UNGROUPED_PROJECT_ID,
} from './display-order.js';
import {
  migrateRemoveAssignedCwds,
  migrateSessionKeys,
  migrateToDisplayOrder,
} from './migrations.js';
import {
  clearAllProjectsFromStore,
  createProjectInStore,
  deleteProjectFromStore,
  getProjectsFromStore,
} from './project-store.js';
import {
  cleanupStaleSessionsInStore,
  clearSessionsFromStore,
  getSessionFromStore,
  getSessionsFromStore,
  removeSessionFromStore,
  updateCodexSessionStatuses,
  updateSessionInStore,
  updateSessionLastMessageInStore,
} from './session-store.js';
import { syncTranscripts } from './transcript-sync.js';
import { getCachedStore, initWriteCache, scheduleWrite } from './write-cache.js';

// Re-export write-cache utilities
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
    projects: {},
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
    // Remove deprecated assignedCwds from projects
    migrateRemoveAssignedCwds(parsed);
    return parsed;
  } catch {
    logger.warn('Failed to parse sessions.json');
    return getEmptyStoreData();
  }
}

export function writeStore(data: StoreData): void {
  scheduleWrite(data);
}

// Session operations
export function updateSession(event: HookEvent): Session | undefined {
  const store = readStore();
  return updateSessionInStore(store, event, writeStore);
}

export function getSessions(): Session[] {
  const store = readStore();
  const sessions = getSessionsFromStore(store);
  if (syncTranscripts(sessions, store)) {
    writeStore(store);
  }
  return sessions;
}

export async function cleanupStaleSessions(): Promise<void> {
  const store = readStore();
  await cleanupStaleSessionsInStore(store, writeStore);
  updateCodexSessionStatuses(store, writeStore);
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

export function updateSessionLastMessage(
  sessionId: string,
  message: string,
  updatedAt?: string
): void {
  const store = readStore();
  updateSessionLastMessageInStore(store, sessionId, message, writeStore, updatedAt);
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

export function registerCodexSession(info: {
  tty: string;
  tmuxTarget: string;
  paneId: string;
}): string {
  const cleanedPaneId = info.paneId.replace(/^%+/, '');
  const sessionId = `codex-n-${cleanedPaneId}`;
  const now = new Date().toISOString();

  const store = readStore();
  const session: Session = {
    session_id: sessionId,
    cwd: process.cwd(),
    initial_cwd: process.cwd(),
    tty: info.tty,
    agent: 'codex',
    tmux_target: info.tmuxTarget,
    tmux_pane_id: info.paneId,
    status: 'running',
    created_at: now,
    updated_at: now,
  };

  store.sessions[sessionId] = session;
  addSessionToDisplayOrder(store, sessionId);
  writeStore(store);

  return sessionId;
}

export function getStorePath(): string {
  return STORE_FILE;
}
