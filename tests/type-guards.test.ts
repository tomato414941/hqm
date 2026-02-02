import { describe, expect, it } from 'vitest';
import {
  isNonEmptyString,
  isObject,
  isValidHookEventName,
  isValidHookPayload,
  isValidStoreData,
  VALID_HOOK_EVENTS,
} from '../src/utils/type-guards.js';

describe('type-guards', () => {
  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true);
      expect(isNonEmptyString('a')).toBe(true);
      expect(isNonEmptyString(' ')).toBe(true);
    });

    it('should return false for empty strings', () => {
      expect(isNonEmptyString('')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isNonEmptyString(null)).toBe(false);
      expect(isNonEmptyString(undefined)).toBe(false);
      expect(isNonEmptyString(123)).toBe(false);
      expect(isNonEmptyString([])).toBe(false);
      expect(isNonEmptyString({})).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for plain objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
    });

    it('should return false for null', () => {
      expect(isObject(null)).toBe(false);
    });

    it('should return false for arrays', () => {
      expect(isObject([])).toBe(false);
      expect(isObject([1, 2, 3])).toBe(false);
    });

    it('should return false for primitives', () => {
      expect(isObject('string')).toBe(false);
      expect(isObject(123)).toBe(false);
      expect(isObject(true)).toBe(false);
      expect(isObject(undefined)).toBe(false);
    });
  });

  describe('VALID_HOOK_EVENTS', () => {
    it('should contain all expected hook events', () => {
      expect(VALID_HOOK_EVENTS.has('PreToolUse')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('PostToolUse')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('Notification')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('Stop')).toBe(true);
      expect(VALID_HOOK_EVENTS.has('UserPromptSubmit')).toBe(true);
    });

    it('should not contain invalid events', () => {
      expect(VALID_HOOK_EVENTS.has('InvalidEvent')).toBe(false);
    });
  });

  describe('isValidHookEventName', () => {
    it('should return true for valid hook event names', () => {
      expect(isValidHookEventName('PreToolUse')).toBe(true);
      expect(isValidHookEventName('PostToolUse')).toBe(true);
      expect(isValidHookEventName('Notification')).toBe(true);
      expect(isValidHookEventName('Stop')).toBe(true);
      expect(isValidHookEventName('UserPromptSubmit')).toBe(true);
    });

    it('should return false for invalid hook event names', () => {
      expect(isValidHookEventName('Invalid')).toBe(false);
      expect(isValidHookEventName('')).toBe(false);
      expect(isValidHookEventName('pretooluse')).toBe(false);
    });
  });

  describe('isValidStoreData', () => {
    it('should return true for valid store data', () => {
      expect(
        isValidStoreData({
          sessions: {},
          updated_at: '2024-01-01T00:00:00.000Z',
        })
      ).toBe(true);

      expect(
        isValidStoreData({
          sessions: { session1: {} },
          projects: {},
          displayOrder: [],
          updated_at: '2024-01-01T00:00:00.000Z',
        })
      ).toBe(true);
    });

    it('should return false for invalid store data', () => {
      expect(isValidStoreData(null)).toBe(false);
      expect(isValidStoreData(undefined)).toBe(false);
      expect(isValidStoreData({})).toBe(false);
      expect(isValidStoreData({ sessions: {} })).toBe(false);
      expect(isValidStoreData({ updated_at: '2024-01-01' })).toBe(false);
      expect(isValidStoreData({ sessions: null, updated_at: '2024-01-01' })).toBe(false);
      expect(isValidStoreData({ sessions: 'invalid', updated_at: '2024-01-01' })).toBe(false);
      expect(isValidStoreData({ sessions: {}, updated_at: 123 })).toBe(false);
    });
  });

  describe('isValidHookPayload', () => {
    it('should return true for valid hook payloads', () => {
      expect(isValidHookPayload({ session_id: 'abc123' })).toBe(true);
      expect(
        isValidHookPayload({
          session_id: 'abc123',
          cwd: '/home/user',
        })
      ).toBe(true);
      expect(
        isValidHookPayload({
          session_id: 'abc123',
          cwd: '/home/user',
          notification_type: 'error',
          prompt: 'Hello',
          tool_name: 'Bash',
        })
      ).toBe(true);
    });

    it('should return false for missing session_id', () => {
      expect(isValidHookPayload({})).toBe(false);
      expect(isValidHookPayload({ cwd: '/home/user' })).toBe(false);
    });

    it('should return false for empty session_id', () => {
      expect(isValidHookPayload({ session_id: '' })).toBe(false);
    });

    it('should return false for non-string session_id', () => {
      expect(isValidHookPayload({ session_id: 123 })).toBe(false);
      expect(isValidHookPayload({ session_id: null })).toBe(false);
    });

    it('should return false for non-object values', () => {
      expect(isValidHookPayload(null)).toBe(false);
      expect(isValidHookPayload(undefined)).toBe(false);
      expect(isValidHookPayload('string')).toBe(false);
      expect(isValidHookPayload([])).toBe(false);
    });

    it('should return false for invalid optional field types', () => {
      expect(isValidHookPayload({ session_id: 'abc', cwd: 123 })).toBe(false);
      expect(isValidHookPayload({ session_id: 'abc', notification_type: {} })).toBe(false);
      expect(isValidHookPayload({ session_id: 'abc', prompt: [] })).toBe(false);
      expect(isValidHookPayload({ session_id: 'abc', tool_name: true })).toBe(false);
    });
  });
});
