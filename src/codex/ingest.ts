import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { FSWatcher } from 'chokidar';
import chokidar from 'chokidar';
import { getSessionTimeoutMs } from '../store/config.js';
import { updateSession, updateSessionLastMessage } from '../store/file-store.js';
import type { HookEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { isObject } from '../utils/type-guards.js';
import {
  encodeCodexSessionId,
  extractCodexSessionIdFromPath,
  getCodexSessionsDir,
} from './paths.js';

interface CodexFileState {
  offset: number;
  remainder: string;
  rawSessionId: string;
  sessionId: string;
  cwd?: string;
  lastMessage?: string;
}

const fileStates = new Map<string, CodexFileState>();
const DAY_MS = 24 * 60 * 60 * 1000;

let watcher: FSWatcher | null = null;

function isCodexDisabled(): boolean {
  const flag = process.env.HQM_DISABLE_CODEX;
  if (!flag) return false;
  return flag === '1' || flag.toLowerCase() === 'true';
}

function getCodexActiveWindowMs(): number | null {
  const env = process.env.HQM_CODEX_RECENT_MINUTES;
  if (env !== undefined) {
    const minutes = Number(env);
    if (!Number.isNaN(minutes) && minutes > 0) {
      return minutes * 60 * 1000;
    }
    return null;
  }

  const timeoutMs = getSessionTimeoutMs();
  if (timeoutMs > 0) {
    return timeoutMs;
  }

  return null;
}

function getOrInitState(filePath: string): CodexFileState | null {
  const existing = fileStates.get(filePath);
  if (existing) return existing;

  const rawId = extractCodexSessionIdFromPath(filePath);
  if (!rawId) {
    return null;
  }

  const state: CodexFileState = {
    offset: 0,
    remainder: '',
    rawSessionId: rawId,
    sessionId: encodeCodexSessionId(rawId),
  };
  fileStates.set(filePath, state);
  return state;
}

function readNewLines(filePath: string, state: CodexFileState): string[] {
  try {
    const size = statSync(filePath).size;
    if (size < state.offset) {
      state.offset = 0;
      state.remainder = '';
    }

    const bytesToRead = size - state.offset;
    if (bytesToRead <= 0) {
      return [];
    }

    const fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(bytesToRead);
    readSync(fd, buffer, 0, bytesToRead, state.offset);
    closeSync(fd);

    state.offset = size;

    const text = state.remainder + buffer.toString('utf-8');
    const lines = text.split('\n');
    state.remainder = lines.pop() ?? '';
    return lines.filter((line) => line.trim().length > 0);
  } catch (e) {
    logger.warn('Codex read failed', { error: e instanceof Error ? e.message : 'unknown' });
    return [];
  }
}

function extractAssistantText(content: unknown): string | undefined {
  if (!content) return undefined;
  if (typeof content === 'string') {
    return content.trim() || undefined;
  }
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((part) => part && typeof part === 'object' && 'text' in part)
    .filter((part) => {
      if (!part || typeof part !== 'object') return false;
      if (!('type' in part)) return true;
      return (part as { type?: string }).type === 'output_text';
    })
    .map((part) => (part as { text?: string }).text)
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join('\n')
    .trim();
  return text || undefined;
}

function buildEvent(
  state: CodexFileState,
  eventName: HookEvent['hook_event_name'],
  overrides: Partial<HookEvent> = {}
): HookEvent {
  return {
    session_id: state.sessionId,
    cwd: state.cwd || process.cwd(),
    hook_event_name: eventName,
    ...overrides,
  };
}

function parseCodexEntry(line: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(line);
    if (!isObject(parsed)) {
      return undefined;
    }
    return parsed;
  } catch (e) {
    logger.warn('Codex entry parse error', { error: e instanceof Error ? e.message : 'unknown' });
    return undefined;
  }
}

function getEntryType(entry: Record<string, unknown>): string | undefined {
  return typeof entry.type === 'string' ? entry.type : undefined;
}

function getPayload(entry: Record<string, unknown>): Record<string, unknown> | undefined {
  return isObject(entry.payload) ? entry.payload : undefined;
}

function getTimestamp(entry: Record<string, unknown>): string | undefined {
  return typeof entry.timestamp === 'string' ? entry.timestamp : undefined;
}

function ingestLine(line: string, state: CodexFileState): void {
  const entry = parseCodexEntry(line);
  if (!entry) {
    return;
  }
  const type = getEntryType(entry);
  const payload = getPayload(entry);
  const timestamp = getTimestamp(entry);

  if (type === 'session_meta' && payload) {
    if (typeof payload.id === 'string') {
      state.rawSessionId = payload.id;
      state.sessionId = encodeCodexSessionId(payload.id);
    }
    if (typeof payload.cwd === 'string' && payload.cwd.length > 0) {
      state.cwd = payload.cwd;
    }
    updateSession(buildEvent(state, 'SessionStart', { source: 'startup' }));
    return;
  }

  if (type === 'turn_context' && payload) {
    if (typeof payload.cwd === 'string' && payload.cwd.length > 0) {
      state.cwd = payload.cwd;
    }
    return;
  }

  if (type === 'event_msg' && payload) {
    if (payload.type === 'user_message' && typeof payload.message === 'string') {
      updateSession(
        buildEvent(state, 'UserPromptSubmit', {
          prompt: payload.message,
        })
      );
      return;
    }
    if (payload.type === 'agent_message' && typeof payload.message === 'string') {
      const message = payload.message.trim();
      if (message && message !== state.lastMessage) {
        state.lastMessage = message;
        updateSessionLastMessage(state.sessionId, message, timestamp);
      }
      return;
    }
  }

  if (type === 'response_item' && payload) {
    if (payload.type === 'function_call' && typeof payload.name === 'string') {
      updateSession(
        buildEvent(state, 'PreToolUse', {
          tool_name: payload.name,
        })
      );
      return;
    }
    if (payload.type === 'function_call_output') {
      updateSession(buildEvent(state, 'PostToolUse'));
      return;
    }
    if (payload.type === 'message' && payload.role === 'assistant') {
      const message = extractAssistantText(payload.content);
      if (message && message !== state.lastMessage) {
        state.lastMessage = message;
        updateSessionLastMessage(state.sessionId, message, timestamp);
      }
    }
  }
}

function ingestCodexFile(filePath: string): void {
  const state = getOrInitState(filePath);
  if (!state) return;

  const lines = readNewLines(filePath, state);
  if (lines.length === 0) return;

  for (const line of lines) {
    ingestLine(line, state);
  }
}

function listSessionFiles(dir: string, results: string[]): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSessionFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }
}

function formatDatePart(value: number): string {
  return String(value).padStart(2, '0');
}

function listRecentSessionFiles(sessionsDir: string, activeWindowMs: number): string[] {
  const files: string[] = [];
  const now = new Date();
  const earliest = new Date(Date.now() - activeWindowMs);

  // Start at the earliest day boundary to avoid missing sessions across midnight.
  const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate());
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while (cursor <= end) {
    const year = String(cursor.getFullYear());
    const month = formatDatePart(cursor.getMonth() + 1);
    const day = formatDatePart(cursor.getDate());
    const dayDir = join(sessionsDir, year, month, day);
    if (existsSync(dayDir)) {
      listSessionFiles(dayDir, files);
    }
    cursor.setTime(cursor.getTime() + DAY_MS);
  }

  return files;
}

export function syncCodexSessionsOnce(): void {
  if (isCodexDisabled()) return;
  const sessionsDir = getCodexSessionsDir();
  if (!existsSync(sessionsDir)) return;

  const activeWindowMs = getCodexActiveWindowMs();
  const now = Date.now();
  const files =
    activeWindowMs !== null
      ? listRecentSessionFiles(sessionsDir, activeWindowMs)
      : (() => {
          const all: string[] = [];
          listSessionFiles(sessionsDir, all);
          return all;
        })();
  for (const filePath of files) {
    if (activeWindowMs !== null) {
      try {
        const mtimeMs = statSync(filePath).mtimeMs;
        if (now - mtimeMs > activeWindowMs) {
          continue;
        }
      } catch (e) {
        logger.warn('Codex stat error', {
          path: filePath,
          error: e instanceof Error ? e.message : 'unknown',
        });
        continue;
      }
    }
    ingestCodexFile(filePath);
  }
}

export function startCodexWatcher(): void {
  if (isCodexDisabled()) return;
  if (watcher) return;

  const sessionsDir = getCodexSessionsDir();
  if (!existsSync(sessionsDir)) {
    return;
  }

  syncCodexSessionsOnce();

  watcher = chokidar.watch(join(sessionsDir, '**/*.jsonl'), {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('add', ingestCodexFile);
  watcher.on('change', ingestCodexFile);
}
