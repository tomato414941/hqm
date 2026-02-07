/**
 * Detailed Codex benchmark - measures file listing, reading, and parsing
 * Usage: npx tsx scripts/benchmark-codex.ts
 */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { getCodexSessionsDir } from '../src/codex/paths.js';

const sessionsDir = getCodexSessionsDir();
console.log(`Codex sessions dir: ${sessionsDir}`);
console.log(`Exists: ${existsSync(sessionsDir)}\n`);

function listSessionFiles(dir: string, results: string[]): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      listSessionFiles(fullPath, results);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }
}

// Step 1: List files
const t0 = performance.now();
const files: string[] = [];
listSessionFiles(sessionsDir, files);
const listMs = performance.now() - t0;
console.log(`File listing: ${listMs.toFixed(1)}ms (${files.length} files)`);

// Step 2: Read files
const t1 = performance.now();
let totalSize = 0;
let totalLines = 0;
for (const f of files) {
  const content = readFileSync(f, 'utf-8');
  totalSize += content.length;
  const lines = content.split('\n').filter((l) => l.trim()).length;
  totalLines += lines;
}
const readMs = performance.now() - t1;
console.log(`File reading: ${readMs.toFixed(1)}ms (${(totalSize/1024/1024).toFixed(1)}MB, ${totalLines} lines)`);

// Step 3: Parse JSON lines
const t2 = performance.now();
let parsedEntries = 0;
let updateSessionCalls = 0;
let updateLastMessageCalls = 0;
for (const f of files) {
  const content = readFileSync(f, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim());
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      parsedEntries++;
      const type = entry.type;
      const payload = entry.payload || {};
      // Count would-be updateSession calls
      if (type === 'session_meta') updateSessionCalls++;
      if (type === 'event_msg' && payload.type === 'user_message') updateSessionCalls++;
      if (type === 'response_item' && payload.type === 'function_call') updateSessionCalls++;
      if (type === 'response_item' && payload.type === 'function_call_output') updateSessionCalls++;
      // Count would-be updateLastMessage calls
      if (type === 'event_msg' && payload.type === 'agent_message') updateLastMessageCalls++;
      if (type === 'response_item' && payload.type === 'message' && payload.role === 'assistant') updateLastMessageCalls++;
    } catch {}
  }
}
const parseMs = performance.now() - t2;
console.log(`JSON parsing: ${parseMs.toFixed(1)}ms (${parsedEntries} entries)`);
console.log(`  updateSession calls:     ${updateSessionCalls}`);
console.log(`  updateLastMessage calls: ${updateLastMessageCalls}`);

// Step 4: Per-file breakdown
console.log('\n--- Per-file sizes ---');
for (const f of files) {
  const stat = statSync(f);
  const content = readFileSync(f, 'utf-8');
  const lines = content.split('\n').filter((l) => l.trim()).length;
  console.log(`  ${f.replace(sessionsDir + '/', '')} - ${(stat.size/1024).toFixed(0)}KB, ${lines} lines`);
}
