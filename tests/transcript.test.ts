import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  createReadStream: vi.fn(),
  openSync: vi.fn(),
  fstatSync: vi.fn(),
  readSync: vi.fn(),
  closeSync: vi.fn(),
}));

function createMockReadStream(content: string): Readable {
  return Readable.from(content.split('\n').map((line) => `${line}\n`));
}

describe('transcript', () => {
  let existsSyncMock: ReturnType<typeof vi.fn>;
  let readFileSyncMock: ReturnType<typeof vi.fn>;
  let createReadStreamMock: ReturnType<typeof vi.fn>;
  let openSyncMock: ReturnType<typeof vi.fn>;
  let fstatSyncMock: ReturnType<typeof vi.fn>;
  let readSyncMock: ReturnType<typeof vi.fn>;
  let closeSyncMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    const fs = await import('node:fs');
    existsSyncMock = fs.existsSync as ReturnType<typeof vi.fn>;
    readFileSyncMock = fs.readFileSync as ReturnType<typeof vi.fn>;
    createReadStreamMock = fs.createReadStream as ReturnType<typeof vi.fn>;
    openSyncMock = fs.openSync as ReturnType<typeof vi.fn>;
    fstatSyncMock = fs.fstatSync as ReturnType<typeof vi.fn>;
    readSyncMock = fs.readSync as ReturnType<typeof vi.fn>;
    closeSyncMock = fs.closeSync as ReturnType<typeof vi.fn>;
    existsSyncMock.mockReset();
    readFileSyncMock.mockReset();
    createReadStreamMock.mockReset();
    openSyncMock.mockReset();
    fstatSyncMock.mockReset();
    readSyncMock.mockReset();
    closeSyncMock.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  /**
   * Set up mocks for both readFileSync and the low-level fd-based reads
   * used by readTailContent.
   */
  function setupFileContent(content: string): void {
    const buf = Buffer.from(content, 'utf-8');
    readFileSyncMock.mockReturnValue(content);
    openSyncMock.mockReturnValue(42);
    fstatSyncMock.mockReturnValue({ size: buf.length });
    readSyncMock.mockImplementation(
      (_fd: number, target: Buffer, offset: number, length: number, position: number) => {
        buf.copy(target, offset, position, position + length);
        return length;
      }
    );
    closeSyncMock.mockImplementation(() => {});
  }

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
      const content = [
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello' }] } }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'First response' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Second response' }] },
        }),
      ].join('\n');
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Second response');
    });

    it('returns undefined when no assistant messages exist', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
        JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'Hello' }] } }),
        JSON.stringify({ type: 'result', message: {} }),
      ].join('\n');
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('skips invalid JSON lines and continues processing', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Valid message' }] },
        }),
        'invalid json {{{',
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Last valid' }] },
        }),
      ].join('\n');
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Last valid');
    });

    it('returns undefined on file read error', async () => {
      existsSyncMock.mockReturnValue(true);
      openSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      readFileSyncMock.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('concatenates multiple text parts in content array', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Part one' },
            { type: 'tool_use', name: 'some_tool' },
            { type: 'text', text: 'Part two' },
          ],
        },
      });
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Part one\nPart two');
    });

    it('handles empty content array', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = JSON.stringify({
        type: 'assistant',
        message: { content: [] },
      });
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('handles empty file', async () => {
      existsSyncMock.mockReturnValue(true);
      setupFileContent('');

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');

      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBeUndefined();
    });

    it('finds previous text when last assistant has only tool_use', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'This is the actual response' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'tool_use', id: 'toolu_123', name: 'Bash', input: {} }] },
        }),
      ].join('\n');
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');
      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('This is the actual response');
    });

    it('finds previous text when last assistant has only thinking', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'User visible message' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'thinking', thinking: 'Internal thought process' }] },
        }),
      ].join('\n');
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');
      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('User visible message');
    });

    it('finds text in real Claude Code transcript format with multiple assistant entries', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
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
      ].join('\n');
      setupFileContent(content);

      const { getLastAssistantMessage } = await import('../src/utils/transcript.js');
      const result = getLastAssistantMessage('/path/to/transcript.jsonl');

      expect(result).toBe('Here is my response to help you.');
    });
  });

  describe('readTailContent', () => {
    it('reads entire file when smaller than tailBytes', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = 'line1\nline2\nline3';
      setupFileContent(content);

      const { readTailContent } = await import('../src/utils/transcript.js');
      const result = readTailContent('/path/to/file.jsonl');

      expect(result).toBe(content);
      expect(closeSyncMock).toHaveBeenCalled();
    });

    it('returns empty string for empty file', async () => {
      openSyncMock.mockReturnValue(42);
      fstatSyncMock.mockReturnValue({ size: 0 });
      closeSyncMock.mockImplementation(() => {});

      const { readTailContent } = await import('../src/utils/transcript.js');
      const result = readTailContent('/path/to/file.jsonl');

      expect(result).toBe('');
    });

    it('drops first partial line when reading tail of large file', async () => {
      const fullContent = 'first-complete-line\nsecond-line\nthird-line';
      const buf = Buffer.from(fullContent, 'utf-8');
      // Simulate reading only last 25 bytes (partial first line + rest)
      const tailBytes = 25;
      const tailPortion = buf.subarray(buf.length - tailBytes);

      openSyncMock.mockReturnValue(42);
      fstatSyncMock.mockReturnValue({ size: buf.length });
      readSyncMock.mockImplementation(
        (_fd: number, target: Buffer, offset: number, length: number, position: number) => {
          buf.copy(target, offset, position, position + length);
          return length;
        }
      );
      closeSyncMock.mockImplementation(() => {});

      const { readTailContent } = await import('../src/utils/transcript.js');
      const result = readTailContent('/path/to/file.jsonl', tailBytes);

      // Should drop the first partial line
      const tailStr = tailPortion.toString('utf-8');
      const firstNewline = tailStr.indexOf('\n');
      const expected = tailStr.slice(firstNewline + 1);
      expect(result).toBe(expected);
    });

    it('closes fd even on read error', async () => {
      openSyncMock.mockReturnValue(42);
      fstatSyncMock.mockImplementation(() => {
        throw new Error('stat error');
      });
      closeSyncMock.mockImplementation(() => {});

      const { readTailContent } = await import('../src/utils/transcript.js');
      expect(() => readTailContent('/path/to/file.jsonl')).toThrow('stat error');
      expect(closeSyncMock).toHaveBeenCalledWith(42);
    });
  });

  describe('findLastAssistantInContent', () => {
    it('finds last assistant message in content string', async () => {
      const { findLastAssistantInContent } = await import('../src/utils/transcript.js');
      const content = [
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'First' }] },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'Second' }] },
        }),
      ].join('\n');

      expect(findLastAssistantInContent(content)).toBe('Second');
    });

    it('returns undefined for content with no assistant messages', async () => {
      const { findLastAssistantInContent } = await import('../src/utils/transcript.js');
      const content = JSON.stringify({
        type: 'user',
        message: { content: [{ type: 'text', text: 'Hello' }] },
      });

      expect(findLastAssistantInContent(content)).toBeUndefined();
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

  describe('getAllMessagesAsync', () => {
    it('returns empty array when file does not exist', async () => {
      existsSyncMock.mockReturnValue(false);
      const { getAllMessagesAsync } = await import('../src/utils/transcript.js');

      const result = await getAllMessagesAsync('/path/to/transcript.jsonl');

      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it('extracts user and assistant messages from JSONL stream', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
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
      ].join('\n');
      createReadStreamMock.mockReturnValue(createMockReadStream(content));

      const { getAllMessagesAsync } = await import('../src/utils/transcript.js');
      const result = await getAllMessagesAsync('/path/to/transcript.jsonl');

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
      const content = [
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
      ].join('\n');
      createReadStreamMock.mockReturnValue(createMockReadStream(content));

      const { getAllMessagesAsync } = await import('../src/utils/transcript.js');
      const result = await getAllMessagesAsync('/path/to/transcript.jsonl');

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe('Real user message');
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
      createReadStreamMock.mockReturnValue(createMockReadStream(messages.join('\n')));

      const { getAllMessagesAsync } = await import('../src/utils/transcript.js');

      const result1 = await getAllMessagesAsync('/path/to/transcript.jsonl', {
        limit: 3,
        offset: 0,
      });
      expect(result1.messages).toHaveLength(3);
      expect(result1.messages[0].content).toBe('Message 7');
      expect(result1.messages[2].content).toBe('Message 9');
      expect(result1.hasMore).toBe(true);
    });

    it('skips invalid JSON lines and continues processing', async () => {
      existsSyncMock.mockReturnValue(true);
      const content = [
        JSON.stringify({
          type: 'user',
          uuid: 'valid-1',
          message: { content: 'Valid message' },
        }),
        'invalid json {{{',
        JSON.stringify({
          type: 'user',
          uuid: 'valid-2',
          message: { content: 'Another valid' },
        }),
      ].join('\n');
      createReadStreamMock.mockReturnValue(createMockReadStream(content));

      const { getAllMessagesAsync } = await import('../src/utils/transcript.js');
      const result = await getAllMessagesAsync('/path/to/transcript.jsonl');

      expect(result.messages).toHaveLength(2);
    });

    it('returns empty on stream error', async () => {
      existsSyncMock.mockReturnValue(true);
      const errorStream = new Readable({
        read() {
          this.destroy(new Error('Stream error'));
        },
      });
      createReadStreamMock.mockReturnValue(errorStream);

      const { getAllMessagesAsync } = await import('../src/utils/transcript.js');
      const result = await getAllMessagesAsync('/path/to/transcript.jsonl');

      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });
});
