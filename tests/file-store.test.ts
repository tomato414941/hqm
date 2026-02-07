import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HookEvent, StoreData } from '../src/types/index.js';

const TEST_STORE_DIR = join(tmpdir(), `hqm-test-${process.pid}`);

// Set of TTYs that are considered "alive" in tests
// Tests can add/remove TTYs from this set to control isTtyAliveAsync behavior
const aliveTtys = new Set<string>();

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => join(tmpdir(), `hqm-test-${process.pid}`),
  };
});

// Mock isTtyAliveAsync to check against aliveTtys set
vi.mock('../src/utils/tty.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/utils/tty.js')>();
  return {
    ...original,
    isTtyAliveAsync: async (tty: string | undefined) => {
      if (!tty) return true;
      return aliveTtys.has(tty);
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
    // Reset alive TTYs set
    aliveTtys.clear();

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
    it('should return session_id only', async () => {
      const { getSessionKey } = await import('../src/store/file-store.js');
      expect(getSessionKey('abc123')).toBe('abc123');
    });
  });

  // Note: isTtyAliveAsync is tested in tty-cache.test.ts

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

    it('should keep existing status on idle_prompt notification', async () => {
      const { determineStatus } = await import('../src/store/file-store.js');
      const event: HookEvent = {
        session_id: 'test',
        cwd: '/tmp',
        hook_event_name: 'Notification',
        notification_type: 'idle_prompt',
      };
      // Keep stopped status (CCM behavior)
      expect(determineStatus(event, 'stopped')).toBe('stopped');
      // Keep running status
      expect(determineStatus(event, 'running')).toBe('running');
      // Keep waiting_input status
      expect(determineStatus(event, 'waiting_input')).toBe('waiting_input');
      // Default to running when no current status
      expect(determineStatus(event)).toBe('running');
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
          test: {
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

      expect(readData.sessions.test).toBeDefined();
      expect(readData.sessions.test.session_id).toBe('test');
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

      const stored = getSession('new-session');
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

      const session = getSession('test');
      expect(session?.status).toBe('waiting_input');
    });

    it('should remove stale sessions on the same TTY when new session starts', async () => {
      const { updateSession, getSession, readStore } = await import('../src/store/file-store.js');

      // Create first session on /dev/pts/10
      updateSession({
        session_id: 'old-session',
        cwd: '/tmp/old',
        tty: '/dev/pts/10',
        hook_event_name: 'PreToolUse',
      });

      expect(getSession('old-session')).toBeDefined();

      // Create new session on the same TTY
      updateSession({
        session_id: 'new-session',
        cwd: '/tmp/new',
        tty: '/dev/pts/10',
        hook_event_name: 'PreToolUse',
      });

      // Old session should be removed
      expect(getSession('old-session')).toBeUndefined();
      // New session should exist
      expect(getSession('new-session')).toBeDefined();

      // Verify in store
      const store = readStore();
      expect(Object.keys(store.sessions)).toHaveLength(1);
      expect(store.sessions['new-session']).toBeDefined();
    });

    it('should not remove sessions on different TTYs', async () => {
      const { updateSession, getSession } = await import('../src/store/file-store.js');

      // Create first session on /dev/pts/10
      updateSession({
        session_id: 'session-1',
        cwd: '/tmp/1',
        tty: '/dev/pts/10',
        hook_event_name: 'PreToolUse',
      });

      // Create second session on different TTY
      updateSession({
        session_id: 'session-2',
        cwd: '/tmp/2',
        tty: '/dev/pts/11',
        hook_event_name: 'PreToolUse',
      });

      // Both sessions should exist
      expect(getSession('session-1')).toBeDefined();
      expect(getSession('session-2')).toBeDefined();
    });
  });

  describe('getSessions', () => {
    it('should return sessions sorted by displayOrder, falling back to created_at', async () => {
      const { writeStore, getSessions } = await import('../src/store/file-store.js');
      const now = Date.now();

      // Add TTYs to alive set
      aliveTtys.add('/dev/pts/1');
      aliveTtys.add('/dev/pts/2');

      writeStore({
        sessions: {
          old: {
            session_id: 'old',
            cwd: '/tmp',
            tty: '/dev/pts/1',
            status: 'running',
            created_at: new Date(now - 1000).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
          new: {
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
      const { writeStore, cleanupStaleSessions, getSessions } = await import(
        '../src/store/file-store.js'
      );
      const now = Date.now();
      const thirtyOneMinutesAgo = now - 31 * 60 * 1000;

      // Add TTYs to alive set
      aliveTtys.add('/dev/pts/1');
      aliveTtys.add('/dev/pts/2');

      writeStore({
        sessions: {
          expired: {
            session_id: 'expired',
            cwd: '/tmp',
            tty: '/dev/pts/1',
            status: 'running',
            created_at: new Date(thirtyOneMinutesAgo).toISOString(),
            updated_at: new Date(thirtyOneMinutesAgo).toISOString(),
          },
          active: {
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

      await cleanupStaleSessions();
      const sessions = getSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe('active');
    });

    it('should remove sessions with closed TTY', async () => {
      const { writeStore, cleanupStaleSessions, getSessions } = await import(
        '../src/store/file-store.js'
      );
      const now = Date.now();

      // Only /dev/pts/2 is alive
      aliveTtys.add('/dev/pts/2');

      writeStore({
        sessions: {
          closedTty: {
            session_id: 'closedTty',
            cwd: '/tmp',
            tty: '/dev/pts/1', // TTY closed (not in aliveTtys)
            status: 'running',
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
          aliveTty: {
            session_id: 'aliveTty',
            cwd: '/tmp',
            tty: '/dev/pts/2', // TTY alive
            status: 'running',
            created_at: new Date(now).toISOString(),
            updated_at: new Date(now).toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      });

      await cleanupStaleSessions();
      const sessions = getSessions();

      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe('aliveTty');
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

      expect(getSession('test')).toBeDefined();

      removeSession('test');

      expect(getSession('test')).toBeUndefined();
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

  describe('project management', () => {
    describe('createProject', () => {
      it('should create a new project', async () => {
        const { createProject, getProjects } = await import('../src/store/file-store.js');

        const project = createProject('My Project');

        expect(project.id).toBeDefined();
        expect(project.name).toBe('My Project');
        expect(project.created_at).toBeDefined();

        const projects = getProjects();
        expect(projects).toHaveLength(1);
        expect(projects[0].name).toBe('My Project');
      });

      it('should add project to displayOrder', async () => {
        const { createProject, getDisplayOrder } = await import('../src/store/file-store.js');

        const project = createProject('Test Project');
        const displayOrder = getDisplayOrder();

        const projectItem = displayOrder.find(
          (item) => item.type === 'project' && item.id === project.id
        );
        expect(projectItem).toBeDefined();
      });
    });

    describe('getProjects', () => {
      it('should return empty array when no projects exist', async () => {
        const { getProjects } = await import('../src/store/file-store.js');
        const projects = getProjects();

        expect(projects).toEqual([]);
      });

      it('should return projects sorted by displayOrder', async () => {
        const { createProject, getProjects } = await import('../src/store/file-store.js');

        createProject('Project A');
        createProject('Project B');

        const projects = getProjects();
        expect(projects).toHaveLength(2);
      });
    });

    describe('deleteProject', () => {
      it('should delete a project', async () => {
        const { createProject, deleteProject, getProjects } = await import(
          '../src/store/file-store.js'
        );

        const project = createProject('To Delete');
        expect(getProjects()).toHaveLength(1);

        deleteProject(project.id);

        expect(getProjects()).toHaveLength(0);
      });

      it('should move sessions to ungrouped when project is deleted', async () => {
        const { createProject, deleteProject, updateSession, getDisplayOrder } = await import(
          '../src/store/file-store.js'
        );

        const project = createProject('Test Project');
        const event = {
          session_id: 'test-session',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse' as const,
        };
        updateSession(event);

        const { assignSessionToProjectInOrder } = await import('../src/store/file-store.js');
        assignSessionToProjectInOrder('test-session', project.id);

        deleteProject(project.id);

        const displayOrder = getDisplayOrder();
        const sessionItem = displayOrder.find(
          (item) => item.type === 'session' && item.key === 'test-session'
        );
        expect(sessionItem).toBeDefined();
      });
    });
  });

  describe('displayOrder management', () => {
    describe('getDisplayOrder', () => {
      it('should return default displayOrder with ungrouped project', async () => {
        const { getDisplayOrder } = await import('../src/store/file-store.js');
        const displayOrder = getDisplayOrder();

        expect(displayOrder).toHaveLength(1);
        expect(displayOrder[0]).toEqual({ type: 'project', id: '' });
      });
    });

    describe('moveInDisplayOrder', () => {
      it('should swap adjacent sessions in displayOrder', async () => {
        const {
          writeStore,
          moveInDisplayOrder,
          getDisplayOrder,
          flushPendingWrites,
          resetStoreCache,
        } = await import('../src/store/file-store.js');

        // Set up store with known displayOrder directly
        writeStore({
          sessions: {
            session1: {
              session_id: 'session1',
              cwd: '/tmp',
              initial_cwd: '/tmp',
              status: 'running',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            session2: {
              session_id: 'session2',
              cwd: '/tmp',
              initial_cwd: '/tmp',
              status: 'running',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          },
          displayOrder: [
            { type: 'project', id: '' },
            { type: 'session', key: 'session1' },
            { type: 'session', key: 'session2' },
          ],
          updated_at: new Date().toISOString(),
        });
        await flushPendingWrites();
        resetStoreCache();

        // Move session1 down should swap with session2
        const result = moveInDisplayOrder('session1', 'down');
        expect(result).toBe(true);

        await flushPendingWrites();
        resetStoreCache();

        const displayOrder = getDisplayOrder();
        const sessionItems = displayOrder.filter((item) => item.type === 'session');
        expect(sessionItems).toHaveLength(2);
        expect(sessionItems[0]).toEqual({ type: 'session', key: 'session2' });
        expect(sessionItems[1]).toEqual({ type: 'session', key: 'session1' });
      });

      it('should not move session before first project', async () => {
        const { updateSession, moveInDisplayOrder, flushPendingWrites } = await import(
          '../src/store/file-store.js'
        );

        updateSession({
          session_id: 'session1',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse',
        });
        await flushPendingWrites();

        const result = moveInDisplayOrder('session1', 'up');
        expect(result).toBe(false);
      });

      it('should return false for non-existent session', async () => {
        const { moveInDisplayOrder } = await import('../src/store/file-store.js');

        const result = moveInDisplayOrder('non-existent', 'up');
        expect(result).toBe(false);
      });
    });

    describe('assignSessionToProjectInOrder', () => {
      it('should assign session to a project', async () => {
        const {
          updateSession,
          createProject,
          assignSessionToProjectInOrder,
          getSessionProject,
          flushPendingWrites,
        } = await import('../src/store/file-store.js');

        updateSession({
          session_id: 'test-session',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse',
        });
        const project = createProject('Test Project');
        await flushPendingWrites();

        assignSessionToProjectInOrder('test-session', project.id);

        const projectId = getSessionProject('test-session');
        expect(projectId).toBe(project.id);
      });

      it('should move session to ungrouped when assigned to undefined', async () => {
        const {
          updateSession,
          createProject,
          assignSessionToProjectInOrder,
          getSessionProject,
          flushPendingWrites,
        } = await import('../src/store/file-store.js');

        updateSession({
          session_id: 'test-session',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse',
        });
        const project = createProject('Test Project');
        await flushPendingWrites();

        assignSessionToProjectInOrder('test-session', project.id);
        assignSessionToProjectInOrder('test-session', undefined);

        const projectId = getSessionProject('test-session');
        expect(projectId).toBeUndefined();
      });
    });

    describe('getSessionProject', () => {
      it('should return undefined for session in ungrouped', async () => {
        const { updateSession, getSessionProject, flushPendingWrites } = await import(
          '../src/store/file-store.js'
        );

        updateSession({
          session_id: 'test-session',
          cwd: '/tmp',
          hook_event_name: 'PreToolUse',
        });
        await flushPendingWrites();

        const projectId = getSessionProject('test-session');
        expect(projectId).toBeUndefined();
      });

      it('should return undefined for non-existent session', async () => {
        const { getSessionProject } = await import('../src/store/file-store.js');

        const projectId = getSessionProject('non-existent');
        expect(projectId).toBeUndefined();
      });
    });

    describe('cleanupDisplayOrder', () => {
      it('should remove entries for non-existent sessions', async () => {
        const { writeStore, cleanupDisplayOrder, getDisplayOrder, flushPendingWrites } =
          await import('../src/store/file-store.js');

        writeStore({
          sessions: {},
          displayOrder: [
            { type: 'project', id: '' },
            { type: 'session', key: 'non-existent' },
          ],
          updated_at: new Date().toISOString(),
        });
        await flushPendingWrites();

        const result = cleanupDisplayOrder();
        expect(result).toBe(true);

        const displayOrder = getDisplayOrder();
        const sessionItems = displayOrder.filter((item) => item.type === 'session');
        expect(sessionItems).toHaveLength(0);
      });

      it('should return false when nothing to cleanup', async () => {
        const { cleanupDisplayOrder } = await import('../src/store/file-store.js');

        const result = cleanupDisplayOrder();
        expect(result).toBe(false);
      });
    });

    describe('reorderProject', () => {
      it('should reorder project up', async () => {
        const { createProject, reorderProject, getProjects } = await import(
          '../src/store/file-store.js'
        );

        createProject('Project A');
        createProject('Project B');

        const projectB = getProjects()[1];
        reorderProject(projectB.id, 'up');

        const projects = getProjects();
        expect(projects[0].name).toBe('Project B');
        expect(projects[1].name).toBe('Project A');
      });

      it('should do nothing for non-existent project', async () => {
        const { reorderProject, getProjects, createProject } = await import(
          '../src/store/file-store.js'
        );

        createProject('Project A');
        const initialProjects = getProjects();

        reorderProject('non-existent', 'up');

        const afterProjects = getProjects();
        expect(afterProjects).toEqual(initialProjects);
      });
    });
  });
});
