#!/usr/bin/env node
import { createRequire } from 'node:module';
import { Command } from 'commander';
import { render } from 'ink';
import { Dashboard } from '../components/Dashboard.js';
import { handleHookEvent } from '../hook/handler.js';
import { startServer } from '../server/index.js';
import { isHooksConfigured, setupHooks, setupSummaryConfig } from '../setup/index.js';
import {
  disableSummary,
  enableSummary,
  getConfigPath,
  getSummaryConfig,
  readConfig,
  setSessionTimeout,
} from '../store/config.js';
import { clearSessions, getSessions } from '../store/file-store.js';
import { debugLog } from '../utils/debug.js';
import { abbreviateHomePath } from '../utils/path.js';
import { getStatusDisplay } from '../utils/status.js';
import { getTtyFromAncestors } from '../utils/tty.js';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

// Alternate screen buffer escape sequences
const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

/**
 * Run TUI with alternate screen buffer
 */
async function runWithAltScreen(renderFn: () => ReturnType<typeof render>) {
  debugLog('runWithAltScreen: entering alternate screen');
  process.stdout.write(ENTER_ALT_SCREEN);
  const { waitUntilExit } = renderFn();
  try {
    debugLog('runWithAltScreen: waiting for exit...');
    await waitUntilExit();
    debugLog('runWithAltScreen: waitUntilExit() resolved');
  } finally {
    debugLog('runWithAltScreen: exiting alternate screen');
    process.stdout.write(EXIT_ALT_SCREEN);
    debugLog('runWithAltScreen: cleanup complete, calling process.exit(0)');
    process.exit(0);
  }
}

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
  .action(async (options: { qr: boolean; url: boolean }) => {
    await runWithAltScreen(() => render(<Dashboard showQR={options.qr} showUrl={options.url} />));
  });

program
  .command('hook <event>')
  .description('Handle a hook event from Claude Code (internal use)')
  .action(async (event: string) => {
    try {
      const tty = getTtyFromAncestors();
      await handleHookEvent(event, tty);
    } catch (e) {
      console.error('Hook error:', e);
      process.exit(1);
    }
  });

program
  .command('list')
  .alias('ls')
  .description('List all sessions')
  .action(async () => {
    const sessions = await getSessions();
    if (sessions.length === 0) {
      console.log('No active sessions');
      return;
    }
    for (const session of sessions) {
      const cwd = abbreviateHomePath(session.cwd);
      const { symbol } = getStatusDisplay(session.status);
      console.log(`${symbol} ${cwd}`);
    }
  });

program
  .command('clear')
  .description('Clear all sessions')
  .action(() => {
    clearSessions();
    console.log('Sessions cleared');
  });

program
  .command('setup')
  .description('Setup Claude Code hooks for monitoring')
  .action(async () => {
    await setupHooks();
  });

program
  .command('serve')
  .description('Start mobile web server only (without TUI)')
  .option('-p, --port <port>', 'Port number', '3456')
  .action(async (options: { port: string }) => {
    const port = Number.parseInt(options.port, 10);
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      console.error('Error: Invalid port number');
      process.exit(1);
    }
    await startServer(port);
  });

const configCmd = program.command('config').description('Manage hqm configuration');

configCmd
  .command('timeout [minutes]')
  .description('Get or set the session timeout (0 = no timeout)')
  .action((minutes?: string) => {
    if (minutes === undefined) {
      // Show current timeout setting
      const config = readConfig();
      const value = config.sessionTimeoutMinutes;
      if (value === 0) {
        console.log('Session timeout: disabled (sessions persist until TTY closes)');
      } else {
        console.log(`Session timeout: ${value} minutes`);
      }
      console.log(`Config file: ${getConfigPath()}`);
    } else {
      // Set timeout
      const value = Number.parseInt(minutes, 10);
      if (Number.isNaN(value) || value < 0) {
        console.error('Error: timeout must be a non-negative integer');
        process.exit(1);
      }
      setSessionTimeout(value);
      if (value === 0) {
        console.log('Session timeout disabled (sessions will persist until TTY closes)');
      } else {
        console.log(`Session timeout set to ${value} minutes`);
      }
    }
  });

const summaryCmd = configCmd.command('summary').description('Manage AI summary configuration');

summaryCmd
  .command('show', { isDefault: true })
  .description('Show current summary configuration')
  .action(() => {
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
  });

summaryCmd
  .command('enable')
  .description('Enable AI summary (requires API key to be set)')
  .action(async () => {
    const summary = getSummaryConfig();
    if (!summary?.apiKey) {
      console.log('API key not set. Running setup...');
      console.log('');
      await setupSummaryConfig();
    } else {
      enableSummary(summary.apiKey, summary.model);
      console.log('AI summary enabled');
    }
  });

summaryCmd
  .command('disable')
  .description('Disable AI summary (keeps API key for re-enabling)')
  .action(() => {
    disableSummary();
    console.log('AI summary disabled');
  });

summaryCmd
  .command('setup')
  .description('Configure AI summary (API key)')
  .action(async () => {
    await setupSummaryConfig();
  });

interface GlobalOptions {
  qr: boolean;
  url: boolean;
}

/**
 * Default action (when launched without arguments or with only global options)
 * - Run setup if not configured
 * - Launch monitor if already configured
 */
async function defaultAction(options: GlobalOptions) {
  if (!isHooksConfigured()) {
    console.log('Initial setup required.\n');
    await setupHooks();

    // Verify setup was completed
    if (!isHooksConfigured()) {
      // Setup was cancelled
      return;
    }
    console.log('');
  }

  // Launch monitor
  await runWithAltScreen(() => render(<Dashboard showQR={options.qr} showUrl={options.url} />));
}

// Set default action when no subcommand is provided
program.action(async () => {
  const options = program.opts<GlobalOptions>();
  await defaultAction(options);
});

program.parseAsync().catch(console.error);
