import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../src/types/index.js';

// Mock chokidar
const mockWatcher = {
  on: vi.fn().mockReturnThis(),
  close: vi.fn(),
};
vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn(() => mockWatcher),
  },
}));

// Mock file-store
const mockGetSessions = vi.fn();
const mockGetProjects = vi.fn().mockReturnValue([]);
vi.mock('../src/store/file-store.js', () => ({
  getSessions: () => mockGetSessions(),
  getProjects: () => mockGetProjects(),
  getStorePath: () => '/tmp/sessions.json',
}));

// Mock summary service
const mockGenerateSummary = vi.fn();
vi.mock('../src/services/summary.js', () => ({
  generateSessionSummaryIfNeeded: (session: Session) => mockGenerateSummary(session),
}));

// Mock websocket
const mockBroadcast = vi.fn();
vi.mock('../src/server/websocket.js', () => ({
  broadcastToClients: (wss: unknown, msg: unknown) => mockBroadcast(wss, msg),
}));

describe('watcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWatcher.on.mockClear();
    mockWatcher.on.mockReturnThis();
  });

  describe('createFileWatcher', () => {
    it('should create watcher and register change handler', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      const watcher = createFileWatcher(mockWss as never);

      expect(watcher).toBe(mockWatcher);
      expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should broadcast sessions on file change', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      const sessions: Session[] = [
        {
          session_id: 'test-1',
          cwd: '/tmp',
          initial_cwd: '/tmp',
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      mockGetSessions.mockResolvedValue(sessions);

      createFileWatcher(mockWss as never);

      // Get the change handler
      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];
      expect(changeHandler).toBeDefined();

      // Trigger change
      await changeHandler();

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockBroadcast).toHaveBeenCalledWith(mockWss, {
        type: 'sessions',
        data: sessions,
        projects: [],
      });
    });

    it('should trigger summary generation for stopped sessions without summary', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      const sessions: Session[] = [
        {
          session_id: 'stopped-1',
          cwd: '/tmp',
          initial_cwd: '/tmp',
          status: 'stopped',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // No summary
        },
      ];
      mockGetSessions.mockResolvedValue(sessions);
      mockGenerateSummary.mockResolvedValue('Generated summary');

      createFileWatcher(mockWss as never);

      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];

      await changeHandler();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGenerateSummary).toHaveBeenCalledWith(sessions[0]);
    });

    it('should not generate summary for sessions that already have one', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      const sessions: Session[] = [
        {
          session_id: 'stopped-with-summary',
          cwd: '/tmp',
          initial_cwd: '/tmp',
          status: 'stopped',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          summary: 'Already has summary',
        },
      ];
      mockGetSessions.mockResolvedValue(sessions);

      createFileWatcher(mockWss as never);

      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];

      await changeHandler();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGenerateSummary).not.toHaveBeenCalled();
    });

    it('should not generate summary for running sessions', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      const sessions: Session[] = [
        {
          session_id: 'running-1',
          cwd: '/tmp',
          initial_cwd: '/tmp',
          status: 'running',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];
      mockGetSessions.mockResolvedValue(sessions);

      createFileWatcher(mockWss as never);

      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];

      await changeHandler();
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockGenerateSummary).not.toHaveBeenCalled();
    });
  });
});
