import * as readline from 'node:readline';

/**
 * Ask for user confirmation with Y/n prompt
 * @param message - The message to display
 * @returns true if user confirms (Enter, 'y', or 'yes'), false otherwise
 */
export async function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [Y/n]: `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      // Accept: Enter only, 'y', or 'yes'
      resolve(normalized === '' || normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Truncate a prompt string for display in session list
 * Replaces newlines with spaces and truncates to maxLength
 * @param prompt - The prompt to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated prompt with ellipsis if needed
 */
export function truncatePrompt(prompt: string, maxLength: number = 50): string {
  // Replace newlines and multiple spaces with single space
  const normalized = prompt
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}…`;
}
