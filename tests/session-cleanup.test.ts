import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, StoreData } from '../src/types/index.js';

// Mock tty check
const mockIsTtyAlive = vi.fn();
vi.mock('../src/utils/tty.js', () => ({
  isTtyAliveAsync: (tty: string | undefined) => mockIsTtyAlive(tty),
}));

// Mock debug log
vi.mock('../src/utils/debug.js', () => ({
  debugLog: vi.fn(),
}));

describe('session-cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsTtyAlive.mockResolvedValue(true);
  });

  function createSession(overrides: Partial<Session> = {}): Session {
    return {
      session_id: 'test-session',
      cwd: '/tmp',
      initial_cwd: '/tmp',
      tty: '/dev/pts/1',
      status: 'running',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
  }

  function createStoreData(sessions: Record<string, Session>): StoreData {
    return {
      sessions,
      updated_at: new Date().toISOString(),
    };
  }

  describe('checkSessionsForCleanup', () => {
    it('should detect timed out sessions', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');

      const thirtyMinutesAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      const session = createSession({
        session_id: 'old-session',
        updated_at: thirtyMinutesAgo,
      });
      const store = createStoreData({ 'old-session:/dev/pts/1': session });

      const results = await checkSessionsForCleanup(store, 30 * 60 * 1000);

      expect(results).toHaveLength(1);
      expect(results[0].shouldRemove).toBe(true);
      expect(results[0].reason).toBe('timeout');
    });

    it('should detect sessions with closed TTY', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');

      mockIsTtyAlive.mockResolvedValue(false);

      const session = createSession({
        session_id: 'dead-tty-session',
        tty: '/dev/pts/999',
      });
      const store = createStoreData({ 'dead-tty-session:/dev/pts/999': session });

      const results = await checkSessionsForCleanup(store, 30 * 60 * 1000);

      expect(results).toHaveLength(1);
      expect(results[0].shouldRemove).toBe(true);
      expect(results[0].reason).toBe('tty_closed');
    });

    it('should handle sessions with invalid timestamps', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');
      const { debugLog } = await import('../src/utils/debug.js');

      const session = createSession({
        session_id: 'invalid-ts-session',
        updated_at: 'not-a-valid-timestamp',
      });
      const store = createStoreData({ 'invalid-ts-session:/dev/pts/1': session });

      const results = await checkSessionsForCleanup(store, 30 * 60 * 1000);

      expect(results).toHaveLength(1);
      expect(results[0].shouldRemove).toBe(false);
      expect(results[0].reason).toBe(null);
      expect(debugLog).toHaveBeenCalledWith(
        expect.stringContaining('Invalid timestamp for session invalid-ts-session')
      );
    });

    it('should not remove active sessions', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');

      const session = createSession({
        session_id: 'active-session',
        updated_at: new Date().toISOString(),
      });
      const store = createStoreData({ 'active-session:/dev/pts/1': session });

      const results = await checkSessionsForCleanup(store, 30 * 60 * 1000);

      expect(results).toHaveLength(1);
      expect(results[0].shouldRemove).toBe(false);
      expect(results[0].reason).toBe(null);
    });

    it('should not timeout sessions when timeoutMs is 0', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');

      const thirtyMinutesAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      const session = createSession({
        session_id: 'old-but-no-timeout',
        updated_at: thirtyMinutesAgo,
      });
      const store = createStoreData({ 'old-but-no-timeout:/dev/pts/1': session });

      // timeoutMs = 0 means no timeout
      const results = await checkSessionsForCleanup(store, 0);

      expect(results).toHaveLength(1);
      expect(results[0].shouldRemove).toBe(false);
      expect(results[0].reason).toBe(null);
    });

    it('should prioritize tty_closed over timeout', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');

      mockIsTtyAlive.mockResolvedValue(false);

      const thirtyMinutesAgo = new Date(Date.now() - 31 * 60 * 1000).toISOString();
      const session = createSession({
        session_id: 'both-conditions',
        updated_at: thirtyMinutesAgo,
        tty: '/dev/pts/999',
      });
      const store = createStoreData({ 'both-conditions:/dev/pts/999': session });

      const results = await checkSessionsForCleanup(store, 30 * 60 * 1000);

      expect(results).toHaveLength(1);
      expect(results[0].shouldRemove).toBe(true);
      // tty_closed should take priority
      expect(results[0].reason).toBe('tty_closed');
    });

    it('should include elapsed time in results', async () => {
      const { checkSessionsForCleanup } = await import('../src/store/session-cleanup.js');

      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const session = createSession({
        session_id: 'recent-session',
        updated_at: fiveMinutesAgo,
      });
      const store = createStoreData({ 'recent-session:/dev/pts/1': session });

      const results = await checkSessionsForCleanup(store, 30 * 60 * 1000);

      expect(results).toHaveLength(1);
      expect(results[0].elapsed).toBeGreaterThan(4 * 60 * 1000);
      expect(results[0].elapsed).toBeLessThan(6 * 60 * 1000);
    });
  });
});
