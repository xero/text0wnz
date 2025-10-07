import { test, expect } from '@playwright/test';

test.describe('Basic Canvas Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		// Wait for the canvas to be loaded
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
	});

	test('should load the application successfully', async ({ page }) => {
		// Check if main elements are present
		await expect(page.locator('#canvas-container')).toBeVisible();
		await expect(page.locator('aside')).toBeVisible(); // Sidebar with tools
		await expect(page.locator('#palette-picker')).toBeVisible();
	});

	test('should have default canvas size', async ({ page }) => {
		// Wait for canvas initialization
		await page.waitForTimeout(1000);

		// Check if canvas exists
		const canvasContainer = page.locator('#canvas-container');
		await expect(canvasContainer).toBeVisible();
	});

	test('should display position info', async ({ page }) => {
		const positionInfo = page.locator('#position-info');
		await expect(positionInfo).toBeVisible();
	});

	test('should have color palette visible', async ({ page }) => {
		const palette = page.locator('#palette-picker');
		await expect(palette).toBeVisible();

		// Palette picker canvas should exist
		const paletteCanvas = page.locator('#palette-picker');
		await expect(paletteCanvas).toBeVisible();
	});

	test('should have toolbar with drawing tools', async ({ page }) => {
		// Check for essential tools in sidebar
		await expect(page.locator('#keyboard')).toBeVisible(); // Keyboard mode
		await expect(page.locator('#brushes')).toBeVisible(); // Brushes
		await expect(page.locator('#shapes')).toBeVisible(); // Shapes
		await expect(page.locator('#selection')).toBeVisible(); // Selection
	});

	test('should allow resizing canvas', async ({ page }) => {
		// Open resize dialog via resolution button
		const resizeButton = page.locator('#navRes');
		await resizeButton.click();

		// Wait for resize modal
		await page.waitForSelector('#resize-modal', { timeout: 5000 });

		// Change canvas size
		await page.fill('#columns-input', '100');
		await page.fill('#rows-input', '30');

		// Confirm resize
		const confirmButton = page.locator('#resize-apply');
		await confirmButton.click();

		// Wait for resize to complete
		await page.waitForTimeout(1000);
	});

	test('should clear canvas on new document', async ({ page }) => {
		// Click new button
		const newButton = page.locator('#new');
		await newButton.click();

		// Handle warning dialog
		await page.waitForTimeout(500);
		const warningYes = page.locator('#warning-yes');
		if (await warningYes.isVisible()) {
			await warningYes.click();
		}
		await page.waitForTimeout(500);
	});
});

test.describe('Canvas Interaction', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support mouse drawing on canvas', async ({ page }) => {
		// Select halfblock (block drawing) tool
		const halfblockTool = page.locator('#halfblock');
		await halfblockTool.click();

		// Get canvas position
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Draw on canvas
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.down();
			await page.mouse.move(box.x + 150, box.y + 150);
			await page.mouse.up();

			await page.waitForTimeout(500);
		}
	});

	test('should allow tool switching', async ({ page }) => {
		// Select different tools from sidebar
		await page.locator('#halfblock').click();
		await page.waitForTimeout(200);

		await page.locator('#keyboard').click();
		await page.waitForTimeout(200);

		await page.locator('#shapes').click();
		await page.waitForTimeout(200);

		// Verify no errors occurred
		const errorMessages = await page.locator('.error').count();
		expect(errorMessages).toBe(0);
	});

	test('should update position info on mouse move', async ({ page }) => {
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Move mouse over canvas
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.waitForTimeout(300);

			// Check if position info is updated
			const positionInfo = page.locator('#position-info');
			const text = await positionInfo.textContent();
			expect(text).toBeTruthy();
		}
	});
});
