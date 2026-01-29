import { MIN_HEIGHT_FOR_QR, MIN_WIDTH_FOR_QR } from '../constants.js';

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
  return (
    showQRProp &&
    showUrlProp &&
    terminalHeight >= MIN_HEIGHT_FOR_QR &&
    terminalWidth >= MIN_WIDTH_FOR_QR &&
    !!qrCode
  );
}
