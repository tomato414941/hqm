import { Box, Text } from 'ink';
import type React from 'react';

interface ConfirmModalProps {
  title: string;
  message: string;
}

export function ConfirmModal({ title, message }: ConfirmModalProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="red" paddingX={1} flexDirection="column">
        <Text bold color="red">
          {title}
        </Text>
        <Box marginTop={1}>
          <Text>{message}</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>[y] Yes [n/Esc] No</Text>
        </Box>
      </Box>
    </Box>
  );
}
