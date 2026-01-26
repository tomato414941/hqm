import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import type { ConversationMessage } from '../types/index.js';

export function buildTranscriptPath(cwd: string, sessionId: string): string {
  const claudeDir = join(homedir(), '.claude', 'projects');
  const cwdHash = cwd.replace(/\//g, '-');
  return join(claudeDir, cwdHash, `${sessionId}.jsonl`);
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

export function getAllMessages(
  transcriptPath: string,
  options: GetAllMessagesOptions = {}
): GetAllMessagesResult {
  const { limit = 50, offset = 0 } = options;

  if (!existsSync(transcriptPath)) {
    return { messages: [], hasMore: false };
  }

  try {
    const fileContent = readFileSync(transcriptPath, 'utf-8');
    const lines = fileContent.trim().split('\n').filter(Boolean);

    const allMessages: ConversationMessage[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;

        // Only process user and assistant messages
        if (entry.type !== 'user' && entry.type !== 'assistant') continue;

        const text = extractTextContent(entry);
        if (!text) continue;

        allMessages.push({
          id: entry.uuid || `msg-${allMessages.length}`,
          type: entry.type,
          content: text,
          timestamp: entry.timestamp,
        });
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Apply pagination (from the end for newest first)
    const total = allMessages.length;
    const startIndex = Math.max(0, total - offset - limit);
    const endIndex = total - offset;
    const paginatedMessages = allMessages.slice(startIndex, endIndex);

    return {
      messages: paginatedMessages,
      hasMore: startIndex > 0,
    };
  } catch {
    return { messages: [], hasMore: false };
  }
}

// Keep backward compatibility alias
interface TranscriptMessage {
  type: 'user' | 'assistant' | 'result';
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

export function getLastAssistantMessage(transcriptPath: string): string | undefined {
  if (!existsSync(transcriptPath)) {
    return undefined;
  }

  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    // Iterate from the end to find the last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]) as TranscriptMessage;
        if (entry.type === 'assistant' && entry.message?.content) {
          // Extract text from content array
          const textParts = entry.message.content
            .filter((c) => c.type === 'text' && c.text)
            .map((c) => c.text)
            .join('\n');
          if (textParts) {
            return textParts;
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    }
  } catch {
    // File read error
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
  const { limit = 50, offset = 0 } = options;

  if (!existsSync(transcriptPath)) {
    return { messages: [], hasMore: false };
  }

  try {
    const allMessages: ConversationMessage[] = [];

    const fileStream = createReadStream(transcriptPath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line) as TranscriptEntry;

        if (entry.type !== 'user' && entry.type !== 'assistant') continue;

        const text = extractTextContent(entry);
        if (!text) continue;

        allMessages.push({
          id: entry.uuid || `msg-${allMessages.length}`,
          type: entry.type,
          content: text,
          timestamp: entry.timestamp,
        });
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Apply pagination (from the end for newest first)
    const total = allMessages.length;
    const startIndex = Math.max(0, total - offset - limit);
    const endIndex = total - offset;
    const paginatedMessages = allMessages.slice(startIndex, endIndex);

    return {
      messages: paginatedMessages,
      hasMore: startIndex > 0,
    };
  } catch {
    return { messages: [], hasMore: false };
  }
}
