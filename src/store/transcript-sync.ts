import { statSync } from 'node:fs';
import { buildCodexTranscriptIndex, resolveCodexTranscriptPath } from '../codex/registry.js';
import type { Session, StoreData } from '../types/index.js';
import { getLastAssistantMessage, getTranscriptPath } from '../utils/transcript.js';

const mtimeCache = new Map<string, { mtimeMs: number; lastMessage: string | undefined }>();

export function clearTranscriptMtimeCache(): void {
  mtimeCache.clear();
}

/**
 * Sync lastMessage from transcripts for active sessions
 * @returns true if any session was updated
 */
export function syncTranscripts(sessions: Session[], store: StoreData): boolean {
  let updated = false;
  const transcriptIndex = buildCodexTranscriptIndex();

  for (const session of sessions) {
    if (session.status === 'stopped') continue;

    let transcriptPath: string | undefined;
    if (session.agent === 'codex') {
      transcriptPath = resolveCodexTranscriptPath(session, transcriptIndex);
      if (transcriptPath && transcriptPath !== session.transcript_path) {
        session.transcript_path = transcriptPath;
        store.sessions[session.session_id] = session;
        updated = true;
      }
    } else {
      transcriptPath = getTranscriptPath(session.session_id, session.initial_cwd ?? session.cwd);
    }
    if (!transcriptPath) continue;

    let message: string | undefined;
    try {
      const { mtimeMs } = statSync(transcriptPath);
      const cached = mtimeCache.get(transcriptPath);
      if (cached && cached.mtimeMs === mtimeMs) {
        message = cached.lastMessage;
      } else {
        message = getLastAssistantMessage(transcriptPath);
        mtimeCache.set(transcriptPath, { mtimeMs, lastMessage: message });
      }
    } catch {
      // File may have been removed between path resolution and stat
      message = getLastAssistantMessage(transcriptPath);
    }

    if (message && message !== session.lastMessage) {
      session.lastMessage = message;
      store.sessions[session.session_id] = session;
      updated = true;
    }
  }

  return updated;
}
