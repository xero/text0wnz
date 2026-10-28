/**
 * The autosave journal across a reload, on the engine's own streams.
 * The restore runs after boot work that already writes a keyframe of
 * the blank boot doc, so it has to restore what the last session left,
 * not what this one just wrote.
 */
import { test, expect } from '@playwright/test';
import { bridgeReady, readRegion } from './helpers/editorHelpers.js';
import { durOf, openBuffer } from './helpers/archiveFixtures.js';

test('a reload restores the journal, every frame of it', async ({ page }) => {
	await page.goto('/?test');
	await bridgeReady(page);
	// two frames: the legacy u16 snapshot keeps only one, so a restore
	// that comes back with both came from the journal
	await openBuffer(page, 'movie.dur', durOf(['FRAME1'], ['FRAME2']));
	await expect.poll(() => readRegion(page, 0, 0, 5, 0)).toEqual(['FRAME1']);
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
	await expect.poll(() => readRegion(page, 0, 0, 5, 0)).toEqual(['FRAME1']);
});
