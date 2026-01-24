import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CLAUDE_DIR = join(homedir(), '.claude');
export const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

/** @internal */
export interface HookConfig {
  type: 'command';
  command: string;
}

/** @internal */
export interface HookEntry {
  matcher?: string;
  hooks: HookConfig[];
}

/** @internal */
export interface Settings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

/**
 * Ensure the .claude directory exists
 */
export function ensureClaudeDir(): void {
  if (!existsSync(CLAUDE_DIR)) {
    mkdirSync(CLAUDE_DIR, { recursive: true });
  }
}

/**
 * Load existing settings.json or return empty settings
 */
export function loadSettings(): Settings {
  if (!existsSync(SETTINGS_FILE)) {
    return {};
  }
  try {
    const content = readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(content) as Settings;
  } catch {
    console.error('Warning: Failed to parse existing settings.json, creating new one');
    return {};
  }
}

/**
 * Save settings to file
 */
export function saveSettings(settings: Settings): void {
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}
