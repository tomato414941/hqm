import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HookEvent, Session, StoreData } from '../src/types/index.js';

const TEST_STORE_DIR = join(tmpdir(), `hqm-test-${process.pid}`);

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => join(tmpdir(), `hqm-test-${process.pid}`),
  };
});

// Mock isTtyAliveAsync to return true for most TTYs, but false for specific test paths
vi.mock('../src/utils/tty-cache.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/utils/tty-cache.js')>();
  return {
    ...original,
    isTtyAliveAsync: async (tty: string | undefined) => {
      if (!tty) return true;
      // Return false for TTYs that are explicitly meant to not exist in tests
      if (tty === '/dev/pts/999') return false;
      // All other TTYs are treated as alive (for CI compatibility)
      return true;
    },
  };
});

// Mock config to enable timeout for tests (30 minutes)
vi.mock('../src/store/config.js', () => ({
  getSessionTimeoutMs: () => 30 * 60 * 1000,
  readConfig: () => ({ sessionTimeoutMinutes: 30 }),
}));

describe('file-store', () => {
  beforeEach(async () => {
    // Reset in-memory cache before each test
    const { resetStoreCache } = await import('../src/store/file-store.js');
    resetStoreCache();

    if (existsSync(TEST_STORE_DIR)) {
      rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    // Flush and reset cache after each test
    const { flushPendingWrites, resetStoreCache } = await import('../src/store/file-store.js');
    await flushPendingWrites();
    resetStoreCache();

    vi.restoreAllMocks();
    if (existsSync(TEST_STORE_DIR)) {
      rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    }
  });

  describe('getSessionKey', () => {
    it('should return session_id:tty when tty is provided', async () => {
      const { getSessionKey } = await import('../src/store/file-store.js');
      expect(getSessionKey('abc123', '/dev/pts/1')).toBe('abc123:/dev/pts/1');
    });

    it('should return session_id only when tty is not provided', async () => {
      const { getSessionKey } = await import('../src/store/file-store.js');
      expect(getSessionKey('abc123')).toBe('abc123');
      expect(getSessionKey('abc123', undefined)).toBe('abc123');
    });
  });

  describe('isTtyAliveAsync', () => {
    it('should return true when tty is undefined', async () => {
      const { isTtyAliveAsync } = await import('../src/store/file-store.js');
      expect(await isTtyAliveAsync(undefined)).toBe(true);
    });

    it('should return false when tty does not exist', async () => {
      const { isTtyAliveAsync } = await import('../src/store/file-store.js');
      expect(await isTtyAliveAsync('/dev/pts/999')).toBe(false);
    });

    it('should return true when tty exists', async () => {
      const { isTtyAliveAsync } = await import('../src/store/file-store.js');
      // /dev/null always exists
      expect(await isTtyAliveAsync('/dev/null')).toBe(true);
    });
  });

  describe('determineStatus', () => {
    it('should return stopped on Stop event', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'Stop',
      };
      expect(determineStatus(event)).toBe('stopped');
      expect(determineStatus(event, 'running')).toBe('stopped');
      expect(determineStatus(event, 'waiting_input')).toBe('stopped');
    });

    it('should return running on UserPromptSubmit event even if stopped', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'UserPromptSubmit',
      };
      expect(determineStatus(event, 'stopped')).toBe('running');
      expect(determineStatus(event, 'running')).toBe('running');
    });

    it('should keep stopped state for other events', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'PostToolUse',
      };
      expect(determineStatus(event, 'stopped')).toBe('stopped');
    });

    it('should return running on PreToolUse event', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'PreToolUse',
      };
      expect(determineStatus(event)).toBe('running');
      expect(determineStatus(event, 'waiting_input')).toBe('running');
    });

    it('should return waiting_input on Notification with permission_prompt', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
      };
      expect(determineStatus(event)).toBe('waiting_input');
    });

    it('should return running on Notification without permission_prompt', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'Notification',
        notification_type: 'other',
      };
      expect(determineStatus(event)).toBe('running');
    });
  });

  describe('removeOldSessionsOnSameTty', () => {
    it('should remove sessions with same tty but different session_id', async () => {
      const { removeOldSessionsOnSameTty } = await import('../src/store/file-store.js');
      const sessions: Record<string, Session> = {
        'old:/dev/pts/1': {
          session_id: 'old',
          cwd: '/tmp',
          tty: '/dev/pts/1',
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        'other:/dev/pts/2': {
          session_id: 'other',
          cwd: '/tmp',
          tty: '/dev/pts/2',
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      removeOldSessionsOnSameTty(sessions, 'new', '/dev/pts/1');

      expect(sessions['old:/dev/pts/1']).toBeUndefined();
      expect(sessions['other:/dev/pts/2']).toBeDefined();
    });

    it('should not remove session with same session_id', async () => {
      const { removeOldSessionsOnSameTty } = await import('../src/store/file-store.js');
      const sessions: Record<string, Session> = {
        'same:/dev/pts/1': {
          session_id: 'same',
          cwd: '/tmp',
          tty: '/dev/pts/1',
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      };

      removeOldSessionsOnSameTty(sessions, 'same', '/dev/pts/1');

      expect(sessions['same:/dev/pts/1']).toBeDefined();
    });
  });

  describe('readStore and writeStore', () => {
    it('should return empty store data when file does not exist', async () => {
      const { readStore } = await import('../src/store/file-store.js');
      const data = readStore();

      expect(data.sessions).toEqual({});
      expect(data.updated_at).toBeDefined();
    });

    it('should read and write store data correctly', async () => {
      const { readStore, writeStore } = await import('../src/store/file-store.js');
      const testData: StoreData = {
        sessions: {
          'test:/dev/pts/1': {
            session_id: 'test',
            cwd: '/tmp',
            tty: '/dev/pts/1',
            status: 'running',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      };

      writeStore(testData);
      const readData = readStore();

      expect(readData.sessions['test:/dev/pts/1']).toBeDefined();
      expect(readData.sessions['test:/dev/pts/1'].session_id).toBe('test');
    });

    it('should return empty store data when file contains invalid JSON', async () => {
      mkdirSync(join(TEST_STORE_DIR, '.hqm'), { recursive: true });
      writeFileSync(join(TEST_STORE_DIR, '.hqm', 'sessions.json'), 'invalid json', 'utf-8');

      const { readStore } = await import('../src/store/file-store.js');
      const data = readStore();

      expect(data.sessions).toEqual({});
    });
  });

  describe('updateSession', () => {
    it('should create new session', async () => {
      const { updateSession, getSession } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'new-session',
        cwd: '/home/user/project',
        tty: '/dev/pts/1',
        hook_event_name: 'PreToolUse',
      };

      const session = updateSession(event);

      expect(session.session_id).toBe('new-session');
      expect(session.cwd).toBe('/home/user/project');
      expect(session.tty).toBe('/dev/pts/1');
      expect(session.status).toBe('running');

      const stored = getSession('new-session', '/dev/pts/1');
      expect(stored).toBeDefined();
      expect(stored?.session_id).toBe('new-session');
    });

    it('should update existing session status', async () => {
      const { updateSession, getSession } = await import('../src/store/file-store.js');

      updateSession({
        session_id: 'test',
        cwd: '/tmp',
        tty: '/dev/pts/1',
        hook_event_name: 'PreToolUse',
      });

      updateSession({
        session_id: 'test',
        cwd: '/tmp',
        tty: '/dev/pts/1',
        hook_event_name: 'Notification',
        notification_type: 'permission_prompt',
      });

      const session = getSession('test', '/dev/pts/1');
      expect(session?.status).toBe('waiting_input');
    });
  });

  describe('getSessions', () => {
    it('should return sessions sorted by created_at asc', async () => {
      const { writeStore, getSessions } = await import('../src/store/file-store.js');
      const now = Date.now();

      writeStore({
        sessions: {
          'old:/dev/pts/1': {
            session_id: 'old',
            cwd: '/tmp',
            tty: '/dev/pts/1',
            status: 'running',
            created_at: new Date(now - 1000).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
          'new:/dev/pts/2': {
            session_id: 'new',
            cwd: '/tmp',
            tty: '/dev/pts/2',
            status: 'running',
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now - 1000).toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      });

      const sessions = await getSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions[0].session_id).toBe('old');
      expect(sessions[1].session_id).toBe('new');
    });

    it('should remove expired sessions', async () => {
      const { writeStore, getSessions } = await import('../src/store/file-store.js');
      const now = Date.now();
      const thirtyOneMinutesAgo = now - 31 * 60 * 1000;

      writeStore({
        sessions: {
          'expired:/dev/pts/1': {
            session_id: 'expired',
            cwd: '/tmp',
            tty: '/dev/pts/1',
            status: 'running',
            created_at: new Date(thirtyOneMinutesAgo).toISOString(),
            updated_at: new Date(thirtyOneMinutesAgo).toISOString(),
          },
          'active:/dev/pts/2': {
            session_id: 'active',
            cwd: '/tmp',
            tty: '/dev/pts/2',
            status: 'running',
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      });

      const sessions = await getSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe('active');
    });
  });

  describe('removeSession', () => {
    it('should remove session by key', async () => {
      const { updateSession, removeSession, getSession } = await import(
        '../src/store/file-store.js'
      );

      updateSession({
        session_id: 'test',
        cwd: '/tmp',
        tty: '/dev/pts/1',
        hook_event_name: 'PreToolUse',
      });

      expect(getSession('test', '/dev/pts/1')).toBeDefined();

      removeSession('test', '/dev/pts/1');

      expect(getSession('test', '/dev/pts/1')).toBeUndefined();
    });
  });

  describe('clearSessions', () => {
    it('should remove all sessions', async () => {
      const { updateSession, clearSessions, getSessions } = await import(
        '../src/store/file-store.js'
      );

      updateSession({
        session_id: 'test1',
        cwd: '/tmp',
        hook_event_name: 'PreToolUse',
      });
      updateSession({
        session_id: 'test2',
        cwd: '/tmp',
        hook_event_name: 'PreToolUse',
      });

      expect(await getSessions()).toHaveLength(2);

      clearSessions();

      expect(await getSessions()).toHaveLength(0);
    });
  });

  describe('getStorePath', () => {
    it('should return store file path', async () => {
      const { getStorePath } = await import('../src/store/file-store.js');
      const path = getStorePath();

      expect(path).toContain('sessions.json');
      expect(path).toContain('.hqm');
    });
  });
});
