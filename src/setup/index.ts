import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { PACKAGE_NAME } from '../constants.js';
import { enableSummary, getConfigPath, getSummaryConfig } from '../store/config.js';
import { askConfirmation, askInput } from '../utils/prompt.js';
import {
  applyHooksToSettings,
  areAllHooksConfigured,
  categorizeHooks,
  createHookEntry,
  hasHqmHookForEvent,
} from './hooks.js';
import {
  ensureClaudeDir,
  type HookConfig,
  type HookEntry,
  loadSettings,
  SETTINGS_FILE,
  type Settings,
  saveSettings,
} from './settings.js';

// Re-export types and functions for backward compatibility
export type { HookConfig, HookEntry, Settings };
export { hasHqmHookForEvent, categorizeHooks, createHookEntry };

/**
 * Check if hqm command is in PATH and return the appropriate command
 */
function getHqmCommand(): string {
  const result = spawnSync('which', ['hqm'], { encoding: 'utf-8' });
  if (result.status === 0) {
    return 'hqm';
  }
  return `npx ${PACKAGE_NAME}`;
}

/**
 * Display setup preview to the user
 */
function showSetupPreview(
  hooksToAdd: string[],
  hooksToSkip: string[],
  settingsExist: boolean
): void {
  console.log(`Target file: ${SETTINGS_FILE}`);
  console.log(settingsExist ? '(file exists, will be modified)' : '(file will be created)');
  console.log('');
  console.log('The following hooks will be added:');
  for (const eventName of hooksToAdd) {
    console.log(`  [add]  ${eventName}`);
  }
  if (hooksToSkip.length > 0) {
    console.log('');
    console.log('Already configured (will be skipped):');
    for (const eventName of hooksToSkip) {
      console.log(`  [skip] ${eventName}`);
    }
  }
  console.log('');
}

/**
 * Check if hooks are already configured
 */
export function isHooksConfigured(): boolean {
  if (!existsSync(SETTINGS_FILE)) {
    return false;
  }

  try {
    const settings = loadSettings();
    return areAllHooksConfigured(settings);
  } catch {
    return false;
  }
}

export async function setupHooks(): Promise<void> {
  console.log('HQM Setup');
  console.log('=========');
  console.log('');

  const baseCommand = getHqmCommand();
  console.log(`Using command: ${baseCommand}`);
  console.log('');

  // Ensure .claude directory exists
  ensureClaudeDir();

  const settingsExist = existsSync(SETTINGS_FILE);
  const settings = loadSettings();
  const { toAdd: hooksToAdd, toSkip: hooksToSkip } = categorizeHooks(settings);

  // No changes needed
  if (hooksToAdd.length === 0) {
    console.log('All hooks already configured. No changes needed.');
    console.log('');
    console.log(`Start monitoring with: ${baseCommand}`);
    return;
  }

  showSetupPreview(hooksToAdd, hooksToSkip, settingsExist);

  const confirmed = await askConfirmation('Do you want to apply these changes?');
  if (!confirmed) {
    console.log('');
    console.log('Setup cancelled. No changes were made.');
    return;
  }

  applyHooksToSettings(settings, hooksToAdd, baseCommand);
  saveSettings(settings);

  console.log('');
  console.log(`Setup complete! Added ${hooksToAdd.length} hook(s) to ${SETTINGS_FILE}`);

  // Ask about AI summary configuration
  await setupSummaryConfig();

  console.log('');
  console.log(`Start monitoring with: ${baseCommand}`);
}

/**
 * Interactive setup for AI summary configuration
 */
export async function setupSummaryConfig(): Promise<void> {
  console.log('');
  console.log('AI Summary Configuration');
  console.log('------------------------');

  const existingConfig = getSummaryConfig();
  if (existingConfig?.enabled && existingConfig?.apiKey) {
    console.log('AI summary is already configured and enabled.');
    const reconfigure = await askConfirmation('Do you want to reconfigure it?');
    if (!reconfigure) {
      return;
    }
  }

  console.log('');
  console.log('AI summary generates a brief summary when Claude Code sessions end.');
  console.log('This requires a separate Anthropic API key (not your Claude Code subscription).');
  console.log('');

  const enable = await askConfirmation('Enable AI summary feature?');
  if (!enable) {
    console.log('AI summary disabled.');
    return;
  }

  console.log('');
  console.log('Enter your Anthropic API key.');
  console.log('Get one at: https://console.anthropic.com/settings/keys');
  console.log('');

  const apiKey = await askInput('API key', { mask: true });
  if (!apiKey || !apiKey.startsWith('sk-')) {
    console.log('');
    console.log('Invalid API key format. AI summary not configured.');
    return;
  }

  enableSummary(apiKey);
  console.log('');
  console.log(`AI summary enabled! Configuration saved to ${getConfigPath()}`);
}
