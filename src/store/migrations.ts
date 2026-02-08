import type { DisplayOrderItem, Project, Session, StoreData } from '../types/index.js';
import { logDisplayOrderChange } from '../utils/display-order-log.js';

export const UNGROUPED_PROJECT_ID = '';

/**
 * Migrate old data structure to new displayOrder format
 */
export function migrateToDisplayOrder(store: StoreData): void {
  if (store.displayOrder) return;

  const order: DisplayOrderItem[] = [];

  // Always add ungrouped project first
  order.push({ type: 'project', id: UNGROUPED_PROJECT_ID });

  // Get sessions with their old project/order info (from migration)
  interface OldSession extends Session {
    project?: string;
    order?: number;
  }
  const sessionsWithOldData = store.sessions as Record<string, OldSession>;

  // Add ungrouped sessions (project is undefined or empty)
  const ungroupedSessions = Object.entries(sessionsWithOldData)
    .filter(([, s]) => !s.project)
    .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

  for (const [key] of ungroupedSessions) {
    order.push({ type: 'session', key });
  }

  // Add named projects (sorted by their order property, then by name)
  interface OldProject extends Project {
    order?: number;
  }
  const sortedProjects = Object.values((store.projects || {}) as Record<string, OldProject>).sort(
    (a, b) => {
      const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
      const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.name.localeCompare(b.name);
    }
  );

  for (const project of sortedProjects) {
    order.push({ type: 'project', id: project.id });

    // Add sessions belonging to this project
    const projectSessions = Object.entries(sessionsWithOldData)
      .filter(([, s]) => s.project === project.id)
      .sort((a, b) => (a[1].order ?? 0) - (b[1].order ?? 0));

    for (const [key] of projectSessions) {
      order.push({ type: 'session', key });
    }
  }

  store.displayOrder = order;

  logDisplayOrderChange('migration', {
    after: order,
    extra: {
      ungroupedSessionCount: ungroupedSessions.length,
      projectCount: sortedProjects.length,
    },
  });

  // Clean up old project/order fields from sessions
  for (const session of Object.values(sessionsWithOldData)) {
    delete session.project;
    delete session.order;
  }
}

/**
 * Migrate session keys from session_id:tty format to session_id only
 */
export function migrateSessionKeys(store: StoreData): void {
  const oldSessions = store.sessions;
  const newSessions: Record<string, Session> = {};
  const keyMapping = new Map<string, string>();

  for (const [oldKey, session] of Object.entries(oldSessions)) {
    // Check if key is in old format (contains :)
    if (oldKey.includes(':')) {
      const newKey = session.session_id;
      // If there's already a session with this new key, keep the one with latest updated_at
      if (newSessions[newKey]) {
        const existing = newSessions[newKey];
        if (new Date(session.updated_at) > new Date(existing.updated_at)) {
          newSessions[newKey] = session;
          keyMapping.set(oldKey, newKey);
        }
      } else {
        newSessions[newKey] = session;
        keyMapping.set(oldKey, newKey);
      }
    } else {
      // Already in new format
      newSessions[oldKey] = session;
    }
  }

  // Update displayOrder to use new keys
  if (store.displayOrder && keyMapping.size > 0) {
    const before = [...store.displayOrder];
    const seenKeys = new Set<string>();
    store.displayOrder = store.displayOrder
      .map((item) => {
        if (item.type === 'session') {
          const newKey = keyMapping.get(item.key) ?? item.key;
          return { ...item, key: newKey };
        }
        return item;
      })
      .filter((item) => {
        // Remove duplicate session entries
        if (item.type === 'session') {
          if (seenKeys.has(item.key)) {
            return false;
          }
          seenKeys.add(item.key);
        }
        return true;
      });

    logDisplayOrderChange('migration_keys', {
      before,
      after: store.displayOrder,
      extra: {
        keyMappingCount: keyMapping.size,
        duplicatesRemoved: before.length - store.displayOrder.length,
      },
    });
  }

  store.sessions = newSessions;
}

/**
 * Remove assignedCwds from all projects (deprecated feature)
 */
export function migrateRemoveAssignedCwds(store: StoreData): void {
  if (!store.projects) return;
  for (const project of Object.values(store.projects)) {
    // biome-ignore lint/suspicious/noExplicitAny: cleaning up deprecated field from stored data
    delete (project as any).assignedCwds;
  }
}
