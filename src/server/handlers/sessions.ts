import type { WebSocket } from 'ws';
import { clearSessions } from '../../store/file-store.js';

export function handleClearSessionsCommand(ws: WebSocket): void {
  try {
    clearSessions();
    ws.send(JSON.stringify({ type: 'clearSessionsResult', success: true }));
  } catch {
    ws.send(
      JSON.stringify({
        type: 'clearSessionsResult',
        success: false,
        error: 'Failed to clear sessions',
      })
    );
  }
}
