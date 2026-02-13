import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MAX_VISIBLE_SESSIONS,
  PENDING_ASSIGNMENT_TIMEOUT_MS,
  QR_PANEL_MARGIN_LEFT,
  SESSION_CARD_HEIGHT,
} from '../../constants.js';
import { useServer } from '../../hooks/useServer.js';
import { useSessions } from '../../hooks/useSessions.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import {
  assignSessionToProjectInOrder,
  createProject,
  deleteProject,
  getDisplayOrder,
  getSessionProject,
  moveInDisplayOrder,
  registerCodexSession,
  reorderProject,
} from '../../store/file-store.js';
import type { Session } from '../../types/index.js';
import { createNewSession, focusSessionByContext } from '../../utils/focus.js';
import { logger } from '../../utils/logger.js';
import { getQrPanelMetrics, shouldShowQRCode } from '../../utils/qr-display.js';
import { buildDisplayOrderRows } from './display-order-view-model.js';
import type { InputMode, PendingAssignment } from './types.js';

interface UseDashboardStateParams {
  showQR: boolean;
  showUrl: boolean;
}

const getViewportStart = (
  selectedIndex: number,
  totalSessions: number,
  maxVisible: number
): number => {
  if (totalSessions <= maxVisible) return 0;

  const halfVisible = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfVisible;
  start = Math.max(0, start);
  start = Math.min(totalSessions - maxVisible, start);

  return start;
};

export function useDashboardState({
  showQR: showQRProp,
  showUrl: showUrlProp,
}: UseDashboardStateParams) {
  const { sessions, projects, loading, error } = useSessions();
  const { qrCode, url, loading: serverLoading } = useServer();
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();

  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('normal');
  const [projectName, setProjectName] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedAssignIndex, setSelectedAssignIndex] = useState(0);
  const [pendingAssignment, setPendingAssignment] = useState<PendingAssignment | null>(null);
  const pendingAssignmentRef = useRef<PendingAssignment | null>(null);

  const qrMetrics = useMemo(() => getQrPanelMetrics(qrCode), [qrCode]);
  const showQR = shouldShowQRCode(showQRProp, showUrlProp, terminalHeight, terminalWidth, qrCode);
  const showUrlText = showUrlProp && !showQR && url && !serverLoading;

  const mainPanelWidth = useMemo(() => {
    if (!showQR || !qrMetrics) return terminalWidth;
    return Math.max(0, terminalWidth - QR_PANEL_MARGIN_LEFT - qrMetrics.panelWidth);
  }, [showQR, qrMetrics, terminalWidth]);

  const sessionListWidth = useMemo(() => {
    const borderWidth = 2;
    const paddingX = 1;
    const rowPaddingLeft = 1;
    return Math.max(0, mainPanelWidth - borderWidth - paddingX * 2 - rowPaddingLeft);
  }, [mainPanelWidth]);

  useEffect(() => {
    pendingAssignmentRef.current = pendingAssignment;
  }, [pendingAssignment]);

  useEffect(() => {
    const pending = pendingAssignmentRef.current;
    if (!pending) return;

    logger.debug(
      `pendingAssignment check: tty=${pending.tty}, projectId=${pending.projectId}, sessions.length=${sessions.length}`
    );

    if (Date.now() - pending.createdAt > PENDING_ASSIGNMENT_TIMEOUT_MS) {
      logger.debug('pendingAssignment: timeout expired');
      setPendingAssignment(null);
      return;
    }

    const matchingSession = sessions.find((session) => session.tty === pending.tty);
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

  const sessionMap = useMemo(() => {
    const map = new Map<string, Session>();
    for (const session of sessions) {
      map.set(session.session_id, session);
    }
    return map;
  }, [sessions]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally refresh when data changes
  const storeDisplayOrder = useMemo(() => getDisplayOrder(), [sessions, projects]);

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

  const selectedIndex = useMemo(() => {
    if (!selectedSessionKey) return 0;
    const idx = displayOrder.findIndex((session) => session.session_id === selectedSessionKey);
    return idx >= 0 ? idx : 0;
  }, [displayOrder, selectedSessionKey]);

  const selectedProjectIndex = useMemo(() => {
    if (!selectedProjectId) return 0;
    const idx = projects.findIndex((project) => project.id === selectedProjectId);
    return idx >= 0 ? idx : 0;
  }, [projects, selectedProjectId]);

  const headerHeight = 3;
  const footerHeight = 2;
  const minHeight = headerHeight + footerHeight + MAX_VISIBLE_SESSIONS * SESSION_CARD_HEIGHT;
  const baseAvailableHeight = terminalHeight - headerHeight - footerHeight;
  const baseMaxVisibleSessions = Math.max(1, Math.floor(baseAvailableHeight / SESSION_CARD_HEIGHT));
  const initialViewportStart = getViewportStart(
    selectedIndex,
    displayOrder.length,
    baseMaxVisibleSessions
  );

  const initialViewModel = useMemo(
    () =>
      buildDisplayOrderRows({
        storeDisplayOrder,
        sessionMap,
        projects,
        viewportStart: initialViewportStart,
        maxVisibleSessions: baseMaxVisibleSessions,
        selectedIndex,
      }),
    [
      storeDisplayOrder,
      sessionMap,
      projects,
      initialViewportStart,
      baseMaxVisibleSessions,
      selectedIndex,
    ]
  );

  const adjustedAvailableHeight = baseAvailableHeight - initialViewModel.headerCountInViewport;
  const maxVisibleSessions = Math.max(1, Math.floor(adjustedAvailableHeight / SESSION_CARD_HEIGHT));
  const viewportStart = getViewportStart(selectedIndex, displayOrder.length, maxVisibleSessions);

  const viewModel = useMemo(
    () =>
      buildDisplayOrderRows({
        storeDisplayOrder,
        sessionMap,
        projects,
        viewportStart,
        maxVisibleSessions,
        selectedIndex,
      }),
    [storeDisplayOrder, sessionMap, projects, viewportStart, maxVisibleSessions, selectedIndex]
  );

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
  }, [projects, selectedProjectId]);

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
    [displayOrder, selectedIndex]
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
    [displayOrder]
  );

  return {
    loading,
    error,
    projects,
    displayOrder,
    displayRows: viewModel.rows,
    selectedIndex,
    selectedProjectIndex,
    selectedAssignIndex,
    inputMode,
    projectName,
    qrCode,
    qrPanelWidth: qrMetrics?.panelWidth,
    url,
    showQR,
    showUrlText,
    sessionListWidth,
    terminalHeight,
    minHeight,
    maxVisibleSessions,
    viewportStart,
    statusCounts,
    setInputMode,
    setProjectName,
    setSelectedProjectId,
    setSelectedAssignIndex,
    setSelectedSessionKey,
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
