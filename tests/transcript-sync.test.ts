import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, StoreData } from '../src/types/index.js';

// Mock transcript utilities
const mockGetLastAssistantMessage = vi.fn();
const mockGetTranscriptPath = vi.fn();
vi.mock('../src/utils/transcript.js', () => ({
  buildTranscriptPath: (cwd: string, sessionId: string) =>
    `/tmp/.claude/projects/${cwd}/${sessionId}.jsonl`,
  getTranscriptPath: (sessionId: string, cwd: string) => mockGetTranscriptPath(sessionId, cwd),
  getLastAssistantMessage: (path: string) => mockGetLastAssistantMessage(path),
}));

describe('transcript-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: return a path based on sessionId and cwd
    mockGetTranscriptPath.mockImplementation(
      (sessionId: string, cwd: string) => `/tmp/.claude/projects/${cwd}/${sessionId}.jsonl`
    );
  });

  function createSession(overrides: Partial<Session> = {}): Session {
    return {
      session_id: 'test-session',
      cwd: '/tmp/project',
      initial_cwd: '/tmp/project',
      tty: '/dev/pts/1',
      status: 'running',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  function createStoreData(sessions: Session[]): StoreData {
    const sessionsRecord: Record<string, Session> = {};
    for (const session of sessions) {
      const key = `${session.session_id}:${session.tty || ''}`;
      sessionsRecord[key] = session;
    }
    return {
      sessions: sessionsRecord,
      updated_at: new Date().toISOString(),
    };
  }

  describe('syncTranscripts', () => {
    it('should skip stopped sessions', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      const session = createSession({
        session_id: 'stopped-session',
        status: 'stopped',
      });
      const sessions = [session];
      const store = createStoreData(sessions);

      const result = syncTranscripts(sessions, store);

      expect(result).toBe(false);
      expect(mockGetLastAssistantMessage).not.toHaveBeenCalled();
    });

    it('should update lastMessage when transcript has new message', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      mockGetLastAssistantMessage.mockReturnValue('New assistant message');

      const session = createSession({
        session_id: 'active-session',
        status: 'running',
        lastMessage: 'Old message',
      });
      const sessions = [session];
      const store = createStoreData(sessions);

      const result = syncTranscripts(sessions, store);

      expect(result).toBe(true);
      expect(session.lastMessage).toBe('New assistant message');
    });

    it('should return false when lastMessage is unchanged', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      const currentMessage = 'Current message';
      mockGetLastAssistantMessage.mockReturnValue(currentMessage);

      const session = createSession({
        session_id: 'active-session',
        status: 'running',
        lastMessage: currentMessage,
      });
      const sessions = [session];
      const store = createStoreData(sessions);

      const result = syncTranscripts(sessions, store);

      expect(result).toBe(false);
    });

    it('should return false when transcript returns null', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      mockGetLastAssistantMessage.mockReturnValue(null);

      const session = createSession({
        session_id: 'active-session',
        status: 'running',
      });
      const sessions = [session];
      const store = createStoreData(sessions);

      const result = syncTranscripts(sessions, store);

      expect(result).toBe(false);
    });

    it('should process multiple sessions', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      mockGetLastAssistantMessage
        .mockReturnValueOnce('Message for session 1')
        .mockReturnValueOnce('Message for session 2');

      const sessions = [
        createSession({ session_id: 'session-1', status: 'running' }),
        createSession({ session_id: 'session-2', status: 'waiting_input' }),
      ];
      const store = createStoreData(sessions);

      const result = syncTranscripts(sessions, store);

      expect(result).toBe(true);
      expect(sessions[0].lastMessage).toBe('Message for session 1');
      expect(sessions[1].lastMessage).toBe('Message for session 2');
    });

    it('should use initial_cwd for transcript path', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      mockGetLastAssistantMessage.mockReturnValue('Some message');

      const session = createSession({
        session_id: 'moved-session',
        status: 'running',
        cwd: '/tmp/new-location',
        initial_cwd: '/tmp/original-location',
      });
      const sessions = [session];
      const store = createStoreData(sessions);

      syncTranscripts(sessions, store);

      // Verify the path was built with initial_cwd
      expect(mockGetLastAssistantMessage).toHaveBeenCalledWith(
        expect.stringContaining('/tmp/original-location')
      );
    });

    it('should update store.sessions with new lastMessage', async () => {
      const { syncTranscripts } = await import('../src/store/transcript-sync.js');

      mockGetLastAssistantMessage.mockReturnValue('Updated message');

      const session = createSession({
        session_id: 'test-session',
        status: 'running',
      });
      const sessions = [session];
      const store = createStoreData(sessions);

      syncTranscripts(sessions, store);

      const key = `${session.session_id}:${session.tty}`;
      expect(store.sessions[key].lastMessage).toBe('Updated message');
    });
  });
});
