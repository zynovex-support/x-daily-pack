import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup/global-setup.ts'],
    include: ['tests/suites/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 30000,
    hookTimeout: 30000,

    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['scripts/**/*.js'],
      exclude: ['scripts/test-*.js'],
      reportsDirectory: './tests/reports/coverage',
    },
  },

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
      '@scripts': path.resolve(__dirname, './scripts'),
      '@config': path.resolve(__dirname, './config'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
});
