/**
 * Truncate text for display, replacing newlines with spaces.
 * @param text - The text to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength = 50): string {
  const normalized = text
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
