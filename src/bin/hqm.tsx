#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { render } from 'ink';
import { codexSessionsDirExists } from '../codex/paths.js';
import { Dashboard } from '../components/Dashboard.js';
import { isHooksConfigured, setupHooks } from '../setup/index.js';
import { clearAllAction, clearProjectsAction, clearSessionsAction } from './commands/clear.js';
import { registerConfigCommands } from './commands/config/index.js';
import { hookAction } from './commands/hook.js';
import { listAction } from './commands/list.js';
import { serveAction } from './commands/serve.js';
import { setupAction } from './commands/setup.js';
import { runWithAltScreen, watchAction } from './commands/watch.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('hqm')
  .description('HQM - TUI dashboard for monitoring Claude Code sessions on Linux')
  .version(pkg.version)
  .option('--no-qr', 'Disable QR code display')
  .option('--no-url', 'Disable URL display (implies --no-qr)');

program
  .command('watch')
  .alias('w')
  .description('Start the monitoring TUI')
  .option('--no-qr', 'Disable QR code display')
  .option('--no-url', 'Disable URL display (implies --no-qr)')
  .action(watchAction);

program
  .command('hook <event>')
  .description('Handle a hook event from Claude Code (internal use)')
  .action(hookAction);

program.command('list').alias('ls').description('List all sessions').action(listAction);

const clearCmd = program.command('clear').description('Clear sessions and/or projects');
clearCmd
  .command('sessions', { isDefault: true })
  .description('Clear all sessions (default)')
  .option('-f, --force', 'Skip confirmation')
  .action(clearSessionsAction);
clearCmd
  .command('projects')
  .description('Delete all projects (sessions move to ungrouped)')
  .option('-f, --force', 'Skip confirmation')
  .action(clearProjectsAction);
clearCmd
  .command('all')
  .description('Clear all sessions and delete all projects')
  .option('-f, --force', 'Skip confirmation')
  .action(clearAllAction);

program.command('setup').description('Setup Claude Code hooks for monitoring').action(setupAction);

program
  .command('serve')
  .description('Start mobile web server only (without TUI)')
  .option('-p, --port <port>', 'Port number', '3456')
  .action(serveAction);

const configCmd = program.command('config').description('Manage hqm configuration');
registerConfigCommands(configCmd);

interface GlobalOptions {
  qr: boolean;
  url: boolean;
}

async function defaultAction(options: GlobalOptions) {
  const codexDisabled = process.env.HQM_DISABLE_CODEX;
  const codexEnabled = !(codexDisabled === '1' || codexDisabled?.toLowerCase() === 'true');
  const hasCodex = codexEnabled && codexSessionsDirExists();

  if (!isHooksConfigured()) {
    if (hasCodex) {
      console.log('Claude hooks not configured. Monitoring Codex sessions only.');
      console.log('Run `hqm setup` to enable Claude Code hooks.\n');
    } else {
      console.log('Initial setup required.\n');
      await setupHooks();

      if (!isHooksConfigured()) {
        return;
      }
      console.log('');
    }
  }

  await runWithAltScreen(() => render(<Dashboard showQR={options.qr} showUrl={options.url} />));
}

program.action(async () => {
  const options = program.opts<GlobalOptions>();
  await defaultAction(options);
});

program.parseAsync().catch(console.error);
