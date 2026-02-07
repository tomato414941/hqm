import { logger } from './logger.js';

/**
 * @deprecated Use logger.debug() directly
 */
export function debugLog(message: string): void {
  logger.debug(message);
}

type ServerLogLevel =
  | 'STARTUP'
  | 'SHUTDOWN'
  | 'WS_CONNECT'
  | 'WS_DISCONNECT'
  | 'WS_ERROR'
  | 'HTTP_ERROR';

const SERVER_LOG_LEVEL_MAP: Record<ServerLogLevel, 'info' | 'warn'> = {
  STARTUP: 'info',
  SHUTDOWN: 'info',
  WS_CONNECT: 'info',
  WS_DISCONNECT: 'info',
  WS_ERROR: 'warn',
  HTTP_ERROR: 'warn',
};

/**
 * @deprecated Use logger.info/warn() directly
 */
export function serverLog(
  level: ServerLogLevel,
  message: string,
  data?: Record<string, unknown>
): void {
  const logLevel = SERVER_LOG_LEVEL_MAP[level];
  logger[logLevel](message, data);
}
