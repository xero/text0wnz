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

test('a rotten zipped piece opens as far as it decodes, with a note', async ({ page }) => {
	await page.goto('/?test');
	await bridgeReady(page);
	// a good block, then the reserved block type where the rot begins
	const stream = Buffer.concat([storedBlock(false, 'SURVIVOR'), Buffer.from([0xff, 0xff])]);
	await openBuffer(page, 'pack.zip', zipOf('ROT.ANS', Buffer.from('SURVIVOR and the rest of it'), stream));
	await expect.poll(() => readRegion(page, 0, 0, 7, 0)).toEqual(['SURVIVOR']);
	await expect(page.locator('#modalError')).toHaveText(
		'ROT.ANS is damaged: showing the first 8 of 27 bytes',
	);
});
