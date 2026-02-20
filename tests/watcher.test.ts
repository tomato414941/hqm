import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const mockGetSessionsLight = vi.fn();
const mockGetProjects = vi.fn().mockReturnValue([]);
vi.mock('../src/store/file-store.js', () => ({
  getSessions: () => mockGetSessionsLight(),
  getSessionsLight: () => mockGetSessionsLight(),
  getProjects: () => mockGetProjects(),
  getStorePath: () => '/tmp/sessions.json',
  cleanupStaleSessions: vi.fn().mockResolvedValue(undefined),
  refreshSessionData: () => mockGetSessionsLight(),
}));

// Mock write-cache
vi.mock('../src/store/write-cache.js', () => ({
  getLastWriteTimestampMs: () => 0,
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
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockWatcher.on.mockClear();
    mockWatcher.on.mockReturnThis();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createFileWatcher', () => {
    it('should create watcher and register change handler', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      const watcher = createFileWatcher(mockWss as never);

      expect(watcher).toBe(mockWatcher);
      expect(mockWatcher.on).toHaveBeenCalledWith('change', expect.any(Function));
    });

    it('should broadcast sessions on file change after debounce', async () => {
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
      mockGetSessionsLight.mockReturnValue(sessions);

      createFileWatcher(mockWss as never);

      // Get the change handler
      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];
      expect(changeHandler).toBeDefined();

      // Trigger change with matching filename
      changeHandler('/tmp/sessions.json');

      // Should not broadcast immediately
      expect(mockBroadcast).not.toHaveBeenCalled();

      // Advance past debounce delay
      vi.advanceTimersByTime(250);

      expect(mockBroadcast).toHaveBeenCalledWith(mockWss, {
        type: 'sessions',
        data: sessions,
        projects: [],
      });
    });

    it('should debounce rapid changes', async () => {
      const { createFileWatcher } = await import('../src/server/watcher.js');
      const mockWss = { clients: new Set() };

      mockGetSessionsLight.mockReturnValue([]);

      createFileWatcher(mockWss as never);

      const changeHandler = mockWatcher.on.mock.calls.find((call) => call[0] === 'change')?.[1];

      // Trigger multiple rapid changes
      changeHandler('/tmp/sessions.json');
      vi.advanceTimersByTime(100);
      changeHandler('/tmp/sessions.json');
      vi.advanceTimersByTime(100);
      changeHandler('/tmp/sessions.json');

      // Should not have broadcast yet
      expect(mockBroadcast).not.toHaveBeenCalled();

      // Advance past debounce from last change
      vi.advanceTimersByTime(250);

      // Should only broadcast once
      expect(mockBroadcast).toHaveBeenCalledTimes(1);
    });
  });
});
