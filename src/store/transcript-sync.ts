import type { Session, StoreData } from '../types/index.js';
import { getLastAssistantMessage, getTranscriptPath } from '../utils/transcript.js';

/**
 * Sync lastMessage from transcripts for active sessions
 * @returns true if any session was updated
 */
export function syncTranscripts(sessions: Session[], store: StoreData): boolean {
  let updated = false;

  for (const session of sessions) {
    if (session.status === 'stopped') continue;

    const transcriptPath = getTranscriptPath(
      session.session_id,
      session.initial_cwd ?? session.cwd
    );
    if (!transcriptPath) continue;

    const message = getLastAssistantMessage(transcriptPath);

    if (message && message !== session.lastMessage) {
      session.lastMessage = message;
      store.sessions[session.session_id] = session;
      updated = true;
    }
  }

  return updated;
}
