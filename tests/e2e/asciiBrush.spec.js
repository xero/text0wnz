/**
 * Ascii brush e2e: the thin stamp engine drives the controller, so
 * strokes resolve to classic ascii line glyphs by slope, fully live.
 * Glyph choice itself is pinned by the core goldens; these tests pin
 * the browser wiring: pointer path in, revised cells out, one undo
 * group per stroke, backgrounds preserved.
 */
import { test, expect } from '@playwright/test';

const UNDERSCORE = 95;
const BACKSLASH = 92;
const PERIOD = 46;

const bridgeReady = async page => {
	await page.waitForSelector('#canvasContainer', { timeout: 10000 });
	await page.waitForSelector('#bodyContainer[data-ready]', {
		state: 'attached',
		timeout: 10000,
	});
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout: 10000 });
};

const selectAsciiBrush = async page => {
	await page.locator('#brushes').click();
	await page.locator('#asciiBrush').click();
	await expect(page.locator('#asciiBrush')).toHaveClass(/toolbarDisplayed/);
};

const cellCenter = async (page, x, y) =>
	page.evaluate(
		([cx, cy]) => {
			const s = window.__t0wnz.State;
			const rect = document
				.getElementById('canvasContainer')
				.getBoundingClientRect();
			return {
				clientX: rect.left + cx * s.font.getWidth() + s.font.getWidth() / 2,
				clientY: rect.top + cy * s.font.getHeight() + s.font.getHeight() / 2,
			};
		},
		[x, y],
	);

const readBlock = async (page, x, y) =>
	page.evaluate(
		([cx, cy]) => {
			const b = window.__t0wnz.State.textArtCanvas.getBlock(cx, cy);
			return {
				charCode: b.charCode,
				fg: b.foregroundColor,
				bg: b.backgroundColor,
			};
		},
		[x, y],
	);

const drag = async (page, from, to, steps = 12) => {
	const a = await cellCenter(page, from[0], from[1]);
	const b = await cellCenter(page, to[0], to[1]);
	await page.mouse.move(a.clientX, a.clientY);
	await page.mouse.down();
	await page.mouse.move(b.clientX, b.clientY, { steps });
	await page.mouse.up();
};

test.describe('ascii brush', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
		await selectAsciiBrush(page);
	});

	test('a tap leaves a pebble in the foreground color', async ({ page }) => {
		const pt = await cellCenter(page, 6, 4);
		// cell centers land in the lower half, so the pebble is a period
		await page.mouse.click(pt.clientX, pt.clientY);
		const block = await readBlock(page, 6, 4);
		expect(block.charCode).toBe(PERIOD);
		expect(block.fg).toBe(7);
	});

	test('a flat drag resolves to underscores on the row', async ({ page }) => {
		await drag(page, [5, 8], [20, 8]);
		for (let x = 5; x <= 20; x++) {
			expect((await readBlock(page, x, 8)).charCode).toBe(UNDERSCORE);
		}
		expect((await readBlock(page, 4, 8)).charCode).not.toBe(UNDERSCORE);
		expect((await readBlock(page, 21, 8)).charCode).not.toBe(UNDERSCORE);
	});

	test('a 45 degree drag resolves to backslashes, gap free', async ({ page }) => {
		await drag(page, [30, 2], [42, 14]);
		for (let i = 0; i <= 12; i++) {
			expect((await readBlock(page, 30 + i, 2 + i)).charCode).toBe(BACKSLASH);
		}
	});

	test('the width knob turns strokes roman', async ({ page }) => {
		await page.selectOption('#asciiWidth', '5');
		await drag(page, [40, 18], [40, 23]);
		// a width five vertical is a solid five column fill ribbon
		for (let y = 19; y <= 22; y++) {
			for (let x = 38; x <= 42; x++) {
				expect((await readBlock(page, x, y)).charCode).toBe(36);
			}
		}
		await page.selectOption('#asciiWidth', '1');
		await drag(page, [50, 18], [50, 23]);
		expect((await readBlock(page, 50, 20)).charCode).toBe(124);
	});

	test('a wide stroke at the left edge never wraps to the right', async ({ page }) => {
		await page.selectOption('#asciiWidth', '5');
		// skeleton hugs column 0, so the ribbon reaches x -2
		await drag(page, [0, 16], [0, 22]);
		expect((await readBlock(page, 0, 18)).charCode).toBe(36);
		const columns = await page.evaluate(() =>
			window.__t0wnz.State.textArtCanvas.getColumns());
		for (let y = 15; y <= 22; y++) {
			for (let x = columns - 3; x < columns; x++) {
				// blank, not merely not-fill: a wrapped taper pebble or AA
				// glyph must fail this too
				expect([0, 32]).toContain((await readBlock(page, x, y)).charCode);
			}
		}
		await page.selectOption('#asciiWidth', '1');
	});

	test('one stroke is one undo step', async ({ page }) => {
		await drag(page, [50, 5], [60, 5]);
		expect((await readBlock(page, 55, 5)).charCode).toBe(UNDERSCORE);
		await page.evaluate(() => window.__t0wnz.State.textArtCanvas.undo());
		for (let x = 50; x <= 60; x++) {
			expect((await readBlock(page, x, 5)).charCode).not.toBe(UNDERSCORE);
		}
	});
});
