import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { CODEX_MATCH_TOLERANCE_MS } from '../constants.js';
import { logger } from '../utils/logger.js';
import { readTailContent } from '../utils/transcript.js';
import { getCodexSessionsDir } from './paths.js';

export interface TranscriptEntry {
  path: string;
  createdAt: number;
}

const TRANSCRIPT_INDEX_CACHE_TTL_MS = 5_000;

let transcriptIndexCache:
  | {
      entries: TranscriptEntry[];
      cachedAt: number;
      signature: string;
    }
  | undefined;

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

// Extract timestamp from Codex transcript filename
// Format: rollout-YYYY-MM-DDTHH-MM-SS-{uuid}.jsonl
const TIMESTAMP_REGEX = /rollout-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})/;

function extractTimestampFromFilename(filePath: string): number | undefined {
  const name = basename(filePath);
  const match = name.match(TIMESTAMP_REGEX);
  if (!match) return undefined;
  const [, year, month, day, hour, min, sec] = match;
  const iso = `${year}-${month}-${day}T${hour}:${min}:${sec}Z`;
  return new Date(iso).getTime();
}

export function scanCodexTranscripts(): TranscriptEntry[] {
  const sessionsDir = getCodexSessionsDir();
  if (!existsSync(sessionsDir)) return [];

  const files: string[] = [];
  try {
    scanSessionsDir(sessionsDir, files);
  } catch (e) {
    logger.warn('Codex transcript scan failed', {
      error: e instanceof Error ? e.message : 'unknown',
    });
    return [];
  }

  const entries: TranscriptEntry[] = [];
  for (const filePath of files) {
    const ts = extractTimestampFromFilename(filePath);
    if (ts) {
      entries.push({ path: filePath, createdAt: ts });
    } else {
      // Fallback: use file birthtime
      try {
        const stat = statSync(filePath);
        entries.push({ path: filePath, createdAt: stat.birthtimeMs });
      } catch {
        logger.warn('Failed to stat codex file', { path: filePath });
      }
    }
  }
  return entries;
}

function getSessionsDirSignature(sessionsDir: string): string {
  if (!existsSync(sessionsDir)) {
    return `${sessionsDir}:missing`;
  }

  try {
    const stat = statSync(sessionsDir);
    return `${sessionsDir}:${stat.mtimeMs}`;
  } catch {
    return `${sessionsDir}:error`;
  }
}

export function buildCodexTranscriptIndex(): TranscriptEntry[] {
  const sessionsDir = getCodexSessionsDir();
  const signature = getSessionsDirSignature(sessionsDir);
  const now = Date.now();

  if (
    transcriptIndexCache &&
    transcriptIndexCache.signature === signature &&
    now - transcriptIndexCache.cachedAt < TRANSCRIPT_INDEX_CACHE_TTL_MS
  ) {
    return transcriptIndexCache.entries;
  }

  const entries = scanCodexTranscripts();
  transcriptIndexCache = { entries, cachedAt: now, signature };
  return entries;
}

export function resetCodexTranscriptIndexCache(): void {
  transcriptIndexCache = undefined;
}

export function resolveCodexTranscriptPath(
  session: {
    transcript_path?: string;
    created_at: string;
  },
  transcriptIndex?: TranscriptEntry[]
): string | undefined {
  // 1. Cached path still valid
  if (session.transcript_path && existsSync(session.transcript_path)) {
    return session.transcript_path;
  }

  // 2. Scan and match by creation time proximity
  const sessionCreatedAt = new Date(session.created_at).getTime();
  if (Number.isNaN(sessionCreatedAt)) return undefined;

  const transcripts = transcriptIndex ?? buildCodexTranscriptIndex();
  let bestMatch: TranscriptEntry | undefined;
  let bestDelta = Number.POSITIVE_INFINITY;

  for (const entry of transcripts) {
    const delta = Math.abs(entry.createdAt - sessionCreatedAt);
    if (delta <= CODEX_MATCH_TOLERANCE_MS && delta < bestDelta) {
      bestMatch = entry;
      bestDelta = delta;
    }
  }

  return bestMatch?.path;
}

/**
 * Determine the type of the last meaningful entry in a Codex transcript.
 * Used to distinguish "user sent prompt, Codex thinking" from "Codex finished responding".
 */
function findLastEntryTypeInContent(content: string): 'user' | 'agent' | undefined {
  const lines = content.trim().split('\n').filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]) as {
        type?: string;
        payload?: Record<string, unknown>;
      };

      if (entry.type === 'event_msg') {
        const payloadType = entry.payload?.type;
        if (payloadType === 'user_message') return 'user';
        if (payloadType === 'agent_message') return 'agent';
      }

      if (entry.type === 'response_item') {
        const payload = entry.payload || {};
        if (payload.role === 'assistant') return 'agent';
      }
    } catch {
      // Skip invalid JSON lines
    }
  }

  return undefined;
}

export function getCodexLastEntryType(transcriptPath: string): 'user' | 'agent' | undefined {
  if (!existsSync(transcriptPath)) return undefined;

  try {
    const tailContent = readTailContent(transcriptPath);
    if (tailContent) {
      const result = findLastEntryTypeInContent(tailContent);
      if (result) return result;
    }
  } catch (e) {
    logger.warn('Codex transcript read error', {
      path: transcriptPath,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  return undefined;
}
