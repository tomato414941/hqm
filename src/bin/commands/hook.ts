import { handleHookEvent } from '../../hook/handler.js';
import { getTtyFromAncestors } from '../../utils/tty.js';

export async function hookAction(event: string): Promise<void> {
  try {
    const tty = getTtyFromAncestors();
    await handleHookEvent(event, tty);
  } catch (e) {
    console.error('Hook error:', e);
    process.exit(1);
  }
}
