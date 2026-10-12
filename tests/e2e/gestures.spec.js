/**
 * Touch gestures end to end: 2-finger tap undo, 3-finger tap
 * redo, pinch zoom, and the zoom shortcut pins. Multi-touch needs CDP
 * Input.dispatchTouchEvent, so the gesture tests run on the Chrome
 * project only; the recognizer's logic is engine-neutral and unit
 * tested, and the mapping spec covers all three engines.
 */
import { test, expect } from '@playwright/test';

const bridgeReady = async page => {
	await page.waitForSelector('#canvasContainer', { timeout: 10000 });
	await page.waitForSelector('#bodyContainer[data-ready]', {
		state: 'attached',
		timeout: 10000,
	});
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout: 10000 });
};

const canvasPoint = async (page, x, y) =>
	page.evaluate(
		([cx, cy]) => {
			const s = window.__t0wnz.State;
			const rect = document
				.getElementById('canvasContainer')
				.getBoundingClientRect();
			return {
				x: rect.left + cx * s.font.getWidth() + s.font.getWidth() / 2,
				y: rect.top + cy * s.font.getHeight() + s.font.getHeight() / 2,
			};
		},
		[x, y],
	);

const readChar = async (page, x, y) =>
	page.evaluate(
		([cx, cy]) => window.__t0wnz.State.textArtCanvas.getBlock(cx, cy).charCode,
		[x, y],
	);

const getScale = async page =>
	page.evaluate(() => window.__t0wnz.State.font.getScaleFactor());

const touch = async (cdp, type, touchPoints) =>
	cdp.send('Input.dispatchTouchEvent', { type, touchPoints });

test.describe('touch gestures and zoom shortcuts', () => {
	test.beforeEach(async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'CDP multi-touch is Chromium-only');
		await page.goto('/?test');
		await bridgeReady(page);
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);
	});

	test('2-finger tap undoes the last stroke without painting', async ({ page }) => {
		const cdp = await page.context().newCDPSession(page);
		const p = await canvasPoint(page, 4, 4);
		await page.mouse.click(p.x, p.y);
		await page.waitForTimeout(200);
		expect(await readChar(page, 4, 4)).not.toBe(0);

		const a = await canvasPoint(page, 10, 10);
		const b = await canvasPoint(page, 14, 10);
		await touch(cdp, 'touchStart', [
			{ x: a.x, y: a.y, id: 1 },
			{ x: b.x, y: b.y, id: 2 },
		]);
		await page.waitForTimeout(60);
		await touch(cdp, 'touchEnd', []);
		await page.waitForTimeout(300);

		// the stroke is undone and the tap itself painted nothing
		expect(await readChar(page, 4, 4)).toBe(0);
		expect(await readChar(page, 10, 10)).toBe(0);
		expect(await readChar(page, 14, 10)).toBe(0);
	});

	test('3-finger tap redoes', async ({ page }) => {
		const cdp = await page.context().newCDPSession(page);
		const p = await canvasPoint(page, 6, 6);
		await page.mouse.click(p.x, p.y);
		await page.waitForTimeout(200);
		const drawn = await readChar(page, 6, 6);
		expect(drawn).not.toBe(0);
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);
		expect(await readChar(page, 6, 6)).toBe(0);

		const pts = [
			await canvasPoint(page, 20, 10),
			await canvasPoint(page, 24, 10),
			await canvasPoint(page, 22, 14),
		];
		await touch(
			cdp,
			'touchStart',
			pts.map((pt, i) => ({ x: pt.x, y: pt.y, id: i + 1 })),
		);
		await page.waitForTimeout(60);
		await touch(cdp, 'touchEnd', []);
		await page.waitForTimeout(300);
		expect(await readChar(page, 6, 6)).toBe(drawn);
	});

	test('pinch zooms around the centroid', async ({ page }) => {
		const cdp = await page.context().newCDPSession(page);
		expect(await getScale(page)).toBe(1);
		const c = await canvasPoint(page, 10, 8);
		await touch(cdp, 'touchStart', [
			{ x: c.x - 40, y: c.y, id: 1 },
			{ x: c.x + 40, y: c.y, id: 2 },
		]);
		for (let step = 1; step <= 6; step++) {
			const spread = 40 + step * 25;
			await touch(cdp, 'touchMove', [
				{ x: c.x - spread, y: c.y, id: 1 },
				{ x: c.x + spread, y: c.y, id: 2 },
			]);
			await page.waitForTimeout(40);
		}
		await touch(cdp, 'touchEnd', []);
		await page.waitForTimeout(500);
		const scale = await getScale(page);
		expect(scale).toBeGreaterThan(1.5);
		expect(scale).toBeLessThanOrEqual(4);
	});

	test('ctrl +/- zooms; ctrl+0 picks a color, not zoom', async ({ page }) => {
		expect(await getScale(page)).toBe(1);
		await page.keyboard.press('Control+=');
		await page.waitForTimeout(400);
		expect(await getScale(page)).toBe(1.5);
		await page.keyboard.press('Control+-');
		await page.waitForTimeout(400);
		expect(await getScale(page)).toBe(1);
		// ctrl+digit owns color selection everywhere; zoom must not move
		await page.keyboard.press('Control+=');
		await page.waitForTimeout(400);
		await page.keyboard.press('Control+0');
		await page.waitForTimeout(400);
		expect(await getScale(page)).toBe(1.5);
		expect(
			await page.evaluate(() =>
				window.__t0wnz.State.palette.getForegroundColor()),
		).toBe(0);
	});

	test('the root is scroll-locked', async ({ page }) => {
		// iOS sizes the root to the layout viewport, which outgrows the
		// window while Safari's toolbar shows; without the lock that slack
		// pans and bares the bg above the editor
		const lock = await page.evaluate(() => {
			const html = window.getComputedStyle(document.documentElement);
			window.scrollTo(0, 100);
			return {
				overflowY: html.overflowY,
				overscroll: html.overscrollBehaviorY,
				scrollY: window.scrollY,
			};
		});
		expect(lock.overflowY).toBe('hidden');
		expect(lock.overscroll).toBe('none');
		expect(lock.scrollY).toBe(0);
	});
});
