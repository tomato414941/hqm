import { generateSummary, isSummaryEnabled } from '../services/summary.js';
import { flushPendingWrites, updateSession, updateSessionSummary } from '../store/file-store.js';
import type { HookEvent, HookEventName } from '../types/index.js';
import { endPerf, startPerf } from '../utils/perf.js';
import { buildTranscriptPath } from '../utils/transcript.js';

// Allowed hook event names (whitelist)
/** @internal */
export const VALID_HOOK_EVENTS: ReadonlySet<string> = new Set<HookEventName>([
  'PreToolUse',
  'PostToolUse',
  'Notification',
  'Stop',
  'UserPromptSubmit',
]);

/** @internal */
export function isValidHookEventName(name: string): name is HookEventName {
  return VALID_HOOK_EVENTS.has(name);
}

/** @internal */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export async function handleHookEvent(eventName: string, tty?: string): Promise<void> {
  const span = startPerf('handleHookEvent', { hook_event_name: eventName, has_tty: !!tty });
  // Validate event name against whitelist
  if (!isValidHookEventName(eventName)) {
    console.error(`Invalid event name: ${eventName}`);
    process.exit(1);
  }

  // Read JSON from stdin
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  const inputJson = Buffer.concat(chunks).toString('utf-8');

  let hookPayload: Record<string, unknown>;
  try {
    hookPayload = JSON.parse(inputJson);
  } catch {
    console.error('Invalid JSON input');
    process.exit(1);
  }

  // Validate required fields
  if (!isNonEmptyString(hookPayload.session_id)) {
    console.error('Invalid or missing session_id');
    process.exit(1);
  }

  // Validate optional string fields
  const optionalStringFields = ['cwd', 'notification_type', 'prompt', 'tool_name'];
  for (const field of optionalStringFields) {
    if (hookPayload[field] !== undefined && typeof hookPayload[field] !== 'string') {
      console.error(`Invalid ${field}: must be a string`);
      process.exit(1);
    }
  }

  const cwd = (hookPayload.cwd as string) || process.cwd();
  const event: HookEvent = {
    session_id: hookPayload.session_id,
    cwd,
    tty,
    hook_event_name: eventName,
    notification_type: hookPayload.notification_type as string | undefined,
    prompt: hookPayload.prompt as string | undefined,
    tool_name: hookPayload.tool_name as string | undefined,
  };

  const session = updateSession(event);

  // Generate summary on Stop event if enabled
  if (eventName === 'Stop' && isSummaryEnabled()) {
    try {
      const initialCwd = session.initial_cwd ?? session.cwd;
      const transcriptPath = buildTranscriptPath(initialCwd, session.session_id);
      const result = await generateSummary(transcriptPath);
      if (result?.summary) {
        updateSessionSummary(event.session_id, event.tty, result.summary);
      }
    } catch (err) {
      // Summary generation failure should not block the hook
      console.error('[hqm] Summary generation failed:', err);
    }
  }

  // Ensure data is written before process exits (hooks are short-lived processes)
  await flushPendingWrites();
  endPerf(span, { bytes: inputJson.length });
}
