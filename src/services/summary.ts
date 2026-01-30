import { readFileSync, statSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { getSummaryConfig, isSummaryEnabled } from '../store/config.js';
import { updateSessionSummary } from '../store/file-store.js';
import type { Session } from '../types/index.js';
import {
  type EntryContent,
  extractTextFromContent,
  getTranscriptPath,
} from '../utils/transcript.js';

// Regenerate summary if transcript grows by this many bytes
const SUMMARY_REGENERATE_THRESHOLD = 5000; // 5KB

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';

const SUMMARY_PROMPT = `Summarize this Claude Code session in 1-2 sentences.
Use the same language as the conversation.
Start directly with the content - no headers, no "This session..." or "In this session..." preamble.
Example: "Fixed login bug by updating auth middleware. Added unit tests for edge cases."`;

export interface SummaryResult {
  summary: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Check if summary generation is available
 */
export { isSummaryEnabled };

interface TranscriptEntry {
  type: 'user' | 'assistant';
  message?: {
    content?: EntryContent;
  };
}

/**
 * Read and parse transcript from JSONL file
 */
function readTranscript(transcriptPath: string): string {
  try {
    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.trim().split('\n');
    const messages: string[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.type !== 'user' && entry.type !== 'assistant') continue;

        const text = extractTextFromContent(entry.message?.content);
        if (text?.trim()) {
          const role = entry.type === 'user' ? 'User' : 'Assistant';
          messages.push(`${role}: ${text.trim()}`);
        }
      } catch {
        // Skip invalid JSON lines
      }
    }

    // Return last portion if too long (to stay within token limits)
    const fullText = messages.join('\n\n');
    const maxChars = 50000; // Roughly 12k tokens
    if (fullText.length > maxChars) {
      return `...\n\n${fullText.slice(-maxChars)}`;
    }
    return fullText;
  } catch {
    return '';
  }
}

/**
 * Generate a summary of the Claude Code session transcript
 */
export async function generateSummary(transcriptPath: string): Promise<SummaryResult | null> {
  if (!isSummaryEnabled()) {
    return null;
  }

  const config = getSummaryConfig();
  if (!config?.apiKey) {
    return null;
  }

  const transcript = readTranscript(transcriptPath);
  if (!transcript) {
    return null;
  }

  try {
    const client = new Anthropic({ apiKey: config.apiKey });
    const model = config.model || DEFAULT_MODEL;

    const response = await client.messages.create({
      model,
      max_tokens: 256,
      system: SUMMARY_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please summarize this Claude Code session:\n\n${transcript}`,
        },
      ],
    });

    const summary = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as Anthropic.TextBlock).text)
      .join('\n');

    return {
      summary,
      model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  } catch (error) {
    // Log error but don't fail
    console.error('Summary generation failed:', error);
    return null;
  }
}

/**
 * Get file size in bytes, returns 0 if file doesn't exist
 */
function getFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

/**
 * Generate summary for a session if needed.
 * Regenerates if transcript has grown by more than threshold since last summary.
 * Returns the summary (existing or newly generated).
 */
export async function generateSessionSummaryIfNeeded(
  session: Session
): Promise<string | undefined> {
  if (!isSummaryEnabled()) {
    return session.summary;
  }

  const transcriptPath = getTranscriptPath(session.session_id, session.initial_cwd ?? session.cwd);
  if (!transcriptPath) {
    return session.summary;
  }

  const currentSize = getFileSize(transcriptPath);

  // Check if generation is needed:
  // - First time: always generate if no summary exists
  // - Regenerate: only if transcript grew by threshold
  const previousSize = session.summary_transcript_size ?? 0;
  const shouldRegenerate = currentSize - previousSize >= SUMMARY_REGENERATE_THRESHOLD;
  const shouldGenerate = !session.summary || shouldRegenerate;

  if (!shouldGenerate) {
    return session.summary;
  }

  const result = await generateSummary(transcriptPath);
  if (result?.summary) {
    // Cache the summary with transcript size
    updateSessionSummary(session.session_id, session.tty, result.summary, currentSize);
    return result.summary;
  }

  return session.summary;
}
