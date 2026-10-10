import { defineConfig } from 'vitest/config';

const ignore = [
	'*.config.js',
	'banner',
	'dist',
	'docs',
	'session',
	'node_modules',
	// playwright suites, not vitest
	'tests/e2e/**',
	'tests/golden/**',
	'tests/gl/**',
	'tests/perf/**',
	'src/img/**',
	'src/css/**',
];

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: [
			'./tests/canvasShim.js',
			'./tests/setupTests.js',
		],
		globals: true,
		isolate: true, // Ensure clean state between tests
		maxWorkers: 1, // Single thread to avoid memory multiplication
		exclude: ignore,
		coverage: {
			enabled: true,
			reporter: ['text', 'html'],
			reportsDirectory: 'tests/results/coverage',
			exclude: ignore,
		},
	},
});
