import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.hqm');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * Summary configuration
 */
export interface SummaryConfig {
  enabled: boolean;
  provider: 'anthropic';
  apiKey: string;
  model?: string; // Default: claude-haiku-4-20250514
}

/**
 * Configuration structure
 */
export interface HqmConfig {
  /**
   * Session timeout in minutes.
   * 0 = no timeout (sessions persist until manually deleted or TTY closes)
   */
  sessionTimeoutMinutes: number;
  /**
   * AI summary configuration (optional, disabled by default)
   */
  summary?: SummaryConfig;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: HqmConfig = {
  sessionTimeoutMinutes: 0, // No timeout by default
};

/**
 * Ensure the config directory exists
 */
function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read configuration from file
 * Returns default config if file doesn't exist or is invalid
 */
export function readConfig(): HqmConfig {
  ensureConfigDir();

  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const content = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Partial<HqmConfig>;

    // Merge with defaults to handle missing fields
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Write configuration to file
 */
export function writeConfig(config: HqmConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
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

/**
 * Get summary configuration
 */
export function getSummaryConfig(): SummaryConfig | undefined {
  const config = readConfig();
  return config.summary;
}

/**
 * Check if summary feature is enabled and configured
 */
export function isSummaryEnabled(): boolean {
  const summary = getSummaryConfig();
  return summary?.enabled === true && !!summary?.apiKey;
}

/**
 * Set summary configuration
 */
export function setSummaryConfig(summary: SummaryConfig | undefined): void {
  const config = readConfig();
  config.summary = summary;
  writeConfig(config);
}

/**
 * Enable summary with the given API key
 */
export function enableSummary(apiKey: string, model?: string): void {
  setSummaryConfig({
    enabled: true,
    provider: 'anthropic',
    apiKey,
    model,
  });
}

/**
 * Disable summary (keeps API key for re-enabling)
 */
export function disableSummary(): void {
  const config = readConfig();
  if (config.summary) {
    config.summary.enabled = false;
    writeConfig(config);
  }
}
