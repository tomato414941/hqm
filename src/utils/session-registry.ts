import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { SESSION_REGISTRY_CACHE_TTL_MS } from '../constants.js';
import { logger } from './logger.js';

interface SessionIndexEntry {
  sessionId: string;
  fullPath: string;
  projectPath?: string;
}

interface SessionsIndex {
  version?: number;
  entries: SessionIndexEntry[];
}

const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
const INDEX_FILE = 'sessions-index.json';

// Cache for sessionId -> fullPath mapping
let registry: Map<string, string> = new Map();
let lastRefresh = 0;

function parseSessionsIndex(filePath: string): SessionsIndex | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content) as SessionsIndex;
    if (data && Array.isArray(data.entries)) {
      return data;
    }
  } catch {
    logger.warn('Failed to parse sessions-index', { path: filePath });
  }
  return null;
}

/**
 * Scan all sessions-index.json files and build the registry
 */
export function refreshSessionRegistry(): void {
  const newRegistry = new Map<string, string>();

  if (!existsSync(PROJECTS_DIR)) {
    registry = newRegistry;
    lastRefresh = Date.now();
    return;
  }

  try {
    const projectDirs = readdirSync(PROJECTS_DIR);
    for (const dir of projectDirs) {
      const indexPath = join(PROJECTS_DIR, dir, INDEX_FILE);
      if (!existsSync(indexPath)) continue;

      const index = parseSessionsIndex(indexPath);
      if (!index) continue;

      for (const entry of index.entries) {
        if (entry.sessionId && entry.fullPath) {
          // Only add if the file actually exists
          if (existsSync(entry.fullPath)) {
            newRegistry.set(entry.sessionId, entry.fullPath);
          }
        }
      }
    }
  } catch (e) {
    logger.warn('Failed to scan projects dir', {
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  registry = newRegistry;
  lastRefresh = Date.now();
  logger.debug('Session registry refreshed', { size: registry.size });
}

/**
 * Get transcript path by session ID from the registry
 * Returns undefined if not found
 */
export function getTranscriptPathFromRegistry(sessionId: string): string | undefined {
  // Auto-refresh if cache is stale
  if (Date.now() - lastRefresh > SESSION_REGISTRY_CACHE_TTL_MS) {
    refreshSessionRegistry();
  }
  return registry.get(sessionId);
}
