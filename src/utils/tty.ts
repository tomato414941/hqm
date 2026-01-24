import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { endPerf, startPerf } from './perf.js';

/** Maximum depth to search ancestor processes for TTY */
const MAX_ANCESTOR_DEPTH = 5;
const TTY_PATH_REGEX = /^\/dev\/(pts\/\d+|tty\d+)$/;

function getTtyFromFds(): { tty: string; fd: number } | undefined {
  for (const fd of [0, 1, 2]) {
    try {
      const target = readlinkSync(`/proc/self/fd/${fd}`);
      if (TTY_PATH_REGEX.test(target)) {
        return { tty: target, fd };
      }
    } catch {
      // Ignore and try next fd
    }
  }
  return undefined;
}

/**
 * Get TTY from ancestor processes
 * Traverses parent process chain to find the controlling TTY
 */
export function getTtyFromAncestors(): string | undefined {
  const span = startPerf('getTtyFromAncestors', { max_depth: MAX_ANCESTOR_DEPTH });
  const fdResult = getTtyFromFds();
  if (fdResult) {
    endPerf(span, { found: true, source: 'fd', fd: fdResult.fd });
    return fdResult.tty;
  }
  let psCalls = 0;
  let depth = 0;
  try {
    let currentPid = process.ppid;
    for (let i = 0; i < MAX_ANCESTOR_DEPTH; i++) {
      depth = i + 1;
      psCalls++;
      const output = execFileSync('ps', ['-o', 'tty=,ppid=', '-p', String(currentPid)], {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      const match = output.match(/^(\S*)\s+(\S+)?/);
      const ttyName = match?.[1] ?? '';
      const ppidRaw = match?.[2];
      const isValidTty = ttyName && ttyName !== '?' && ttyName !== '';
      if (isValidTty) {
        const resolvedTty = `/dev/${ttyName}`;
        endPerf(span, { found: true, depth, ps_calls: psCalls, source: 'ps' });
        return resolvedTty;
      }
      const ppid = ppidRaw?.trim();
      if (!ppid) break;
      currentPid = parseInt(ppid, 10);
    }
  } catch {
    endPerf(span, { found: false, error: true, depth, ps_calls: psCalls, source: 'ps' });
    // TTY取得失敗は正常（バックグラウンド実行時など）
    return undefined;
  }
  endPerf(span, { found: false, depth, ps_calls: psCalls, source: 'ps' });
  return undefined;
}
