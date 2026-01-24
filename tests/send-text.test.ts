import { describe, expect, it } from 'vitest';
import { validateTextInput } from '../src/utils/send-text.js';

describe('validateTextInput', () => {
  it('returns invalid for empty string', () => {
    const result = validateTextInput('');
    expect(result).toEqual({ valid: false, error: 'Text cannot be empty' });
  });

  it('returns invalid for whitespace only', () => {
    const result = validateTextInput('   ');
    expect(result).toEqual({ valid: false, error: 'Text cannot be empty' });
  });

  it('returns invalid for tabs and newlines only', () => {
    const result = validateTextInput('\t\n\r');
    expect(result).toEqual({ valid: false, error: 'Text cannot be empty' });
  });

  it('returns invalid when text exceeds 10000 characters', () => {
    const longText = 'a'.repeat(10001);
    const result = validateTextInput(longText);
    expect(result).toEqual({
      valid: false,
      error: 'Text exceeds maximum length of 10000 characters',
    });
  });

  it('returns valid for normal text', () => {
    const result = validateTextInput('Hello, world!');
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for exactly 10000 characters (boundary)', () => {
    const boundaryText = 'x'.repeat(10000);
    const result = validateTextInput(boundaryText);
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for text with leading/trailing whitespace', () => {
    const result = validateTextInput('  valid text  ');
    expect(result).toEqual({ valid: true });
  });
});
