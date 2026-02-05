import type { DisplayOrderItem, StoreData } from '../types/index.js';
import { logDisplayOrderChange } from '../utils/display-order-log.js';
import { UNGROUPED_PROJECT_ID } from './migrations.js';

export { UNGROUPED_PROJECT_ID };

/**
 * Get the displayOrder from store, or return default
 */
export function getDisplayOrderFromStore(store: StoreData): DisplayOrderItem[] {
  return store.displayOrder || [{ type: 'project', id: UNGROUPED_PROJECT_ID }];
}

/**
 * Get the project ID that a session belongs to (based on displayOrder)
 */
export function getSessionProjectFromStore(
  store: StoreData,
  sessionKey: string
): string | undefined {
  if (!store.displayOrder) return undefined;

  const sessionIndex = store.displayOrder.findIndex(
    (item) => item.type === 'session' && item.key === sessionKey
  );
  if (sessionIndex === -1) return undefined;

  // Find the nearest project before this session
  for (let i = sessionIndex - 1; i >= 0; i--) {
    const item = store.displayOrder[i];
    if (item.type === 'project') {
      return item.id || undefined; // Return undefined for ungrouped (empty string)
    }
  }
  return undefined; // ungrouped
}

/**
 * Move a session in displayOrder (swap with adjacent element)
 */
export function moveSessionInDisplayOrder(
  store: StoreData,
  sessionKey: string,
  direction: 'up' | 'down'
): boolean {
  if (!store.displayOrder) return false;

  const currentIndex = store.displayOrder.findIndex(
    (item) => item.type === 'session' && item.key === sessionKey
  );
  if (currentIndex === -1) return false;

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= store.displayOrder.length) return false;

  // k (up): Can't move before the first project
  if (direction === 'up') {
    const targetItem = store.displayOrder[targetIndex];
    if (targetItem.type === 'project') {
      // Check if there's any project before this one
      const hasProjectBefore = store.displayOrder
        .slice(0, targetIndex)
        .some((item) => item.type === 'project');
      if (!hasProjectBefore) {
        return false; // Can't move before the first project
      }
    }
  }

  // Swap
  const temp = store.displayOrder[currentIndex];
  store.displayOrder[currentIndex] = store.displayOrder[targetIndex];
  store.displayOrder[targetIndex] = temp;

  return true;
}

/**
 * Assign a session to a project (insert after the project in displayOrder)
 */
export function assignSessionToProject(
  store: StoreData,
  sessionKey: string,
  projectId: string | undefined
): void {
  if (!store.displayOrder) return;

  const before = [...store.displayOrder];

  // Remove session from current position
  store.displayOrder = store.displayOrder.filter(
    (item) => !(item.type === 'session' && item.key === sessionKey)
  );

  // Find the target project (ungrouped if undefined)
  const targetProjectId = projectId ?? UNGROUPED_PROJECT_ID;
  const projectIndex = store.displayOrder.findIndex(
    (item) => item.type === 'project' && item.id === targetProjectId
  );

  if (projectIndex !== -1) {
    store.displayOrder.splice(projectIndex + 1, 0, { type: 'session', key: sessionKey });
  } else {
    // Project not found, add to end
    store.displayOrder.push({ type: 'session', key: sessionKey });
  }

  logDisplayOrderChange('assign_project', {
    sessionKey,
    projectId,
    before,
    after: store.displayOrder,
    extra: { projectFound: projectIndex !== -1 },
  });
}

/**
 * Clean up displayOrder by removing entries for non-existent sessions/projects
 */
export function cleanupStoreDisplayOrder(store: StoreData): boolean {
  if (!store.displayOrder) return false;

  // Collect project IDs from displayOrder as defensive fallback
  // This prevents data loss when store.projects is undefined/empty but displayOrder has projects
  const projectIdsInOrder = new Set<string>();
  for (const item of store.displayOrder) {
    if (item.type === 'project') {
      projectIdsInOrder.add(item.id);
    }
  }

  const validSessionKeys = new Set(Object.keys(store.sessions || {}));
  const validProjectIds = new Set([
    UNGROUPED_PROJECT_ID,
    ...Object.keys(store.projects || {}),
    ...projectIdsInOrder,
  ]);

  const originalLength = store.displayOrder.length;
  store.displayOrder = store.displayOrder.filter((item) => {
    if (item.type === 'session') {
      return validSessionKeys.has(item.key);
    }
    if (item.type === 'project') {
      return validProjectIds.has(item.id);
    }
    return false;
  });

  return store.displayOrder.length !== originalLength;
}

/**
 * Reorder a project (move with all its sessions)
 */
export function reorderProjectInStore(
  store: StoreData,
  projectId: string,
  direction: 'up' | 'down'
): void {
  if (!store.projects?.[projectId] || !store.displayOrder) return;

  // Find the project in displayOrder
  const projectIndex = store.displayOrder.findIndex(
    (item) => item.type === 'project' && item.id === projectId
  );
  if (projectIndex === -1) return;

  // Collect the project and its sessions
  const itemsToMove: DisplayOrderItem[] = [store.displayOrder[projectIndex]];
  let i = projectIndex + 1;
  while (i < store.displayOrder.length) {
    const item = store.displayOrder[i];
    if (item.type === 'project') break;
    itemsToMove.push(item);
    i++;
  }

  // Find target position
  let targetIndex: number;
  if (direction === 'up') {
    // Find previous project
    targetIndex = -1;
    for (let j = projectIndex - 1; j >= 0; j--) {
      if (store.displayOrder[j].type === 'project') {
        // Can't move before ungrouped
        if (
          (store.displayOrder[j] as { type: 'project'; id: string }).id === UNGROUPED_PROJECT_ID
        ) {
          return;
        }
        targetIndex = j;
        break;
      }
    }
    if (targetIndex === -1) return;
  } else {
    // Find next project (after our sessions)
    targetIndex = -1;
    for (let j = projectIndex + itemsToMove.length; j < store.displayOrder.length; j++) {
      if (store.displayOrder[j].type === 'project') {
        // Can't move after ungrouped (ungrouped should stay at the end)
        if (
          (store.displayOrder[j] as { type: 'project'; id: string }).id === UNGROUPED_PROJECT_ID
        ) {
          return;
        }
        targetIndex = j;
        break;
      }
    }
    if (targetIndex === -1) return;
  }

  // Remove items from current position
  store.displayOrder.splice(projectIndex, itemsToMove.length);

  // Adjust target index after removal
  if (direction === 'down') {
    targetIndex -= itemsToMove.length;
    // Find where the target project's sessions end
    let insertIndex = targetIndex + 1;
    while (insertIndex < store.displayOrder.length) {
      if (store.displayOrder[insertIndex].type === 'project') break;
      insertIndex++;
    }
    store.displayOrder.splice(insertIndex, 0, ...itemsToMove);
  } else {
    store.displayOrder.splice(targetIndex, 0, ...itemsToMove);
  }
}

/**
 * Add a new session to displayOrder (auto-assign by cwd or add to ungrouped)
 */
export function addSessionToDisplayOrder(store: StoreData, sessionKey: string): void {
  if (!store.displayOrder) {
    store.displayOrder = [{ type: 'project', id: UNGROUPED_PROJECT_ID }];
  }

  // Already in displayOrder? Skip
  if (store.displayOrder.some((item) => item.type === 'session' && item.key === sessionKey)) {
    return;
  }

  const before = [...store.displayOrder];

  // Always add to ungrouped (user manually assigns to projects)
  const ungroupedIndex = store.displayOrder.findIndex(
    (item) => item.type === 'project' && item.id === UNGROUPED_PROJECT_ID
  );
  if (ungroupedIndex !== -1) {
    store.displayOrder.splice(ungroupedIndex + 1, 0, { type: 'session', key: sessionKey });
  } else {
    store.displayOrder.push({ type: 'session', key: sessionKey });
  }

  const session = store.sessions[sessionKey];
  logDisplayOrderChange('add_session', {
    sessionKey,
    before,
    after: store.displayOrder,
    extra: { cwd: session?.initial_cwd || session?.cwd },
  });
}

/**
 * Remove a session from displayOrder
 */
export function removeSessionFromDisplayOrder(store: StoreData, sessionKey: string): void {
  if (store.displayOrder) {
    const before = [...store.displayOrder];
    store.displayOrder = store.displayOrder.filter(
      (item) => !(item.type === 'session' && item.key === sessionKey)
    );
    if (before.length !== store.displayOrder.length) {
      logDisplayOrderChange('remove_session', {
        sessionKey,
        before,
        after: store.displayOrder,
      });
    }
  }
}
