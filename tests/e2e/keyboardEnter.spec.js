import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	cursorAt,
	parkToolSettings,
} from './helpers/editorHelpers.js';

// keyboard mode is the boot tool, so Enter is canvas input wherever
// the canvas scope holds focus
test.describe('Enter in keyboard mode', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
		await page.evaluate(() => window.__t0wnz.State.cursor.move(2, 3));
	});

	for (const key of ['Enter', 'NumpadEnter']) {
		test(`${key} on the focused File button opens the menu`, async ({ page }) => {
			await page.locator('#file').focus();
			await page.keyboard.press(key);

			await expect(page.locator('#mainMenu')).toBeVisible();
			expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
		});
	}

	// Chrome and Firefox leave a clicked button focused
	test('Enter after a mouse click on a button starts a new line', async ({ page }) => {
		const ice = () => page.evaluate(() => window.__t0wnz.State.textArtCanvas.getIceColors());
		const before = await ice();
		await page.locator('#navICE').click();
		await expect.poll(ice).toBe(!before);
		await page.keyboard.press('Enter');

		await expect.poll(() => cursorAt(page)).toEqual({ x: 0, y: 4 });
		expect(await ice()).toBe(!before);
	});

	test('Enter waits for a typed unicode glyph to land', async ({ page }) => {
		// hold the glyph's resolve open until Enter is in, so the race is
		// the same on every run
		await page.evaluate(() => {
			const canvas = window.__t0wnz.State.textArtCanvas;
			const resolve = canvas.resolveUnicode;
			const gate = new Promise(release => {
				window.__releaseGlyph = release;
			});
			canvas.resolveUnicode = async codepoints => {
				await gate;
				return resolve(codepoints);
			};
			document.activeElement?.blur?.();
			// no US layout key yields U+2764, so the keypress is synthetic
			document.dispatchEvent(
				new KeyboardEvent('keypress', {
					key: '❤',
					bubbles: true,
					cancelable: true,
				}),
			);
		});
		await page.keyboard.press('Enter');
		expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });

		await page.evaluate(() => window.__releaseGlyph());
		await expect.poll(() => cursorAt(page)).toEqual({ x: 0, y: 4 });
		const landed = await page.evaluate(() => {
			const doc = window.__t0wnz.State.textArtCanvas.getDoc();
			const glyphId = doc.frames[0].glyph[3 * doc.getColumns() + 2] & 0xffff;
			return doc.glyphTable.get(glyphId)?.codepoint ?? null;
		});
		expect(landed).toBe(0x2764);
	});
});

test.describe('Enter with the selection tool', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
		await page.evaluate(() => window.__t0wnz.State.cursor.move(2, 3));
		await page.locator('#selection').click();
	});

	for (const key of ['Enter', 'NumpadEnter']) {
		test(`${key} on the focused File button opens the menu and keeps the tool`, async ({ page }) => {
			await page.locator('#file').focus();
			await page.keyboard.press(key);

			await expect(page.locator('#mainMenu')).toBeVisible();
			await expect(page.locator('#selection')).toHaveClass(/toolbarDisplayed/);
			expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
		});

		// the tool's rail entry takes no focus, so the canvas scope holds it
		test(`${key} after picking the tool returns to keyboard mode on a new line`, async ({ page }) => {
			await page.keyboard.press(key);

			await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
			expect(await cursorAt(page)).toEqual({ x: 0, y: 4 });
		});
	}
});
