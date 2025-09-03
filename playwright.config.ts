import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    baseURL: 'http://localhost:4173',
  },
  projects: [
    {
      name: 'Chrome',
      use: { channel: 'chrome' },
    },
    {
      name: 'Firefox',
      use: { 
        browserName: 'firefox',
        // Firefox-specific settings for CI environment
        launchOptions: {
          firefoxUserPrefs: {
            'dom.disable_beforeunload': true,
          },
        },
      },
    },
    {
      name: 'WebKit',
      use: { 
        browserName: 'webkit',
        // WebKit-specific settings to handle pointer event issues
        actionTimeout: 10000,
      },
      timeout: 45000, // Increased timeout for WebKit due to interaction issues
    },
  ],
  webServer: {
    command: 'bunx serve dist -l 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
});
