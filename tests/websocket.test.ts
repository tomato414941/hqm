import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
vi.mock('../src/store/file-store.js', () => ({
  getSessions: vi.fn().mockReturnValue([]),
  getSessionsLight: vi.fn().mockReturnValue([]),
  getProjects: vi.fn().mockReturnValue([]),
  refreshSessionData: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/utils/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn(),
  },
}));

vi.mock('../src/server/handlers/focus.js', () => ({
  handleFocusCommand: vi.fn(),
}));

vi.mock('../src/server/handlers/history.js', () => ({
  handleGetHistoryCommand: vi.fn(),
}));

vi.mock('../src/server/handlers/send-text.js', () => ({
  handleSendTextCommand: vi.fn(),
  handleSendKeystrokeCommand: vi.fn(),
}));

vi.mock('../src/server/handlers/sessions.js', () => ({
  handleClearSessionsCommand: vi.fn(),
}));

describe('websocket', () => {
  let mockWs: {
    send: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    readyState: number;
    on: ReturnType<typeof vi.fn>;
  };

  let mockWss: {
    clients: Set<typeof mockWs>;
    on: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockWs = {
      send: vi.fn(),
      close: vi.fn(),
      readyState: 1,
      on: vi.fn(),
    };
    mockWss = {
      clients: new Set([mockWs]),
      on: vi.fn(),
    };
  });

  describe('handleWebSocketMessage', () => {
    it('should send error response for invalid JSON', async () => {
      const { setupWebSocketHandlers } = await import('../src/server/websocket.js');

      setupWebSocketHandlers(mockWss as never, 'valid-token');

      // Get the connection handler
      const connectionHandler = mockWss.on.mock.calls.find((call) => call[0] === 'connection')?.[1];
      expect(connectionHandler).toBeDefined();

      // Simulate connection with valid token
      const mockReq = {
        url: '/?token=valid-token',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      connectionHandler(mockWs, mockReq);

      // Get the message handler
      const messageHandler = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];
      expect(messageHandler).toBeDefined();

      // Send invalid JSON
      messageHandler(Buffer.from('not valid json'));

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'error', error: 'Invalid JSON message' })
      );
    });

    it('should process valid JSON messages', async () => {
      const { handleClearSessionsCommand } = await import('../src/server/handlers/sessions.js');
      const { setupWebSocketHandlers } = await import('../src/server/websocket.js');

      setupWebSocketHandlers(mockWss as never, 'valid-token');

      const connectionHandler = mockWss.on.mock.calls.find((call) => call[0] === 'connection')?.[1];

      const mockReq = {
        url: '/?token=valid-token',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      connectionHandler(mockWs, mockReq);

      const messageHandler = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      // Send valid clearSessions command
      messageHandler(Buffer.from(JSON.stringify({ type: 'clearSessions' })));

      expect(handleClearSessionsCommand).toHaveBeenCalledWith(mockWs);
    });

    it('should ignore unknown message types', async () => {
      const { setupWebSocketHandlers } = await import('../src/server/websocket.js');

      setupWebSocketHandlers(mockWss as never, 'valid-token');

      const connectionHandler = mockWss.on.mock.calls.find((call) => call[0] === 'connection')?.[1];

      const mockReq = {
        url: '/?token=valid-token',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      connectionHandler(mockWs, mockReq);

      const messageHandler = mockWs.on.mock.calls.find((call) => call[0] === 'message')?.[1];

      // Send unknown message type
      messageHandler(Buffer.from(JSON.stringify({ type: 'unknownType' })));

      // Should not throw, just ignore
      // No error response should be sent for valid JSON with unknown type
      const errorCalls = mockWs.send.mock.calls.filter((call) => {
        const parsed = JSON.parse(call[0]);
        return parsed.type === 'error';
      });
      expect(errorCalls).toHaveLength(0);
    });
  });

  describe('authentication', () => {
    it('should reject connection with invalid token', async () => {
      const { setupWebSocketHandlers } = await import('../src/server/websocket.js');

      setupWebSocketHandlers(mockWss as never, 'valid-token');

      const connectionHandler = mockWss.on.mock.calls.find((call) => call[0] === 'connection')?.[1];

      const mockReq = {
        url: '/?token=wrong-token',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      connectionHandler(mockWs, mockReq);

      expect(mockWs.close).toHaveBeenCalledWith(1008, 'Unauthorized');
    });

    it('should accept connection with valid token', async () => {
      const { setupWebSocketHandlers } = await import('../src/server/websocket.js');

      setupWebSocketHandlers(mockWss as never, 'valid-token');

      const connectionHandler = mockWss.on.mock.calls.find((call) => call[0] === 'connection')?.[1];

      const mockReq = {
        url: '/?token=valid-token',
        headers: { host: 'localhost' },
        socket: { remoteAddress: '127.0.0.1' },
      };
      connectionHandler(mockWs, mockReq);

      expect(mockWs.close).not.toHaveBeenCalled();
      // Should send initial sessions (async, wait for it)
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockWs.send).toHaveBeenCalled();
    });
  });

  describe('broadcastToClients', () => {
    it('should broadcast to all connected clients', async () => {
      const { broadcastToClients } = await import('../src/server/websocket.js');

      const mockWs2 = {
        send: vi.fn(),
        readyState: 1,
      };
      mockWss.clients.add(mockWs2 as never);

      broadcastToClients(mockWss as never, { type: 'sessions', data: [], projects: [] });

      expect(mockWs.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'sessions', data: [], projects: [] })
      );
      expect(mockWs2.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'sessions', data: [], projects: [] })
      );
    });

    it('should not send to closed clients', async () => {
      const { broadcastToClients } = await import('../src/server/websocket.js');

      const closedWs = {
        send: vi.fn(),
        readyState: 3, // CLOSED
      };
      mockWss.clients.add(closedWs as never);

      broadcastToClients(mockWss as never, { type: 'sessions', data: [], projects: [] });

      expect(mockWs.send).toHaveBeenCalled(); // readyState = 1 (OPEN)
      expect(closedWs.send).not.toHaveBeenCalled();
    });
  });
});
