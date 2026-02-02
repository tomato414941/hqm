import { createInterface } from 'node:readline';
import { clearAll, clearProjects, clearSessions } from '../../store/file-store.js';

interface ClearOptions {
  force?: boolean;
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
  clearSessions();
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
  clearProjects();
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
  clearAll();
  console.log('All data cleared');
}
