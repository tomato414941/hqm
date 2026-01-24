import { Box, Text } from 'ink';
import type React from 'react';
import { memo } from 'react';
import type { Session } from '../types/index.js';
import { abbreviateHomePath } from '../utils/path.js';
import { truncatePrompt } from '../utils/prompt.js';
import { getExtendedStatusDisplay } from '../utils/status.js';
import { formatRelativeTime } from '../utils/time.js';
import { Spinner } from './Spinner.js';

interface SessionCardProps {
  session: Session;
  index: number;
  isSelected: boolean;
}

function truncateSessionId(sessionId: string): string {
  return sessionId.slice(0, 8);
}

function truncateMessage(message: string, maxLength = 40): string {
  const normalized = message
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

// Indentation for lines 2-4 to align with content after "> [n] "
const LINE_INDENT = '      ';

function arePropsEqual(prevProps: SessionCardProps, nextProps: SessionCardProps): boolean {
  if (prevProps.isSelected !== nextProps.isSelected) return false;
  if (prevProps.index !== nextProps.index) return false;

  const prev = prevProps.session;
  const next = nextProps.session;

  return (
    prev.session_id === next.session_id &&
    prev.status === next.status &&
    prev.updated_at === next.updated_at &&
    prev.cwd === next.cwd &&
    prev.last_prompt === next.last_prompt &&
    prev.current_tool === next.current_tool &&
    prev.notification_type === next.notification_type &&
    prev.lastMessage === next.lastMessage
  );
}

export const SessionCard = memo(function SessionCard({
  session,
  index,
  isSelected,
}: SessionCardProps): React.ReactElement {
  const { symbol, color, label } = getExtendedStatusDisplay(session);
  const dir = abbreviateHomePath(session.cwd);
  const relativeTime = formatRelativeTime(session.updated_at);
  const isRunning = session.status === 'running';
  const prompt = session.last_prompt ? truncatePrompt(session.last_prompt) : undefined;
  const lastMessage = session.lastMessage ? truncateMessage(session.lastMessage) : undefined;
  const shortId = truncateSessionId(session.session_id);

  return (
    <Box flexDirection="column">
      {/* Line 1: Status, time, session ID */}
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
        <Text color="gray">#{shortId}</Text>
      </Box>
      {/* Line 2: Directory */}
      <Box paddingX={1}>
        <Text>{LINE_INDENT}</Text>
        <Text color={isSelected ? 'white' : 'gray'}>{dir}</Text>
      </Box>
      {/* Line 3: Prompt → Response */}
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
