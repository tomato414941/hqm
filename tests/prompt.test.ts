import { describe, expect, it } from 'vitest';
import { truncatePrompt } from '../src/utils/cli-prompt.js';

describe('prompt', () => {
  describe('truncatePrompt', () => {
    it('returns original prompt if shorter than maxLength', () => {
      const result = truncatePrompt('Hello world', 50);
      expect(result).toBe('Hello world');
    });

    it('truncates prompt with ellipsis if longer than maxLength', () => {
      const longPrompt = 'This is a very long prompt that should be truncated';
      const result = truncatePrompt(longPrompt, 20);
      expect(result).toBe('This is a very long…');
      expect(result.length).toBe(20);
    });

    it('replaces newlines with spaces', () => {
      const result = truncatePrompt('Line one\nLine two\r\nLine three', 50);
      expect(result).toBe('Line one Line two Line three');
    });

    it('collapses multiple spaces into single space', () => {
      const result = truncatePrompt('Multiple    spaces   here', 50);
      expect(result).toBe('Multiple spaces here');
    });

    it('trims whitespace from start and end', () => {
      const result = truncatePrompt('  trimmed  ', 50);
      expect(result).toBe('trimmed');
    });

    it('uses default maxLength of 50', () => {
      const longPrompt = 'a'.repeat(60);
      const result = truncatePrompt(longPrompt);
      expect(result.length).toBe(50);
      expect(result.endsWith('…')).toBe(true);
    });

    it('handles empty string', () => {
      const result = truncatePrompt('', 50);
      expect(result).toBe('');
    });

    it('handles exact maxLength', () => {
      const prompt = 'a'.repeat(50);
      const result = truncatePrompt(prompt, 50);
      expect(result).toBe(prompt);
      expect(result.length).toBe(50);
    });
  });
});
