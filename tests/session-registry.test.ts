import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

describe('session-registry', () => {
  let existsSyncMock: ReturnType<typeof vi.fn>;
  let readdirSyncMock: ReturnType<typeof vi.fn>;
  let readFileSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs');
    existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    readdirSyncMock = fs.readdirSync as ReturnType<typeof vi.fn>;
    readFileSyncMock = fs.readFileSync as ReturnType<typeof vi.fn>;
    existsSyncMock.mockReset();
    readdirSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('refreshSessionRegistry', () => {
    it('scans projects directory and builds registry', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (path.includes('.claude/projects')) return true;
        if (path.includes('sessions-index.json')) return true;
        if (path.endsWith('.jsonl')) return true;
        return false;
      });

      readdirSyncMock.mockReturnValue(['-home-dev-project1', '-home-dev-project2']);

      readFileSyncMock.mockImplementation((path: string) => {
        if (path.includes('project1')) {
          return JSON.stringify({
            version: 1,
            entries: [
              {
                sessionId: 'session-1',
                fullPath: '/home/dev/.claude/projects/-home-dev-project1/session-1.jsonl',
                projectPath: '/home/dev/project1',
              },
            ],
          });
        }
        if (path.includes('project2')) {
          return JSON.stringify({
            version: 1,
            entries: [
              {
                sessionId: 'session-2',
                fullPath: '/home/dev/.claude/projects/-home-dev-project2/session-2.jsonl',
                projectPath: '/home/dev/project2',
              },
            ],
          });
        }
        return '{}';
      });

      const { refreshSessionRegistry, getTranscriptPathFromRegistry } = await import(
        '../src/utils/session-registry.js'
      );

      refreshSessionRegistry();

      expect(getTranscriptPathFromRegistry('session-1')).toBe(
        '/home/dev/.claude/projects/-home-dev-project1/session-1.jsonl'
      );
      expect(getTranscriptPathFromRegistry('session-2')).toBe(
        '/home/dev/.claude/projects/-home-dev-project2/session-2.jsonl'
      );
      expect(getTranscriptPathFromRegistry('non-existent')).toBeUndefined();
    });

    it('handles empty projects directory', async () => {
      existsSyncMock.mockReturnValue(true);
      readdirSyncMock.mockReturnValue([]);

      const { refreshSessionRegistry, getTranscriptPathFromRegistry } = await import(
        '../src/utils/session-registry.js'
      );

      refreshSessionRegistry();

      expect(getTranscriptPathFromRegistry('any-session')).toBeUndefined();
    });

    it('handles missing projects directory', async () => {
      existsSyncMock.mockReturnValue(false);

      const { refreshSessionRegistry, getTranscriptPathFromRegistry } = await import(
        '../src/utils/session-registry.js'
      );

      refreshSessionRegistry();

      expect(getTranscriptPathFromRegistry('any-session')).toBeUndefined();
    });

    it('skips invalid sessions-index.json files', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (path.includes('.claude/projects')) return true;
        if (path.includes('sessions-index.json')) return true;
        if (path.endsWith('.jsonl')) return true;
        return false;
      });

      readdirSyncMock.mockReturnValue(['-home-dev-project1']);

      readFileSyncMock.mockReturnValue('invalid json {{{');

      const { refreshSessionRegistry, getTranscriptPathFromRegistry } = await import(
        '../src/utils/session-registry.js'
      );

      refreshSessionRegistry();

      expect(getTranscriptPathFromRegistry('any-session')).toBeUndefined();
    });

    it('skips entries where transcript file does not exist', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (path.includes('.claude/projects') && !path.endsWith('.jsonl')) return true;
        if (path.includes('sessions-index.json')) return true;
        // Transcript file does not exist
        if (path.endsWith('.jsonl')) return false;
        return false;
      });

      readdirSyncMock.mockReturnValue(['-home-dev-project1']);

      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          version: 1,
          entries: [
            {
              sessionId: 'session-missing',
              fullPath: '/home/dev/.claude/projects/-home-dev-project1/session-missing.jsonl',
            },
          ],
        })
      );

      const { refreshSessionRegistry, getTranscriptPathFromRegistry } = await import(
        '../src/utils/session-registry.js'
      );

      refreshSessionRegistry();

      expect(getTranscriptPathFromRegistry('session-missing')).toBeUndefined();
    });
  });

  describe('getTranscriptPathFromRegistry', () => {
    it('auto-refreshes when cache is stale', async () => {
      existsSyncMock.mockImplementation((path: string) => {
        if (path.includes('.claude/projects')) return true;
        if (path.includes('sessions-index.json')) return true;
        if (path.endsWith('.jsonl')) return true;
        return false;
      });

      readdirSyncMock.mockReturnValue(['-home-dev-project1']);

      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          version: 1,
          entries: [
            {
              sessionId: 'session-1',
              fullPath: '/home/dev/.claude/projects/-home-dev-project1/session-1.jsonl',
            },
          ],
        })
      );

      const { getTranscriptPathFromRegistry, refreshSessionRegistry } = await import(
        '../src/utils/session-registry.js'
      );

      // First call triggers refresh
      refreshSessionRegistry();
      const result = getTranscriptPathFromRegistry('session-1');
      expect(result).toBe('/home/dev/.claude/projects/-home-dev-project1/session-1.jsonl');
    });
  });
});
