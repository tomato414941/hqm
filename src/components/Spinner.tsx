import { Text } from 'ink';
import type React from 'react';
import { useSyncExternalStore } from 'react';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const FRAME_INTERVAL_MS = 120; // Slightly slower for less CPU usage

// Shared global spinner state - only ONE timer for all spinners
let globalFrame = 0;
let subscriberCount = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  subscriberCount++;

  // Start timer only when first subscriber joins
  if (subscriberCount === 1 && intervalId === null) {
    intervalId = setInterval(() => {
      globalFrame = (globalFrame + 1) % SPINNER_FRAMES.length;
      for (const listener of listeners) {
        listener();
      }
    }, FRAME_INTERVAL_MS);
  }

  return () => {
    listeners.delete(callback);
    subscriberCount--;

    // Stop timer when last subscriber leaves
    if (subscriberCount === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot(): number {
  return globalFrame;
}

interface SpinnerProps {
  color?: string;
}

export function Spinner({ color = 'green' }: SpinnerProps): React.ReactElement {
  const frame = useSyncExternalStore(subscribe, getSnapshot);

  return <Text color={color}>{SPINNER_FRAMES[frame]}</Text>;
}
