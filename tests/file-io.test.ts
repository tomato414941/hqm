import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureDir,
  readJsonFile,
  readJsonFileWithErrorHandler,
  writeJsonFile,
} from '../src/utils/file-io.js';

describe('file-io', () => {
  const testDir = join(tmpdir(), 'hqm-test-file-io');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('ensureDir', () => {
    it('should create a directory if it does not exist', () => {
      const newDir = join(testDir, 'new-dir');
      expect(existsSync(newDir)).toBe(false);

      ensureDir(newDir);

      expect(existsSync(newDir)).toBe(true);
    });

    it('should not throw if directory already exists', () => {
      mkdirSync(testDir, { recursive: true });
      expect(existsSync(testDir)).toBe(true);

      expect(() => ensureDir(testDir)).not.toThrow();
    });

    it('should create nested directories', () => {
      const nestedDir = join(testDir, 'a', 'b', 'c');
      expect(existsSync(nestedDir)).toBe(false);

      ensureDir(nestedDir);

      expect(existsSync(nestedDir)).toBe(true);
    });
  });

  describe('readJsonFile', () => {
    it('should return default value if file does not exist', () => {
      const defaultValue = { foo: 'bar' };
      const result = readJsonFile(join(testDir, 'nonexistent.json'), defaultValue);

      expect(result).toEqual(defaultValue);
    });

    it('should return parsed JSON if file exists', () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, 'test.json');
      const data = { name: 'test', value: 123 };
      writeFileSync(filePath, JSON.stringify(data));

      const result = readJsonFile(filePath, {});

      expect(result).toEqual(data);
    });

    it('should return default value if file contains invalid JSON', () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, 'invalid.json');
      writeFileSync(filePath, 'not valid json {{{');

      const defaultValue = { default: true };
      const result = readJsonFile(filePath, defaultValue);

      expect(result).toEqual(defaultValue);
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON to file', () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, 'output.json');
      const data = { key: 'value', num: 42 };

      writeJsonFile(filePath, data);

      expect(existsSync(filePath)).toBe(true);
      const content = readJsonFile(filePath, {});
      expect(content).toEqual(data);
    });

    it('should overwrite existing file', () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, 'overwrite.json');
      writeFileSync(filePath, JSON.stringify({ old: 'data' }));

      writeJsonFile(filePath, { new: 'data' });

      const content = readJsonFile(filePath, {});
      expect(content).toEqual({ new: 'data' });
    });
  });

  describe('readJsonFileWithErrorHandler', () => {
    it('should return default value if file does not exist', () => {
      const errorHandler = vi.fn();
      const defaultValue = { foo: 'bar' };
      const result = readJsonFileWithErrorHandler(
        join(testDir, 'nonexistent.json'),
        defaultValue,
        errorHandler
      );

      expect(result).toEqual(defaultValue);
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should return parsed JSON if file exists', () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, 'test.json');
      const data = { name: 'test' };
      writeFileSync(filePath, JSON.stringify(data));

      const errorHandler = vi.fn();
      const result = readJsonFileWithErrorHandler(filePath, {}, errorHandler);

      expect(result).toEqual(data);
      expect(errorHandler).not.toHaveBeenCalled();
    });

    it('should call error handler and return default if JSON is invalid', () => {
      mkdirSync(testDir, { recursive: true });
      const filePath = join(testDir, 'invalid.json');
      writeFileSync(filePath, 'invalid json');

      const errorHandler = vi.fn();
      const defaultValue = { default: true };
      const result = readJsonFileWithErrorHandler(filePath, defaultValue, errorHandler);

      expect(result).toEqual(defaultValue);
      expect(errorHandler).toHaveBeenCalledOnce();
      expect(errorHandler.mock.calls[0][0]).toBeInstanceOf(SyntaxError);
    });
  });
});
