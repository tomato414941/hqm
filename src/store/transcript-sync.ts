import type { Session, StoreData } from '../types/index.js';
import { getSessionKey } from '../utils/session-key.js';
import { buildTranscriptPath, getLastAssistantMessage } from '../utils/transcript.js';

/**
 * Sync lastMessage from transcripts for active sessions
 * @returns true if any session was updated
 */
export function syncTranscripts(sessions: Session[], store: StoreData): boolean {
  let updated = false;

  for (const session of sessions) {
    if (session.status === 'stopped') continue;

    const transcriptPath = buildTranscriptPath(
      session.initial_cwd ?? session.cwd,
      session.session_id
    );
    const message = getLastAssistantMessage(transcriptPath);

    if (message && message !== session.lastMessage) {
      session.lastMessage = message;
      const key = getSessionKey(session.session_id, session.tty);
      store.sessions[key] = session;
      updated = true;
    }
  }

  return updated;
}
