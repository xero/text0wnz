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
		setupFiles: ['./tests/setupTests.js'],
		globals: true,
		// Optimize for memory usage
		threads: false, // Run tests sequentially to reduce memory pressure
		isolate: true, // Ensure clean state between tests
		maxThreads: 1, // Single thread to avoid memory multiplication
		exclude: ignore,
		coverage: {
			enabled: true,
			reporter: ['text', 'html'],
			reportsDirectory: 'tests/results/coverage',
			exclude: ignore,
		},
	},
});
