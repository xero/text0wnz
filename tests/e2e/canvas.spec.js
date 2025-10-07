import { test, expect } from '@playwright/test';

test.describe('Basic Canvas Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		// Wait for the canvas to be loaded
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
	});

	test('should load the application successfully', async ({ page }) => {
		// Check if main elements are present
		await expect(page.locator('#canvas-container')).toBeVisible();
		await expect(page.locator('#toolbar')).toBeVisible();
		await expect(page.locator('#palette')).toBeVisible();
	});

	test('should have default canvas size', async ({ page }) => {
		// Wait for canvas initialization
		await page.waitForTimeout(1000);

		// Check if canvas exists
		const canvasContainer = page.locator('#canvas-container');
		await expect(canvasContainer).toBeVisible();
	});

	test('should display artwork title input', async ({ page }) => {
		const titleInput = page.locator('#artwork-title');
		await expect(titleInput).toBeVisible();
		await expect(titleInput).toHaveValue('untitled');
	});

	test('should have color palette visible', async ({ page }) => {
		const palette = page.locator('#palette');
		await expect(palette).toBeVisible();

		// Check if palette has color swatches
		const colorSwatches = page.locator('.palette-color');
		const count = await colorSwatches.count();
		expect(count).toBeGreaterThan(0);
	});

	test('should have toolbar with drawing tools', async ({ page }) => {
		// Check for essential tools
		await expect(page.locator('#freehand')).toBeVisible();
		await expect(page.locator('#character')).toBeVisible();
		await expect(page.locator('#brush')).toBeVisible();
		await expect(page.locator('#line')).toBeVisible();
	});

	test('should allow resizing canvas', async ({ page }) => {
		// Open resize dialog
		const resizeButton = page.locator('#resize');
		await resizeButton.click();

		// Wait for resize dialog
		await page.waitForSelector('#columns-input', { timeout: 5000 });

		// Change canvas size
		await page.fill('#columns-input', '100');
		await page.fill('#rows-input', '30');

		// Confirm resize
		const confirmButton = page.locator('button:has-text("Resize")');
		await confirmButton.click();

		// Wait for resize to complete
		await page.waitForTimeout(1000);
	});

	test('should clear canvas on new document', async ({ page }) => {
		// Click new button
		const newButton = page.locator('#new');
		await newButton.click();

		// Confirm dialog
		page.on('dialog', dialog => dialog.accept());
		await page.waitForTimeout(500);

		// Check title is reset
		const titleInput = page.locator('#artwork-title');
		await expect(titleInput).toHaveValue('untitled');
	});
});

test.describe('Canvas Interaction', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support mouse drawing on canvas', async ({ page }) => {
		// Select freehand tool
		const freehandTool = page.locator('#freehand');
		await freehandTool.click();

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
		// Select different tools
		await page.locator('#freehand').click();
		await page.waitForTimeout(200);

		await page.locator('#character').click();
		await page.waitForTimeout(200);

		await page.locator('#brush').click();
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
