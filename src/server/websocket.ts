import type { IncomingMessage } from 'node:http';
import type { WebSocket, WebSocketServer } from 'ws';
import { getProjects, getSessionsLight } from '../store/file-store.js';
import type { Project, Session } from '../types/index.js';
import { logger } from '../utils/logger.js';
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
  } else {
    logger.warn('Unknown WebSocket message type', { type: message.type });
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

function sendSessionsToClient(ws: WebSocket): void {
  const sessions = getSessionsLight();
  const projects = getProjects();
  ws.send(JSON.stringify({ type: 'sessions', data: sessions, projects }));
}

export function setupWebSocketHandlers(wss: WebSocketServer, validToken: string): void {
  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || '/', `ws://${req.headers.host}`);
    const requestToken = url.searchParams.get('token');
    const clientIP = req.socket.remoteAddress || 'unknown';

    if (requestToken !== validToken) {
      logger.info(`WebSocket auth failed from ${clientIP}`);
      ws.close(1008, 'Unauthorized');
      return;
    }

    logger.info(`WebSocket client connected from ${clientIP}`);

    void sendSessionsToClient(ws);
    ws.on('message', (data: Buffer) => handleWebSocketMessage(ws, data));

    ws.on('close', (code: number) => {
      logger.info(`WebSocket client disconnected (code: ${code})`);
    });

    ws.on('error', (error) => {
      logger.warn('WebSocket client error', { error: error.message });
    });
  });
}
