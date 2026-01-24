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

  return (
    <Box flexDirection="column">
      {/* Line 1: Status, time, directory */}
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
        <Text color={isSelected ? 'white' : 'gray'}>{dir}</Text>
      </Box>
      {/* Line 2: Last prompt */}
      {prompt && (
        <Box paddingX={1}>
          <Text> </Text>
          <Text dimColor>「{prompt}」</Text>
        </Box>
      )}
    </Box>
  );
});
