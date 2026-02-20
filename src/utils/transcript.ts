import {
  closeSync,
  createReadStream,
  existsSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { isCodexSessionId } from '../codex/paths.js';
import { TAIL_READ_BYTES } from '../constants.js';
import type { ConversationMessage } from '../types/index.js';
import { logger } from './logger.js';
import { getTranscriptPathFromRegistry } from './session-registry.js';

/**
 * Build transcript path from cwd (legacy method, use getTranscriptPath instead)
 * @deprecated Use getTranscriptPath() which uses SessionRegistry for accurate paths
 */
export function buildTranscriptPath(cwd: string, sessionId: string): string {
  const claudeDir = join(homedir(), '.claude', 'projects');
  const cwdHash = cwd.replace(/\//g, '-');
  return join(claudeDir, cwdHash, `${sessionId}.jsonl`);
}

/**
 * Get transcript path for a session, using SessionRegistry with fallback to path building
 */
export function getTranscriptPath(sessionId: string, cwd?: string): string | undefined {
  if (isCodexSessionId(sessionId)) {
    // Codex transcripts are resolved via session.transcript_path
    // (pane-based IDs don't match transcript UUIDs)
    return undefined;
  }

  // Try registry first (most accurate)
  const registryPath = getTranscriptPathFromRegistry(sessionId);
  if (registryPath) {
    return registryPath;
  }

  // Fallback to building path from cwd if provided
  if (cwd) {
    const fallbackPath = buildTranscriptPath(cwd, sessionId);
    if (existsSync(fallbackPath)) {
      return fallbackPath;
    }
  }

  return undefined;
}

export type EntryContent = string | Array<{ type: string; text?: string }>;

interface TranscriptEntry {
  type: 'user' | 'assistant' | 'result' | 'summary' | 'file-history-snapshot';
  uuid?: string;
  timestamp?: string;
  isMeta?: boolean;
  message?: {
    role?: string;
    content?: EntryContent;
  };
}

interface CodexEntry {
  timestamp?: string;
  type?: string;
  payload?: Record<string, unknown>;
}

interface GetAllMessagesOptions {
  limit?: number;
  offset?: number;
}

interface GetAllMessagesResult {
  messages: ConversationMessage[];
  hasMore: boolean;
}

/**
 * Extract text from content (string or array of content blocks)
 */
export function extractTextFromContent(content: EntryContent | undefined): string | null {
  if (!content) return null;

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .filter((c) => c.type === 'text' && c.text)
      .map((c) => c.text)
      .join('\n');
    return textParts || null;
  }

  return null;
}

function extractTextContent(entry: TranscriptEntry): string | null {
  const text = extractTextFromContent(entry.message?.content);
  if (!text) return null;

  // Skip meta messages and local commands for user messages
  if (typeof entry.message?.content === 'string') {
    if (entry.isMeta) return null;
    if (text.includes('<local-command-')) return null;
    if (text.includes('<command-name>')) return null;
  }

  return text;
}

interface MessageCollector {
  addEntry(entry: TranscriptEntry): void;
  addCodexEntry(entry: CodexEntry): void;
  getResult(options: GetAllMessagesOptions): GetAllMessagesResult;
}

function createMessageCollector(): MessageCollector {
  const allMessages: ConversationMessage[] = [];
  let lastMessage: ConversationMessage | null = null;

  const pushMessage = (message: ConversationMessage): void => {
    if (
      lastMessage &&
      lastMessage.type === message.type &&
      lastMessage.content === message.content
    ) {
      return;
    }
    allMessages.push(message);
    lastMessage = message;
  };

  return {
    addEntry(entry: TranscriptEntry): void {
      if (entry.type !== 'user' && entry.type !== 'assistant') return;

      const text = extractTextContent(entry);
      if (!text) return;

      pushMessage({
        id: entry.uuid || `msg-${allMessages.length}`,
        type: entry.type,
        content: text,
        timestamp: entry.timestamp,
      });
    },

    addCodexEntry(entry: CodexEntry): void {
      const message = extractCodexMessage(entry, allMessages.length);
      if (!message) return;
      pushMessage(message);
    },

    getResult({ limit = 50, offset = 0 }): GetAllMessagesResult {
      const total = allMessages.length;
      const startIndex = Math.max(0, total - offset - limit);
      const endIndex = total - offset;
      return {
        messages: allMessages.slice(startIndex, endIndex),
        hasMore: startIndex > 0,
      };
    },
  };
}

function extractCodexText(content: unknown): string | null {
  if (!content) return null;
  if (typeof content === 'string') {
    return content.trim() || null;
  }
  if (!Array.isArray(content)) return null;

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

  return text || null;
}

function extractCodexMessage(entry: CodexEntry, index: number): ConversationMessage | null {
  if (!entry || typeof entry !== 'object') return null;

  if (entry.type === 'event_msg') {
    const payload = entry.payload || {};
    if (payload.type === 'user_message' && typeof payload.message === 'string') {
      return {
        id: `codex-user-${index}`,
        type: 'user',
        content: payload.message,
        timestamp: entry.timestamp,
      };
    }
    if (payload.type === 'agent_message' && typeof payload.message === 'string') {
      return {
        id: `codex-assistant-${index}`,
        type: 'assistant',
        content: payload.message,
        timestamp: entry.timestamp,
      };
    }
  }

  if (entry.type === 'response_item') {
    const payload = entry.payload || {};
    if (payload.type === 'message' && payload.role === 'assistant') {
      const text = extractCodexText(payload.content);
      if (!text) return null;
      return {
        id: `codex-assistant-${index}`,
        type: 'assistant',
        content: text,
        timestamp: entry.timestamp,
      };
    }
  }

  return null;
}

function logParseErrors(parseErrors: number, transcriptPath: string): void {
  if (parseErrors > 3) {
    logger.warn('transcript parse errors', { count: parseErrors, path: transcriptPath });
  }
}

export function getAllMessages(
  transcriptPath: string,
  options: GetAllMessagesOptions = {}
): GetAllMessagesResult {
  if (!existsSync(transcriptPath)) {
    return { messages: [], hasMore: false };
  }

  try {
    const fileContent = readFileSync(transcriptPath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(Boolean);
    const collector = createMessageCollector();
    let parseErrors = 0;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry & CodexEntry;
        collector.addEntry(entry);
        collector.addCodexEntry(entry);
      } catch (e) {
        parseErrors++;
        if (parseErrors <= 3) {
          logger.warn('transcript parse error', {
            path: transcriptPath,
            error: e instanceof Error ? e.message : 'unknown',
          });
        }
      }
    }
    logParseErrors(parseErrors, transcriptPath);

    return collector.getResult(options);
  } catch (e) {
    logger.warn('Transcript read error', {
      path: transcriptPath,
      error: e instanceof Error ? e.message : 'unknown',
    });
    return { messages: [], hasMore: false };
  }
}

/**
 * Read the tail portion of a file without loading the entire file.
 * Drops the first (potentially incomplete) line from the buffer.
 */
export function readTailContent(filePath: string, tailBytes: number = TAIL_READ_BYTES): string {
  const fd = openSync(filePath, 'r');
  try {
    const { size } = fstatSync(fd);
    if (size === 0) return '';

    const readSize = Math.min(tailBytes, size);
    const buffer = Buffer.alloc(readSize);
    readSync(fd, buffer, 0, readSize, size - readSize);
    let content = buffer.toString('utf-8');

    // If we didn't read the whole file, drop the first (potentially incomplete) line
    if (readSize < size) {
      const firstNewline = content.indexOf('\n');
      if (firstNewline !== -1) {
        content = content.slice(firstNewline + 1);
      } else {
        // Entire buffer is one partial line — unusable
        return '';
      }
    }

    return content;
  } finally {
    closeSync(fd);
  }
}

interface TranscriptMessage {
  type: 'user' | 'assistant' | 'result';
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

function extractClaudeAssistantMessage(entry: TranscriptMessage): string | null {
  if (entry.type !== 'assistant' || !entry.message?.content) return null;
  const textParts = entry.message.content
    .filter((c) => c.type === 'text' && c.text)
    .map((c) => c.text)
    .join('\n');
  return textParts || null;
}

function extractCodexAssistantMessage(entry: CodexEntry): string | null {
  if (!entry || typeof entry !== 'object') return null;
  if (entry.type === 'event_msg') {
    const payload = entry.payload || {};
    if (payload.type === 'agent_message' && typeof payload.message === 'string') {
      return payload.message;
    }
  }
  if (entry.type === 'response_item') {
    const payload = entry.payload || {};
    if (payload.type === 'message' && payload.role === 'assistant') {
      return extractCodexText(payload.content);
    }
  }
  return null;
}

export function findLastAssistantInContent(content: string): string | undefined {
  const lines = content.trim().split('\n').filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]) as TranscriptMessage & CodexEntry;
      const claudeText = extractClaudeAssistantMessage(entry);
      if (claudeText) return claudeText;
      const codexText = extractCodexAssistantMessage(entry);
      if (codexText) return codexText;
    } catch {
      // Skip invalid JSON lines
    }
  }

  return undefined;
}

export function getLastAssistantMessage(transcriptPath: string): string | undefined {
  if (!existsSync(transcriptPath)) {
    return undefined;
  }

  try {
    // Try tail read first (efficient for large files)
    const tailContent = readTailContent(transcriptPath);
    if (tailContent) {
      const result = findLastAssistantInContent(tailContent);
      if (result) return result;
    }

    // Fallback: read entire file (rare case where assistant message is far from end)
    const fullContent = readFileSync(transcriptPath, 'utf-8');
    return findLastAssistantInContent(fullContent);
  } catch (e) {
    logger.warn('Transcript read error', {
      path: transcriptPath,
      error: e instanceof Error ? e.message : 'unknown',
    });
  }

  return undefined;
}

/**
 * Get all messages from a transcript file (async streaming version)
 * More efficient for large files as it doesn't load the entire file into memory
 */
export async function getAllMessagesAsync(
  transcriptPath: string,
  options: GetAllMessagesOptions = {}
): Promise<GetAllMessagesResult> {
  if (!existsSync(transcriptPath)) {
    return { messages: [], hasMore: false };
  }

  try {
    const collector = createMessageCollector();
    const fileStream = createReadStream(transcriptPath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    let parseErrors = 0;
    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as TranscriptEntry & CodexEntry;
        collector.addEntry(entry);
        collector.addCodexEntry(entry);
      } catch (e) {
        parseErrors++;
        if (parseErrors <= 3) {
          logger.warn('transcript parse error', {
            path: transcriptPath,
            error: e instanceof Error ? e.message : 'unknown',
          });
        }
      }
    }
    logParseErrors(parseErrors, transcriptPath);

    return collector.getResult(options);
  } catch (e) {
    logger.warn('Transcript async read error', {
      path: transcriptPath,
      error: e instanceof Error ? e.message : 'unknown',
    });
    return { messages: [], hasMore: false };
  }
}
