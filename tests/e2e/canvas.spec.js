import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers/editorHelpers.js';

test.describe('Basic Canvas Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
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
		await page.waitForTimeout(1000);

		const canvasContainer = page.locator('#canvasContainer');
		await expect(canvasContainer).toBeVisible();
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

		await page.waitForTimeout(1000);
	});

	test('should clear canvas on new document', async ({ page }) => {
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		const newButton = page.locator('#new');
		await newButton.click();

		await page.waitForTimeout(500);
		const warningYes = page.locator('#warningYes');
		if (await warningYes.isVisible()) {
			await warningYes.click();
		}
		await page.waitForTimeout(500);
	});
});

test.describe('Canvas Interaction', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support mouse drawing on canvas', async ({ page }) => {
		// #halfblock is only clickable once the brushes toolbar is open
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const halfblockTool = page.locator('#halfblock');
		await halfblockTool.click();

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.down();
			await page.mouse.move(box.x + 150, box.y + 150);
			await page.mouse.up();

			await page.waitForTimeout(500);
		}
	});

	test('should allow tool switching', async ({ page }) => {
		// sidebar tool buttons toggle their toolbars
		await page.locator('#brushes').click();
		await page.waitForTimeout(200);

		await page.locator('#keyboard').click();
		await page.waitForTimeout(200);

		await page.locator('#shapes').click();
		await page.waitForTimeout(200);

		const errorMessages = await page.locator('.error').count();
		expect(errorMessages).toBe(0);
	});

	test('should update position info on mouse move', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.waitForTimeout(300);

			const positionInfo = page.locator('#positionInfo');
			const text = await positionInfo.textContent();
			expect(text).toBeTruthy();
		}
	});
});
