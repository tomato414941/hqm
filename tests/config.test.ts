import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const TEST_CONFIG_DIR = join(tmpdir(), `hqm-config-test-${process.pid}`);

vi.mock('node:os', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:os')>();
  return {
    ...original,
    homedir: () => join(tmpdir(), `hqm-config-test-${process.pid}`),
  };
});

describe('config', () => {
  beforeEach(async () => {
    vi.resetModules();

    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
  });

  describe('readConfig', () => {
    it('should return default config when file does not exist', async () => {
      const { readConfig } = await import('../src/store/config.js');
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(0);
    });

    it('should read config from file', async () => {
      mkdirSync(join(TEST_CONFIG_DIR, '.hqm'), { recursive: true });
      writeFileSync(
        join(TEST_CONFIG_DIR, '.hqm', 'config.json'),
        JSON.stringify({ sessionTimeoutMinutes: 30 }),
        'utf-8'
      );

      const { readConfig } = await import('../src/store/config.js');
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(30);
    });

    it('should return default config when file contains invalid JSON', async () => {
      mkdirSync(join(TEST_CONFIG_DIR, '.hqm'), { recursive: true });
      writeFileSync(join(TEST_CONFIG_DIR, '.hqm', 'config.json'), 'invalid json', 'utf-8');

      const { readConfig } = await import('../src/store/config.js');
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(0);
    });

    it('should merge with defaults for missing fields', async () => {
      mkdirSync(join(TEST_CONFIG_DIR, '.hqm'), { recursive: true });
      writeFileSync(join(TEST_CONFIG_DIR, '.hqm', 'config.json'), JSON.stringify({}), 'utf-8');

      const { readConfig } = await import('../src/store/config.js');
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(0);
    });
  });

  describe('writeConfig', () => {
    it('should write config to file', async () => {
      const { writeConfig, readConfig } = await import('../src/store/config.js');

      writeConfig({ sessionTimeoutMinutes: 60 });
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(60);
    });

    it('should create config directory if it does not exist', async () => {
      const { writeConfig } = await import('../src/store/config.js');

      writeConfig({ sessionTimeoutMinutes: 15 });

      expect(existsSync(join(TEST_CONFIG_DIR, '.hqm'))).toBe(true);
    });
  });

  describe('getSessionTimeoutMs', () => {
    it('should return 0 when timeout is disabled', async () => {
      const { getSessionTimeoutMs } = await import('../src/store/config.js');

      const timeoutMs = getSessionTimeoutMs();

      expect(timeoutMs).toBe(0);
    });

    it('should convert minutes to milliseconds', async () => {
      mkdirSync(join(TEST_CONFIG_DIR, '.hqm'), { recursive: true });
      writeFileSync(
        join(TEST_CONFIG_DIR, '.hqm', 'config.json'),
        JSON.stringify({ sessionTimeoutMinutes: 30 }),
        'utf-8'
      );

      const { getSessionTimeoutMs } = await import('../src/store/config.js');
      const timeoutMs = getSessionTimeoutMs();

      expect(timeoutMs).toBe(30 * 60 * 1000);
    });
  });

  describe('setSessionTimeout', () => {
    it('should set timeout to specified value', async () => {
      const { setSessionTimeout, readConfig } = await import('../src/store/config.js');

      setSessionTimeout(45);
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(45);
    });

    it('should set timeout to 0 to disable', async () => {
      const { setSessionTimeout, readConfig, writeConfig } = await import('../src/store/config.js');

      // First set a non-zero timeout
      writeConfig({ sessionTimeoutMinutes: 30 });

      // Then disable it
      setSessionTimeout(0);
      const config = readConfig();

      expect(config.sessionTimeoutMinutes).toBe(0);
    });
  });

  describe('getConfigPath', () => {
    it('should return config file path', async () => {
      const { getConfigPath } = await import('../src/store/config.js');
      const path = getConfigPath();

      expect(path).toContain('config.json');
      expect(path).toContain('.hqm');
    });
  });
});
