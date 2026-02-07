import { isDaemonRunning, sendToDaemon } from '../server/daemon-client.js';
import { flushPendingWrites, updateSession } from '../store/file-store.js';
import type { HookEvent } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { endPerf, startPerf } from '../utils/perf.js';
import { isNonEmptyString, isValidHookEventName, VALID_HOOK_EVENTS } from '../utils/type-guards.js';

// Re-export for backward compatibility
export { VALID_HOOK_EVENTS, isNonEmptyString, isValidHookEventName };

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
  const optionalStringFields = ['cwd', 'notification_type', 'prompt', 'tool_name', 'source'];
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
    source: hookPayload.source as HookEvent['source'],
  };

  // Prefer sending to daemon via socket (single writer) with fallback to direct write
  if (isDaemonRunning()) {
    try {
      const response = await sendToDaemon({ type: 'hookEvent', payload: event });
      if (response.ok) {
        endPerf(span, { bytes: inputJson.length, via: 'daemon' });
        logger.flush();
        return;
      }
    } catch {
      // Daemon unreachable - fall through to direct write
    }
  }

  updateSession(event);
  await flushPendingWrites();
  endPerf(span, { bytes: inputJson.length, via: 'direct' });
  logger.flush();
}
