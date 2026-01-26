import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getContentType(path: string): string {
  if (path.endsWith('.html')) return 'text/html';
  if (path.endsWith('.css')) return 'text/css';
  if (path.endsWith('.js')) return 'application/javascript';
  return 'text/plain';
}

export function serveStatic(req: IncomingMessage, res: ServerResponse, validToken: string): void {
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
