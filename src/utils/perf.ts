import { appendFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROFILE_ENABLED = process.env.HQM_PROFILE === '1';
const PERF_DIR = join(homedir(), '.hqm');
const PERF_LOG_PATH = join(PERF_DIR, 'perf.log');

export interface PerfSpan {
  event: string;
  start: bigint;
  data?: Record<string, unknown>;
}

function writePerf(entry: Record<string, unknown>): void {
  if (!PROFILE_ENABLED) {
    return;
  }
  try {
    mkdirSync(PERF_DIR, { recursive: true, mode: 0o700 });
    appendFileSync(PERF_LOG_PATH, `${JSON.stringify({ pid: process.pid, ...entry })}\n`);
  } catch {
    // Ignore profiling log failures
  }
}

export function startPerf(event: string, data?: Record<string, unknown>): PerfSpan | null {
  if (!PROFILE_ENABLED) {
    return null;
  }
  return { event, start: process.hrtime.bigint(), data };
}

export function endPerf(span: PerfSpan | null, data?: Record<string, unknown>): void {
  if (!span) {
    return;
  }
  const durationMs = Number(process.hrtime.bigint() - span.start) / 1e6;
  writePerf({
    timestamp: new Date().toISOString(),
    event: span.event,
    duration_ms: Math.round(durationMs * 1000) / 1000,
    ...span.data,
    ...data,
  });
}

export function logPerfEvent(event: string, data?: Record<string, unknown>): void {
  writePerf({
    timestamp: new Date().toISOString(),
    event,
    ...data,
  });
}
