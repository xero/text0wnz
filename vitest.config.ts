import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      'node_modules',
      'node_modules/**',
      'tests/e2e/**',
      'dist',
      'dist/**',
    ],
    environment: 'jsdom',
    setupFiles: ['./tests/setup/test-setup.ts'],
    globals: true,
    coverage: {
      enabled: true,
      reporter: ['text', 'html'],
    },
  },
});
