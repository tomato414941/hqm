import {
  MIN_HEIGHT_FOR_QR,
  MIN_MAIN_PANEL_WIDTH,
  MIN_WIDTH_FOR_QR,
  QR_PANEL_BORDER_HEIGHT,
  QR_PANEL_BORDER_WIDTH,
  QR_PANEL_HEADER_HEIGHT,
  QR_PANEL_MARGIN_LEFT,
  QR_PANEL_MARGIN_TOP,
  QR_PANEL_PADDING_X,
} from '../constants.js';

export interface QrPanelMetrics {
  codeWidth: number;
  codeHeight: number;
  panelWidth: number;
  panelHeight: number;
}

function stripAnsi(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape sequence removal requires matching control characters
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function getQrCodeMetrics(qrCode: string): { width: number; height: number } {
  const normalized = qrCode.replace(/\n+$/, '');
  if (!normalized) return { width: 0, height: 0 };
  const lines = normalized.split('\n');
  let maxWidth = 0;
  for (const line of lines) {
    const clean = stripAnsi(line);
    if (clean.length > maxWidth) {
      maxWidth = clean.length;
    }
  }
  return { width: maxWidth, height: lines.length };
}

export function getQrPanelMetrics(qrCode: string | null | undefined): QrPanelMetrics | null {
  if (!qrCode) return null;
  const { width, height } = getQrCodeMetrics(qrCode);
  const headerWidth = 'Mobile'.length;
  const contentWidth = Math.max(width, headerWidth);
  return {
    codeWidth: width,
    codeHeight: height,
    panelWidth: contentWidth + QR_PANEL_PADDING_X * 2 + QR_PANEL_BORDER_WIDTH,
    panelHeight: height + QR_PANEL_HEADER_HEIGHT + QR_PANEL_MARGIN_TOP + QR_PANEL_BORDER_HEIGHT,
  };
}

/**
 * Determine whether to show QR code based on terminal size and settings
 */
export function shouldShowQRCode(
  showQRProp: boolean,
  showUrlProp: boolean,
  terminalHeight: number,
  terminalWidth: number,
  qrCode: string | null | undefined
): boolean {
  const metrics = getQrPanelMetrics(qrCode);
  if (!metrics) return false;

  const requiredWidth = Math.max(
    MIN_WIDTH_FOR_QR,
    MIN_MAIN_PANEL_WIDTH + QR_PANEL_MARGIN_LEFT + metrics.panelWidth
  );
  const requiredHeight = Math.max(MIN_HEIGHT_FOR_QR, metrics.panelHeight);

  return (
    showQRProp && showUrlProp && terminalHeight >= requiredHeight && terminalWidth >= requiredWidth
  );
}
