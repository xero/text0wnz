import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// macOS 27 privacy-protects ~/Library/Application Support/Firefox, which playwright's
// bundled firefox reads on launch and hangs. give each worker its own empty home dir
// https://github.com/microsoft/playwright/issues/42768
const firefoxEnv = process.platform === 'darwin'
	? { ...process.env, CFFIXED_USER_HOME: mkdtempSync(path.join(tmpdir(), 'pw-firefox-home-')) }
	: undefined;

export default defineConfig({
	testDir: './tests/e2e',
	timeout: 30000,
	retries: 1,
	outputDir: 'tests/results/e2e',
	fullyParallel: true,
	workers: process.env.CI ? 6 : undefined,
	reporter: process.env.CI
		? [
			['blob'],
			['html', { outputFolder: 'tests/results/playwright-report', open: 'never' }],
			['json', { outputFile: 'tests/results/e2e/results.json' }],
		]
		: [
			['html', { outputFolder: 'tests/results/playwright-report', open: 'never' }],
			['json', { outputFile: 'tests/results/e2e/results.json' }],
		],
	use: {
		baseURL: 'http://localhost:8060',
		headless: true,
		viewport: { width: 1280, height: 720 },
		ignoreHTTPSErrors: true,
		screenshot: 'only-on-failure',
		trace: 'on-first-retry',
	},
	webServer: {
		command: 'bun www',
		port: 8060,
		reuseExistingServer: !process.env.CI,
		timeout: 120000,
	},
	projects: [
		{
			name: 'Chrome',
			use: {
				channel: 'chrome',
			},
		},
		{
			name: 'Firefox',
			use: {
				browserName: 'firefox',
				// Firefox-specific settings for CI environment
				launchOptions: {
					env: firefoxEnv,
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
			timeout: 45000,
		},
	],
});
