import { useMemo } from 'react';
import {
  MAX_VISIBLE_SESSIONS,
  QR_PANEL_MARGIN_LEFT,
  SESSION_CARD_HEIGHT,
} from '../../constants.js';
import type { DisplayOrderItem, Project, Session } from '../../types/index.js';
import { getQrPanelMetrics, shouldShowQRCode } from '../../utils/qr-display.js';
import { buildDisplayOrderRows } from './display-order-view-model.js';
import type { DashboardDisplayRow } from './types.js';

interface UseDashboardLayoutParams {
  showQRProp: boolean;
  showUrlProp: boolean;
  qrCode: string | null;
  url: string | null;
  serverLoading: boolean;
  terminalHeight: number;
  terminalWidth: number;
  storeDisplayOrder: DisplayOrderItem[];
  sessionMap: Map<string, Session>;
  projects: Project[];
  selectedIndex: number;
  displayOrderLength: number;
}

interface UseDashboardLayoutResult {
  qrPanelWidth: number | undefined;
  showQR: boolean;
  showUrlText: boolean;
  sessionListWidth: number;
  minHeight: number;
  maxVisibleSessions: number;
  viewportStart: number;
  displayRows: DashboardDisplayRow[];
}

function getViewportStart(
  selectedIndex: number,
  totalSessions: number,
  maxVisible: number
): number {
  if (totalSessions <= maxVisible) return 0;

  const halfVisible = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfVisible;
  start = Math.max(0, start);
  start = Math.min(totalSessions - maxVisible, start);

  return start;
}

export function useDashboardLayout({
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
  displayOrderLength,
}: UseDashboardLayoutParams): UseDashboardLayoutResult {
  const qrMetrics = useMemo(() => getQrPanelMetrics(qrCode), [qrCode]);
  const showQR = shouldShowQRCode(showQRProp, showUrlProp, terminalHeight, terminalWidth, qrCode);
  const showUrlText = Boolean(showUrlProp && !showQR && url && !serverLoading);

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

  const headerHeight = 3;
  const footerHeight = 2;
  const minHeight = headerHeight + footerHeight + MAX_VISIBLE_SESSIONS * SESSION_CARD_HEIGHT;
  const baseAvailableHeight = terminalHeight - headerHeight - footerHeight;
  const baseMaxVisibleSessions = Math.max(1, Math.floor(baseAvailableHeight / SESSION_CARD_HEIGHT));
  const initialViewportStart = getViewportStart(
    selectedIndex,
    displayOrderLength,
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
  const viewportStart = getViewportStart(selectedIndex, displayOrderLength, maxVisibleSessions);

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

  return {
    qrPanelWidth: qrMetrics?.panelWidth,
    showQR,
    showUrlText,
    sessionListWidth,
    minHeight,
    maxVisibleSessions,
    viewportStart,
    displayRows: viewModel.rows,
  };
}
