import { refreshSessionData } from '../../store/file-store.js';
import { abbreviateHomePath } from '../../utils/path.js';
import { getStatusDisplay } from '../../utils/status-display.js';

export async function listAction(): Promise<void> {
  const sessions = refreshSessionData();
  if (sessions.length === 0) {
    console.log('No active sessions');
    return;
  }
  for (const session of sessions) {
    const cwd = abbreviateHomePath(session.cwd);
    const { symbol } = getStatusDisplay(session.status);
    console.log(`${symbol} ${cwd}`);
  }
}
