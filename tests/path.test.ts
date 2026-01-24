import { describe, expect, test } from 'vitest';
import { abbreviateHomePath } from '../src/utils/path.js';

describe('abbreviateHomePath', () => {
  test('should replace home directory with ~', () => {
    expect(abbreviateHomePath('/home/user/projects')).toBe('~/projects');
    expect(abbreviateHomePath('/home/testuser/code/myapp')).toBe('~/code/myapp');
  });

  test('should handle root home directory', () => {
    expect(abbreviateHomePath('/home/user')).toBe('~');
  });

  test('should not replace paths outside home', () => {
    expect(abbreviateHomePath('/var/log')).toBe('/var/log');
    expect(abbreviateHomePath('/tmp/test')).toBe('/tmp/test');
  });

  test('should return (unknown) for undefined', () => {
    expect(abbreviateHomePath(undefined)).toBe('(unknown)');
  });

  test('should return (unknown) for empty string', () => {
    expect(abbreviateHomePath('')).toBe('(unknown)');
  });
});
