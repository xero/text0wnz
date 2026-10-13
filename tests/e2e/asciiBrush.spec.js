/**
 * Ascii brush e2e: the P0 skeleton stamps $ (CP437 36) along the
 * pointer path on the full-cell grid, preserves the cell background,
 * and groups a stroke into one undo step. Glyph selection lands in the
 * core stamp engine later; these tests pin the controller wiring.
 */
import { test, expect } from '@playwright/test';

const DOLLAR = 36;

const bridgeReady = async page => {
	await page.waitForSelector('#canvasContainer', { timeout: 10000 });
	await page.waitForSelector('#bodyContainer[data-ready]', {
		state: 'attached',
		timeout: 10000,
	});
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, {
		timeout: 10000,
	});
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

	test('a click stamps $ in the foreground color', async ({ page }) => {
		const pt = await cellCenter(page, 6, 4);
		await page.mouse.click(pt.clientX, pt.clientY);
		const block = await readBlock(page, 6, 4);
		expect(block.charCode).toBe(DOLLAR);
		expect(block.fg).toBe(7);
	});

	test('a horizontal drag stamps every cell on the row', async ({ page }) => {
		await drag(page, [5, 8], [20, 8]);
		for (let x = 5; x <= 20; x++) {
			expect((await readBlock(page, x, 8)).charCode).toBe(DOLLAR);
		}
		// neighbors stay untouched
		expect((await readBlock(page, 4, 8)).charCode).not.toBe(DOLLAR);
		expect((await readBlock(page, 21, 8)).charCode).not.toBe(DOLLAR);
	});

	test('a diagonal drag leaves no row gaps', async ({ page }) => {
		await drag(page, [30, 2], [42, 14]);
		expect((await readBlock(page, 30, 2)).charCode).toBe(DOLLAR);
		expect((await readBlock(page, 42, 14)).charCode).toBe(DOLLAR);
		for (let y = 2; y <= 14; y++) {
			const row = [];
			for (let x = 30; x <= 42; x++) {
				row.push((await readBlock(page, x, y)).charCode);
			}
			expect(row).toContain(DOLLAR);
		}
	});

	test('one stroke is one undo step', async ({ page }) => {
		await drag(page, [50, 5], [60, 5]);
		expect((await readBlock(page, 55, 5)).charCode).toBe(DOLLAR);
		await page.evaluate(() => window.__t0wnz.State.textArtCanvas.undo());
		for (let x = 50; x <= 60; x++) {
			expect((await readBlock(page, x, 5)).charCode).not.toBe(DOLLAR);
		}
	});
});
