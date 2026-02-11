import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_CODEX_HOME = join(tmpdir(), `hqm-codex-test-${process.pid}`);

vi.mock('../src/codex/paths.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/codex/paths.js')>();
  return {
    ...original,
    getCodexSessionsDir: () => join(TEST_CODEX_HOME, 'sessions'),
  };
});

describe('codex-registry', () => {
  beforeEach(() => {
    if (existsSync(TEST_CODEX_HOME)) {
      rmSync(TEST_CODEX_HOME, { recursive: true, force: true });
    }
  });

  afterEach(() => {
    if (existsSync(TEST_CODEX_HOME)) {
      rmSync(TEST_CODEX_HOME, { recursive: true, force: true });
    }
  });

  describe('scanCodexTranscripts', () => {
    it('should return empty array when sessions dir does not exist', async () => {
      const { scanCodexTranscripts } = await import('../src/codex/registry.js');
      const result = scanCodexTranscripts();
      expect(result).toEqual([]);
    });

    it('should find .jsonl files with timestamps from filenames', async () => {
      const { scanCodexTranscripts } = await import('../src/codex/registry.js');
      const sessionsDir = join(TEST_CODEX_HOME, 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      const filename = 'rollout-2025-01-15T10-30-45-abc12345-def6-7890-abcd-ef1234567890.jsonl';
      writeFileSync(join(sessionsDir, filename), '{"test":true}\n');

      const result = scanCodexTranscripts();
      expect(result).toHaveLength(1);
      expect(result[0].path).toContain(filename);
      // Timestamp should be 2025-01-15T10:30:45Z
      const expectedMs = new Date('2025-01-15T10:30:45Z').getTime();
      expect(result[0].createdAt).toBe(expectedMs);
    });

    it('should scan subdirectories recursively', async () => {
      const { scanCodexTranscripts } = await import('../src/codex/registry.js');
      const subDir = join(TEST_CODEX_HOME, 'sessions', 'subdir');
      mkdirSync(subDir, { recursive: true });

      const filename = 'rollout-2025-02-01T08-00-00-abc12345-def6-7890-abcd-ef1234567890.jsonl';
      writeFileSync(join(subDir, filename), '{"test":true}\n');

      const result = scanCodexTranscripts();
      expect(result).toHaveLength(1);
    });

    it('should skip non-jsonl files', async () => {
      const { scanCodexTranscripts } = await import('../src/codex/registry.js');
      const sessionsDir = join(TEST_CODEX_HOME, 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      writeFileSync(join(sessionsDir, 'notes.txt'), 'not a transcript');
      writeFileSync(
        join(sessionsDir, 'rollout-2025-01-15T10-30-45-abc12345-def6-7890-abcd-ef1234567890.jsonl'),
        '{}\n'
      );

      const result = scanCodexTranscripts();
      expect(result).toHaveLength(1);
    });
  });

  describe('resolveCodexTranscriptPath', () => {
    it('should return cached path if file exists', async () => {
      const { resolveCodexTranscriptPath } = await import('../src/codex/registry.js');
      const sessionsDir = join(TEST_CODEX_HOME, 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      const filePath = join(sessionsDir, 'cached.jsonl');
      writeFileSync(filePath, '{}\n');

      const result = resolveCodexTranscriptPath({
        transcript_path: filePath,
        created_at: new Date().toISOString(),
      });
      expect(result).toBe(filePath);
    });

    it('should ignore stale cached path (file deleted)', async () => {
      const { resolveCodexTranscriptPath } = await import('../src/codex/registry.js');

      const result = resolveCodexTranscriptPath({
        transcript_path: '/nonexistent/path.jsonl',
        created_at: '2020-01-01T00:00:00Z',
      });
      // No matching file in sessions dir either
      expect(result).toBeUndefined();
    });

    it('should match by creation time proximity', async () => {
      const { resolveCodexTranscriptPath } = await import('../src/codex/registry.js');
      const sessionsDir = join(TEST_CODEX_HOME, 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      // Session created at 2025-01-15T10:30:45Z
      const sessionCreatedAt = '2025-01-15T10:30:45Z';

      // Transcript with timestamp within 10s tolerance
      const filename = 'rollout-2025-01-15T10-30-48-abc12345-def6-7890-abcd-ef1234567890.jsonl';
      const filePath = join(sessionsDir, filename);
      writeFileSync(filePath, '{}\n');

      const result = resolveCodexTranscriptPath({
        created_at: sessionCreatedAt,
      });
      expect(result).toBe(filePath);
    });

    it('should not match when time difference exceeds tolerance', async () => {
      const { resolveCodexTranscriptPath } = await import('../src/codex/registry.js');
      const sessionsDir = join(TEST_CODEX_HOME, 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      // Session created at 2025-01-15T10:30:45Z
      const sessionCreatedAt = '2025-01-15T10:30:45Z';

      // Transcript 20 seconds later (beyond 10s tolerance)
      const filename = 'rollout-2025-01-15T10-31-05-abc12345-def6-7890-abcd-ef1234567890.jsonl';
      writeFileSync(join(sessionsDir, filename), '{}\n');

      const result = resolveCodexTranscriptPath({
        created_at: sessionCreatedAt,
      });
      expect(result).toBeUndefined();
    });

    it('should pick the closest match when multiple transcripts exist', async () => {
      const { resolveCodexTranscriptPath } = await import('../src/codex/registry.js');
      const sessionsDir = join(TEST_CODEX_HOME, 'sessions');
      mkdirSync(sessionsDir, { recursive: true });

      const sessionCreatedAt = '2025-01-15T10:30:45Z';

      // 5 seconds off
      const closer = 'rollout-2025-01-15T10-30-50-aaa11111-def6-7890-abcd-ef1234567890.jsonl';
      // 8 seconds off
      const farther = 'rollout-2025-01-15T10-30-53-bbb22222-def6-7890-abcd-ef1234567890.jsonl';

      const closerPath = join(sessionsDir, closer);
      const fartherPath = join(sessionsDir, farther);
      writeFileSync(closerPath, '{}\n');
      writeFileSync(fartherPath, '{}\n');

      const result = resolveCodexTranscriptPath({
        created_at: sessionCreatedAt,
      });
      expect(result).toBe(closerPath);
    });
  });
});
