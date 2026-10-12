/**
 * Mapping fuzz gate: clicking the computed center of
 * a cell must paint exactly that cell, across zooms (fractional
 * included) and scroll offsets, on every engine this suite runs on
 * (Chrome, Firefox, WebKit projects all match e2e/**). The centers
 * come from the same formula family as core/mapping.ts, measured
 * against the live DOM rect and font metrics, so this is the
 * end-to-end round trip of the one shared mapping.
 */
import { test, expect } from '@playwright/test';

const ZOOMS = [0.5, 1, 1.5, 2, 3];

// distinct cells per zoom so paints never collide; halves alternate
const CELLS = {
	0.5: [
		[2, 2, 'top'],
		[17, 9, 'bottom'],
		[31, 15, 'top'],
	],
	1: [
		[1, 1, 'bottom'],
		[12, 7, 'top'],
		[25, 18, 'bottom'],
	],
	1.5: [
		[3, 4, 'top'],
		[14, 11, 'bottom'],
		[21, 2, 'top'],
	],
	2: [
		[0, 0, 'top'],
		[9, 6, 'bottom'],
		[16, 10, 'top'],
	],
	3: [
		[2, 1, 'bottom'],
		[7, 5, 'top'],
		[11, 8, 'bottom'],
	],
};

// the true CP437 values: 223 = upper half filled, 220 = lower half
const EXPECT_CHAR = { top: 223, bottom: 220 };

const bridgeReady = async page => {
	await page.waitForSelector('#canvasContainer', { timeout: 10000 });
	await page.waitForSelector('#bodyContainer[data-ready]', {
		state: 'attached',
		timeout: 10000,
	});
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout: 10000 });
};

const setZoom = async (page, zoom) => {
	await page.evaluate(z => {
		window.__t0wnz.State.font.setScaleFactor(z);
	}, zoom);
	// relayout settles when the container matches columns x scaled cells
	await page.waitForFunction(
		z => {
			const s = window.__t0wnz.State;
			if (s.font.getScaleFactor() !== z) {
				return false;
			}
			const container = document.getElementById('canvasContainer');
			const want = s.textArtCanvas.getColumns() * s.font.getWidth();
			return Math.abs(container.getBoundingClientRect().width - want) < 2;
		},
		zoom,
		{ timeout: 10000 },
	);
	// the settings modal must be gone or it swallows the clicks
	await page.waitForFunction(
		() => !document.getElementById('modal')?.open,
		null,
		{ timeout: 10000 },
	);
	await page.waitForTimeout(400);
};

const cellProbe = async (page, x, y, half) =>
	page.evaluate(
		([cx, cy, which]) => {
			const s = window.__t0wnz.State;
			const rect = document
				.getElementById('canvasContainer')
				.getBoundingClientRect();
			const w = s.font.getWidth();
			const h = s.font.getHeight();
			const clientX = rect.left + cx * w + w / 2;
			const clientY =
				rect.top + cy * h + (which === 'top' ? h / 4 : (3 * h) / 4);
			return {
				clientX,
				clientY,
				visible:
					clientX >= 0 &&
					clientY >= 0 &&
					clientX < window.innerWidth &&
					clientY < window.innerHeight,
			};
		},
		[x, y, half],
	);

const readBlock = async (page, x, y) =>
	page.evaluate(
		([cx, cy]) => {
			const block = window.__t0wnz.State.textArtCanvas.getBlock(cx, cy);
			return { charCode: block.charCode };
		},
		[x, y],
	);

test.describe('pointer-to-cell mapping identity', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
		// half-block brush: a click paints one half cell
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);
	});

	for (const zoom of ZOOMS) {
		test(`cell centers hit their cell at ${zoom}x`, async ({ page }) => {
			await setZoom(page, zoom);
			let asserted = 0;
			for (const [x, y, half] of CELLS[zoom]) {
				const probe = await cellProbe(page, x, y, half);
				if (!probe.visible) {
					continue;
				}
				await page.mouse.click(probe.clientX, probe.clientY);
				await page.waitForTimeout(150);
				const block = await readBlock(page, x, y);
				expect
					.soft(block.charCode, `cell ${x},${y} ${half} at ${zoom}x`)
					.toBe(EXPECT_CHAR[half]);
				asserted++;
			}
			expect(asserted).toBeGreaterThan(0);
		});
	}

	test('mapping holds after scrolling the viewport', async ({ page }) => {
		await setZoom(page, 2);
		await page.evaluate(() => {
			document.getElementById('viewport').scrollTop = 160;
		});
		await page.waitForTimeout(300);
		// a row that is only visible scrolled; the fresh rect carries the
		// scroll offset so the same probe math must still land
		const x = 5;
		const y = 16;
		const probe = await cellProbe(page, x, y, 'top');
		expect(probe.visible).toBe(true);
		await page.mouse.click(probe.clientX, probe.clientY);
		await page.waitForTimeout(150);
		const block = await readBlock(page, x, y);
		expect(block.charCode).toBe(223);
	});
});
