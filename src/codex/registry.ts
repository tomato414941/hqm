import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { logger } from '../utils/logger.js';
import {
  decodeCodexSessionId,
  extractCodexSessionIdFromPath,
  getCodexSessionsDir,
} from './paths.js';

interface RegistryEntry {
  path: string;
  mtimeMs: number;
}

const REGISTRY_TTL_MS = 30_000;

let registry = new Map<string, RegistryEntry>();
let lastRefresh = 0;

function scanSessionsDir(dir: string, entries: string[]): void {
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      scanSessionsDir(fullPath, entries);
      continue;
    }
    if (item.isFile() && item.name.endsWith('.jsonl')) {
      entries.push(fullPath);
    }
  }
}

export function refreshCodexRegistry(): void {
  const sessionsDir = getCodexSessionsDir();
  if (!existsSync(sessionsDir)) {
    registry = new Map();
    lastRefresh = Date.now();
    return;
  }

  const files: string[] = [];
  try {
    scanSessionsDir(sessionsDir, files);
  } catch (e) {
    logger.warn('Codex registry scan failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
    registry = new Map();
    lastRefresh = Date.now();
    return;
  }

  const nextRegistry = new Map<string, RegistryEntry>();
  for (const filePath of files) {
    const sessionId = extractCodexSessionIdFromPath(filePath);
    if (!sessionId) continue;
    try {
      const mtimeMs = statSync(filePath).mtimeMs;
      const existing = nextRegistry.get(sessionId);
      if (!existing || existing.mtimeMs < mtimeMs) {
        nextRegistry.set(sessionId, { path: filePath, mtimeMs });
      }
    } catch {
      // Skip unreadable files
    }
  }

  registry = nextRegistry;
  lastRefresh = Date.now();
  logger.debug('Codex registry refreshed', { size: registry.size });
}

export function getCodexTranscriptPath(sessionId: string): string | undefined {
  const rawId = decodeCodexSessionId(sessionId);
  if (Date.now() - lastRefresh > REGISTRY_TTL_MS) {
    refreshCodexRegistry();
  }
  return registry.get(rawId)?.path;
}

export function getCodexRegistrySize(): number {
  if (Date.now() - lastRefresh > REGISTRY_TTL_MS) {
    refreshCodexRegistry();
  }
  return registry.size;
}
