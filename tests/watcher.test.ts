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
  cleanupStaleSessions: vi.fn().mockResolvedValue(undefined),
}));

// Mock config
vi.mock('../src/store/config.js', () => ({
  getSessionTimeoutMs: () => 0,
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
      mockGetSessions.mockReturnValue(sessions);

      createFileWatcher(mockWss as never);

      // Get the change handler
      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];
      expect(changeHandler).toBeDefined();

      // Trigger change with matching filename
      await changeHandler('/tmp/sessions.json');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockBroadcast).toHaveBeenCalledWith(mockWss, {
        type: 'sessions',
        data: sessions,
        projects: [],
      });
    });
  });
});
