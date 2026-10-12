import { test, expect } from '@playwright/test';
import {
	waitForEditorReady,
	focusCanvas,
	getViewportScrollPosition,
} from './helpers/editorHelpers.js';
import { openFile } from './helpers/openFile.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({ screenshot: 'on' });

test.describe('File Open and Scrolling', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test('opens example ANSI file via file open', async ({ page }) => {
		const exampleFilePath = path.join(
			__dirname,
			'../../docs/examples/ansi/x0-defcon25.ans',
		);

		await openFile(page, exampleFilePath);

		// TODO: replace with a specific indicator for load completion
		await page.waitForTimeout(1500);

		const canvasContainer = page.locator('#canvasContainer');
		await expect(canvasContainer).toBeVisible();

		// TODO: assert on loaded content once the editor exposes it; for
		// now pin that at least one canvas exists
		const canvases = page.locator('#canvasContainer canvas');
		const canvasCount = await canvases.count();
		expect(canvasCount).toBeGreaterThan(0);

		const positionInfo = page.locator('#positionInfo');
		await expect(positionInfo).toBeVisible();
	});

	test('page down and page up keyboard scrolling', async ({ page }) => {
		// load a large file so the canvas can scroll
		const exampleFilePath = path.join(
			__dirname,
			'../../docs/examples/ansi/x0-defcon25.ans',
		);
		await openFile(page, exampleFilePath);
		await page.waitForTimeout(1500);

		await focusCanvas(page);

		const initialScroll = await getViewportScrollPosition(page);

		await page.keyboard.press('PageDown');
		await page.waitForTimeout(500);

		const afterPageDown = await getViewportScrollPosition(page);

		// the exact scroll amount depends on viewport height and font size
		expect(afterPageDown.scrollTop).toBeGreaterThan(initialScroll.scrollTop);

		await page.keyboard.press('PageUp');
		await page.waitForTimeout(500);

		const afterPageUp = await getViewportScrollPosition(page);

		expect(afterPageUp.scrollTop).toBeLessThan(afterPageDown.scrollTop);
	});

	test('mouse wheel scrolls canvas', async ({ page }) => {
		// load a large file so the canvas can scroll
		const exampleFilePath = path.join(
			__dirname,
			'../../docs/examples/ansi/x0-defcon25.ans',
		);
		await openFile(page, exampleFilePath);
		await page.waitForTimeout(1500);

		const viewport = page.locator('#viewport');
		const box = await viewport.boundingBox();

		if (!box) {
			throw new Error('Viewport not found or not visible');
		}

		const initialScroll = await getViewportScrollPosition(page);

		// Aim at the viewport background left of the drawing canvas, not the
		// canvas itself or the menus
		const canvasBox = await page.locator('#canvasContainer').boundingBox();
		const wheelX = (box.x + canvasBox.x) / 2;
		const wheelY = box.y + box.height / 2;
		const target = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.id,
			[wheelX, wheelY],
		);
		expect(target).toBe('viewport');
		await page.mouse.move(wheelX, wheelY);
		await page.mouse.wheel(0, 300);
		await page.waitForTimeout(500);

		const afterScrollDown = await getViewportScrollPosition(page);

		expect(afterScrollDown.scrollTop).toBeGreaterThan(initialScroll.scrollTop);

		await page.mouse.wheel(0, -300);
		await page.waitForTimeout(500);

		const afterScrollUp = await getViewportScrollPosition(page);

		expect(afterScrollUp.scrollTop).toBeLessThan(afterScrollDown.scrollTop);
	});
});
