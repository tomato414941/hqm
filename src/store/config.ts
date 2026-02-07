import { homedir } from 'node:os';
import { join } from 'node:path';
import { ensureDir, readJsonFile, writeJsonFile } from '../utils/file-io.js';
import type { LogLevel } from '../utils/logger.js';

const CONFIG_DIR = join(homedir(), '.hqm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Configuration structure
 */
export interface HqmConfig {
  /**
   * Session timeout in minutes.
   * 0 = no timeout (sessions persist until manually deleted or TTY closes)
   */
  sessionTimeoutMinutes: number;
  logLevel: LogLevel;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: HqmConfig = {
  sessionTimeoutMinutes: 0,
  logLevel: 'info',
};

/**
 * Read configuration from file
 * Returns default config if file doesn't exist or is invalid
 */
export function readConfig(): HqmConfig {
  ensureDir(CONFIG_DIR);
  const parsed = readJsonFile<Partial<HqmConfig>>(CONFIG_FILE, {});
  return { ...DEFAULT_CONFIG, ...parsed };
}

/**
 * Write configuration to file
 */
export function writeConfig(config: HqmConfig): void {
  ensureDir(CONFIG_DIR);
  writeJsonFile(CONFIG_FILE, config);
}

/**
 * Get the session timeout in milliseconds
 * Returns 0 if timeout is disabled
 */
export function getSessionTimeoutMs(): number {
  const config = readConfig();
  if (config.sessionTimeoutMinutes === 0) {
    return 0; // No timeout
  }
  return config.sessionTimeoutMinutes * 60 * 1000;
}

/**
 * Set the session timeout in minutes
 */
export function setSessionTimeout(minutes: number): void {
  const config = readConfig();
  config.sessionTimeoutMinutes = minutes;
  writeConfig(config);
}

/**
 * Get the config file path (for display purposes)
 */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getLogLevel(): LogLevel {
  const config = readConfig();
  return config.logLevel;
}
