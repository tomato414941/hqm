import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('transcript', () => {
  let existsSyncMock: ReturnType<typeof vi.fn>;
  let readFileSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs');
    existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    readFileSyncMock = fs.readFileSync as ReturnType<typeof vi.fn>;
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe('buildTranscriptPath', () => {
    it('builds correct path from cwd and sessionId', async () => {
      const { buildTranscriptPath } = await import('../src/utils/transcript.js');

      const result = buildTranscriptPath('/home/user/project', 'abc123');

      expect(result).toContain('.claude');
      expect(result).toContain('projects');
      expect(result).toContain('-home-user-project');
      expect(result).toContain('abc123.jsonl');
    });

    it('handles root directory', async () => {
      const { buildTranscriptPath } = await import('../src/utils/transcript.js');

      const result = buildTranscriptPath('/', 'session1');

      expect(result).toContain('-');
      expect(result).toContain('session1.jsonl');
    });
  });

  describe('getLastAssistantMessage', () => {
    it('returns undefined when file does not exist', async () => {
      existsSyncMock.mockReturnValue(false);
      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
      expect(readFileSyncMock).not.toHaveBeenCalled();
    });

    it('returns last assistant message from valid JSONL', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello' }] } }),
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'First response' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Second response' }] },
          }),
        ].join('\n')
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Second response');
    });

    it('returns undefined when no assistant messages exist', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello' }] } }),
          JSON.stringify({ type: 'result', message: {} }),
        ].join('\n')
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('skips invalid JSON lines and continues processing', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Valid message' }] },
          }),
          'invalid json {{{',
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Last valid' }] },
          }),
        ].join('\n')
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Last valid');
    });

    it('returns undefined on file read error', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('concatenates multiple text parts in content array', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Part one' },
              { type: 'tool_use', name: 'some_tool' },
              { type: 'text', text: 'Part two' },
            ],
          },
        })
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Part one\nPart two');
    });

    it('handles empty content array', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        JSON.stringify({
          type: 'assistant',
          message: { content: [] },
        })
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('handles empty file', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue('');

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    // Tests for multi-line assistant messages where text is in a separate entry
    // The implementation correctly skips entries without text and finds the previous text

    it('finds previous text when last assistant has only tool_use', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'This is the actual response' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'tool_use', id: 'toolu_123', name: 'Bash', input: {} }] },
          }),
        ].join('\n')
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');
      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('This is the actual response');
    });

    it('finds previous text when last assistant has only thinking', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'User visible message' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'thinking', thinking: 'Internal thought process' }] },
          }),
        ].join('\n')
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');
      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('User visible message');
    });

    it('finds text in real Claude Code transcript format with multiple assistant entries', async () => {
      existsSyncMock.mockReturnValue(true);
      // Simulating actual Claude Code transcript structure
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({ type: 'summary', summary: 'Session summary' }),
          JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello' }] } }),
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'thinking', thinking: 'Let me help...' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            message: { content: [{ type: 'text', text: 'Here is my response to help you.' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            message: {
              content: [
                { type: 'tool_use', id: 'toolu_abc', name: 'Read', input: { file_path: '/test' } },
              ],
            },
          }),
        ].join('\n')
      );

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');
      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Here is my response to help you.');
    });
  });

  describe('getAllMessages', () => {
    it('returns empty array when file does not exist', async () => {
      existsSyncMock.mockReturnValue(false);
      const { getAllMessages } = await import('../src/utils/transcript.js');

      const result = getAllMessages('/path/to/transcript.jsonl');

      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('extracts user and assistant messages from JSONL', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({
            type: 'user',
            uuid: 'user-1',
            timestamp: '2026-01-20T10:00:00Z',
            message: { role: 'user', content: 'Hello' },
          }),
          JSON.stringify({
            type: 'assistant',
            uuid: 'assistant-1',
            timestamp: '2026-01-20T10:00:01Z',
            message: { content: [{ type: 'text', text: 'Hi there!' }] },
          }),
        ].join('\n')
      );

      const { getAllMessages } = await import('../src/utils/transcript.js');
      const result = getAllMessages('/path/to/transcript.jsonl');

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({
        id: 'user-1',
        type: 'user',
        content: 'Hello',
        timestamp: '2026-01-20T10:00:00Z',
      });
      expect(result.messages[1]).toEqual({
        id: 'assistant-1',
        type: 'assistant',
        content: 'Hi there!',
        timestamp: '2026-01-20T10:00:01Z',
      });
    });

    it('skips meta messages and local commands', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({
            type: 'user',
            uuid: 'meta-1',
            isMeta: true,
            message: { content: '<local-command-caveat>...</local-command-caveat>' },
          }),
          JSON.stringify({
            type: 'user',
            uuid: 'cmd-1',
            message: { content: '<command-name>/exit</command-name>' },
          }),
          JSON.stringify({
            type: 'user',
            uuid: 'real-1',
            message: { content: 'Real user message' },
          }),
        ].join('\n')
      );

      const { getAllMessages } = await import('../src/utils/transcript.js');
      const result = getAllMessages('/path/to/transcript.jsonl');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Real user message');
    });

    it('skips summary and file-history-snapshot entries', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({ type: 'summary', summary: 'Session summary' }),
          JSON.stringify({ type: 'file-history-snapshot', snapshot: {} }),
          JSON.stringify({
            type: 'user',
            uuid: 'user-1',
            message: { content: 'Hello' },
          }),
        ].join('\n')
      );

      const { getAllMessages } = await import('../src/utils/transcript.js');
      const result = getAllMessages('/path/to/transcript.jsonl');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].type).toBe('user');
    });

    it('applies pagination with limit and offset', async () => {
      existsSyncMock.mockReturnValue(true);
      const messages = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify({
          type: 'user',
          uuid: `msg-${i}`,
          message: { content: `Message ${i}` },
        })
      );
      readFileSyncMock.mockReturnValue(messages.join('\n'));

      const { getAllMessages } = await import('../src/utils/transcript.js');

      // Get last 3 messages
      const result1 = getAllMessages('/path/to/transcript.jsonl', { limit: 3, offset: 0 });
      expect(result1.messages).toHaveLength(3);
      expect(result1.messages[0].content).toBe('Message 7');
      expect(result1.messages[2].content).toBe('Message 9');
      expect(result1.hasMore).toBe(true);

      // Get next 3 messages (offset 3)
      const result2 = getAllMessages('/path/to/transcript.jsonl', { limit: 3, offset: 3 });
      expect(result2.messages).toHaveLength(3);
      expect(result2.messages[0].content).toBe('Message 4');
      expect(result2.messages[2].content).toBe('Message 6');
      expect(result2.hasMore).toBe(true);

      // Get remaining messages
      const result3 = getAllMessages('/path/to/transcript.jsonl', { limit: 10, offset: 6 });
      expect(result3.messages).toHaveLength(4);
      expect(result3.messages[0].content).toBe('Message 0');
      expect(result3.hasMore).toBe(false);
    });

    it('handles assistant messages with only tool_use (no text)', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockReturnValue(
        [
          JSON.stringify({
            type: 'assistant',
            uuid: 'tool-only',
            message: { content: [{ type: 'tool_use', name: 'Bash' }] },
          }),
          JSON.stringify({
            type: 'assistant',
            uuid: 'with-text',
            message: { content: [{ type: 'text', text: 'Done!' }] },
          }),
        ].join('\n')
      );

      const { getAllMessages } = await import('../src/utils/transcript.js');
      const result = getAllMessages('/path/to/transcript.jsonl');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Done!');
    });

    it('returns empty on file read error', async () => {
      existsSyncMock.mockReturnValue(true);
      readFileSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { getAllMessages } = await import('../src/utils/transcript.js');
      const result = getAllMessages('/path/to/transcript.jsonl');

      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });
});
