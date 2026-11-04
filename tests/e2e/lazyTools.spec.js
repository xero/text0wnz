/**
 * main.js reaches every freehand tool through a dynamic import. A
 * build that bundles freehandTools.js into a boot chunk fetches it with
 * the modulepreloads, and every lazy import is then already resolved.
 */
import { test, expect } from '@playwright/test';
import { bridgeReady, clickTool } from './helpers/editorHelpers.js';

// string literals survive minification, and only freehandTools.js
// names these tool settings
const MARKERS = ['charCellSize', 'attribSize'];

// a worker would serve the lazy chunk from its precache, out of the
// page's network view
test.use({ serviceWorkers: 'block' });

test.describe('lazy tool loading', () => {
	test('freehand tools are fetched on first use, not at boot', async ({ page }) => {
		const scripts = [];
		page.on('response', response => {
			if (new URL(response.url()).pathname.endsWith('.js')) {
				scripts.push(response);
			}
		});
		const freehandScripts = async () => {
			const hits = [];
			for (const response of scripts) {
				const body = await response.text().catch(() => '');
				if (MARKERS.every(marker => body.includes(marker))) {
					hits.push(response.url());
				}
			}
			return hits;
		};

		await page.goto('/?test');
		await bridgeReady(page);
		expect(scripts.length).toBeGreaterThan(0);
		expect(await freehandScripts()).toEqual([]);

		await clickTool(page, 'halfblock');
		await expect.poll(async () => (await freehandScripts()).length).toBe(1);
	});
});
