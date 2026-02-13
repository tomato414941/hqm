import { useInput } from 'ink';
import { QUICK_SELECT_KEYS } from '../../constants.js';
import { logger } from '../../utils/logger.js';
import type { DashboardInputController, InputKey } from './types.js';

function isConfirmationMode(inputMode: DashboardInputController['inputMode']): boolean {
  return (
    inputMode === 'confirmClearSessions' ||
    inputMode === 'confirmClearAll' ||
    inputMode === 'confirmClearProjects' ||
    inputMode === 'confirmDeleteProject'
  );
}

export function handleDashboardInput(
  input: string,
  key: InputKey,
  controller: DashboardInputController
): void {
  if (controller.inputMode === 'createProjectInManage') {
    if (key.escape) {
      controller.setProjectName('');
      controller.setInputMode('manageProjects');
    }
    return;
  }

  if (controller.inputMode === 'manageProjects') {
    if (key.escape) {
      controller.setInputMode('normal');
      return;
    }

    if (key.upArrow) {
      const newIndex = Math.max(0, controller.selectedProjectIndex - 1);
      const project = controller.projects[newIndex];
      if (project) {
        controller.setSelectedProjectId(project.id);
      }
      return;
    }

    if (key.downArrow) {
      const newIndex = Math.min(
        controller.projects.length - 1,
        controller.selectedProjectIndex + 1
      );
      const project = controller.projects[newIndex];
      if (project) {
        controller.setSelectedProjectId(project.id);
      }
      return;
    }

    if (input === 'k') {
      controller.handleReorderProject('up');
      return;
    }

    if (input === 'j') {
      controller.handleReorderProject('down');
      return;
    }

    if (input === 'n') {
      controller.setInputMode('createProjectInManage');
      return;
    }

    if (input === 'd') {
      if (controller.projects.length > 0) {
        controller.setInputMode('confirmDeleteProject');
      }
      return;
    }

    if (input === 'c') {
      if (controller.projects.length > 0) {
        controller.setInputMode('confirmClearProjects');
      }
    }

    return;
  }

  if (isConfirmationMode(controller.inputMode)) {
    if (input === 'y') {
      if (controller.inputMode === 'confirmClearSessions') {
        controller.clearSessions();
        controller.setSelectedSessionKey(null);
        controller.setInputMode('normal');
      } else if (controller.inputMode === 'confirmClearAll') {
        controller.clearAll();
        controller.setSelectedSessionKey(null);
        controller.setInputMode('normal');
      } else if (controller.inputMode === 'confirmClearProjects') {
        controller.clearProjects();
        controller.setInputMode('manageProjects');
        controller.setSelectedProjectId(null);
      } else if (controller.inputMode === 'confirmDeleteProject') {
        controller.handleDeleteProject();
        controller.setInputMode('manageProjects');
      }
      return;
    }

    if (input === 'n' || key.escape) {
      if (
        controller.inputMode === 'confirmClearProjects' ||
        controller.inputMode === 'confirmDeleteProject'
      ) {
        controller.setInputMode('manageProjects');
      } else {
        controller.setInputMode('normal');
      }
    }

    return;
  }

  if (controller.inputMode === 'assignProject') {
    if (key.escape) {
      controller.setInputMode('normal');
      return;
    }

    if (key.upArrow) {
      controller.setSelectedAssignIndex((prev) => Math.max(0, prev - 1));
      return;
    }

    if (key.downArrow) {
      controller.setSelectedAssignIndex((prev) => Math.min(controller.projects.length, prev + 1));
      return;
    }

    if (key.return) {
      if (controller.selectedAssignIndex === controller.projects.length) {
        controller.handleAssignProject('0');
      } else {
        controller.handleAssignProject(String(controller.selectedAssignIndex + 1));
      }
      return;
    }

    if (/^[0-9]$/.test(input)) {
      controller.handleAssignProject(input);
    }

    return;
  }

  if (input === 'q' || key.escape) {
    logger.debug(`'q' key pressed (input=${input}, escape=${key.escape})`);
    logger.debug('Calling exit()');
    controller.exit();
    logger.debug('exit() called, returning from useInput handler');
    return;
  }

  if (key.upArrow) {
    const newIndex = Math.max(0, controller.selectedIndex - 1);
    const session = controller.displayOrder[newIndex];
    if (session) {
      controller.setSelectedSessionKey(session.session_id);
    }
    return;
  }

  if (key.downArrow) {
    const newIndex = Math.min(controller.displayOrder.length - 1, controller.selectedIndex + 1);
    const session = controller.displayOrder[newIndex];
    if (session) {
      controller.setSelectedSessionKey(session.session_id);
    }
    return;
  }

  if (input === 'k') {
    controller.handleReorderSession('up');
    return;
  }

  if (input === 'j') {
    controller.handleReorderSession('down');
    return;
  }

  if (key.return || input === 'f') {
    controller.focusSessionByIndex(controller.selectedIndex);
    return;
  }

  if (QUICK_SELECT_KEYS.includes(input)) {
    controller.handleQuickSelect(input);
    return;
  }

  if (input === 'c') {
    controller.setInputMode('confirmClearSessions');
    return;
  }

  if (input === 'C') {
    controller.setInputMode('confirmClearAll');
    return;
  }

  if (input === 'd') {
    const session = controller.displayOrder[controller.selectedIndex];
    if (session) {
      controller.removeSession(session.session_id);

      if (
        controller.selectedIndex >= controller.displayOrder.length - 1 &&
        controller.selectedIndex > 0
      ) {
        const prevSession = controller.displayOrder[controller.selectedIndex - 1];
        if (prevSession) {
          controller.setSelectedSessionKey(prevSession.session_id);
        }
      } else if (controller.displayOrder.length === 1) {
        controller.setSelectedSessionKey(null);
      }
    }
    return;
  }

  if (input === 'n') {
    controller.handleNewSession('claude');
    return;
  }

  if (input === 'N') {
    controller.handleNewSession('codex');
    return;
  }

  if (input === 'p') {
    controller.setInputMode('manageProjects');
    const firstProject = controller.projects[0];
    controller.setSelectedProjectId(firstProject?.id ?? null);
    return;
  }

  if (input === 'a') {
    if (controller.displayOrder.length > 0) {
      controller.setInputMode('assignProject');
      controller.setSelectedAssignIndex(0);
    }
  }
}

export function useDashboardInput(controller: DashboardInputController): void {
  useInput((input, key) => {
    handleDashboardInput(input, key, controller);
  });
}
