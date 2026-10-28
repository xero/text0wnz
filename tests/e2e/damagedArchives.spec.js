/**
 * Scene packs carry decades of bit rot. A zipped piece whose stream
 * breaks partway opens as far as it decodes, and the artist hears why
 * the rest is missing once the load is done.
 */
import { test, expect } from '@playwright/test';
import { bridgeReady, readRegion } from './helpers/editorHelpers.js';
import { openBuffer, zipOf } from './helpers/archiveFixtures.js';

/** a stored deflate block: header byte, LEN, NLEN, then the bytes */
const storedBlock = (final, text) => {
	const head = Buffer.alloc(5);
	head[0] = final ? 1 : 0;
	head.writeUInt16LE(text.length, 1);
	head.writeUInt16LE(~text.length & 0xffff, 3);
	return Buffer.concat([head, Buffer.from(text)]);
};

// a good block, then the reserved block type where the rot begins
const rotten = name =>
	zipOf(
		name,
		Buffer.from('SURVIVOR and the rest of it'),
		Buffer.concat([storedBlock(false, 'SURVIVOR'), Buffer.from([0xff, 0xff])]),
	);

test('a rotten zipped piece opens as far as it decodes, with a note', async ({ page }) => {
	await page.goto('/?test');
	await bridgeReady(page);
	await openBuffer(page, 'pack.zip', rotten('ROT.ANS'));
	await expect.poll(() => readRegion(page, 0, 0, 7, 0)).toEqual(['SURVIVOR']);
	// news, not a failure: the note has its own modal
	await expect(page.locator('#noticeModal')).toBeVisible();
	await expect(page.locator('#modalNotice')).toHaveText(
		'ROT.ANS is damaged: showing the first 8 of 27 bytes',
	);
	await expect(page.locator('#errorModal')).toBeHidden();
});

test('a superseded open keeps its note to itself', async ({ page }) => {
	await page.goto('/?test');
	await bridgeReady(page);
	// an nfo switches font before it lands; hold that switch so a clean
	// open can overtake the damaged one
	await page.evaluate(() => {
		const canvas = window.__t0wnz.State.textArtCanvas;
		const setFont = canvas.setFont;
		let release;
		const held = new Promise(resolve => (release = resolve));
		window.fontHold = { release, asked: false, done: false };
		canvas.setFont = async (...args) => {
			// only a file open passes the stillWanted guard
			if (typeof args[3] !== 'function') {
				return setFont.apply(canvas, args);
			}
			window.fontHold.asked = true;
			await held;
			await setFont.apply(canvas, args);
			window.fontHold.done = true;
		};
	});
	await openBuffer(page, 'pack.zip', rotten('ROT.NFO'));
	await page.waitForFunction(() => window.fontHold.asked);
	await openBuffer(page, 'FRESH.ANS', Buffer.from('FRESH'));
	await expect.poll(() => readRegion(page, 0, 0, 4, 0)).toEqual(['FRESH']);
	await page.evaluate(() => window.fontHold.release());
	await page.waitForFunction(() => window.fontHold.done);
	// the stale open finishes on the next ticks; give it room to speak
	await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
	await expect(page.locator('#noticeModal')).toBeHidden();
	expect(await readRegion(page, 0, 0, 4, 0)).toEqual(['FRESH']);
});
