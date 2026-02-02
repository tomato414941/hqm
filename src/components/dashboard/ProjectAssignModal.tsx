import { Box, Text } from 'ink';
import type React from 'react';
import type { Project } from '../../types/index.js';

interface ProjectAssignModalProps {
  projects: Project[];
  selectedAssignIndex: number;
}

export function ProjectAssignModal({
  projects,
  selectedAssignIndex,
}: ProjectAssignModalProps): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1} flexDirection="column">
        <Text bold color="cyan">
          Assign to Project
        </Text>
        <Box marginTop={1} flexDirection="column">
          {projects.map((project, index) => (
            <Box key={project.id}>
              <Text color={selectedAssignIndex === index ? 'cyan' : undefined}>
                {selectedAssignIndex === index ? '> ' : '  '}[{index + 1}] {project.name}
              </Text>
            </Box>
          ))}
          <Box>
            <Text color={selectedAssignIndex === projects.length ? 'cyan' : undefined}>
              {selectedAssignIndex === projects.length ? '> ' : '  '}[0] (none)
            </Text>
          </Box>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>[↑↓] Select [Enter] Confirm [1-9/0] Quick [Esc] Cancel</Text>
        </Box>
      </Box>
    </Box>
  );
}
