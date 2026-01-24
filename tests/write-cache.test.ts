import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreData } from '../src/types/index.js';

const TEST_STORE_DIR = join(tmpdir(), `hqm-write-cache-test-${process.pid}`);
const TEST_STORE_FILE = join(TEST_STORE_DIR, 'sessions.json');

describe('write-cache', () => {
  beforeEach(async () => {
    vi.resetModules();

    if (existsSync(TEST_STORE_DIR)) {
      rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (existsSync(TEST_STORE_DIR)) {
      rmSync(TEST_STORE_DIR, { recursive: true, force: true });
    }
  });

  describe('initWriteCache', () => {
    it('should initialize store paths', async () => {
      const { initWriteCache, getCachedStore } = await import('../src/store/write-cache.js');

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      // After initialization, cache should be null
      expect(getCachedStore()).toBeNull();
    });
  });

  describe('getCachedStore', () => {
    it('should return null when no data is cached', async () => {
      const { getCachedStore } = await import('../src/store/write-cache.js');

      expect(getCachedStore()).toBeNull();
    });

    it('should return cached data after scheduleWrite', async () => {
      const { initWriteCache, scheduleWrite, getCachedStore, resetStoreCache } = await import(
        '../src/store/write-cache.js'
      );

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      const testData: StoreData = {
        sessions: {},
        updated_at: new Date().toISOString(),
      };

      scheduleWrite(testData);

      expect(getCachedStore()).toBe(testData);

      resetStoreCache();
    });
  });

  describe('scheduleWrite', () => {
    it('should debounce multiple writes', async () => {
      const { initWriteCache, scheduleWrite, getCachedStore, resetStoreCache } = await import(
        '../src/store/write-cache.js'
      );

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      const data1: StoreData = {
        sessions: { a: {} as StoreData['sessions'][string] },
        updated_at: new Date().toISOString(),
      };
      const data2: StoreData = {
        sessions: { b: {} as StoreData['sessions'][string] },
        updated_at: new Date().toISOString(),
      };

      scheduleWrite(data1);
      scheduleWrite(data2);

      // Should have the latest data
      expect(getCachedStore()).toBe(data2);

      resetStoreCache();
    });
  });

  describe('flushPendingWrites', () => {
    it('should do nothing when no write is pending', async () => {
      const { initWriteCache, flushPendingWrites, getCachedStore } = await import(
        '../src/store/write-cache.js'
      );

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      // Should not throw
      await flushPendingWrites();

      expect(getCachedStore()).toBeNull();
    });

    it('should flush pending write to disk', async () => {
      const { initWriteCache, scheduleWrite, flushPendingWrites, getCachedStore } = await import(
        '../src/store/write-cache.js'
      );

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);
      mkdirSync(TEST_STORE_DIR, { recursive: true });

      const testData: StoreData = {
        sessions: {},
        updated_at: new Date().toISOString(),
      };

      scheduleWrite(testData);
      expect(getCachedStore()).not.toBeNull();

      await flushPendingWrites();

      // After flush, cache should be cleared
      expect(getCachedStore()).toBeNull();
      expect(existsSync(TEST_STORE_FILE)).toBe(true);
    });
  });

  describe('resetStoreCache', () => {
    it('should do nothing when no timer is set (else branch line 84-85)', async () => {
      const { initWriteCache, resetStoreCache, getCachedStore } = await import(
        '../src/store/write-cache.js'
      );

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      // Should not throw when called with no pending write
      resetStoreCache();

      expect(getCachedStore()).toBeNull();
    });

    it('should clear timer and cache when write is pending', async () => {
      const { initWriteCache, scheduleWrite, resetStoreCache, getCachedStore } = await import(
        '../src/store/write-cache.js'
      );

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      const testData: StoreData = {
        sessions: {},
        updated_at: new Date().toISOString(),
      };

      scheduleWrite(testData);
      expect(getCachedStore()).not.toBeNull();

      resetStoreCache();

      expect(getCachedStore()).toBeNull();
    });
  });

  describe('flushWriteAsync else branch', () => {
    it('should handle case when cachedStore is null but timer is set', async () => {
      // This tests the edge case where flushWriteAsync is called but cachedStore is null
      // This can happen if resetStoreCache clears cachedStore but not the timer

      const { initWriteCache, scheduleWrite, flushPendingWrites, getCachedStore, resetStoreCache } =
        await import('../src/store/write-cache.js');

      initWriteCache(TEST_STORE_DIR, TEST_STORE_FILE);

      const testData: StoreData = {
        sessions: {},
        updated_at: new Date().toISOString(),
      };

      scheduleWrite(testData);

      // Manually simulate the edge case by flushing twice
      // First flush clears cachedStore, second should hit the else branch
      await flushPendingWrites();
      expect(getCachedStore()).toBeNull();

      // The timer should be null now, so this is a no-op
      await flushPendingWrites();
      expect(getCachedStore()).toBeNull();

      resetStoreCache();
    });
  });
});
