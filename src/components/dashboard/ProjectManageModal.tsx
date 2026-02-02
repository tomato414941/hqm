import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import type React from 'react';
import type { Project } from '../../types/index.js';

interface ProjectManageModalProps {
  projects: Project[];
  selectedProjectIndex: number;
  projectName: string;
  isCreating: boolean;
  onProjectNameChange: (value: string) => void;
  onCreateProject: () => void;
}

export function ProjectManageModal({
  projects,
  selectedProjectIndex,
  projectName,
  isCreating,
  onProjectNameChange,
  onCreateProject,
}: ProjectManageModalProps): React.ReactElement {
  if (isCreating) {
    return (
      <Box flexDirection="column">
        <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
          <Text bold color="cyan">
            New Project
          </Text>
          <Box marginTop={1}>
            <Text>Name: </Text>
            <TextInput
              value={projectName}
              onChange={onProjectNameChange}
              onSubmit={onCreateProject}
            />
          </Box>
          <Box marginTop={1}>
            <Text dimColor>[Enter] Create [Esc] Cancel</Text>
          </Box>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text bold color="cyan">
          Manage Projects
        </Text>
        <Box marginTop={1} flexDirection="column">
          {projects.length === 0 ? (
            <Text dimColor>No projects. Press [n] to create one.</Text>
          ) : (
            projects.map((project, i) => (
              <Box key={project.id}>
                <Text color={i === selectedProjectIndex ? 'cyan' : undefined}>
                  {i === selectedProjectIndex ? '> ' : '  '}[{i + 1}] {project.name}
                </Text>
              </Box>
            ))
          )}
        </Box>
        <Box marginTop={1}>
          <Text dimColor>[↑↓] Select [j/k] Move [n] New [d] Delete [Esc] Back</Text>
        </Box>
      </Box>
    </Box>
  );
}
