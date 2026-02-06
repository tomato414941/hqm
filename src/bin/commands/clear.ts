import { createInterface } from 'node:readline';
import { isDaemonRunning, sendToDaemon } from '../../server/daemon-client.js';
import type { DaemonRequest } from '../../server/daemon-socket.js';
import { clearAll, clearProjects, clearSessions } from '../../store/file-store.js';
import { flushPendingWrites } from '../../store/write-cache.js';

interface ClearOptions {
  force?: boolean;
}

async function trySendToDaemon(type: DaemonRequest['type']): Promise<boolean> {
  if (!isDaemonRunning()) return false;
  try {
    const response = await sendToDaemon({ type });
    return response.ok;
  } catch {
    return false;
  }
}

async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function clearSessionsAction(options: ClearOptions): Promise<void> {
  if (!options.force) {
    const confirmed = await confirm('Clear all sessions from hqm?');
    if (!confirmed) {
      console.log('Cancelled');
      return;
    }
  }
  if (!(await trySendToDaemon('clearSessions'))) {
    clearSessions();
    await flushPendingWrites();
  }
  console.log('Sessions cleared');
}

export async function clearProjectsAction(options: ClearOptions): Promise<void> {
  if (!options.force) {
    const confirmed = await confirm('Delete all projects? (sessions will be moved to ungrouped)');
    if (!confirmed) {
      console.log('Cancelled');
      return;
    }
  }
  if (!(await trySendToDaemon('clearProjects'))) {
    clearProjects();
    await flushPendingWrites();
  }
  console.log('Projects cleared');
}

export async function clearAllAction(options: ClearOptions): Promise<void> {
  if (!options.force) {
    const confirmed = await confirm('Clear all sessions and delete all projects?');
    if (!confirmed) {
      console.log('Cancelled');
      return;
    }
  }
  if (!(await trySendToDaemon('clearAll'))) {
    clearAll();
    await flushPendingWrites();
  }
  console.log('All data cleared');
}
