import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { getSummaryConfig, isSummaryEnabled } from '../store/config.js';
import { updateSessionSummary } from '../store/file-store.js';
import type { Session } from '../types/index.js';
import {
  buildTranscriptPath,
  type EntryContent,
  extractTextFromContent,
} from '../utils/transcript.js';

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
 * Generate summary for a session if not already cached.
 * Returns the summary (existing or newly generated).
 */
export async function generateSessionSummaryIfNeeded(
  session: Session
): Promise<string | undefined> {
  // Return cached summary if available
  if (session.summary) {
    return session.summary;
  }

  if (!isSummaryEnabled()) {
    return undefined;
  }

  const initialCwd = session.initial_cwd ?? session.cwd;
  const transcriptPath = buildTranscriptPath(initialCwd, session.session_id);

  const result = await generateSummary(transcriptPath);
  if (result?.summary) {
    // Cache the summary
    updateSessionSummary(session.session_id, session.tty, result.summary);
    return result.summary;
  }

  return undefined;
}
