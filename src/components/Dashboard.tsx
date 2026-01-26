import { Box, Text, useApp, useInput } from 'ink';
import type React from 'react';
import { useMemo, useState } from 'react';
import { useServer } from '../hooks/useServer.js';
import { useSessions } from '../hooks/useSessions.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { clearSessions, removeSession } from '../store/file-store.js';
import { debugLog } from '../utils/debug.js';
import { createNewSession, focusSession } from '../utils/focus.js';
import { SessionCard } from './SessionCard.js';

const QUICK_SELECT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const MIN_HEIGHT_FOR_QR = 30;
const MIN_WIDTH_FOR_QR = 80;

const getViewportStart = (
  selectedIndex: number,
  totalSessions: number,
  maxVisible: number
): number => {
  if (totalSessions <= maxVisible) return 0;

  // Keep selected item near center
  const halfVisible = Math.floor(maxVisible / 2);
  let start = selectedIndex - halfVisible;

  // Clamp to valid range
  start = Math.max(0, start);
  start = Math.min(totalSessions - maxVisible, start);

  return start;
};

interface DashboardProps {
  showQR?: boolean;
  showUrl?: boolean;
}

export function Dashboard({
  showQR: showQRProp = true,
  showUrl: showUrlProp = true,
}: DashboardProps): React.ReactElement {
  const { sessions, loading, error } = useSessions();
  const { qrCode, url, loading: serverLoading } = useServer();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();
  const { rows: terminalHeight, columns: terminalWidth } = useTerminalSize();
  const showQR =
    showQRProp &&
    showUrlProp &&
    terminalHeight >= MIN_HEIGHT_FOR_QR &&
    terminalWidth >= MIN_WIDTH_FOR_QR &&
    !!qrCode;
  const showUrlText = showUrlProp && !showQR && url && !serverLoading;

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
    if (input === 'd') {
      const session = sessions[selectedIndex];
      if (session) {
        removeSession(session.session_id, session.tty);
        setSelectedIndex(Math.max(0, selectedIndex - 1));
      }
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

  // Fixed height for stable rendering on remote terminals
  const maxSessions = 9;
  const headerHeight = 3; // Header box
  const footerHeight = 2; // Footer help text
  const sessionHeight = 3; // Each session card (approximate)
  const minHeight = headerHeight + footerHeight + maxSessions * sessionHeight;

  // Calculate visible sessions based on terminal height
  const availableHeight = terminalHeight - headerHeight - footerHeight;
  const maxVisibleSessions = Math.max(1, Math.floor(availableHeight / sessionHeight));
  const viewportStart = getViewportStart(selectedIndex, sessions.length, maxVisibleSessions);
  const visibleSessions = sessions.slice(viewportStart, viewportStart + maxVisibleSessions);

  return (
    <Box flexDirection="row" minHeight={Math.min(minHeight, terminalHeight - 2)}>
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
            <>
              {viewportStart > 0 && <Text dimColor> ↑ {viewportStart} more</Text>}
              {visibleSessions.map((session, i) => {
                const actualIndex = viewportStart + i;
                return (
                  <SessionCard
                    key={`${session.session_id}:${session.tty || ''}`}
                    session={session}
                    index={actualIndex}
                    isSelected={actualIndex === selectedIndex}
                  />
                );
              })}
              {viewportStart + maxVisibleSessions < sessions.length && (
                <Text dimColor> ↓ {sessions.length - viewportStart - maxVisibleSessions} more</Text>
              )}
            </>
          )}
        </Box>

        <Box marginTop={1} justifyContent="center" gap={1}>
          <Text dimColor>[↑↓]Select</Text>
          <Text dimColor>[Enter]Focus</Text>
          <Text dimColor>[1-9]Quick</Text>
          <Text dimColor>[n]New</Text>
          <Text dimColor>[d]Delete</Text>
          <Text dimColor>[c]Clear</Text>
          <Text dimColor>[q]Quit</Text>
        </Box>

        {showUrlText && (
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
