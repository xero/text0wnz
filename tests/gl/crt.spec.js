/**
 * CRT post pass smoke (P6): toggling the effect recomposites through
 * the FBO path without GL errors and visibly changes the presented
 * frame (scanline mask), then restores cleanly. Pixel LOOK is not
 * asserted; the classic goldens pin that the effect stays OFF by
 * default.
 */
import { test, expect } from '@playwright/test';

test.describe('crt post pass', () => {
	test('toggles on and off, changing the presented frame', async ({ page }) => {
		await page.goto('/?test&renderer=gl');
		await page.waitForSelector('#bodyContainer[data-ready]', {
			state: 'attached',
			timeout: 10000,
		});
		await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout: 10000 });
		await page.evaluate(() => {
			const { State } = window.__t0wnz;
			State.textArtCanvas.draw(cb => {
				for (let x = 0; x < 40; x++) {
					cb(219, 1 + (x % 14), 0, x, 2); // colorful full blocks
				}
			}, false);
		});
		const glCanvas = page.locator('#glRenderCanvas');
		await page.waitForTimeout(200);
		const before = await glCanvas.screenshot();

		await page.evaluate(() => {
			window.__t0wnz.State.textArtCanvas.setCrtEffect(true);
		});
		expect(
			await page.evaluate(() =>
				window.__t0wnz.State.textArtCanvas.getCrtEffect()),
		).toBe(true);
		await page.waitForTimeout(200);
		const during = await glCanvas.screenshot();
		expect(during.equals(before)).toBe(false);

		const glError = await page.evaluate(() =>
			document.getElementById('glRenderCanvas').getContext('webgl2').getError());
		expect(glError).toBe(0);

		await page.evaluate(() => {
			window.__t0wnz.State.textArtCanvas.setCrtEffect(false);
		});
		await page.waitForTimeout(200);
		const after = await glCanvas.screenshot();
		expect(after.equals(during)).toBe(false);
	});
});
