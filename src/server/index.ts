import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import qrcode from 'qrcode-terminal';
import { WebSocketServer } from 'ws';
import { startCleanupLoop, stopCleanupLoop } from '../store/cleanup-loop.js';
import { logger } from '../utils/logger.js';
import { generateAuthToken } from './auth.js';
import { startDaemonSocket, stopDaemonSocket } from './daemon-socket.js';
import { DEFAULT_PORT, findAvailablePort, isPortAvailable } from './port.js';
import { isDangerousCommand } from './security.js';
import { getContentType, serveStatic } from './static.js';
import { createFileWatcher } from './watcher.js';
import { broadcastToClients, setupWebSocketHandlers } from './websocket.js';

// Re-export for backward compatibility
export {
  broadcastToClients,
  DEFAULT_PORT,
  findAvailablePort,
  generateAuthToken,
  getContentType,
  isDangerousCommand,
  isPortAvailable,
};

// Re-export handlers for backward compatibility
export { handleFocusCommand } from './handlers/focus.js';
export { handleGetHistoryCommand } from './handlers/history.js';
export { handleSendTextCommand } from './handlers/send-text.js';
export { handleClearSessionsCommand } from './handlers/sessions.js';

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

interface ServerComponents {
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  watcher: ReturnType<typeof createFileWatcher>;
}

function createServerComponents(token: string): ServerComponents {
  const server = createServer((req, res) => serveStatic(req, res, token));
  const wss = new WebSocketServer({ server });
  setupWebSocketHandlers(wss, token);
  const watcher = createFileWatcher(wss);
  startCleanupLoop();

  return { server, wss, watcher };
}

function stopServerComponents({ watcher, wss, server }: ServerComponents): void {
  void watcher.close();
  stopCleanupLoop();

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

  startDaemonSocket();

  await new Promise<void>((resolve) => {
    components.server.listen(actualPort, '0.0.0.0', resolve);
  });

  return {
    url,
    qrCode,
    token,
    port: actualPort,
    stop: () => {
      stopServerComponents(components);
      void stopDaemonSocket();
    },
  };
}

export async function startServer(port = DEFAULT_PORT): Promise<void> {
  const actualPort = await findAvailablePort(port);
  const localIP = getLocalIP();
  const token = generateAuthToken();
  const url = `http://${localIP}:${actualPort}?token=${token}`;

  const components = createServerComponents(token);

  startDaemonSocket();

  components.server.listen(actualPort, '0.0.0.0', () => {
    logger.info(`Server listening on ${localIP}:${actualPort}`);
    if (actualPort !== port) {
      logger.info(`Port ${port} unavailable, using ${actualPort}`);
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
    logger.info(`Server stopped (signal: ${signal})`);
    logger.flush();
    console.log('\n  Shutting down...');
    stopServerComponents(components);
    void stopDaemonSocket();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
