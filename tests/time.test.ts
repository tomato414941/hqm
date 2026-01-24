import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRelativeTime, parseISOTimestamp } from '../src/utils/time.js';

describe('time', () => {
  describe('parseISOTimestamp', () => {
    it('returns null for undefined', () => {
      expect(parseISOTimestamp(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseISOTimestamp('')).toBeNull();
    });

    it('returns null for invalid date string', () => {
      expect(parseISOTimestamp('not-a-date')).toBeNull();
      expect(parseISOTimestamp('2024-99-99')).toBeNull();
    });

    it('returns timestamp in milliseconds for valid ISO string', () => {
      const timestamp = '2024-01-15T12:00:00Z';
      const expected = new Date(timestamp).getTime();
      expect(parseISOTimestamp(timestamp)).toBe(expected);
    });

    it('returns timestamp for various valid ISO formats', () => {
      const timestamp1 = '2024-01-15T12:00:00.000Z';
      expect(parseISOTimestamp(timestamp1)).toBe(new Date(timestamp1).getTime());

      const timestamp2 = '2024-01-15T12:00:00+09:00';
      expect(parseISOTimestamp(timestamp2)).toBe(new Date(timestamp2).getTime());
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns "0s ago" for current time', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(now);
      expect(formatRelativeTime('2024-01-15T12:00:00Z')).toBe('0s ago');
    });

    it('returns seconds ago for times less than a minute', () => {
      const now = new Date('2024-01-15T12:00:30Z');
      vi.setSystemTime(now);
      expect(formatRelativeTime('2024-01-15T12:00:00Z')).toBe('30s ago');
    });

    it('returns minutes ago for times less than an hour', () => {
      const now = new Date('2024-01-15T12:05:00Z');
      vi.setSystemTime(now);
      expect(formatRelativeTime('2024-01-15T12:00:00Z')).toBe('5m ago');
    });

    it('returns hours ago for times more than an hour', () => {
      const now = new Date('2024-01-15T14:00:00Z');
      vi.setSystemTime(now);
      expect(formatRelativeTime('2024-01-15T12:00:00Z')).toBe('2h ago');
    });

    it('returns "now" for future times', () => {
      const now = new Date('2024-01-15T12:00:00Z');
      vi.setSystemTime(now);
      expect(formatRelativeTime('2024-01-15T12:00:01Z')).toBe('now');
    });
  });
});
