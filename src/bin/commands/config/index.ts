import type { Command } from 'commander';
import { timeoutAction } from './timeout.js';

export function registerConfigCommands(configCmd: Command): void {
  configCmd
    .command('timeout [minutes]')
    .description('Get or set the session timeout (0 = no timeout)')
    .action(timeoutAction);
}
