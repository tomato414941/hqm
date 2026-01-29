import { render } from 'ink';
import { Dashboard } from '../../components/Dashboard.js';
import { debugLog } from '../../utils/debug.js';

const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H\x1b[2J';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

export interface WatchOptions {
  qr: boolean;
  url: boolean;
}

export async function runWithAltScreen(renderFn: () => ReturnType<typeof render>) {
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

export async function watchAction(options: WatchOptions): Promise<void> {
  await runWithAltScreen(() => render(<Dashboard showQR={options.qr} showUrl={options.url} />));
}
