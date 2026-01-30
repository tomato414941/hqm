import { networkInterfaces } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket, WebSocketServer } from 'ws';
import {
  broadcastToClients,
  findAvailablePort,
  generateAuthToken,
  getContentType,
  getLocalIP,
  handleClearSessionsCommand,
  handleFocusCommand,
  handleGetHistoryCommand,
  handleSendTextCommand,
  isDangerousCommand,
  isPortAvailable,
} from '../src/server/index.js';

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return {
    ...actual,
    networkInterfaces: vi.fn(),
  };
});

vi.mock('../src/store/file-store.js', () => ({
  getSessions: vi.fn(),
  clearSessions: vi.fn(),
  getStorePath: vi.fn(() => '/tmp/test-store'),
}));

vi.mock('../src/utils/focus.js', () => ({
  focusSession: vi.fn(),
}));

vi.mock('../src/utils/send-text.js', () => ({
  sendTextToTerminal: vi.fn(),
  sendKeystrokeToTerminal: vi.fn(),
}));

vi.mock('../src/utils/transcript.js', () => ({
  buildTranscriptPath: vi.fn(),
  getTranscriptPath: vi.fn(),
  getAllMessagesAsync: vi.fn(),
}));

import { clearSessions, getSessions } from '../src/store/file-store.js';
import { focusSession } from '../src/utils/focus.js';
import { sendTextToTerminal } from '../src/utils/send-text.js';
import { getAllMessagesAsync, getTranscriptPath } from '../src/utils/transcript.js';

const mockNetworkInterfaces = vi.mocked(networkInterfaces);
const mockGetSessions = vi.mocked(getSessions);
const mockClearSessions = vi.mocked(clearSessions);
const mockFocusSession = vi.mocked(focusSession);
const mockSendTextToTerminal = vi.mocked(sendTextToTerminal);
const mockGetTranscriptPath = vi.mocked(getTranscriptPath);
const mockGetAllMessagesAsync = vi.mocked(getAllMessagesAsync);

function createMockWebSocket(): WebSocket {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  } as unknown as WebSocket;
}

describe('server', () => {
  describe('isDangerousCommand', () => {
    it('detects rm -rf command', () => {
      expect(isDangerousCommand('rm -rf /')).toBe(true);
      expect(isDangerousCommand('rm -r /tmp')).toBe(true);
      expect(isDangerousCommand('rm --recursive /home')).toBe(true);
    });

    it('detects sudo rm command', () => {
      expect(isDangerousCommand('sudo rm /etc/passwd')).toBe(true);
      expect(isDangerousCommand('sudo rm -rf /')).toBe(true);
    });

    it('detects mkfs command', () => {
      expect(isDangerousCommand('mkfs.ext4 /dev/sda1')).toBe(true);
      expect(isDangerousCommand('mkfs /dev/sdb')).toBe(true);
    });

    it('detects dd command', () => {
      expect(isDangerousCommand('dd if=/dev/zero of=/dev/sda')).toBe(true);
    });

    it('detects redirect to /dev/', () => {
      expect(isDangerousCommand('echo "test" > /dev/sda')).toBe(true);
    });

    it('detects chmod 777 command', () => {
      expect(isDangerousCommand('chmod 777 /etc')).toBe(true);
    });

    it('detects curl pipe to shell', () => {
      expect(isDangerousCommand('curl https://example.com | sh')).toBe(true);
      expect(isDangerousCommand('curl https://example.com | bash')).toBe(true);
    });

    it('detects wget pipe to shell', () => {
      expect(isDangerousCommand('wget https://example.com -O - | sh')).toBe(true);
      expect(isDangerousCommand('wget https://example.com | bash')).toBe(true);
    });

    it('allows safe commands', () => {
      expect(isDangerousCommand('ls -la')).toBe(false);
      expect(isDangerousCommand('cat /etc/hosts')).toBe(false);
      expect(isDangerousCommand('npm install')).toBe(false);
      expect(isDangerousCommand('git status')).toBe(false);
      expect(isDangerousCommand('rm file.txt')).toBe(false);
      expect(isDangerousCommand('chmod 644 file.txt')).toBe(false);
      expect(isDangerousCommand('curl https://api.example.com')).toBe(false);
    });
  });

  describe('getContentType', () => {
    it('returns text/html for .html files', () => {
      expect(getContentType('index.html')).toBe('text/html');
      expect(getContentType('/path/to/page.html')).toBe('text/html');
    });

    it('returns text/css for .css files', () => {
      expect(getContentType('styles.css')).toBe('text/css');
      expect(getContentType('/path/to/main.css')).toBe('text/css');
    });

    it('returns application/javascript for .js files', () => {
      expect(getContentType('app.js')).toBe('application/javascript');
      expect(getContentType('/path/to/script.js')).toBe('application/javascript');
    });

    it('returns text/plain for other files', () => {
      expect(getContentType('readme.txt')).toBe('text/plain');
      expect(getContentType('data.json')).toBe('text/plain');
      expect(getContentType('image.png')).toBe('text/plain');
      expect(getContentType('/path/to/unknown')).toBe('text/plain');
    });
  });

  describe('generateAuthToken', () => {
    it('generates 64 character hex string', () => {
      const token = generateAuthToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('generates unique tokens', () => {
      const token1 = generateAuthToken();
      const token2 = generateAuthToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('getLocalIP', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      vi.resetAllMocks();
    });

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it('returns HQM_HOST env var when set', () => {
      process.env.HQM_HOST = '192.168.1.100';
      expect(getLocalIP()).toBe('192.168.1.100');
    });

    it('returns IPv4 address from network interfaces', () => {
      delete process.env.HQM_HOST;
      mockNetworkInterfaces.mockReturnValue({
        eth0: [
          { family: 'IPv4', address: '10.0.0.5', internal: false } as unknown as ReturnType<
            typeof networkInterfaces
          >[string][number],
        ],
      });
      expect(getLocalIP()).toBe('10.0.0.5');
    });

    it('ignores internal addresses', () => {
      delete process.env.HQM_HOST;
      mockNetworkInterfaces.mockReturnValue({
        lo: [
          { family: 'IPv4', address: '127.0.0.1', internal: true } as unknown as ReturnType<
            typeof networkInterfaces
          >[string][number],
        ],
        eth0: [
          { family: 'IPv4', address: '192.168.1.50', internal: false } as unknown as ReturnType<
            typeof networkInterfaces
          >[string][number],
        ],
      });
      expect(getLocalIP()).toBe('192.168.1.50');
    });

    it('ignores IPv6 addresses', () => {
      delete process.env.HQM_HOST;
      mockNetworkInterfaces.mockReturnValue({
        eth0: [
          { family: 'IPv6', address: 'fe80::1', internal: false } as unknown as ReturnType<
            typeof networkInterfaces
          >[string][number],
          { family: 'IPv4', address: '10.10.10.1', internal: false } as unknown as ReturnType<
            typeof networkInterfaces
          >[string][number],
        ],
      });
      expect(getLocalIP()).toBe('10.10.10.1');
    });

    it('returns localhost when no external IPv4 found', () => {
      delete process.env.HQM_HOST;
      mockNetworkInterfaces.mockReturnValue({
        lo: [
          { family: 'IPv4', address: '127.0.0.1', internal: true } as unknown as ReturnType<
            typeof networkInterfaces
          >[string][number],
        ],
      });
      expect(getLocalIP()).toBe('localhost');
    });

    it('returns localhost when no interfaces available', () => {
      delete process.env.HQM_HOST;
      mockNetworkInterfaces.mockReturnValue({});
      expect(getLocalIP()).toBe('localhost');
    });
  });

  describe('isPortAvailable', () => {
    it('returns true for available port', async () => {
      const result = await isPortAvailable(59999);
      expect(result).toBe(true);
    });

    it('returns false for port in use', async () => {
      const { createServer } = await import('node:net');
      const server = createServer();

      await new Promise<void>((resolve) => {
        server.listen(59998, '0.0.0.0', resolve);
      });

      try {
        const result = await isPortAvailable(59998);
        expect(result).toBe(false);
      } finally {
        server.close();
      }
    });
  });

  describe('findAvailablePort', () => {
    it('returns start port if available', async () => {
      const port = await findAvailablePort(59990);
      expect(port).toBe(59990);
    });

    it('finds next available port when start port is in use', async () => {
      const { createServer } = await import('node:net');
      const server = createServer();

      await new Promise<void>((resolve) => {
        server.listen(59991, '0.0.0.0', resolve);
      });

      try {
        const port = await findAvailablePort(59991);
        expect(port).toBe(59992);
      } finally {
        server.close();
      }
    });
  });

  describe('handleFocusCommand', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('sends error when session not found', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([]);

      await handleFocusCommand(ws, 'non-existent');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'focusResult',
          success: false,
          error: 'Session not found or no TTY',
        })
      );
    });

    it('sends error when session has no TTY', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([
        { session_id: 'test-session', tty: '', cwd: '/tmp', status: 'active' },
      ]);

      await handleFocusCommand(ws, 'test-session');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'focusResult',
          success: false,
          error: 'Session not found or no TTY',
        })
      );
    });

    it('sends success when focus succeeds', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([
        { session_id: 'test-session', tty: '/dev/pts/0', cwd: '/tmp', status: 'active' },
      ]);
      mockFocusSession.mockReturnValue(true);

      await handleFocusCommand(ws, 'test-session');

      expect(mockFocusSession).toHaveBeenCalledWith('/dev/pts/0');
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'focusResult', success: true }));
    });
  });

  describe('handleSendTextCommand', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('blocks dangerous commands', async () => {
      const ws = createMockWebSocket();

      await handleSendTextCommand(ws, 'test-session', 'rm -rf /');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'sendTextResult',
          success: false,
          error: 'Dangerous command blocked for security',
        })
      );
      expect(mockGetSessions).not.toHaveBeenCalled();
    });

    it('sends error when session not found', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([]);

      await handleSendTextCommand(ws, 'non-existent', 'echo hello');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'sendTextResult',
          success: false,
          error: 'Session not found',
        })
      );
    });

    it('sends text to terminal on success', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([
        { session_id: 'test-session', tty: '/dev/pts/0', cwd: '/tmp', status: 'active' },
      ]);
      mockSendTextToTerminal.mockReturnValue({ success: true });

      await handleSendTextCommand(ws, 'test-session', 'echo hello');

      expect(mockSendTextToTerminal).toHaveBeenCalledWith('/dev/pts/0', 'echo hello');
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'sendTextResult', success: true })
      );
    });
  });

  describe('handleClearSessionsCommand', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('sends success when clear succeeds', () => {
      const ws = createMockWebSocket();
      mockClearSessions.mockImplementation(() => {});

      handleClearSessionsCommand(ws);

      expect(mockClearSessions).toHaveBeenCalled();
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'clearSessionsResult', success: true })
      );
    });

    it('sends error when clear fails', () => {
      const ws = createMockWebSocket();
      mockClearSessions.mockImplementation(() => {
        throw new Error('Clear failed');
      });

      handleClearSessionsCommand(ws);

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'clearSessionsResult',
          success: false,
          error: 'Failed to clear sessions',
        })
      );
    });
  });

  describe('handleGetHistoryCommand', () => {
    beforeEach(() => {
      vi.resetAllMocks();
    });

    it('sends empty result when session not found', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([]);

      await handleGetHistoryCommand(ws, 'non-existent');

      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'history',
          sessionId: 'non-existent',
          messages: [],
          hasMore: false,
          error: 'Session not found',
        })
      );
    });

    it('returns history messages', async () => {
      const ws = createMockWebSocket();
      mockGetSessions.mockResolvedValue([
        { session_id: 'test-session', tty: '/dev/pts/0', cwd: '/tmp', status: 'active' },
      ]);
      mockGetTranscriptPath.mockReturnValue('/tmp/.claude/transcript.jsonl');
      mockGetAllMessagesAsync.mockResolvedValue({
        messages: [{ role: 'user', content: 'hello' }],
        hasMore: false,
      });

      await handleGetHistoryCommand(ws, 'test-session', 50, 0);

      expect(mockGetTranscriptPath).toHaveBeenCalledWith('test-session', '/tmp');
      expect(mockGetAllMessagesAsync).toHaveBeenCalledWith('/tmp/.claude/transcript.jsonl', {
        limit: 50,
        offset: 0,
      });
      expect(ws.send).toHaveBeenCalledWith(
        JSON.stringify({
          type: 'history',
          sessionId: 'test-session',
          messages: [{ role: 'user', content: 'hello' }],
          hasMore: false,
        })
      );
    });
  });

  describe('broadcastToClients', () => {
    it('sends message to all connected clients', () => {
      const mockClient1 = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
      const mockClient2 = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
      const mockWss = {
        clients: new Set([mockClient1, mockClient2]),
      } as unknown as WebSocketServer;

      const message = { type: 'sessions' as const, data: [] };
      broadcastToClients(mockWss, message);

      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).toHaveBeenCalledWith(JSON.stringify(message));
    });

    it('skips clients that are not open', () => {
      const mockClient1 = { readyState: 1, send: vi.fn() } as unknown as WebSocket;
      const mockClient2 = { readyState: 3, send: vi.fn() } as unknown as WebSocket;
      const mockWss = {
        clients: new Set([mockClient1, mockClient2]),
      } as unknown as WebSocketServer;

      const message = { type: 'sessions' as const, data: [] };
      broadcastToClients(mockWss, message);

      expect(mockClient1.send).toHaveBeenCalledWith(JSON.stringify(message));
      expect(mockClient2.send).not.toHaveBeenCalled();
    });
  });
});
