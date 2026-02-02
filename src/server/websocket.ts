import type { IncomingMessage } from 'node:http';
import type { WebSocket, WebSocketServer } from 'ws';
import { getProjects, getSessions } from '../store/file-store.js';
import type { Project, Session } from '../types/index.js';
import { serverLog } from '../utils/debug.js';
import { handleFocusCommand } from './handlers/focus.js';
import { handleGetHistoryCommand } from './handlers/history.js';
import { handleSendKeystrokeCommand, handleSendTextCommand } from './handlers/send-text.js';
import { handleClearSessionsCommand } from './handlers/sessions.js';

interface WebSocketMessage {
  type: 'sessions' | 'focus' | 'sendText' | 'sendKeystroke' | 'clearSessions' | 'getHistory';
  sessionId?: string;
  text?: string;
  key?: string;
  useControl?: boolean;
  limit?: number;
  offset?: number;
}

interface BroadcastMessage {
  type: 'sessions';
  data: Session[];
  projects: Project[];
}

const WEBSOCKET_OPEN = 1;

type MessageHandler = (ws: WebSocket, message: WebSocketMessage) => void;

const messageHandlers: Record<string, MessageHandler> = {
  focus: (ws, msg) => {
    if (msg.sessionId) {
      void handleFocusCommand(ws, msg.sessionId);
    }
  },
  sendText: (ws, msg) => {
    if (msg.sessionId && msg.text) {
      void handleSendTextCommand(ws, msg.sessionId, msg.text);
    }
  },
  sendKeystroke: (ws, msg) => {
    if (msg.sessionId && msg.key) {
      void handleSendKeystrokeCommand(ws, msg.sessionId, msg.key, msg.useControl ?? false);
    }
  },
  clearSessions: (ws) => {
    handleClearSessionsCommand(ws);
  },
  getHistory: (ws, msg) => {
    if (msg.sessionId) {
      void handleGetHistoryCommand(ws, msg.sessionId, msg.limit, msg.offset);
    }
  },
};

function handleWebSocketMessage(ws: WebSocket, data: Buffer): void {
  let message: WebSocketMessage;
  try {
    message = JSON.parse(data.toString()) as WebSocketMessage;
  } catch {
    ws.send(JSON.stringify({ type: 'error', error: 'Invalid JSON message' }));
    return;
  }

  const handler = messageHandlers[message.type];
  if (handler) {
    handler(ws, message);
  }
}

export function broadcastToClients(wss: WebSocketServer, message: BroadcastMessage): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WEBSOCKET_OPEN) {
      client.send(data);
    }
  }
}

async function sendSessionsToClient(ws: WebSocket): Promise<void> {
  const sessions = await getSessions();
  const projects = getProjects();
  ws.send(JSON.stringify({ type: 'sessions', data: sessions, projects }));
}

export function setupWebSocketHandlers(wss: WebSocketServer, validToken: string): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `ws://${req.headers.host}`);
    const requestToken = url.searchParams.get('token');
    const clientIP = req.socket.remoteAddress || 'unknown';

    if (requestToken !== validToken) {
      serverLog('WS_CONNECT', `Auth failed from ${clientIP}`);
      ws.close(1008, 'Unauthorized');
      return;
    }

    serverLog('WS_CONNECT', `Client connected from ${clientIP}`);

    void sendSessionsToClient(ws);
    ws.on('message', (data: Buffer) => handleWebSocketMessage(ws, data));

    ws.on('close', (code: number) => {
      serverLog('WS_DISCONNECT', `Client disconnected (code: ${code})`);
    });

    ws.on('error', (error) => {
      serverLog('WS_ERROR', error.message);
      console.error('WebSocket client error:', error.message);
    });
  });
}
