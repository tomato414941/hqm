import type { WebSocket } from 'ws';
import { getSessionsLight } from '../../store/file-store.js';
import type { HistoryResponse, Session } from '../../types/index.js';
import { getAllMessagesAsync, getTranscriptPath } from '../../utils/transcript.js';

async function findSessionById(sessionId: string): Promise<Session | undefined> {
  const sessions = getSessionsLight();
  return sessions.find((s) => s.session_id === sessionId);
}

export async function handleGetHistoryCommand(
  ws: WebSocket,
  sessionId: string,
  limit = 50,
  offset = 0
): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session) {
    ws.send(
      JSON.stringify({
        type: 'history',
        sessionId,
        messages: [],
        hasMore: false,
        error: 'Session not found',
      })
    );
    return;
  }

  const transcriptPath =
    session.transcript_path || getTranscriptPath(sessionId, session.initial_cwd ?? session.cwd);
  if (!transcriptPath) {
    ws.send(
      JSON.stringify({
        type: 'history',
        sessionId,
        messages: [],
        hasMore: false,
        error: 'Transcript not found',
      })
    );
    return;
  }

  const result = await getAllMessagesAsync(transcriptPath, { limit, offset });

  const response: HistoryResponse = {
    type: 'history',
    sessionId,
    messages: result.messages,
    hasMore: result.hasMore,
  };

  ws.send(JSON.stringify(response));
}
