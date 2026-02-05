import { statSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { SUMMARY_REGENERATE_THRESHOLD_BYTES } from '../constants.js';
import { getSummaryConfig, isSummaryEnabled } from '../store/config.js';
import { updateSessionSummary } from '../store/file-store.js';
import type { Session } from '../types/index.js';
import { getAllMessages, getTranscriptPath } from '../utils/transcript.js';

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

/**
 * Read and parse transcript from JSONL file
 */
function readTranscript(transcriptPath: string): string {
  try {
    const { messages } = getAllMessages(transcriptPath, {
      limit: Number.MAX_SAFE_INTEGER,
      offset: 0,
    });
    if (messages.length === 0) {
      return '';
    }

    const fullText = messages
      .map((message) => {
        const role = message.type === 'user' ? 'User' : 'Assistant';
        return `${role}: ${message.content.trim()}`;
      })
      .join('\n\n');

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
  const shouldRegenerate = currentSize - previousSize >= SUMMARY_REGENERATE_THRESHOLD_BYTES;
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
