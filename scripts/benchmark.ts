/**
 * Benchmark script for HQM startup performance
 * Usage: npx tsx scripts/benchmark.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { syncCodexSessionsOnce } from '../src/codex/ingest.js';
import { getSessions, readStore, syncTmuxSessionsOnce } from '../src/store/file-store.js';
import { getSessionsFromStore } from '../src/store/session-store.js';
import { refreshSessionRegistry } from '../src/utils/session-registry.js';
import { getLastAssistantMessage, getTranscriptPath } from '../src/utils/transcript.js';

function measure<T>(label: string, fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  const ms = performance.now() - start;
  return { result, ms };
}

console.log('=== HQM Startup Performance Benchmark ===\n');

// 1. syncCodexSessionsOnce
const { ms: codexMs } = measure('syncCodexSessionsOnce', () => {
  syncCodexSessionsOnce();
});

// 2. syncTmuxSessionsOnce
const { ms: tmuxMs } = measure('syncTmuxSessionsOnce', () => {
  syncTmuxSessionsOnce();
});

// 3. readStore
const { ms: readStoreMs, result: store } = measure('readStore', () => {
  return readStore();
});

// 4. getSessionsFromStore
const { ms: getSessionsMs, result: sessions } = measure('getSessionsFromStore', () => {
  return getSessionsFromStore(store);
});

// 5. refreshSessionRegistry
const { ms: registryMs } = measure('refreshSessionRegistry', () => {
  refreshSessionRegistry();
});

// 5b. Count registry entries & existsSync calls
const PROJECTS_DIR = join(homedir(), '.claude', 'projects');
let totalEntries = 0;
let existingEntries = 0;
let missingEntries = 0;
const { ms: registryDetailMs } = measure('refreshSessionRegistry (detailed)', () => {
  if (!existsSync(PROJECTS_DIR)) return;
  const projectDirs = readdirSync(PROJECTS_DIR);
  for (const dir of projectDirs) {
    const indexPath = join(PROJECTS_DIR, dir, 'sessions-index.json');
    if (!existsSync(indexPath)) continue;
    try {
      const content = readFileSync(indexPath, 'utf-8');
      const data = JSON.parse(content);
      if (data && Array.isArray(data.entries)) {
        for (const entry of data.entries) {
          if (entry.sessionId && entry.fullPath) {
            totalEntries++;
            if (existsSync(entry.fullPath)) {
              existingEntries++;
            } else {
              missingEntries++;
            }
          }
        }
      }
    } catch {}
  }
});

// 6. syncTranscripts (including getLastAssistantMessage)
const transcriptTimes: { sessionId: string; ms: number; fileSize: number; lines: number }[] = [];
const { ms: syncTranscriptsMs } = measure('syncTranscripts', () => {
  for (const session of sessions) {
    if (session.status === 'stopped') continue;

    const transcriptPath = getTranscriptPath(
      session.session_id,
      session.initial_cwd ?? session.cwd
    );
    if (!transcriptPath) continue;

    const tStart = performance.now();
    getLastAssistantMessage(transcriptPath);
    const tMs = performance.now() - tStart;

    let fileSize = 0;
    let lines = 0;
    try {
      fileSize = statSync(transcriptPath).size;
      const content = readFileSync(transcriptPath, 'utf-8');
      lines = content.split('\n').length;
    } catch {}

    transcriptTimes.push({
      sessionId: session.session_id.slice(0, 12),
      ms: tMs,
      fileSize,
      lines,
    });
  }
});

// 7. Full getSessions()
const { ms: getSessionsFullMs } = measure('getSessions (full)', () => {
  return getSessions();
});

// Print results
console.log('--- Individual timings ---');
console.log(`syncCodexSessionsOnce:    ${codexMs.toFixed(1)}ms`);
console.log(`syncTmuxSessionsOnce:     ${tmuxMs.toFixed(1)}ms`);
console.log(`readStore:                ${readStoreMs.toFixed(1)}ms`);
console.log(`getSessionsFromStore:     ${getSessionsMs.toFixed(1)}ms`);
console.log(`refreshSessionRegistry:   ${registryMs.toFixed(1)}ms`);
console.log(`  total entries:          ${totalEntries}`);
console.log(`  existing:               ${existingEntries}`);
console.log(`  missing (wasted):       ${missingEntries}`);
console.log(`  detail scan time:       ${registryDetailMs.toFixed(1)}ms`);
console.log(`syncTranscripts:          ${syncTranscriptsMs.toFixed(1)}ms`);
console.log(`  sessions processed:     ${sessions.length}`);
console.log(`  transcripts read:       ${transcriptTimes.length}`);

if (transcriptTimes.length > 0) {
  console.log('\n--- Per-transcript timings ---');
  transcriptTimes.sort((a, b) => b.ms - a.ms);
  for (const t of transcriptTimes) {
    const sizeKB = (t.fileSize / 1024).toFixed(0);
    console.log(`  ${t.sessionId}  ${t.ms.toFixed(1)}ms  ${sizeKB}KB  ${t.lines} lines`);
  }
}

console.log(`\n--- Full getSessions() ---`);
console.log(`getSessions (full):       ${getSessionsFullMs.toFixed(1)}ms`);

console.log(`\n--- Total startup estimate ---`);
const totalMs = codexMs + tmuxMs + getSessionsFullMs;
console.log(`Total (codex + tmux + getSessions): ${totalMs.toFixed(1)}ms`);
