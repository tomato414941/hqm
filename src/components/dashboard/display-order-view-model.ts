import type { Project } from '../../types/index.js';
import type { BuildDisplayOrderRowsParams, BuildDisplayOrderRowsResult } from './types.js';

const UNGROUPED_PROJECT_ID = '';

function resolveProjectName(projectId: string, projects: Project[]): string | undefined {
  if (projectId === UNGROUPED_PROJECT_ID) {
    return '(ungrouped)';
  }

  return projects.find((project) => project.id === projectId)?.name;
}

export function buildDisplayOrderRows({
  storeDisplayOrder,
  sessionMap,
  projects,
  viewportStart,
  maxVisibleSessions,
  selectedIndex,
}: BuildDisplayOrderRowsParams): BuildDisplayOrderRowsResult {
  const rows: BuildDisplayOrderRowsResult['rows'] = [];
  const viewportEnd = viewportStart + maxVisibleSessions;
  const hasNamedProjects = storeDisplayOrder.some(
    (item) => item.type === 'project' && item.id !== UNGROUPED_PROJECT_ID
  );

  let sessionNumber = 0;
  let headerCountInViewport = 0;
  let currentProjectId: string | null = null;
  let currentProjectHasVisibleSessions = false;
  let pendingProjectHeader: BuildDisplayOrderRowsResult['rows'][number] | null = null;

  for (const item of storeDisplayOrder) {
    if (item.type === 'project') {
      if (
        pendingProjectHeader &&
        !currentProjectHasVisibleSessions &&
        currentProjectId !== UNGROUPED_PROJECT_ID
      ) {
        rows.push(pendingProjectHeader);
      }

      currentProjectId = item.id;
      currentProjectHasVisibleSessions = false;

      if (item.id === UNGROUPED_PROJECT_ID && !hasNamedProjects) {
        pendingProjectHeader = null;
        continue;
      }

      const projectName = resolveProjectName(item.id, projects);
      if (!projectName) {
        pendingProjectHeader = null;
        continue;
      }

      pendingProjectHeader = {
        type: 'project-header',
        key: `project-${item.id || 'ungrouped'}`,
        projectId: item.id,
        projectName,
      };
      continue;
    }

    const session = sessionMap.get(item.key);
    if (!session) {
      continue;
    }

    const isVisible = sessionNumber >= viewportStart && sessionNumber < viewportEnd;

    if (isVisible) {
      if (pendingProjectHeader && !currentProjectHasVisibleSessions) {
        rows.push(pendingProjectHeader);
        headerCountInViewport++;
        pendingProjectHeader = null;
      }
      currentProjectHasVisibleSessions = true;

      rows.push({
        type: 'session',
        key: `${session.session_id}:${session.tty || ''}`,
        session,
        sessionIndex: sessionNumber,
        isSelected: sessionNumber === selectedIndex,
      });
    }

    sessionNumber++;
  }

  if (
    pendingProjectHeader &&
    !currentProjectHasVisibleSessions &&
    currentProjectId !== UNGROUPED_PROJECT_ID
  ) {
    rows.push(pendingProjectHeader);
  }

  return {
    rows,
    totalSessions: sessionNumber,
    headerCountInViewport,
  };
}
