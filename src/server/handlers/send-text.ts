import type { WebSocket } from 'ws';
import { getSessions } from '../../store/file-store.js';
import type { Session } from '../../types/index.js';
import { sendKeystrokeToTerminal, sendTextToTerminal } from '../../utils/send-text.js';
import { isDangerousCommand } from '../security.js';

async function findSessionById(sessionId: string): Promise<Session | undefined> {
  const sessions = await getSessions();
  return sessions.find((s) => s.session_id === sessionId);
}

export async function handleSendTextCommand(
  ws: WebSocket,
  sessionId: string,
  text: string
): Promise<void> {
  if (isDangerousCommand(text)) {
    ws.send(
      JSON.stringify({
        type: 'sendTextResult',
        success: false,
        error: 'Dangerous command blocked for security',
      })
    );
    return;
  }

  const session = await findSessionById(sessionId);
  if (!session?.tty) {
    ws.send(JSON.stringify({ type: 'sendTextResult', success: false, error: 'Session not found' }));
    return;
  }
  const result = sendTextToTerminal(session.tty, text);
  ws.send(JSON.stringify({ type: 'sendTextResult', ...result }));
}

export async function handleSendKeystrokeCommand(
  ws: WebSocket,
  sessionId: string,
  key: string,
  useControl = false
): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session?.tty) {
    ws.send(
      JSON.stringify({ type: 'sendKeystrokeResult', success: false, error: 'Session not found' })
    );
    return;
  }
  const result = sendKeystrokeToTerminal(session.tty, key, useControl);
  ws.send(JSON.stringify({ type: 'sendKeystrokeResult', ...result }));
}
