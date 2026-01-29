import type { Command } from 'commander';
import {
  disableSummaryAction,
  enableSummaryAction,
  setupSummaryAction,
  showSummaryAction,
} from './summary.js';
import { timeoutAction } from './timeout.js';

export function registerConfigCommands(configCmd: Command): void {
  configCmd
    .command('timeout [minutes]')
    .description('Get or set the session timeout (0 = no timeout)')
    .action(timeoutAction);

  const summaryCmd = configCmd.command('summary').description('Manage AI summary configuration');

  summaryCmd
    .command('show', { isDefault: true })
    .description('Show current summary configuration')
    .action(showSummaryAction);

  summaryCmd
    .command('enable')
    .description('Enable AI summary (requires API key to be set)')
    .action(enableSummaryAction);

  summaryCmd
    .command('disable')
    .description('Disable AI summary (keeps API key for re-enabling)')
    .action(disableSummaryAction);

  summaryCmd
    .command('setup')
    .description('Configure AI summary (API key)')
    .action(setupSummaryAction);
}
