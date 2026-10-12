/**
 * Precache manifest pins. index.html keeps its filename across builds,
 * so workbox only re-fetches it when its manifest entry carries a real
 * content revision. A revision:null entry shipped once and permanently
 * wedged returning browsers on old HTML whose hashed assets were gone
 * (the vite config's manifest options sat under the generateSW-only
 * `workbox` key and were silently ignored in injectManifest mode).
 * These assertions read the built worker, so they run after bake like
 * every other e2e gate.
 */
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const sw = readFileSync(path.join(repoRoot, 'dist/service.js'), 'utf8');

test('index.html precaches with a real content revision', () => {
	expect(sw).toContain('"url":"index.html"');
	expect(sw).not.toMatch(/"revision":null,"url":"index\.html"/);
	expect(sw).not.toMatch(/"url":"index\.html","revision":null/);
	expect(sw).toMatch(
		/"revision":"[0-9a-f]{32}","url":"index\.html"|"url":"index\.html","revision":"[0-9a-f]{32}"/,
	);
});

test('legacy janitor and recovery machinery ship in the worker', () => {
	// the v2-era runtime caches (html-cache above all) served stale HTML
	// forever; the worker must keep deleting them on activate, and the
	// recovery flag cache marks the wedged-generation takeover path
	for (const name of [
		'html-cache',
		'app-cache',
		'style-cache',
		'asset-cache',
		'text0wnz-recovery',
		'RECOVERY_PING',
	]) {
		expect(sw).toContain(name);
	}
	// the only runtime cache the worker may create anew
	expect(sw).toContain('img-cache');
});

test('app shell assets are in the precache', () => {
	// the ignored glob patterns also dropped the font and icon sprite
	// from the precache, leaving offline mode without them
	expect(sw).toMatch(/"url":"ui\/topazplus_1200\.woff2"/);
	expect(sw).toMatch(/"url":"ui\/icons-[^"]+\.svg"/);
});
