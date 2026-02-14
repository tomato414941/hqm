import { useCallback } from 'react';
import {
  assignSessionToProjectInOrder,
  createProject,
  deleteProject,
  getSessionProject,
  moveInDisplayOrder,
  registerCodexSession,
  reorderProject,
} from '../../store/file-store.js';
import type { Project, Session } from '../../types/index.js';
import { createNewSession, focusSessionByContext } from '../../utils/focus.js';
import { logger } from '../../utils/logger.js';
import type { InputMode, PendingAssignment } from './types.js';

interface UseDashboardActionsParams {
  displayOrder: Session[];
  selectedIndex: number;
  projects: Project[];
  projectName: string;
  selectedProjectId: string | null;
  setInputMode: (mode: InputMode) => void;
  setProjectName: (name: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedSessionKey: (key: string | null) => void;
  setPendingAssignment: (assignment: PendingAssignment | null) => void;
}

interface UseDashboardActionsResult {
  focusSessionByIndex: (index: number) => void;
  handleCreateProject: () => void;
  handleDeleteProject: () => void;
  handleReorderProject: (direction: 'up' | 'down') => void;
  handleAssignProject: (input: string) => void;
  handleNewSession: (command?: 'claude' | 'codex') => void;
  handleReorderSession: (direction: 'up' | 'down') => void;
  handleQuickSelect: (input: string) => void;
}

export function useDashboardActions({
  displayOrder,
  selectedIndex,
  projects,
  projectName,
  selectedProjectId,
  setInputMode,
  setProjectName,
  setSelectedProjectId,
  setSelectedSessionKey,
  setPendingAssignment,
}: UseDashboardActionsParams): UseDashboardActionsResult {
  const focusSessionByIndex = useCallback(
    (index: number) => {
      const session = displayOrder[index];
      if (session) {
        focusSessionByContext(session);
      }
    },
    [displayOrder]
  );

  const handleCreateProject = useCallback(() => {
    if (projectName.trim()) {
      createProject(projectName.trim());
      setProjectName('');
    }
    setInputMode('manageProjects');
  }, [projectName, setInputMode, setProjectName]);

  const handleDeleteProject = useCallback(() => {
    if (!selectedProjectId) return;
    const projectIndex = projects.findIndex((project) => project.id === selectedProjectId);
    if (projectIndex === -1) return;

    deleteProject(selectedProjectId);

    if (projectIndex >= projects.length - 1 && projectIndex > 0) {
      const prevProject = projects[projectIndex - 1];
      if (prevProject) {
        setSelectedProjectId(prevProject.id);
      }
    } else if (projects.length === 1) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId, setSelectedProjectId]);

  const handleReorderProject = useCallback(
    (direction: 'up' | 'down') => {
      if (!selectedProjectId) return;
      reorderProject(selectedProjectId, direction);
    },
    [selectedProjectId]
  );

  const handleAssignProject = useCallback(
    (input: string) => {
      const selectedSession = displayOrder[selectedIndex];
      if (!selectedSession) return;

      const sessionKey = selectedSession.session_id;

      if (input === '0') {
        assignSessionToProjectInOrder(sessionKey, undefined);
        setInputMode('normal');
        return;
      }

      const projectIndex = Number.parseInt(input, 10) - 1;
      if (projectIndex >= 0 && projectIndex < projects.length) {
        const project = projects[projectIndex];
        assignSessionToProjectInOrder(sessionKey, project.id);
        setInputMode('normal');
      }
    },
    [displayOrder, selectedIndex, projects, setInputMode]
  );

  const handleNewSession = useCallback(
    (command: 'claude' | 'codex' = 'claude') => {
      const selectedSession = displayOrder[selectedIndex];
      const sessionKey = selectedSession ? selectedSession.session_id : undefined;
      const projectId = sessionKey ? getSessionProject(sessionKey) : undefined;

      logger.debug(
        `handleNewSession: selectedIndex=${selectedIndex}, sessionKey=${sessionKey}, projectId=${projectId}`
      );

      const result = createNewSession(command);
      logger.debug(`handleNewSession: result=${JSON.stringify(result)}`);

      if (!result) return;

      if (command === 'codex') {
        const codexSessionId = registerCodexSession(result);
        logger.debug(`handleNewSession: registered codex session ${codexSessionId}`);
        if (projectId) {
          assignSessionToProjectInOrder(codexSessionId, projectId);
        }
      } else if (projectId) {
        setPendingAssignment({
          tty: result.tty,
          projectId,
          createdAt: Date.now(),
        });
      }
    },
    [displayOrder, selectedIndex, setPendingAssignment]
  );

  const handleReorderSession = useCallback(
    (direction: 'up' | 'down') => {
      const currentSession = displayOrder[selectedIndex];
      if (!currentSession) return;

      moveInDisplayOrder(currentSession.session_id, direction);
    },
    [displayOrder, selectedIndex]
  );

  const handleQuickSelect = useCallback(
    (input: string) => {
      const displayIndex = Number.parseInt(input, 10) - 1;
      if (displayIndex >= 0 && displayIndex < displayOrder.length) {
        const session = displayOrder[displayIndex];
        setSelectedSessionKey(session.session_id);
        focusSessionByContext(session);
      }
    },
    [displayOrder, setSelectedSessionKey]
  );

  return {
    focusSessionByIndex,
    handleCreateProject,
    handleDeleteProject,
    handleReorderProject,
    handleAssignProject,
    handleNewSession,
    handleReorderSession,
    handleQuickSelect,
  };
}
