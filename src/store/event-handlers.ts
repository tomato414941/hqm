import type { HookEvent, HookEventName } from '../types/index.js';

export interface SessionFieldUpdates {
  lastPrompt?: string;
  currentTool?: string;
  notificationType?: string;
  needsSummary?: boolean;
}

interface ExistingFields {
  last_prompt?: string;
  current_tool?: string;
  notification_type?: string;
}

type EventHandler = (event: HookEvent, existing: ExistingFields) => SessionFieldUpdates;

const eventHandlers: Record<HookEventName, EventHandler> = {
  SessionStart: (event, existing) => {
    // Log for investigation - will be visible in hqm logs
    console.error(
      `[SessionStart] source=${event.source}, session_id=${event.session_id}, tty=${event.tty}`
    );
    return {
      lastPrompt: existing.last_prompt,
      currentTool: undefined,
      notificationType: undefined,
    };
  },

  UserPromptSubmit: (event, existing) => ({
    lastPrompt: event.prompt ?? existing.last_prompt,
    currentTool: existing.current_tool,
    notificationType: undefined, // Clear notification when user submits new prompt
    needsSummary: false,
  }),

  PreToolUse: (event, existing) => ({
    lastPrompt: existing.last_prompt,
    currentTool: event.tool_name ?? existing.current_tool,
    notificationType: existing.notification_type,
    needsSummary: false,
  }),

  PostToolUse: (_event, existing) => ({
    lastPrompt: existing.last_prompt,
    currentTool: undefined,
    notificationType: existing.notification_type,
    needsSummary: false,
  }),

  Notification: (event, existing) => ({
    lastPrompt: existing.last_prompt,
    currentTool: existing.current_tool,
    notificationType: event.notification_type ?? existing.notification_type,
    needsSummary: true, // Generate summary on permission/input wait
  }),

  Stop: (_event, existing) => ({
    lastPrompt: existing.last_prompt,
    currentTool: undefined,
    notificationType: undefined,
    needsSummary: true, // Generate summary on session stop
  }),
};

/**
 * Get field updates based on event type
 */
export function getFieldUpdates(event: HookEvent, existing: ExistingFields): SessionFieldUpdates {
  const handler = eventHandlers[event.hook_event_name];
  return handler(event, existing);
}
