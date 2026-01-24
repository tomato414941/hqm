import type { Session, SessionStatus } from '../types/index.js';

export interface StatusDisplay {
  symbol: string;
  color: string;
  label: string;
}

export function getStatusDisplay(status: SessionStatus): StatusDisplay {
  switch (status) {
    case 'running':
      return { symbol: '●', color: 'green', label: 'Running' };
    case 'waiting_input':
      return { symbol: '◐', color: 'yellow', label: 'Waiting' };
    case 'stopped':
      return { symbol: '✓', color: 'cyan', label: 'Done' };
  }
}

/**
 * Get notification type display label
 */
function getNotificationLabel(notificationType: string): string {
  switch (notificationType) {
    case 'permission_prompt':
      return 'Permission';
    case 'idle_prompt':
      return 'Idle';
    default:
      return notificationType;
  }
}

/**
 * Get extended status display with tool/notification context
 */
export function getExtendedStatusDisplay(session: Session): StatusDisplay {
  const base = getStatusDisplay(session.status);

  if (session.status === 'running' && session.current_tool) {
    return {
      ...base,
      label: `Running: ${session.current_tool}`,
    };
  }

  if (session.status === 'waiting_input' && session.notification_type) {
    return {
      ...base,
      label: getNotificationLabel(session.notification_type),
    };
  }

  return base;
}
