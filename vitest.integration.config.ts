import {isolatedDatabaseUrl} from './tests/support/database-url';
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    env: {DATABASE_URL:isolatedDatabaseUrl(),INTEGRATION_DATABASE_URL:isolatedDatabaseUrl()},
    globalSetup: ['tests/support/http-setup.ts'],
    fileParallelism: false,
    environment: 'node',
    include: ['tests/integration/**/*.test.ts', 'tests/contracts/**/*.test.ts'],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
