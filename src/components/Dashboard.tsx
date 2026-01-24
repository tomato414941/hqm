import { Box, Text, useApp, useInput, useStdout } from 'ink';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useServer } from '../hooks/useServer.js';
import { useSessions } from '../hooks/useSessions.js';
import { clearSessions } from '../store/file-store.js';
import { debugLog } from '../utils/debug.js';
import { createNewSession, focusSession } from '../utils/focus.js';
import { SessionCard } from './SessionCard.js';

const QUICK_SELECT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MIN_HEIGHT_FOR_QR = 30;
const MIN_WIDTH_FOR_QR = 80;

interface DashboardProps {
  showQR?: boolean;
}

export function Dashboard({ showQR: showQRProp = true }: DashboardProps): React.ReactElement {
  const { sessions, loading, error } = useSessions();
  const { qrCode, url, loading: serverLoading } = useServer();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();
  const { stdout } = useStdout();

  const terminalHeight = stdout?.rows ?? 0;
  const terminalWidth = stdout?.columns ?? 0;
  const showQR =
    showQRProp && terminalHeight >= MIN_HEIGHT_FOR_QR && terminalWidth >= MIN_WIDTH_FOR_QR && !!qrCode;

  const focusSessionByIndex = (index: number) => {
    const session = sessions[index];
    if (session?.tty) {
      focusSession(session.tty);
    }
  };

  const handleQuickSelect = (input: string) => {
    const index = parseInt(input, 10) - 1;
    if (index < sessions.length) {
      setSelectedIndex(index);
      focusSessionByIndex(index);
    }
  };

  const statusCounts = useMemo(
    () =>
      sessions.reduce(
        (counts, session) => {
          counts[session.status]++;
          return counts;
        },
        { running: 0, waiting_input: 0, stopped: 0 }
      ),
    [sessions]
  );

  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      debugLog(`'q' key pressed (input=${input}, escape=${key.escape})`);
      debugLog('Calling exit()');
      exit();
      debugLog('exit() called, returning from useInput handler');
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIndex((prev) => Math.min(sessions.length - 1, prev + 1));
      return;
    }
    if (key.return || input === 'f') {
      focusSessionByIndex(selectedIndex);
      return;
    }
    if (QUICK_SELECT_KEYS.includes(input)) {
      handleQuickSelect(input);
      return;
    }
    if (input === 'c') {
      clearSessions();
      setSelectedIndex(0);
      return;
    }
    if (input === 'n') {
      createNewSession();
      return;
    }
  });

  if (loading) {
    return <Text dimColor>Loading...</Text>;
  }

  if (error) {
    return <Text color="red">Error: {error.message}</Text>;
  }

  const { running, waiting_input: waitingInput, stopped } = statusCounts;

  return (
    <Box flexDirection="row">
      <Box flexDirection="column" flexGrow={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">
            HQM
          </Text>
          <Text dimColor> │ </Text>
          <Text color="green">● {running}</Text>
          <Text dimColor> </Text>
          <Text color="yellow">◐ {waitingInput}</Text>
          <Text dimColor> </Text>
          <Text color="cyan">✓ {stopped}</Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          marginTop={1}
          paddingX={1}
          paddingY={0}
        >
          {sessions.length === 0 ? (
            <Box paddingY={1}>
              <Text dimColor>No active sessions</Text>
            </Box>
          ) : (
            sessions.map((session, index) => (
              <SessionCard
                key={`${session.session_id}:${session.tty || ''}`}
                session={session}
                index={index}
                isSelected={index === selectedIndex}
              />
            ))
          )}
        </Box>

        <Box marginTop={1} justifyContent="center" gap={1}>
          <Text dimColor>[↑↓]Select</Text>
          <Text dimColor>[Enter]Focus</Text>
          <Text dimColor>[1-9]Quick</Text>
          <Text dimColor>[n]New</Text>
          <Text dimColor>[c]Clear</Text>
          <Text dimColor>[q]Quit</Text>
        </Box>

        {!showQR && url && !serverLoading && (
          <Box justifyContent="center" marginTop={1}>
            <Text dimColor>📱 {url}</Text>
          </Box>
        )}
      </Box>

      {showQR && (
        <Box
          flexDirection="column"
          marginLeft={2}
          borderStyle="round"
          borderColor="gray"
          paddingX={1}
        >
          <Text bold dimColor>
            Mobile
          </Text>
          <Box marginTop={1}>
            <Text>{qrCode}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
