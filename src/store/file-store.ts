import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { isCodexSessionId } from '../codex/paths.js';
import { TMUX_INFERENCE_WINDOW_MS } from '../constants.js';
import type { DisplayOrderItem, HookEvent, Project, Session, StoreData } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { parseISOTimestamp } from '../utils/time.js';
import { listTmuxPanesDetails, type TmuxPaneDetails } from '../utils/tmux.js';
import { isValidStoreData } from '../utils/type-guards.js';
import {
  addSessionToDisplayOrder,
  assignSessionToProject,
  cleanupStoreDisplayOrder,
  getDisplayOrderFromStore,
  getSessionProjectFromStore,
  moveSessionInDisplayOrder,
  removeSessionFromDisplayOrder,
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
  updateSessionInStore,
  updateSessionLastMessageInStore,
} from './session-store.js';
import { syncTranscripts } from './transcript-sync.js';
import { getCachedStore, initWriteCache, scheduleWrite } from './write-cache.js';

// Re-export for backward compatibility
export { getSessionKey } from '../utils/session-key.js';
export { determineStatus } from '../utils/session-status.js';
export { isTtyAliveAsync } from '../utils/tty.js';
export { UNGROUPED_PROJECT_ID } from './display-order.js';
export { flushPendingWrites, resetStoreCache } from './write-cache.js';

const STORE_DIR = join(homedir(), '.hqm');
const STORE_FILE = join(STORE_DIR, 'sessions.json');
const TMUX_SESSION_PREFIX = 'tmux-';
const TMUX_SYNC_THROTTLE_MS = 1000;
let lastTmuxSyncAt = 0;

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

type AgentType = 'claude' | 'codex';

function detectAgentFromCommand(command: string): AgentType | null {
  const normalized = command.toLowerCase();
  if (normalized.includes('codex')) return 'codex';
  if (normalized.includes('claude')) return 'claude';
  return null;
}

function buildTmuxSessionId(paneId: string, tty: string, target: string): string {
  const cleanedPaneId = paneId.replace(/^%+/, '');
  if (cleanedPaneId) return `${TMUX_SESSION_PREFIX}${cleanedPaneId}`;
  if (tty) {
    return `${TMUX_SESSION_PREFIX}${tty.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  }
  return `${TMUX_SESSION_PREFIX}${target.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
}

function resolveUpdatedAt(existing: string | undefined, lastActiveSeconds: number): string {
  const candidate =
    lastActiveSeconds > 0 ? new Date(lastActiveSeconds * 1000).toISOString() : undefined;

  if (!existing) {
    return candidate ?? new Date().toISOString();
  }

  if (!candidate) return existing;

  const existingMs = parseISOTimestamp(existing);
  if (existingMs === null) return candidate;

  return Date.parse(candidate) > existingMs ? candidate : existing;
}

function normalizePath(path: string): string {
  if (!path) return '';
  return path.replace(/\/+$/, '');
}

function cwdMatchScore(paneCwd: string, sessionCwd: string): number {
  const pane = normalizePath(paneCwd);
  const target = normalizePath(sessionCwd);
  if (!pane || !target) return 0;
  if (pane === target) return 3;
  if (pane.startsWith(`${target}/`) || target.startsWith(`${pane}/`)) return 2;
  return 0;
}

function detectAgentFromSession(session: Session): AgentType {
  if (session.agent) return session.agent;
  return isCodexSessionId(session.session_id) ? 'codex' : 'claude';
}

function findBestPaneMatch(
  session: Session,
  panes: TmuxPaneDetails[],
  usedPaneIds: Set<string>
): TmuxPaneDetails | undefined {
  if (panes.length === 0) return undefined;

  const candidates: Array<{
    pane: TmuxPaneDetails;
    score: number;
  }> = [];

  for (const pane of panes) {
    if (usedPaneIds.has(pane.paneId)) continue;
    const score = cwdMatchScore(pane.cwd, session.cwd);
    if (score === 0) continue;
    candidates.push({ pane, score });
  }

  if (candidates.length === 0) return undefined;

  candidates.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.pane.active !== b.pane.active) return a.pane.active ? -1 : 1;
    return a.pane.target.localeCompare(b.pane.target);
  });

  return candidates[0].pane;
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
    return getEmptyStoreData();
  }
}

export function writeStore(data: StoreData): void {
  scheduleWrite(data);
}

export function syncTmuxSessionsOnce(): void {
  const panes = listTmuxPanesDetails();
  if (panes.length === 0) return;

  const store = readStore();
  let hasChanges = false;

  const stats = {
    panes: panes.length,
    agentPanes: 0,
    hookSessions: 0,
    matched: 0,
    updatedExisting: 0,
    createdTmux: 0,
    removedTmux: 0,
    skippedTty: 0,
    skippedOld: 0,
  };

  const nonTmuxTtys = new Set<string>();
  for (const session of Object.values(store.sessions)) {
    if (session.tty && session.source !== 'tmux') {
      nonTmuxTtys.add(session.tty);
      stats.hookSessions += 1;
    }
  }

  const panesByTty = new Map<string, TmuxPaneDetails>();
  const panesByAgent: Record<AgentType, TmuxPaneDetails[]> = {
    claude: [],
    codex: [],
  };

  for (const pane of panes) {
    if (pane.tty) {
      panesByTty.set(pane.tty, pane);
    }
    const agent = detectAgentFromCommand(pane.command);
    if (agent) {
      panesByAgent[agent].push(pane);
      stats.agentPanes += 1;
    }
  }

  const usedPaneIds = new Set<string>();

  for (const [key, session] of Object.entries(store.sessions)) {
    if (session.source === 'tmux') continue;

    let updated = false;
    const agent = detectAgentFromSession(session);
    if (!session.agent) {
      session.agent = agent;
      updated = true;
    }

    let pane: TmuxPaneDetails | undefined;
    if (session.tty) {
      pane = panesByTty.get(session.tty);
    }
    if (!pane && agent === 'codex') {
      const updatedMs = parseISOTimestamp(session.updated_at);
      if (updatedMs !== null && Date.now() - updatedMs > TMUX_INFERENCE_WINDOW_MS) {
        stats.skippedOld += 1;
        if (updated) {
          store.sessions[key] = session;
          hasChanges = true;
        }
        continue;
      }
      pane = findBestPaneMatch(session, panesByAgent[agent], usedPaneIds);
    }
    if (!pane) {
      if (updated) {
        store.sessions[key] = session;
        hasChanges = true;
      }
      continue;
    }

    usedPaneIds.add(pane.paneId);
    stats.matched += 1;

    if (!session.tty && pane.tty) {
      session.tty = pane.tty;
      updated = true;
    }
    if (session.tmux_target !== pane.target) {
      session.tmux_target = pane.target;
      updated = true;
    }
    if (session.tmux_pane_id !== pane.paneId) {
      session.tmux_pane_id = pane.paneId;
      updated = true;
    }

    if (updated) {
      store.sessions[key] = session;
      hasChanges = true;
      stats.updatedExisting += 1;
    }
  }

  const activeTmuxSessionIds = new Set<string>();

  for (const pane of panes) {
    const agent = detectAgentFromCommand(pane.command);
    if (!agent) continue;

    if (usedPaneIds.has(pane.paneId)) {
      continue;
    }

    if (pane.tty && nonTmuxTtys.has(pane.tty)) {
      stats.skippedTty += 1;
      continue;
    }

    const sessionId = buildTmuxSessionId(pane.paneId, pane.tty, pane.target);
    if (!sessionId) continue;
    activeTmuxSessionIds.add(sessionId);

    const existing = store.sessions[sessionId];
    const updatedAt = resolveUpdatedAt(existing?.updated_at, pane.lastActive);
    const cwd = pane.cwd || existing?.cwd || process.cwd();
    const initialCwd = existing?.initial_cwd ?? cwd;

    const session: Session = {
      session_id: sessionId,
      cwd,
      initial_cwd: initialCwd,
      tty: pane.tty || existing?.tty,
      agent,
      source: 'tmux',
      tmux_target: pane.target,
      tmux_pane_id: pane.paneId,
      status: 'running',
      created_at: existing?.created_at ?? updatedAt,
      updated_at: updatedAt,
      last_prompt: existing?.last_prompt,
      current_tool: existing?.current_tool,
      notification_type: existing?.notification_type,
      lastMessage: existing?.lastMessage,
    };

    const changed =
      !existing ||
      existing.cwd !== session.cwd ||
      existing.initial_cwd !== session.initial_cwd ||
      existing.tty !== session.tty ||
      existing.agent !== session.agent ||
      existing.source !== session.source ||
      existing.tmux_target !== session.tmux_target ||
      existing.tmux_pane_id !== session.tmux_pane_id ||
      existing.status !== session.status ||
      existing.updated_at !== session.updated_at;

    if (changed) {
      store.sessions[sessionId] = session;
      hasChanges = true;
    }

    if (!existing) {
      addSessionToDisplayOrder(store, sessionId);
      hasChanges = true;
      stats.createdTmux += 1;
    }
  }

  for (const [key, session] of Object.entries(store.sessions)) {
    if (session.source === 'tmux' && !activeTmuxSessionIds.has(session.session_id)) {
      delete store.sessions[key];
      removeSessionFromDisplayOrder(store, key);
      hasChanges = true;
      stats.removedTmux += 1;
    }
  }

  const logEnabled = (() => {
    const flag = process.env.HQM_TMUX_LOG;
    if (!flag) return false;
    return flag === '1' || flag.toLowerCase() === 'true';
  })();

  if (logEnabled || hasChanges) {
    logger.debug('tmux-sync', stats);
  }

  if (hasChanges) {
    writeStore(store);
  }
}

export function syncTmuxSessionsIfNeeded(): void {
  const now = Date.now();
  if (now - lastTmuxSyncAt < TMUX_SYNC_THROTTLE_MS) {
    return;
  }
  lastTmuxSyncAt = now;
  syncTmuxSessionsOnce();
}

// Session operations
export function updateSession(event: HookEvent): Session {
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

export function getStorePath(): string {
  return STORE_FILE;
}
