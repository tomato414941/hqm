import { useMemo, useState } from 'react';
import { useServer } from '../../hooks/useServer.js';
import { useSessions } from '../../hooks/useSessions.js';
import { useTerminalSize } from '../../hooks/useTerminalSize.js';
import { getDisplayOrder } from '../../store/file-store.js';
import type { Session } from '../../types/index.js';
import type { InputMode } from './types.js';
import { useDashboardActions } from './useDashboardActions.js';
import { useDashboardLayout } from './useDashboardLayout.js';
import { usePendingAssignment } from './usePendingAssignment.js';

interface UseDashboardStateParams {
  showQR: boolean;
  showUrl: boolean;
}

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
  const { setPendingAssignment } = usePendingAssignment(sessions);

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

  const {
    qrPanelWidth,
    showQR,
    showUrlText,
    sessionListWidth,
    minHeight,
    maxVisibleSessions,
    viewportStart,
    displayRows,
  } = useDashboardLayout({
    showQRProp,
    showUrlProp,
    qrCode,
    url,
    serverLoading,
    terminalHeight,
    terminalWidth,
    storeDisplayOrder,
    sessionMap,
    projects,
    selectedIndex,
    displayOrderLength: displayOrder.length,
  });

  const {
    focusSessionByIndex,
    handleCreateProject,
    handleDeleteProject,
    handleReorderProject,
    handleAssignProject,
    handleNewSession,
    handleReorderSession,
    handleQuickSelect,
  } = useDashboardActions({
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
  });

  return {
    loading,
    error,
    projects,
    displayOrder,
    displayRows,
    selectedIndex,
    selectedProjectIndex,
    selectedAssignIndex,
    inputMode,
    projectName,
    qrCode,
    qrPanelWidth,
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
