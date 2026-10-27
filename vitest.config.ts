import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // Next preserves JSX for its own compiler; Vitest must transform it for Node.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
