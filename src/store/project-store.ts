import type { DisplayOrderItem, Project, StoreData } from '../types/index.js';
import { UNGROUPED_PROJECT_ID } from './migrations.js';

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * Create a new project in the store
 */
export function createProjectInStore(store: StoreData, name: string): Project {
  if (!store.projects) {
    store.projects = {};
  }
  const id = generateId();
  const project: Project = {
    id,
    name,
    created_at: new Date().toISOString(),
  };
  store.projects[id] = project;

  // Add to displayOrder before ungrouped (which is at the end)
  if (!store.displayOrder) {
    store.displayOrder = [{ type: 'project', id: UNGROUPED_PROJECT_ID }];
  }
  const ungroupedIndex = store.displayOrder.findIndex(
    (item) => item.type === 'project' && item.id === UNGROUPED_PROJECT_ID
  );
  if (ungroupedIndex !== -1) {
    // Insert before ungrouped
    store.displayOrder.splice(ungroupedIndex, 0, { type: 'project', id });
  } else {
    // No ungrouped found, add to end
    store.displayOrder.push({ type: 'project', id });
  }

  return project;
}

/**
 * Get all projects from the store, sorted by displayOrder
 */
export function getProjectsFromStore(store: StoreData): Project[] {
  const projects = store.projects || {};
  const displayOrder = store.displayOrder || [];

  // Sort projects by their order in displayOrder
  const projectOrder = new Map<string, number>();
  let orderIndex = 0;
  for (const item of displayOrder) {
    if (item.type === 'project' && item.id !== UNGROUPED_PROJECT_ID) {
      projectOrder.set(item.id, orderIndex++);
    }
  }

  return Object.values(projects).sort((a, b) => {
    const aOrder = projectOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = projectOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Clear all projects from the store, moving all sessions to ungrouped
 */
export function clearAllProjectsFromStore(store: StoreData): void {
  if (!store.projects || Object.keys(store.projects).length === 0) return;

  // Collect all session items
  const sessionItems: DisplayOrderItem[] = (store.displayOrder || []).filter(
    (item): item is DisplayOrderItem & { type: 'session' } => item.type === 'session'
  );

  // Reset projects and displayOrder
  store.projects = {};
  store.displayOrder = [{ type: 'project', id: UNGROUPED_PROJECT_ID }, ...sessionItems];
}

/**
 * Delete a project from the store, moving its sessions to ungrouped
 */
export function deleteProjectFromStore(store: StoreData, id: string): void {
  if (!store.projects?.[id]) return;

  delete store.projects[id];

  // Remove project from displayOrder and move its sessions to ungrouped
  if (store.displayOrder) {
    const projectIndex = store.displayOrder.findIndex(
      (item) => item.type === 'project' && item.id === id
    );
    if (projectIndex !== -1) {
      // Collect sessions that belong to this project
      const sessionsToMove: DisplayOrderItem[] = [];
      let i = projectIndex + 1;
      while (i < store.displayOrder.length) {
        const item = store.displayOrder[i];
        if (item.type === 'project') break;
        sessionsToMove.push(item);
        i++;
      }
      // Remove project and its sessions
      store.displayOrder.splice(projectIndex, 1 + sessionsToMove.length);
      // Insert sessions after ungrouped project
      const ungroupedIndex = store.displayOrder.findIndex(
        (item) => item.type === 'project' && item.id === UNGROUPED_PROJECT_ID
      );
      if (ungroupedIndex !== -1) {
        // Find where ungrouped sessions end
        let insertIndex = ungroupedIndex + 1;
        while (insertIndex < store.displayOrder.length) {
          const item = store.displayOrder[insertIndex];
          if (item.type === 'project') break;
          insertIndex++;
        }
        store.displayOrder.splice(insertIndex, 0, ...sessionsToMove);
      }
    }
  }
}
