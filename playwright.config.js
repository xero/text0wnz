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
	testDir: './tests',
	testMatch: ['e2e/**/*.spec.js', 'golden/**/*.spec.js', 'gl/**/*.spec.js'],
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
			testMatch: 'e2e/**/*.spec.js',
			use: {
				channel: 'chrome',
			},
		},
		{
			name: 'Firefox',
			testMatch: 'e2e/**/*.spec.js',
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
			testMatch: 'e2e/**/*.spec.js',
			use: {
				browserName: 'webkit',
				// WebKit-specific settings to handle pointer event issues
				actionTimeout: 10000,
			},
			timeout: 45000,
		},
		{
			// Pixel goldens: generated ONLY in the CI container (linux,
			// SwiftShader, dpr 1). Elsewhere the flows run but screenshot
			// assertions are skipped, since font/AA rendering differs per OS
			name: 'golden',
			testMatch: 'golden/**/*.spec.js',
			ignoreSnapshots: !process.env.CI,
			use: {
				browserName: 'chromium',
				deviceScaleFactor: 1,
				launchOptions: {
					args: [
						'--use-gl=angle',
						'--use-angle=swiftshader-webgl',
						'--enable-unsafe-swiftshader',
					],
				},
			},
		},
		{
			// P1 pixel-parity gate: the same golden suite rendered through
			// the GL renderer (?renderer=gl) and asserted against the SAME
			// goldens the 2D chunk renderer generated (integer zoom, dpr 1)
			name: 'golden-gl',
			testMatch: 'golden/**/*.spec.js',
			ignoreSnapshots: !process.env.CI,
			snapshotPathTemplate:
				'{snapshotDir}/{testFileDir}/{testFileName}-snapshots/{arg}-golden{-snapshotSuffix}{ext}',
			use: {
				browserName: 'chromium',
				deviceScaleFactor: 1,
				launchOptions: {
					args: [
						'--use-gl=angle',
						'--use-angle=swiftshader-webgl',
						'--enable-unsafe-swiftshader',
					],
				},
			},
		},
		{
			// GL rail for the P1 renderer (PLAN.md §4 P0): same SwiftShader
			// flags the goldens use; asserts WebGL2 works in CI before any
			// renderer code depends on it
			name: 'chromium-gl',
			testMatch: 'gl/**/*.spec.js',
			use: {
				browserName: 'chromium',
				deviceScaleFactor: 1,
				launchOptions: {
					args: [
						'--use-gl=angle',
						'--use-angle=swiftshader-webgl',
						'--enable-unsafe-swiftshader',
					],
				},
			},
		},
	],
});
