import type { DisplayOrderItem, Project, Session } from '../../types/index.js';

export type InputMode =
  | 'normal'
  | 'manageProjects'
  | 'createProjectInManage'
  | 'assignProject'
  | 'confirmClearSessions'
  | 'confirmClearAll'
  | 'confirmClearProjects'
  | 'confirmDeleteProject';

export interface PendingAssignment {
  tty: string;
  projectId: string | undefined;
  createdAt: number;
}

export interface InputKey {
  escape?: boolean;
  upArrow?: boolean;
  downArrow?: boolean;
  return?: boolean;
}

export interface DashboardProjectHeaderRow {
  type: 'project-header';
  key: string;
  projectId: string;
  projectName: string;
}

export interface DashboardSessionRow {
  type: 'session';
  key: string;
  session: Session;
  sessionIndex: number;
  isSelected: boolean;
}

export type DashboardDisplayRow = DashboardProjectHeaderRow | DashboardSessionRow;

export interface BuildDisplayOrderRowsParams {
  storeDisplayOrder: DisplayOrderItem[];
  sessionMap: Map<string, Session>;
  projects: Project[];
  viewportStart: number;
  maxVisibleSessions: number;
  selectedIndex: number;
}

export interface BuildDisplayOrderRowsResult {
  rows: DashboardDisplayRow[];
  totalSessions: number;
  headerCountInViewport: number;
}

export interface DashboardInputController {
  inputMode: InputMode;
  projects: Project[];
  displayOrder: Session[];
  selectedIndex: number;
  selectedProjectIndex: number;
  selectedAssignIndex: number;
  setInputMode: (mode: InputMode) => void;
  setProjectName: (name: string) => void;
  setSelectedProjectId: (id: string | null) => void;
  setSelectedAssignIndex: (value: number | ((prev: number) => number)) => void;
  setSelectedSessionKey: (key: string | null) => void;
  focusSessionByIndex: (index: number) => void;
  handleReorderProject: (direction: 'up' | 'down') => void;
  handleReorderSession: (direction: 'up' | 'down') => void;
  handleAssignProject: (input: string) => void;
  handleDeleteProject: () => void;
  handleNewSession: (command?: 'claude' | 'codex') => void;
  handleQuickSelect: (input: string) => void;
  clearSessions: () => void;
  clearAll: () => void;
  clearProjects: () => void;
  removeSession: (sessionId: string) => void;
  exit: () => void;
}
