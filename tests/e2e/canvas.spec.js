import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	drag,
	parkToolSettings,
	readBlock,
	readRegion,
	tap,
	waitForEditorReady,
} from './helpers/editorHelpers.js';

test.describe('Basic Canvas Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await waitForEditorReady(page);
		await bridgeReady(page);
	});

	test('should load the application successfully', async ({ page }) => {
		await expect(page.locator('#canvasContainer')).toBeVisible();

		await page.waitForTimeout(500);

		const sidebar = page.locator('#bodyContainer aside');
		await expect(sidebar).toBeVisible();

		const palettePicker = page.locator('#palettePicker');
		await expect(palettePicker).toBeVisible();
	});

	test('should have default canvas size', async ({ page }) => {
		await expect(page.locator('#canvasContainer')).toBeVisible();
		await expect(page.locator('#resolutionLabel')).toHaveText('80x25');
	});

	test('should display position info', async ({ page }) => {
		const positionInfo = page.locator('#positionInfo');
		await expect(positionInfo).toBeVisible();
	});

	test('should have color palette visible', async ({ page }) => {
		const palette = page.locator('#palettePicker');
		await expect(palette).toBeVisible();

		const paletteCanvas = page.locator('#palettePicker');
		await expect(paletteCanvas).toBeVisible();
	});

	test('should have toolbar with drawing tools', async ({ page }) => {
		await expect(page.locator('#keyboard')).toBeVisible();
		await expect(page.locator('#brushes')).toBeVisible();
		await expect(page.locator('#shapes')).toBeVisible();
		await expect(page.locator('#selection')).toBeVisible();
	});

	test('should allow resizing canvas', async ({ page }) => {
		const resizeButton = page.locator('#resolution');
		await resizeButton.click();

		await page.waitForSelector('#resizeModal', { timeout: 5000 });

		await page.fill('#columnsInput', '100');
		await page.fill('#rowsInput', '30');

		const confirmButton = page.locator('#resizeApply');
		await confirmButton.click();

		await expect(page.locator('#resolutionLabel')).toHaveText('100x30');
		expect(
			await page.evaluate(() => {
				const c = window.__t0wnz.State.textArtCanvas;
				return [c.getColumns(), c.getRows()];
			}),
		).toEqual([100, 30]);
	});

	test('should clear canvas on new document', async ({ page }) => {
		// keyboard mode is the boot tool, its cursor parked at 0,0
		await page.keyboard.type('abc');
		await expect.poll(() => readRegion(page, 0, 0, 2, 0)).toEqual(['abc']);

		await page.locator('#fileMenu button').click();
		await page.locator('#new').click();
		await page.locator('#warningYes').click();

		await expect.poll(() => readRegion(page, 0, 0, 2, 0)).toEqual(['   ']);
	});
});

test.describe('Canvas Interaction', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should support mouse drawing on canvas', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await drag(page, [10, 5], [16, 8]);

		for (const [x, y] of [[10, 5], [16, 8]]) {
			expect([0, 32]).not.toContain((await readBlock(page, x, y)).charCode);
		}
	});

	test('should allow tool switching', async ({ page }) => {
		// the group buttons open flyouts and leave the active tool alone
		await page.locator('#brushes').click();
		await expect(page.locator('#brushToolbar')).toBeVisible();
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);

		await clickTool(page, 'halfblock');
		await expect(page.locator('#keyboard')).not.toHaveClass(/toolbarDisplayed/);

		await page.locator('#shapes').click();
		await expect(page.locator('#shapesToolbar')).toBeVisible();
		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);

		await page.locator('#keyboard').click();
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
		await expect(page.locator('#halfblock')).not.toHaveClass(/toolbarDisplayed/);
	});

	test('position info follows the cursor and a drawing stroke', async ({ page }) => {
		const readout = async () => {
			const row = page.locator('#positionInfo .cursorReadout');
			return [await row.locator('b').textContent(), await row.locator('button').textContent()];
		};
		// keyboard mode is the boot tool: a click moves its cursor
		await tap(page, 20, 7);
		await expect.poll(readout).toEqual(['21', '8']);

		await clickTool(page, 'halfblock');
		await drag(page, [30, 10], [34, 12]);
		await expect.poll(readout).toEqual(['35', '13']);
	});
});
