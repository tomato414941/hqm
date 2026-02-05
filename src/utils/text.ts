import cliTruncate from 'cli-truncate';

/**
 * Truncate text for display, replacing newlines with spaces.
 * Uses cli-truncate for proper terminal width calculation (CJK characters, emojis).
 * @param text - The text to truncate
 * @param maxLength - Maximum terminal width (default: 50)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength = 50): string {
  const normalized = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cliTruncate(normalized, maxLength);
}
