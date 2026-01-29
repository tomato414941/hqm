import { setupSummaryConfig } from '../../../setup/index.js';
import {
  disableSummary,
  enableSummary,
  getConfigPath,
  getSummaryConfig,
} from '../../../store/config.js';

export function showSummaryAction(): void {
  const summary = getSummaryConfig();
  console.log('AI Summary Configuration');
  console.log('------------------------');
  if (!summary) {
    console.log('Status: not configured');
  } else {
    console.log(`Status: ${summary.enabled ? 'enabled' : 'disabled'}`);
    console.log(`Provider: ${summary.provider}`);
    console.log(
      `API Key: ${summary.apiKey ? `${summary.apiKey.slice(0, 7)}...${summary.apiKey.slice(-4)}` : 'not set'}`
    );
    console.log(`Model: ${summary.model || 'claude-haiku-4-20250514 (default)'}`);
  }
  console.log(`Config file: ${getConfigPath()}`);
}

export async function enableSummaryAction(): Promise<void> {
  const summary = getSummaryConfig();
  if (!summary?.apiKey) {
    console.log('API key not set. Running setup...');
    console.log('');
    await setupSummaryConfig();
  } else {
    enableSummary(summary.apiKey, summary.model);
    console.log('AI summary enabled');
  }
}

export function disableSummaryAction(): void {
  disableSummary();
  console.log('AI summary disabled');
}

export async function setupSummaryAction(): Promise<void> {
  await setupSummaryConfig();
}
