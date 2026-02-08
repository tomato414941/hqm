// Import and re-export HookEventName from constants (single source of truth)
import type { HookEventName } from '../constants.js';
export type { HookEventName };

// Event received from hooks (for internal processing)
export interface HookEvent {
  session_id: string;
  cwd: string;
  tty?: string;
  hook_event_name: HookEventName;
  notification_type?: string;
  prompt?: string;
  tool_name?: string;
  source?: 'startup' | 'resume' | 'clear' | 'compact';
}

// Session status
export type SessionStatus = 'running' | 'waiting_input' | 'stopped';

// Session information (minimal)
export interface Session {
  session_id: string;
  cwd: string;
  initial_cwd: string;
  tty?: string;
  agent?: 'claude' | 'codex';
  tmux_target?: string;
  tmux_pane_id?: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  // Additional context fields
  last_prompt?: string;
  current_tool?: string;
  notification_type?: string;
  lastMessage?: string;
}

// Project for grouping sessions
export interface Project {
  id: string;
  name: string;
  created_at: string;
}

// Display order item (project or session)
export type DisplayOrderItem = { type: 'project'; id: string } | { type: 'session'; key: string };

// File store data structure
export interface StoreData {
  sessions: Record<string, Session>;
  projects?: Record<string, Project>;
  displayOrder?: DisplayOrderItem[];
  updated_at: string;
}

// Conversation message for history display
export interface ConversationMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

// History response from WebSocket
export interface HistoryResponse {
  type: 'history';
  sessionId: string;
  messages: ConversationMessage[];
  hasMore: boolean;
}
