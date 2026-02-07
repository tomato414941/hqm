import { Box, Text } from 'ink';
import type React from 'react';
import { memo } from 'react';
import { CODEX_SESSION_PREFIX } from '../codex/paths.js';
import type { Session } from '../types/index.js';
import { truncatePrompt } from '../utils/cli-prompt.js';
import { abbreviateHomePath } from '../utils/path.js';
import { getExtendedStatusDisplay } from '../utils/status-display.js';
import { truncateText } from '../utils/text.js';
import { formatRelativeTime } from '../utils/time.js';
import { Spinner } from './Spinner.js';

interface SessionCardProps {
  session: Session;
  index: number;
  isSelected: boolean;
  terminalColumns: number;
}

function truncateSessionId(sessionId: string, isCodex: boolean): string {
  const withoutPrefix = sessionId.startsWith(CODEX_SESSION_PREFIX)
    ? sessionId.slice(CODEX_SESSION_PREFIX.length)
    : sessionId.replace(/^tmux-/, '');
  return `${isCodex ? 'X' : 'A'}${withoutPrefix.slice(0, 7)}`;
}

// Indentation for lines 2-4 to align with content after "> [n] "
const LINE_INDENT = '      ';

function arePropsEqual(prevProps: SessionCardProps, nextProps: SessionCardProps): boolean {
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.terminalColumns !== nextProps.terminalColumns) return false;
  // index is only used for display "[n]", no need to trigger re-render

  const prev = prevProps.session;
  const next = nextProps.session;

  return (
    prev.session_id === next.session_id &&
    prev.status === next.status &&
    prev.updated_at === next.updated_at &&
    prev.cwd === next.cwd &&
    prev.agent === next.agent &&
    prev.last_prompt === next.last_prompt &&
    prev.current_tool === next.current_tool &&
    prev.notification_type === next.notification_type &&
    prev.lastMessage === next.lastMessage
  );
}

// Fixed elements width excluding ID label:
// "> [n] " (6) + status (18) + time (9) + padding (2) = 35
const LINE1_BASE_WIDTH = 35;
// Line 2/3 indent: "      " (6) + paddingX (2) = 8
const LINE_INDENT_WIDTH = 8;
const MIN_CONTENT_LENGTH = 20;

export const SessionCard = memo(function SessionCard({
  session,
  index,
  isSelected,
  terminalColumns,
}: SessionCardProps): React.ReactElement {
  const { symbol, color, label } = getExtendedStatusDisplay(session);
  const agent =
    session.agent ?? (session.session_id.startsWith(CODEX_SESSION_PREFIX) ? 'codex' : 'claude');
  const isCodex = agent === 'codex';
  const shortId = truncateSessionId(session.session_id, isCodex);
  const idLabel = isCodex ? '[Codex]' : '[Claude]';
  const idText = `${idLabel} #${shortId}`;
  const line1FixedWidth = LINE1_BASE_WIDTH + idText.length + 1; // +1 for trailing space
  const maxDirLength = Math.max(MIN_CONTENT_LENGTH, terminalColumns - line1FixedWidth);
  const maxLineLength = Math.max(MIN_CONTENT_LENGTH, terminalColumns - LINE_INDENT_WIDTH);
  const dir = truncateText(abbreviateHomePath(session.cwd), maxDirLength);
  const relativeTime = formatRelativeTime(session.updated_at);
  const isRunning = session.status === 'running';

  // Line 2: prompt and lastMessage share the space
  const hasPrompt = !!session.last_prompt;
  const hasLastMessage = !!session.lastMessage;
  const arrowLength = hasPrompt && hasLastMessage ? 3 : 0; // " → " (→ is halfwidth=1 in string-width)
  const bracketLength = hasPrompt ? 4 : 0; // 「」 (each is fullwidth = 2)
  const availableForContent = maxLineLength - arrowLength - bracketLength;
  // Split space: prompt gets 40%, lastMessage gets 60% (lastMessage is usually more important)
  const promptMaxLength = hasLastMessage
    ? Math.floor(availableForContent * 0.4)
    : availableForContent;
  const lastMessageMaxLength = hasPrompt
    ? availableForContent - promptMaxLength
    : availableForContent;
  const prompt = session.last_prompt
    ? truncatePrompt(session.last_prompt, promptMaxLength)
    : undefined;
  const lastMessage = session.lastMessage
    ? truncateText(session.lastMessage, lastMessageMaxLength)
    : undefined;

  return (
    <Box flexDirection="column" minHeight={3}>
      {/* Line 1: Status, time, ID, path */}
      <Box paddingX={1}>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {isSelected ? '>' : ' '} [{index + 1}]
        </Text>
        <Text> </Text>
        <Box width={18}>
          {isRunning ? (
            <>
              <Spinner color="green" />
              <Text color={color}> {label}</Text>
            </>
          ) : (
            <Text color={color}>
              {symbol} {label}
            </Text>
          )}
        </Box>
        <Text> </Text>
        <Text dimColor>{relativeTime.padEnd(8)}</Text>
        <Text color={isCodex ? 'green' : 'yellow'}>{idText} </Text>
        <Text color={isSelected ? 'white' : 'gray'}>{dir}</Text>
      </Box>
      {/* Line 2: Prompt → Response */}
      {(prompt || lastMessage) && (
        <Box paddingX={1}>
          <Text>{LINE_INDENT}</Text>
          {prompt && <Text dimColor>「{prompt}」</Text>}
          {prompt && lastMessage && <Text dimColor> → </Text>}
          {lastMessage && <Text color="gray">{lastMessage}</Text>}
        </Box>
      )}
    </Box>
  );
}, arePropsEqual);
