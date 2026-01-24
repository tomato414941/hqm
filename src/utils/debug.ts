import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DEBUG_LOG_PATH = join(homedir(), '.hqm', 'debug.log');

/**
 * Write a debug log entry with timestamp
 */
export function debugLog(message: string): void {
  try {
    mkdirSync(join(homedir(), '.hqm'), { recursive: true });
    const timestamp = new Date().toISOString();
    appendFileSync(DEBUG_LOG_PATH, `[${timestamp}] ${message}\n`);
  } catch {
    // Ignore errors in debug logging
  }
}

type ServerLogLevel =
  | 'STARTUP'
  | 'SHUTDOWN'
  | 'WS_CONNECT'
  | 'WS_DISCONNECT'
  | 'WS_ERROR'
  | 'HTTP_ERROR';

export function serverLog(
  level: ServerLogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const dataStr = data ? ` ${JSON.stringify(data)}` : '';
  debugLog(`[${level}] ${message}${dataStr}`);
}
