import { render } from 'ink';
import { Dashboard } from '../../components/Dashboard.js';
import { logger } from '../../utils/logger.js';

const ENTER_ALT_SCREEN = '\x1b[?1049h\x1b[H\x1b[2J';
const EXIT_ALT_SCREEN = '\x1b[?1049l';

export interface WatchOptions {
  qr: boolean;
  url: boolean;
}

export async function runWithAltScreen(renderFn: () => ReturnType<typeof render>) {
  logger.debug('runWithAltScreen: entering alternate screen');
  process.stdout.write(ENTER_ALT_SCREEN);
  const { waitUntilExit } = renderFn();
  try {
    logger.debug('runWithAltScreen: waiting for exit...');
    await waitUntilExit();
    logger.debug('runWithAltScreen: waitUntilExit() resolved');
  } finally {
    logger.debug('runWithAltScreen: exiting alternate screen');
    process.stdout.write(EXIT_ALT_SCREEN);
    logger.debug('runWithAltScreen: cleanup complete');
  }
}

export async function watchAction(options: WatchOptions): Promise<void> {
  await runWithAltScreen(() => render(<Dashboard showQR={options.qr} showUrl={options.url} />));
}
