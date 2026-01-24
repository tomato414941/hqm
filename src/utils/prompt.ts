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
 * Ask for user input with a prompt
 * @param message - The message to display
 * @param options - Optional settings (mask for password input)
 * @returns The user's input string
 */
export async function askInput(message: string, options?: { mask?: boolean }): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // For masked input (API keys), we need to handle it differently
  if (options?.mask) {
    return new Promise((resolve) => {
      process.stdout.write(`${message}: `);
      let input = '';

      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      stdin.setRawMode(true);
      stdin.resume();

      const onData = (char: Buffer) => {
        const c = char.toString();
        if (c === '\n' || c === '\r') {
          stdin.removeListener('data', onData);
          stdin.setRawMode(wasRaw);
          rl.close();
          process.stdout.write('\n');
          resolve(input);
        } else if (c === '\x7f' || c === '\b') {
          // Backspace
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else if (c === '\x03') {
          // Ctrl+C
          process.exit(0);
        } else {
          input += c;
          process.stdout.write('*');
        }
      };

      stdin.on('data', onData);
    });
  }

  return new Promise((resolve) => {
    rl.question(`${message}: `, (answer) => {
      rl.close();
      resolve(answer.trim());
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
