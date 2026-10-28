/**
 * Engines without CompressionStream / DecompressionStream (Safari
 * before 16.4, Firefox before 113), reproduced in every project by
 * deleting the globals before any app code runs. Zips, durdraw movies,
 * .0wnz saves, and the autosave journal must all work on the plain TS
 * codec.
 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { bridgeReady, readRegion } from './helpers/editorHelpers.js';
import { durOf, openBuffer as open, zipOf } from './helpers/archiveFixtures.js';

const firstRow = (page, width) => readRegion(page, 0, 0, width - 1, 0);

test.describe('without compression streams', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			delete globalThis.CompressionStream;
			delete globalThis.DecompressionStream;
			// saves take the download path, not a picker Playwright cannot drive
			delete globalThis.showSaveFilePicker;
		});
		await page.goto('/?test');
		await bridgeReady(page);
		expect(await page.evaluate(() => typeof globalThis.DecompressionStream)).toBe('undefined');
	});

	test('opens a zipped piece', async ({ page }) => {
		await open(page, 'pack.zip', zipOf('ZIPPED.ANS', Buffer.from('ZIPPED and inflated in plain TS')));
		await expect.poll(() => firstRow(page, 6)).toEqual(['ZIPPED']);
	});

	test('opens a durdraw movie', async ({ page }) => {
		await open(page, 'movie.dur', durOf(['GUNZIP', 'in plain TS']));
		await expect.poll(() => firstRow(page, 6)).toEqual(['GUNZIP']);
	});

	test('saves a .0wnz and opens it again', async ({ page }) => {
		await open(page, 'movie.dur', durOf(['SAVED!']));
		await expect.poll(() => firstRow(page, 6)).toEqual(['SAVED!']);
		const downloading = page.waitForEvent('download');
		await page.evaluate(() => window.__t0wnz.Save.ownz());
		const bytes = await readFile(await (await downloading).path());
		// node's own zlib reads what the plain deflater wrote
		expect(gunzipSync(bytes).toString()).toContain('"format":"t0wnz-doc"');
		await open(page, 'pack.zip', zipOf('OTHER.ANS', Buffer.from('OTHER!')));
		await expect.poll(() => firstRow(page, 6)).toEqual(['OTHER!']);
		await open(page, 'again.0wnz', bytes);
		await expect.poll(() => firstRow(page, 6)).toEqual(['SAVED!']);
	});

	test('restores the autosave journal after a reload', async ({ page }) => {
		// two frames: the legacy u16 snapshot keeps only one, so a
		// restore that comes back with both came from the journal
		await open(page, 'movie.dur', durOf(['FRAME1'], ['FRAME2']));
		await expect.poll(() => firstRow(page, 6)).toEqual(['FRAME1']);
		// past the settings debounce and the keyframe write
		await page.waitForTimeout(2000);
		await page.reload();
		await bridgeReady(page);
		await expect
			.poll(
				() => page.evaluate(() => window.__t0wnz.State.textArtCanvas.getDoc().frames.length),
				{ timeout: 15000 },
			)
			.toBe(2);
		await expect.poll(() => firstRow(page, 6)).toEqual(['FRAME1']);
	});
});
