/**
 * Parse an ISO timestamp string safely
 * Returns the timestamp in milliseconds, or null if parsing fails
 */
export function parseISOTimestamp(timestamp: string | undefined): number | null {
  if (!timestamp) {
    return null;
  }

  try {
    const ms = new Date(timestamp).getTime();
    // Check for invalid date (NaN)
    if (Number.isNaN(ms)) {
      return null;
    }
    return ms;
  } catch {
    return null;
  }
}

/**
 * Format a timestamp as relative time (e.g., "5s ago", "2m ago", "1h ago")
 */
export function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diffMs = now - then;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  // Check from largest to smallest unit (use the first matching unit)
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  if (seconds >= 0) return `${seconds}s ago`;
  return 'now';
}
