import { defineConfig } from 'vitest/config';

const ignore = [
	'*.config.js',
	'banner',
	'dist',
	'docs',
	'session',
	'node_modules',
	'tests/e2e/**',
];

export default defineConfig({
	test: {
		environment: 'jsdom',
		setupFiles: [
			'./tests/canvas-shim.js',
			'./tests/setup-tests.js',
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
