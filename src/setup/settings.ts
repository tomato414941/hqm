import { homedir } from 'node:os';
import { join } from 'node:path';
import { ensureDir, readJsonFileWithErrorHandler, writeJsonFile } from '../utils/file-io.js';

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
  ensureDir(CLAUDE_DIR);
}

/**
 * Load existing settings.json or return empty settings
 */
export function loadSettings(): Settings {
  return readJsonFileWithErrorHandler<Settings>(SETTINGS_FILE, {}, () => {
    console.error('Warning: Failed to parse existing settings.json, creating new one');
  });
}

/**
 * Save settings to file
 */
export function saveSettings(settings: Settings): void {
  writeJsonFile(SETTINGS_FILE, settings);
}
