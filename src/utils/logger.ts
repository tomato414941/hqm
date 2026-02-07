import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LEVEL_VALUES: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const HQM_DIR = join(homedir(), '.hqm');
const LOG_FILE = join(HQM_DIR, 'hqm.log');
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_GENERATIONS = 3;
const FLUSH_INTERVAL_MS = 1000;
const FLUSH_BUFFER_SIZE = 100;

let configuredLevel: LogLevel = 'info';
let buffer: string[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let dirEnsured = false;

function ensureLogDir(): void {
  if (dirEnsured) return;
  try {
    if (!existsSync(HQM_DIR)) {
      mkdirSync(HQM_DIR, { recursive: true, mode: 0o700 });
    }
    dirEnsured = true;
  } catch {
    // Cannot create dir — logging will silently fail
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_VALUES[level] <= LEVEL_VALUES[configuredLevel];
}

function rotate(): void {
  try {
    if (!existsSync(LOG_FILE)) return;
    const stats = statSync(LOG_FILE);
    if (stats.size < MAX_FILE_SIZE) return;

    // Delete oldest generation
    const oldest = `${LOG_FILE}.${MAX_GENERATIONS}`;
    // Shift generations: .2 → .3, .1 → .2
    for (let i = MAX_GENERATIONS - 1; i >= 1; i--) {
      const from = `${LOG_FILE}.${i}`;
      const to = `${LOG_FILE}.${i + 1}`;
      try {
        renameSync(from, to);
      } catch {
        // File may not exist yet
      }
    }
    // Current → .1
    try {
      renameSync(LOG_FILE, `${LOG_FILE}.1`);
    } catch {
      // Rename failed — skip rotation this cycle
    }
    // Clean up oldest if rename chain pushed it out
    try {
      if (existsSync(oldest)) {
        unlinkSync(oldest);
      }
    } catch {
      // Best effort
    }
  } catch {
    // Rotation failed — continue without rotation
  }
}

function formatEntry(level: LogLevel, message: string, data?: Record<string, unknown>): string {
  const entry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };
  if (data !== undefined) {
    entry.data = data;
  }
  entry.pid = process.pid;
  return JSON.stringify(entry);
}

export function flush(): void {
  if (buffer.length === 0) return;
  ensureLogDir();
  const lines = `${buffer.join('\n')}\n`;
  buffer = [];
  try {
    rotate();
    appendFileSync(LOG_FILE, lines, { encoding: 'utf-8' });
  } catch {
    // Write failed — drop entries silently
  }
}

function enqueue(level: LogLevel, message: string, data?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;
  buffer.push(formatEntry(level, message, data));
  if (buffer.length >= FLUSH_BUFFER_SIZE) {
    flush();
  }
}

function startFlushTimer(): void {
  if (flushTimer !== null) return;
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
  flushTimer.unref();
}

function stopFlushTimer(): void {
  if (flushTimer !== null) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
}

export function setLevel(level: LogLevel): void {
  configuredLevel = level;
}

export function getLevel(): LogLevel {
  return configuredLevel;
}

export function initLogger(level?: LogLevel): void {
  // Env override takes precedence
  const envLevel = process.env.HQM_LOG_LEVEL;
  if (envLevel && envLevel in LEVEL_VALUES) {
    configuredLevel = envLevel as LogLevel;
  } else if (level !== undefined) {
    configuredLevel = level;
  }
  startFlushTimer();
  process.on('exit', flush);
}

export const logger = {
  error(message: string, data?: Record<string, unknown>): void {
    enqueue('error', message, data);
  },
  warn(message: string, data?: Record<string, unknown>): void {
    enqueue('warn', message, data);
  },
  info(message: string, data?: Record<string, unknown>): void {
    enqueue('info', message, data);
  },
  debug(message: string, data?: Record<string, unknown>): void {
    enqueue('debug', message, data);
  },
  flush,
};

// Auto-initialize on import
initLogger();

// --- Test helpers (not exported from public API) ---
export function _resetForTest(): void {
  buffer = [];
  dirEnsured = false;
  configuredLevel = 'info';
  stopFlushTimer();
}

export function _getBuffer(): string[] {
  return buffer;
}
