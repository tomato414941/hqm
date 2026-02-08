import * as readline from 'node:readline';
import { truncateText } from './text.js';

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
 * @param prompt - The prompt to truncate
 * @param maxLength - Maximum length (default: 50)
 * @returns Truncated prompt with ellipsis if needed
 */
export function truncatePrompt(prompt: string, maxLength = 50): string {
  return truncateText(prompt, maxLength);
}
