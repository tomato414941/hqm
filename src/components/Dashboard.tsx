import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_VISIBLE_SESSIONS,
  PENDING_ASSIGNMENT_TIMEOUT_MS,
  QR_PANEL_MARGIN_LEFT,
  QR_PANEL_PADDING_X,
  QUICK_SELECT_KEYS,
  SESSION_CARD_HEIGHT,
} from '../constants.js';
import { useServer } from '../hooks/useServer.js';
import { useSessions } from '../hooks/useSessions.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import {
  assignSessionToProjectInOrder,
  clearAll,
  clearProjects,
  clearSessions,
  createProject,
  deleteProject,
  getDisplayOrder,
  getSessionProject,
  moveInDisplayOrder,
  removeSession,
  reorderProject,
} from '../store/file-store.js';
import type { DisplayOrderItem, Project, Session } from '../types/index.js';
import { createNewSession, focusSessionByContext } from '../utils/focus.js';
import { logger } from '../utils/logger.js';
import { getQrPanelMetrics, shouldShowQRCode } from '../utils/qr-display.js';
import { ConfirmModal, ProjectAssignModal, ProjectManageModal } from './dashboard/index.js';
import { SessionCard } from './SessionCard.js';

type InputMode =
  | 'normal'
  | 'manageProjects'
  | 'createProjectInManage'
  | 'assignProject'
  | 'confirmClearSessions'
  | 'confirmClearAll'
  | 'confirmClearProjects'
  | 'confirmDeleteProject';

interface PendingAssignment {
  tty: string;
  projectId: string | undefined;
  createdAt: number;
}

const UNGROUPED_PROJECT_ID = '';

interface DisplayOrderRendererProps {
  storeDisplayOrder: DisplayOrderItem[];
  sessionMap: Map<string, Session>;
  projects: Project[];
  viewportStart: number;
  maxVisibleSessions: number;
  selectedIndex: number;
  displayOrder: Session[];
  terminalColumns: number;
}

function DisplayOrderRenderer({
  storeDisplayOrder,
  sessionMap,
  projects,
  viewportStart,
  maxVisibleSessions,
  selectedIndex,
  displayOrder,
  terminalColumns,
}: DisplayOrderRendererProps): React.ReactElement {
  const elements: React.ReactElement[] = [];
  let sessionNumber = 0;
  let currentProjectId: string | null = null;
  let currentProjectHasSessions = false;
  let pendingProjectHeader: React.ReactElement | null = null;
  const hasNamedProjects = storeDisplayOrder.some(
    (item) => item.type === 'project' && item.id !== UNGROUPED_PROJECT_ID
  );

  for (const item of storeDisplayOrder) {
    if (item.type === 'project') {
      // Flush pending project header if it had no sessions and is a named project
      if (
        pendingProjectHeader &&
        !currentProjectHasSessions &&
        currentProjectId !== UNGROUPED_PROJECT_ID
      ) {
        elements.push(pendingProjectHeader);
      }

      currentProjectId = item.id;
      currentProjectHasSessions = false;

      // Skip ungrouped header if there are no named projects
      if (item.id === UNGROUPED_PROJECT_ID && !hasNamedProjects) {
        pendingProjectHeader = null;
        continue;
      }

      const project =
        item.id === UNGROUPED_PROJECT_ID
          ? { id: '', name: '(ungrouped)' }
          : projects.find((p) => p.id === item.id);

      if (project) {
        pendingProjectHeader = (
          <Text key={`project-${item.id || 'ungrouped'}`} color="magenta" bold>
            [{project.name}]
          </Text>
        );
      } else {
        pendingProjectHeader = null;
      }
    } else {
      // Session item
      const session = sessionMap.get(item.key);
      if (!session) continue;

      const sessionIdx = sessionNumber;
      const isVisible =
        sessionIdx >= viewportStart && sessionIdx < viewportStart + maxVisibleSessions;

      if (isVisible) {
        // Output pending project header if this is the first visible session in the project
        if (pendingProjectHeader && !currentProjectHasSessions) {
          elements.push(pendingProjectHeader);
          pendingProjectHeader = null;
        }
        currentProjectHasSessions = true;

        elements.push(
          <Box key={`${session.session_id}:${session.tty || ''}`} paddingLeft={1}>
            <SessionCard
              session={session}
              index={sessionIdx}
              isSelected={sessionIdx === selectedIndex}
              terminalColumns={terminalColumns}
            />
          </Box>
        );
      }

      sessionNumber++;
    }
  }

  // Flush any remaining empty project header
  if (
    pendingProjectHeader &&
    !currentProjectHasSessions &&
    currentProjectId !== UNGROUPED_PROJECT_ID
  ) {
    elements.push(pendingProjectHeader);
  }

  return (
    <>
      {viewportStart > 0 && <Text dimColor> ^ {viewportStart} more</Text>}
      {elements}
      {viewportStart + maxVisibleSessions < displayOrder.length && (
        <Text dimColor> v {displayOrder.length - viewportStart - maxVisibleSessions} more</Text>
      )}
    </>
  );
}

const getViewportStart = (
  selectedIndex: number,
  totalSessions: number,
  maxVisible: number
): number => {
  if (totalSessions <= maxVisible) return 0;

  // Keep selected item near center
  const halfVisible = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfVisible;

  // Clamp to valid range
  start = Math.max(0, start);
  start = Math.min(totalSessions - maxVisible, start);

  return start;
};

// Count project headers that would be displayed in the viewport
function countProjectHeadersInViewport(
  storeDisplayOrder: DisplayOrderItem[],
  sessionMap: Map<string, Session>,
  viewportStart: number,
  viewportEnd: number
): number {
  const hasNamedProjects = storeDisplayOrder.some(
    (item) => item.type === 'project' && item.id !== UNGROUPED_PROJECT_ID
  );

  let headerCount = 0;
  let sessionNumber = 0;
  let currentProjectId: string | null = null;
  let currentProjectHeaderCounted = false;

  for (const item of storeDisplayOrder) {
    if (item.type === 'project') {
      currentProjectId = item.id;
      currentProjectHeaderCounted = false;

      // Skip ungrouped if no named projects
      if (item.id === UNGROUPED_PROJECT_ID && !hasNamedProjects) {
        currentProjectId = null;
      }
    } else {
      const session = sessionMap.get(item.key);
      if (!session) continue;

      const isVisible = sessionNumber >= viewportStart && sessionNumber < viewportEnd;

      // Count header when first visible session in project is found
      if (isVisible && currentProjectId !== null && !currentProjectHeaderCounted) {
        headerCount++;
        currentProjectHeaderCounted = true;
      }

      sessionNumber++;
    }
  }

  return headerCount;
}

interface DashboardProps {
  showQR?: boolean;
  showUrl?: boolean;
}

export function Dashboard({
  showQR: showQRProp = true,
  showUrl: showUrlProp = true,
}: DashboardProps): React.ReactElement {
  const { sessions, projects, loading, error } = useSessions();
  const { qrCode, url, loading: serverLoading } = useServer();
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('normal');
  const [projectName, setProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAssignIndex, setSelectedAssignIndex] = useState(0);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const pendingAssignmentRef = useRef<PendingAssignment | null>(null);
  const { exit } = useApp();
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const qrMetrics = useMemo(() => getQrPanelMetrics(qrCode), [qrCode]);
  const showQR = shouldShowQRCode(showQRProp, showUrlProp, terminalHeight, terminalWidth, qrCode);
  const showUrlText = showUrlProp && !showQR && url && !serverLoading;
  const mainPanelWidth = useMemo(() => {
    if (!showQR || !qrMetrics) return terminalWidth;
    return Math.max(0, terminalWidth - QR_PANEL_MARGIN_LEFT - qrMetrics.panelWidth);
  }, [showQR, qrMetrics, terminalWidth]);
  const sessionListWidth = useMemo(() => {
    const borderWidth = 2; // round border adds left+right
    const paddingX = 1; // matches list container paddingX
    const rowPaddingLeft = 1; // matches SessionCard wrapper paddingLeft
    return Math.max(0, mainPanelWidth - borderWidth - paddingX * 2 - rowPaddingLeft);
  }, [mainPanelWidth]);

  // Keep ref in sync with state
  useEffect(() => {
    pendingAssignmentRef.current = pendingAssignment;
  }, [pendingAssignment]);

  // Handle pending assignment when new sessions appear
  useEffect(() => {
    const pending = pendingAssignmentRef.current;
    if (!pending) return;

    logger.debug(
      `pendingAssignment check: tty=${pending.tty}, projectId=${pending.projectId}, sessions.length=${sessions.length}`
    );

    // Check if timeout expired
    if (Date.now() - pending.createdAt > PENDING_ASSIGNMENT_TIMEOUT_MS) {
      logger.debug('pendingAssignment: timeout expired');
      setPendingAssignment(null);
      return;
    }

    // Find session with matching TTY
    const matchingSession = sessions.find((s) => s.tty === pending.tty);
    logger.debug(
      `pendingAssignment: matchingSession=${matchingSession ? matchingSession.session_id : 'not found'}`
    );
    if (matchingSession && pending.projectId) {
      const sessionKey = matchingSession.session_id;
      logger.debug(`pendingAssignment: assigning ${sessionKey} to project ${pending.projectId}`);
      assignSessionToProjectInOrder(sessionKey, pending.projectId);
      setPendingAssignment(null);
    }
  }, [sessions]);

  const statusCounts = useMemo(
    () =>
      sessions.reduce(
        (counts, session) => {
          counts[session.status]++;
          return counts;
        },
        { running: 0, waiting_input: 0, stopped: 0 }
      ),
    [sessions]
  );

  // Build session map for quick lookup
  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of sessions) {
      const key = session.session_id;
      map.set(key, session);
    }
    return map;
  }, [sessions]);

  // Get displayOrder from store (re-fetch when sessions/projects change)
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally refresh when data changes
  const storeDisplayOrder = useMemo(() => getDisplayOrder(), [sessions, projects]);

  // Build display order: array of sessions in display order
  const displayOrder = useMemo(() => {
    const order: Session[] = [];

    for (const item of storeDisplayOrder) {
      if (item.type === 'session') {
        const session = sessionMap.get(item.key);
        if (session) {
          order.push(session);
        }
      }
    }
    return order;
  }, [storeDisplayOrder, sessionMap]);

  // Derive selectedIndex from selectedSessionKey
  const selectedIndex = useMemo(() => {
    if (!selectedSessionKey) return 0;
    const idx = displayOrder.findIndex((s) => s.session_id === selectedSessionKey);
    return idx >= 0 ? idx : 0;
  }, [displayOrder, selectedSessionKey]);

  // Derive selectedProjectIndex from selectedProjectId
  const selectedProjectIndex = useMemo(() => {
    if (!selectedProjectId) return 0;
    const idx = projects.findIndex((p) => p.id === selectedProjectId);
    return idx >= 0 ? idx : 0;
  }, [projects, selectedProjectId]);

  // Callbacks that depend on displayOrder must be defined after it
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
  }, [projectName]);

  const handleDeleteProject = useCallback(() => {
    if (!selectedProjectId) return;
    const projectIndex = projects.findIndex((p) => p.id === selectedProjectId);
    if (projectIndex === -1) return;

    deleteProject(selectedProjectId);

    // Select the previous project if we deleted the last one
    if (projectIndex >= projects.length - 1 && projectIndex > 0) {
      const prevProject = projects[projectIndex - 1];
      if (prevProject) setSelectedProjectId(prevProject.id);
    } else if (projects.length === 1) {
      setSelectedProjectId(null);
    }
    // Otherwise useMemo will update index automatically
  }, [projects, selectedProjectId]);

  const handleReorderProject = useCallback(
    (direction: 'up' | 'down') => {
      if (!selectedProjectId) return;
      reorderProject(selectedProjectId, direction);
      // selectedProjectId stays the same, useMemo auto-updates index
    },
    [selectedProjectId]
  );

  const handleAssignProject = useCallback(
    (input: string) => {
      const selectedSession = displayOrder[selectedIndex];
      if (!selectedSession) return;

      const sessionKey = selectedSession.session_id;

      if (input === '0') {
        // Unassign from project (move to ungrouped)
        assignSessionToProjectInOrder(sessionKey, undefined);
        setInputMode('normal');
        return;
      }

      const index = parseInt(input, 10) - 1;
      if (index >= 0 && index < projects.length) {
        const project = projects[index];
        assignSessionToProjectInOrder(sessionKey, project.id);
        setInputMode('normal');
      }
    },
    [displayOrder, selectedIndex, projects]
  );

  const handleNewSession = useCallback(
    (command: 'claude' | 'codex' = 'claude') => {
      const selectedSession = displayOrder[selectedIndex];
      const sessionKey = selectedSession ? selectedSession.session_id : undefined;
      const projectId = sessionKey ? getSessionProject(sessionKey) : undefined;

      logger.debug(
        `handleNewSession: selectedIndex=${selectedIndex}, sessionKey=${sessionKey}, projectId=${projectId}`
      );

      const newTty = createNewSession(command);
      logger.debug(`handleNewSession: newTty=${newTty}`);

      if (newTty && projectId) {
        // Set up pending assignment for the new session
        logger.debug(
          `handleNewSession: setting pendingAssignment tty=${newTty}, projectId=${projectId}`
        );
        setPendingAssignment({
          tty: newTty,
          projectId,
          createdAt: Date.now(),
        });
      }
    },
    [displayOrder, selectedIndex]
  );

  const handleReorderSession = useCallback(
    (direction: 'up' | 'down') => {
      const currentSession = displayOrder[selectedIndex];
      if (!currentSession) return;

      const sessionKey = currentSession.session_id;
      // selectedSessionKey doesn't change, so selectedIndex auto-updates via useMemo
      moveInDisplayOrder(sessionKey, direction);
    },
    [displayOrder, selectedIndex]
  );

  const handleQuickSelect = useCallback(
    (input: string) => {
      const displayIdx = parseInt(input, 10) - 1;
      if (displayIdx >= 0 && displayIdx < displayOrder.length) {
        const session = displayOrder[displayIdx];
        setSelectedSessionKey(session.session_id);
        focusSessionByContext(session);
      }
    },
    [displayOrder]
  );

  useInput((input, key) => {
    // Handle different modes
    if (inputMode === 'createProjectInManage') {
      if (key.escape) {
        setProjectName('');
        setInputMode('manageProjects');
      }
      // TextInput handles other keys
      return;
    }

    if (inputMode === 'manageProjects') {
      if (key.escape) {
        setInputMode('normal');
        return;
      }
      if (key.upArrow) {
        const newIndex = Math.max(0, selectedProjectIndex - 1);
        const project = projects[newIndex];
        if (project) setSelectedProjectId(project.id);
        return;
      }
      if (key.downArrow) {
        const newIndex = Math.min(projects.length - 1, selectedProjectIndex + 1);
        const project = projects[newIndex];
        if (project) setSelectedProjectId(project.id);
        return;
      }
      if (input === 'k') {
        handleReorderProject('up');
        return;
      }
      if (input === 'j') {
        handleReorderProject('down');
        return;
      }
      if (input === 'n') {
        setInputMode('createProjectInManage');
        return;
      }
      if (input === 'd') {
        if (projects.length > 0) {
          setInputMode('confirmDeleteProject');
        }
        return;
      }
      if (input === 'c') {
        if (projects.length > 0) {
          setInputMode('confirmClearProjects');
        }
        return;
      }
      return;
    }

    // Confirmation modes
    if (
      inputMode === 'confirmClearSessions' ||
      inputMode === 'confirmClearAll' ||
      inputMode === 'confirmClearProjects' ||
      inputMode === 'confirmDeleteProject'
    ) {
      if (input === 'y') {
        if (inputMode === 'confirmClearSessions') {
          clearSessions();
          setSelectedSessionKey(null);
          setInputMode('normal');
        } else if (inputMode === 'confirmClearAll') {
          clearAll();
          setSelectedSessionKey(null);
          setInputMode('normal');
        } else if (inputMode === 'confirmClearProjects') {
          clearProjects();
          setInputMode('manageProjects');
          setSelectedProjectId(null);
        } else if (inputMode === 'confirmDeleteProject') {
          handleDeleteProject();
          setInputMode('manageProjects');
        }
        return;
      }
      if (input === 'n' || key.escape) {
        // Return to the appropriate mode
        if (inputMode === 'confirmClearProjects' || inputMode === 'confirmDeleteProject') {
          setInputMode('manageProjects');
        } else {
          setInputMode('normal');
        }
        return;
      }
      return;
    }

    if (inputMode === 'assignProject') {
      if (key.escape) {
        setInputMode('normal');
        return;
      }
      if (key.upArrow) {
        // 0~N-1 = projects, N = (none)
        setSelectedAssignIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedAssignIndex((prev) => Math.min(projects.length, prev + 1));
        return;
      }
      if (key.return) {
        // selectedAssignIndex 0~N-1 = projects, N = (none)
        if (selectedAssignIndex === projects.length) {
          handleAssignProject('0'); // (none)
        } else {
          handleAssignProject(String(selectedAssignIndex + 1)); // 1-based for projects
        }
        return;
      }
      if (/^[0-9]$/.test(input)) {
        handleAssignProject(input);
        return;
      }
      return;
    }

    // Normal mode
    if (input === 'q' || key.escape) {
      logger.debug(`'q' key pressed (input=${input}, escape=${key.escape})`);
      logger.debug('Calling exit()');
      exit();
      logger.debug('exit() called, returning from useInput handler');
      return;
    }
    if (key.upArrow) {
      const newIndex = Math.max(0, selectedIndex - 1);
      const session = displayOrder[newIndex];
      if (session) setSelectedSessionKey(session.session_id);
      return;
    }
    if (key.downArrow) {
      const newIndex = Math.min(displayOrder.length - 1, selectedIndex + 1);
      const session = displayOrder[newIndex];
      if (session) setSelectedSessionKey(session.session_id);
      return;
    }
    if (input === 'k') {
      handleReorderSession('up');
      return;
    }
    if (input === 'j') {
      handleReorderSession('down');
      return;
    }
    if (key.return || input === 'f') {
      focusSessionByIndex(selectedIndex);
      return;
    }
    if (QUICK_SELECT_KEYS.includes(input)) {
      handleQuickSelect(input);
      return;
    }
    if (input === 'c') {
      setInputMode('confirmClearSessions');
      return;
    }
    if (input === 'C') {
      setInputMode('confirmClearAll');
      return;
    }
    if (input === 'd') {
      const session = displayOrder[selectedIndex];
      if (session) {
        removeSession(session.session_id);
        // Fallback to previous session if we deleted the last item
        if (selectedIndex >= displayOrder.length - 1 && selectedIndex > 0) {
          const prevSession = displayOrder[selectedIndex - 1];
          if (prevSession) {
            setSelectedSessionKey(prevSession.session_id);
          }
        } else if (displayOrder.length === 1) {
          // Deleted the only session
          setSelectedSessionKey(null);
        }
        // Otherwise, keep the same key - the next session will take its place
      }
      return;
    }
    if (input === 'n') {
      handleNewSession('claude');
      return;
    }
    if (input === 'N') {
      handleNewSession('codex');
      return;
    }
    if (input === 'p') {
      setInputMode('manageProjects');
      // Select first project if available
      const firstProject = projects[0];
      setSelectedProjectId(firstProject?.id ?? null);
      return;
    }
    if (input === 'a') {
      if (displayOrder.length > 0) {
        setInputMode('assignProject');
        setSelectedAssignIndex(0);
      }
      return;
    }
  });

  if (loading) {
    return <Text dimColor>Loading...</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error.message}</Text>;
  }

  const { running, waiting_input: waitingInput, stopped } = statusCounts;

  // Fixed height for stable rendering on remote terminals
  const maxSessions = MAX_VISIBLE_SESSIONS;
  const headerHeight = 3; // Header box
  const footerHeight = 2; // Footer help text
  const minHeight = headerHeight + footerHeight + maxSessions * SESSION_CARD_HEIGHT;

  // Calculate visible sessions based on terminal height
  // Account for project headers that take up space in the viewport
  const baseAvailableHeight = terminalHeight - headerHeight - footerHeight;
  let maxVisibleSessions = Math.max(1, Math.floor(baseAvailableHeight / SESSION_CARD_HEIGHT));
  let viewportStart = getViewportStart(selectedIndex, displayOrder.length, maxVisibleSessions);

  // Refine by accounting for project headers in viewport
  const headerCount = countProjectHeadersInViewport(
    storeDisplayOrder,
    sessionMap,
    viewportStart,
    viewportStart + maxVisibleSessions
  );
  const adjustedAvailableHeight = baseAvailableHeight - headerCount;
  maxVisibleSessions = Math.max(1, Math.floor(adjustedAvailableHeight / SESSION_CARD_HEIGHT));
  viewportStart = getViewportStart(selectedIndex, displayOrder.length, maxVisibleSessions);

  // Render project management modal (includes create mode)
  if (inputMode === 'manageProjects' || inputMode === 'createProjectInManage') {
    return (
      <ProjectManageModal
        projects={projects}
        selectedProjectIndex={selectedProjectIndex}
        projectName={projectName}
        isCreating={inputMode === 'createProjectInManage'}
        onProjectNameChange={setProjectName}
        onCreateProject={handleCreateProject}
      />
    );
  }

  // Render assign project modal
  if (inputMode === 'assignProject') {
    return <ProjectAssignModal projects={projects} selectedAssignIndex={selectedAssignIndex} />;
  }

  // Render confirmation modals
  if (inputMode === 'confirmClearSessions') {
    return <ConfirmModal title="Clear Sessions" message="Clear all sessions from hqm?" />;
  }
  if (inputMode === 'confirmClearAll') {
    return <ConfirmModal title="Clear All" message="Clear all sessions and delete all projects?" />;
  }
  if (inputMode === 'confirmClearProjects') {
    return (
      <ConfirmModal
        title="Clear Projects"
        message="Delete all projects? (sessions will be moved to ungrouped)"
      />
    );
  }
  if (inputMode === 'confirmDeleteProject') {
    const projectToDelete = projects[selectedProjectIndex];
    return (
      <ConfirmModal
        title="Delete Project"
        message={`Delete project "${projectToDelete?.name || ''}"?`}
      />
    );
  }

  return (
    <Box flexDirection="row" minHeight={Math.min(minHeight, terminalHeight - 2)}>
      <Box flexDirection="column" flexGrow={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">
            HQM
          </Text>
          <Text dimColor> | </Text>
          <Text color="green">* {running}</Text>
          <Text dimColor> </Text>
          <Text color="yellow">o {waitingInput}</Text>
          <Text dimColor> </Text>
          <Text color="cyan">v {stopped}</Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          marginTop={1}
          paddingX={1}
          paddingY={0}
        >
          {displayOrder.length === 0 ? (
            <Box paddingY={1}>
              <Text dimColor>No active sessions</Text>
            </Box>
          ) : (
            <DisplayOrderRenderer
              storeDisplayOrder={storeDisplayOrder}
              sessionMap={sessionMap}
              projects={projects}
              viewportStart={viewportStart}
              maxVisibleSessions={maxVisibleSessions}
              selectedIndex={selectedIndex}
              displayOrder={displayOrder}
              terminalColumns={sessionListWidth}
            />
          )}
        </Box>

        <Box marginTop={1} justifyContent="center" gap={1}>
          <Text dimColor>[↑↓]Select</Text>
          <Text dimColor>[j/k]Move</Text>
          <Text dimColor>[Enter]Focus</Text>
          <Text dimColor>[p]Project</Text>
          <Text dimColor>[a]Assign</Text>
          <Text dimColor>[n]Claude [N]Codex</Text>
          <Text dimColor>[q]Quit</Text>
        </Box>

        {showUrlText && (
          <Box justifyContent="center" marginTop={1}>
            <Text dimColor>Mobile: {url}</Text>
          </Box>
        )}
      </Box>

      {showQR && (
        <Box
          flexDirection="column"
          marginLeft={QR_PANEL_MARGIN_LEFT}
          borderStyle="round"
          borderColor="gray"
          paddingX={QR_PANEL_PADDING_X}
          minWidth={qrMetrics?.panelWidth}
        >
          <Text bold dimColor>
            Mobile
          </Text>
          <Box marginTop={1}>
            <Text>{qrCode}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
