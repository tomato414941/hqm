import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    environment: 'node',
    globals: false,
    pool: 'forks',
    testTimeout: 10000,
    hookTimeout: 10000,
    reporters: ['default'],
    coverage: {
      provider: 'v8',
      enabled: false,
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/bin/**',
        'src/components/**',
        'src/hooks/**',
        'src/index.ts',
        'src/setup/**',
        'src/utils/prompt.ts',
        'src/utils/focus.ts',
      ],
      thresholds: {
        lines: 45,
        functions: 50,
        branches: 50,
        statements: 45,
      },
    },
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
