import { startServer } from '../../server/index.js';

export interface ServeOptions {
  port: string;
}

export async function serveAction(options: ServeOptions): Promise<void> {
  const port = Number.parseInt(options.port, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error('Error: Invalid port number');
    process.exit(1);
  }
  await startServer(port);
}
