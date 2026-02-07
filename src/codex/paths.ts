import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

export const CODEX_SESSION_PREFIX = 'codex-';

const DEFAULT_CODEX_HOME = join(homedir(), '.codex');

export function getCodexHome(): string {
  return process.env.CODEX_HOME || DEFAULT_CODEX_HOME;
}

export function getCodexSessionsDir(): string {
  return join(getCodexHome(), 'sessions');
}

export function codexSessionsDirExists(): boolean {
  return existsSync(getCodexSessionsDir());
}

export function isCodexSessionId(sessionId: string): boolean {
  return sessionId.startsWith(CODEX_SESSION_PREFIX);
}

export function decodeCodexSessionId(sessionId: string): string {
  if (!isCodexSessionId(sessionId)) {
    return sessionId;
  }
  return sessionId.slice(CODEX_SESSION_PREFIX.length);
}

const CODEX_SESSION_ID_REGEX = /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i;

export function extractCodexSessionIdFromPath(filePath: string): string | undefined {
  const match = basename(filePath).match(CODEX_SESSION_ID_REGEX);
  return match?.[0];
}
