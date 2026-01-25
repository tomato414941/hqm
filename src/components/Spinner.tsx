import { Text } from 'ink';
import type React from 'react';
import { memo } from 'react';

interface SpinnerProps {
  color?: string;
}

// Static indicator for stability on slow/remote connections
export const Spinner = memo(function Spinner({
  color = 'green',
}: SpinnerProps): React.ReactElement {
  return <Text color={color}>●</Text>;
});
