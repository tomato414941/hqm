/**
 * Abbreviate home directory path to ~
 * e.g., /home/user/projects -> ~/projects
 */
export function abbreviateHomePath(path: string | undefined): string {
  if (!path) return '(unknown)';
  return path.replace(/^\/home\/[^/]+/, '~');
}
