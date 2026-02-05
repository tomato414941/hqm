import type { WebSocket } from 'ws';
import { getSessions } from '../../store/file-store.js';
import type { Session } from '../../types/index.js';
import { focusSessionByContext } from '../../utils/focus.js';

async function findSessionById(sessionId: string): Promise<Session | undefined> {
  const sessions = await getSessions();
  return sessions.find((s) => s.session_id === sessionId);
}

export async function handleFocusCommand(ws: WebSocket, sessionId: string): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session) {
    ws.send(
      JSON.stringify({
        type: 'focusResult',
        success: false,
        error: 'Session not found',
      })
    );
    return;
  }
  const success = focusSessionByContext(session);
  ws.send(JSON.stringify({ type: 'focusResult', success }));
}
