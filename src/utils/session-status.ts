import type { HookEvent, SessionStatus } from '../types/index.js';

/**
 * Determine session status based on hook event and current status
 */
export function determineStatus(event: HookEvent, currentStatus?: SessionStatus): SessionStatus {
  // Explicit stop event
  if (event.hook_event_name === 'Stop') {
    return 'stopped';
  }

  // UserPromptSubmit starts a new operation, so resume even if stopped
  if (event.hook_event_name === 'UserPromptSubmit') {
    return 'running';
  }

  // Keep stopped state (don't resume except for UserPromptSubmit)
  if (currentStatus === 'stopped') {
    return 'stopped';
  }

  // Active operation event
  if (event.hook_event_name === 'PreToolUse') {
    return 'running';
  }

  // Waiting for permission prompt
  const isPermissionPrompt =
    event.hook_event_name === 'Notification' && event.notification_type === 'permission_prompt';
  if (isPermissionPrompt) {
    return 'waiting_input';
  }

  // idle_prompt: keep existing status (same behavior as CCM)
  const isIdlePrompt =
    event.hook_event_name === 'Notification' && event.notification_type === 'idle_prompt';
  if (isIdlePrompt) {
    return currentStatus ?? 'running';
  }

  // Default: running for other events (PostToolUse, etc.)
  return 'running';
}
