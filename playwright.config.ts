import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    baseURL: 'http://localhost:3000',
    channel: 'chrome', // Use system Chrome
  },
  webServer: {
    command: 'npx serve dist -l 3000',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
