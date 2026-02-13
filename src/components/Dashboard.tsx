import { Box, Text, useApp } from 'ink';
import type React from 'react';
import { QR_PANEL_MARGIN_LEFT, QR_PANEL_PADDING_X } from '../constants.js';
import { clearAll, clearProjects, clearSessions, removeSession } from '../store/file-store.js';
import { ConfirmModal, ProjectAssignModal, ProjectManageModal } from './dashboard/index.js';
import type { DashboardDisplayRow } from './dashboard/types.js';
import { useDashboardInput } from './dashboard/useDashboardInput.js';
import { useDashboardState } from './dashboard/useDashboardState.js';
import { SessionCard } from './SessionCard.js';

interface DashboardProps {
  showQR?: boolean;
  showUrl?: boolean;
}

interface DisplayOrderRendererProps {
  rows: DashboardDisplayRow[];
  viewportStart: number;
  maxVisibleSessions: number;
  displayOrderLength: number;
  terminalColumns: number;
}

function DisplayOrderRenderer({
  rows,
  viewportStart,
  maxVisibleSessions,
  displayOrderLength,
  terminalColumns,
}: DisplayOrderRendererProps): React.ReactElement {
  return (
    <>
      {viewportStart > 0 && <Text dimColor> ^ {viewportStart} more</Text>}

      {rows.map((row) =>
        row.type === 'project-header' ? (
          <Text key={row.key} color="magenta" bold>
            [{row.projectName}]
          </Text>
        ) : (
          <Box key={row.key} paddingLeft={1}>
            <SessionCard
              session={row.session}
              index={row.sessionIndex}
              isSelected={row.isSelected}
              terminalColumns={terminalColumns}
            />
          </Box>
        )
      )}

      {viewportStart + maxVisibleSessions < displayOrderLength && (
        <Text dimColor> v {displayOrderLength - viewportStart - maxVisibleSessions} more</Text>
      )}
    </>
  );
}

export function Dashboard({
  showQR: showQRProp = true,
  showUrl: showUrlProp = true,
}: DashboardProps) {
  const { exit } = useApp();
  const state = useDashboardState({ showQR: showQRProp, showUrl: showUrlProp });

  useDashboardInput({
    inputMode: state.inputMode,
    projects: state.projects,
    displayOrder: state.displayOrder,
    selectedIndex: state.selectedIndex,
    selectedProjectIndex: state.selectedProjectIndex,
    selectedAssignIndex: state.selectedAssignIndex,
    setInputMode: state.setInputMode,
    setProjectName: state.setProjectName,
    setSelectedProjectId: state.setSelectedProjectId,
    setSelectedAssignIndex: state.setSelectedAssignIndex,
    setSelectedSessionKey: state.setSelectedSessionKey,
    focusSessionByIndex: state.focusSessionByIndex,
    handleReorderProject: state.handleReorderProject,
    handleReorderSession: state.handleReorderSession,
    handleAssignProject: state.handleAssignProject,
    handleDeleteProject: state.handleDeleteProject,
    handleNewSession: state.handleNewSession,
    handleQuickSelect: state.handleQuickSelect,
    clearSessions,
    clearAll,
    clearProjects,
    removeSession,
    exit,
  });

  if (state.loading) {
    return <Text dimColor>Loading...</Text>;
  }

  if (state.error) {
    return <Text color="red">Error: {state.error.message}</Text>;
  }

  const { running, waiting_input: waitingInput, stopped } = state.statusCounts;

  if (state.inputMode === 'manageProjects' || state.inputMode === 'createProjectInManage') {
    return (
      <ProjectManageModal
        projects={state.projects}
        selectedProjectIndex={state.selectedProjectIndex}
        projectName={state.projectName}
        isCreating={state.inputMode === 'createProjectInManage'}
        onProjectNameChange={state.setProjectName}
        onCreateProject={state.handleCreateProject}
      />
    );
  }

  if (state.inputMode === 'assignProject') {
    return (
      <ProjectAssignModal
        projects={state.projects}
        selectedAssignIndex={state.selectedAssignIndex}
      />
    );
  }

  if (state.inputMode === 'confirmClearSessions') {
    return <ConfirmModal title="Clear Sessions" message="Clear all sessions from hqm?" />;
  }

  if (state.inputMode === 'confirmClearAll') {
    return <ConfirmModal title="Clear All" message="Clear all sessions and delete all projects?" />;
  }

  if (state.inputMode === 'confirmClearProjects') {
    return (
      <ConfirmModal
        title="Clear Projects"
        message="Delete all projects? (sessions will be moved to ungrouped)"
      />
    );
  }

  if (state.inputMode === 'confirmDeleteProject') {
    const projectToDelete = state.projects[state.selectedProjectIndex];
    return (
      <ConfirmModal
        title="Delete Project"
        message={`Delete project "${projectToDelete?.name || ''}"?`}
      />
    );
  }

  return (
    <Box flexDirection="row" minHeight={Math.min(state.minHeight, state.terminalHeight - 2)}>
      <Box flexDirection="column" flexGrow={1}>
        <Box borderStyle="round" borderColor="cyan" paddingX={1}>
          <Text bold color="cyan">
            HQM
          </Text>
          <Text dimColor> | </Text>
          <Text color="green">* {running}</Text>
          <Text dimColor> </Text>
          <Text color="yellow">o {waitingInput}</Text>
          <Text dimColor> </Text>
          <Text color="cyan">v {stopped}</Text>
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="gray"
          marginTop={1}
          paddingX={1}
          paddingY={0}
        >
          {state.displayOrder.length === 0 ? (
            <Box paddingY={1}>
              <Text dimColor>No active sessions</Text>
            </Box>
          ) : (
            <DisplayOrderRenderer
              rows={state.displayRows}
              viewportStart={state.viewportStart}
              maxVisibleSessions={state.maxVisibleSessions}
              displayOrderLength={state.displayOrder.length}
              terminalColumns={state.sessionListWidth}
            />
          )}
        </Box>

        <Box marginTop={1} justifyContent="center" gap={1}>
          <Text dimColor>[↑↓]Select</Text>
          <Text dimColor>[j/k]Move</Text>
          <Text dimColor>[Enter]Focus</Text>
          <Text dimColor>[p]Project</Text>
          <Text dimColor>[a]Assign</Text>
          <Text dimColor>[n]Claude [N]Codex</Text>
          <Text dimColor>[q]Quit</Text>
        </Box>

        {state.showUrlText && (
          <Box justifyContent="center" marginTop={1}>
            <Text dimColor>Mobile: {state.url}</Text>
          </Box>
        )}
      </Box>

      {state.showQR && (
        <Box
          flexDirection="column"
          marginLeft={QR_PANEL_MARGIN_LEFT}
          borderStyle="round"
          borderColor="gray"
          paddingX={QR_PANEL_PADDING_X}
          minWidth={state.qrPanelWidth}
        >
          <Text bold dimColor>
            Mobile
          </Text>
          <Box marginTop={1}>
            <Text>{state.qrCode}</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
