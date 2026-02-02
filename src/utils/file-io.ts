import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(path: string, mode = 0o700): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode });
  }
}

/**
 * Read and parse a JSON file, returning a default value on error
 */
export function readJsonFile<T>(path: string, defaultValue: T): T {
  if (!existsSync(path)) {
    return defaultValue;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

/**
 * Write data to a JSON file with secure permissions
 */
export function writeJsonFile(path: string, data: unknown, mode = 0o600): void {
  writeFileSync(path, JSON.stringify(data, null, 2), {
    encoding: 'utf-8',
    mode,
  });
}

/**
 * Read and parse a JSON file, calling onError if parsing fails
 */
export function readJsonFileWithErrorHandler<T>(
  path: string,
  defaultValue: T,
  onError: (error: unknown) => void
): T {
  if (!existsSync(path)) {
    return defaultValue;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    onError(error);
    return defaultValue;
  }
}
