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
}

// Session status
export type SessionStatus = 'running' | 'waiting_input' | 'stopped';

// Session information (minimal)
export interface Session {
  session_id: string;
  cwd: string;
  initial_cwd: string;
  tty?: string;
  status: SessionStatus;
  created_at: string;
  updated_at: string;
  // Additional context fields
  last_prompt?: string;
  current_tool?: string;
  notification_type?: string;
  lastMessage?: string;
  summary?: string;
  summary_transcript_size?: number;
}

// File store data structure
export interface StoreData {
  sessions: Record<string, Session>;
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
