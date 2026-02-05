import { syncCodexSessionsOnce } from '../../codex/ingest.js';
import { getSessions, syncTmuxSessionsOnce } from '../../store/file-store.js';
import { abbreviateHomePath } from '../../utils/path.js';
import { getStatusDisplay } from '../../utils/status-display.js';

export async function listAction(): Promise<void> {
  syncCodexSessionsOnce();
  syncTmuxSessionsOnce();
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
}
