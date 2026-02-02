import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DisplayOrderItem } from '../types/index.js';

const LOG_DIR = join(homedir(), '.hqm');
const LOG_FILE = join(LOG_DIR, 'display-order-changes.log');

export type DisplayOrderChangeReason =
  | 'add_session'
  | 'remove_session'
  | 'assign_project'
  | 'delete_project'
  | 'clear_all_projects'
  | 'create_project'
  | 'reorder_project'
  | 'move_session'
  | 'cleanup'
  | 'migration'
  | 'migration_keys';

export interface DisplayOrderChangeDetails {
  sessionKey?: string;
  projectId?: string;
  before?: DisplayOrderItem[];
  after?: DisplayOrderItem[];
  extra?: Record<string, unknown>;
}

export function logDisplayOrderChange(
  reason: DisplayOrderChangeReason,
  details: DisplayOrderChangeDetails
): void {
  try {
    mkdirSync(LOG_DIR, { recursive: true, mode: 0o700 });

    const entry = {
      timestamp: new Date().toISOString(),
      reason,
      ...details,
    };

    appendFileSync(LOG_FILE, `${JSON.stringify(entry)}\n`);
  } catch {
    // Ignore errors in logging
  }
}
