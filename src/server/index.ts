import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { homedir, networkInterfaces } from 'node:os';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';
import qrcode from 'qrcode-terminal';
import { type WebSocket, WebSocketServer } from 'ws';
import { clearSessions, getSessions, getStorePath } from '../store/file-store.js';
import type { HistoryResponse, Session } from '../types/index.js';
import { serverLog } from '../utils/debug.js';
import { focusSession } from '../utils/focus.js';
import { sendKeystrokeToTerminal, sendTextToTerminal } from '../utils/send-text.js';
import { buildTranscriptPath, getAllMessages } from '../utils/transcript.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_PORT = 3456;
const MAX_PORT_ATTEMPTS = 10;

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createNetServer();
    server.once('error', () => {
      server.close();
      resolve(false);
    });
    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });
    server.listen(port, '0.0.0.0');
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let i = 0; i < MAX_PORT_ATTEMPTS; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(
    `No available port found in range ${startPort}-${startPort + MAX_PORT_ATTEMPTS - 1}`
  );
}

function generateAuthToken(): string {
  return randomBytes(32).toString('hex');
}

function saveUrlToFile(url: string): void {
  const hqmDir = resolve(homedir(), '.hqm');
  mkdirSync(hqmDir, { recursive: true });
  writeFileSync(resolve(hqmDir, 'web-url.txt'), url, 'utf-8');
}

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
}

const WEBSOCKET_OPEN = 1;

const DANGEROUS_COMMAND_PATTERNS: RegExp[] = [
  /rm\s+(-rf?|--recursive)/i,
  /sudo\s+rm/i,
  /mkfs/i,
  /dd\s+if=/i,
  />\s*\/dev\//i,
  /chmod\s+777/i,
  /curl.*\|\s*(ba)?sh/i,
  /wget.*\|\s*(ba)?sh/i,
];

function isDangerousCommand(text: string): boolean {
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

async function findSessionById(sessionId: string): Promise<Session | undefined> {
  const sessions = await getSessions();
  return sessions.find((s) => s.session_id === sessionId);
}

async function handleFocusCommand(ws: WebSocket, sessionId: string): Promise<void> {
  const session = await findSessionById(sessionId);
  if (!session?.tty) {
    ws.send(
      JSON.stringify({
        type: 'focusResult',
        success: false,
        error: 'Session not found or no TTY',
      })
    );
    return;
  }
  const success = focusSession(session.tty);
  ws.send(JSON.stringify({ type: 'focusResult', success }));
}

async function handleSendTextCommand(
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

async function handleSendKeystrokeCommand(
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

function handleClearSessionsCommand(ws: WebSocket): void {
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

async function handleGetHistoryCommand(
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

  const transcriptPath = buildTranscriptPath(session.cwd, sessionId);
  const result = getAllMessages(transcriptPath, { limit, offset });

  const response: HistoryResponse = {
    type: 'history',
    sessionId,
    messages: result.messages,
    hasMore: result.hasMore,
  };

  ws.send(JSON.stringify(response));
}

function handleWebSocketMessage(ws: WebSocket, data: Buffer): void {
  let message: WebSocketMessage;
  try {
    message = JSON.parse(data.toString()) as WebSocketMessage;
  } catch {
    return;
  }

  if (message.type === 'focus' && message.sessionId) {
    void handleFocusCommand(ws, message.sessionId);
    return;
  }

  if (message.type === 'sendText' && message.sessionId && message.text) {
    void handleSendTextCommand(ws, message.sessionId, message.text);
    return;
  }

  if (message.type === 'sendKeystroke' && message.sessionId && message.key) {
    void handleSendKeystrokeCommand(
      ws,
      message.sessionId,
      message.key,
      message.useControl ?? false
    );
    return;
  }

  if (message.type === 'clearSessions') {
    handleClearSessionsCommand(ws);
    return;
  }

  if (message.type === 'getHistory' && message.sessionId) {
    void handleGetHistoryCommand(ws, message.sessionId, message.limit, message.offset);
  }
}

function broadcastToClients(wss: WebSocketServer, message: BroadcastMessage): void {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WEBSOCKET_OPEN) {
      client.send(data);
    }
  }
}

async function sendSessionsToClient(ws: WebSocket): Promise<void> {
  const sessions = await getSessions();
  ws.send(JSON.stringify({ type: 'sessions', data: sessions }));
}

function setupWebSocketHandlers(wss: WebSocketServer, validToken: string): void {
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

export interface ServerInfo {
  url: string;
  qrCode: string;
  token: string;
  port: number;
  stop: () => void;
}

export function getLocalIP(): string {
  if (process.env.HQM_HOST) {
    return process.env.HQM_HOST;
  }
  const interfaces = networkInterfaces();
  const allAddresses = Object.values(interfaces)
    .flat()
    .filter((info): info is NonNullable<typeof info> => info != null);
  const externalIPv4 = allAddresses.find((info) => info.family === 'IPv4' && !info.internal);
  return externalIPv4?.address ?? 'localhost';
}

export function generateQRCode(text: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(text, { small: true }, (qrCode: string) => {
      resolve(qrCode);
    });
  });
}

function getContentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  return 'text/plain';
}

function serveStatic(req: IncomingMessage, res: ServerResponse, validToken: string): void {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requestToken = url.searchParams.get('token');
  const filePath = url.pathname === '/' ? '/index.html' : url.pathname;

  const isPublicLibrary = filePath.startsWith('/lib/') && filePath.endsWith('.js');

  if (!isPublicLibrary && requestToken !== validToken) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized - Invalid or missing token');
    return;
  }

  const publicDir = resolve(__dirname, '../../public');

  const safePath = normalize(filePath)
    .replace(/^(\.\.(\/|\\|$))+/, '')
    .replace(/^\/+/, '');
  const fullPath = resolve(publicDir, safePath);

  if (!fullPath.startsWith(publicDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  try {
    const content = readFileSync(fullPath, 'utf-8');
    res.writeHead(200, {
      'Content-Type': getContentType(filePath),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end('Not Found');
  }
}

interface ServerComponents {
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  watcher: ReturnType<typeof chokidar.watch>;
}

function createServerComponents(token: string): ServerComponents {
  const server = createServer((req, res) => serveStatic(req, res, token));
  const wss = new WebSocketServer({ server });
  setupWebSocketHandlers(wss, token);

  const storePath = getStorePath();
  const watcher = chokidar.watch(storePath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 100,
      pollInterval: 50,
    },
  });

  watcher.on('change', () => {
    void (async () => {
      const sessions = await getSessions();
      broadcastToClients(wss, { type: 'sessions', data: sessions });
    })();
  });

  return { server, wss, watcher };
}

function stopServerComponents({ watcher, wss, server }: ServerComponents): void {
  void watcher.close();

  for (const client of wss.clients) {
    client.terminate();
  }

  wss.close();
  server.close();
}

export async function createMobileServer(port = DEFAULT_PORT): Promise<ServerInfo> {
  const actualPort = await findAvailablePort(port);
  const localIP = getLocalIP();
  const token = generateAuthToken();
  const url = `http://${localIP}:${actualPort}?token=${token}`;
  const qrCode = await generateQRCode(url);

  const components = createServerComponents(token);

  await new Promise<void>((resolve) => {
    components.server.listen(actualPort, '0.0.0.0', resolve);
  });

  return {
    url,
    qrCode,
    token,
    port: actualPort,
    stop: () => stopServerComponents(components),
  };
}

export async function startServer(port = DEFAULT_PORT): Promise<void> {
  const actualPort = await findAvailablePort(port);
  const localIP = getLocalIP();
  const token = generateAuthToken();
  const url = `http://${localIP}:${actualPort}?token=${token}`;

  const components = createServerComponents(token);

  components.server.listen(actualPort, '0.0.0.0', () => {
    serverLog('STARTUP', `Server listening on ${localIP}:${actualPort}`);
    if (actualPort !== port) {
      serverLog('STARTUP', `Port ${port} unavailable, using ${actualPort}`);
    }

    console.log('\n  HQM - Mobile Web Interface\n');
    console.log(`  Server running at: ${url}\n`);
    if (actualPort !== port) {
      console.log(`  (Port ${port} was in use, using ${actualPort} instead)\n`);
    }
    console.log('  Scan this QR code with your phone:\n');
    qrcode.generate(url, { small: true });
    console.log('\n  Press Ctrl+C to stop the server.\n');
  });

  const shutdown = (signal: string) => {
    serverLog('SHUTDOWN', `Server stopped (signal: ${signal})`);
    console.log('\n  Shutting down...');
    stopServerComponents(components);
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
