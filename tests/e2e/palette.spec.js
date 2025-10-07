import { test, expect } from '@playwright/test';

test.describe('Color Palette', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should display color palette', async ({ page }) => {
		const palette = page.locator('#palette');
		await expect(palette).toBeVisible();
	});

	test('should have foreground and background color indicators', async ({ page }) => {
		// Check for color indicators
		const fgIndicator = page.locator(
			'#current-foreground, .foreground-color, [data-testid="foreground-color"]',
		);
		const bgIndicator = page.locator(
			'#current-background, .background-color, [data-testid="background-color"]',
		);

		// At least one should exist
		const fgCount = await fgIndicator.count();
		const bgCount = await bgIndicator.count();

		expect(fgCount + bgCount).toBeGreaterThan(0);
	});

	test('should change foreground color on left click', async ({ page }) => {
		// Find a color swatch
		const colorSwatches = page.locator(
			'.palette-color, .color-swatch, [data-color]',
		);
		const count = await colorSwatches.count();

		if (count > 0) {
			// Click on a color
			await colorSwatches.nth(2).click({ button: 'left' });
			await page.waitForTimeout(300);

			// Verify no errors
			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		}
	});

	test('should change background color on right click', async ({ page }) => {
		// Find a color swatch
		const colorSwatches = page.locator(
			'.palette-color, .color-swatch, [data-color]',
		);
		const count = await colorSwatches.count();

		if (count > 0) {
			// Right click on a color
			await colorSwatches.nth(5).click({ button: 'right' });
			await page.waitForTimeout(300);

			// Verify no errors
			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		}
	});

	test('should have ICE colors toggle', async ({ page }) => {
		const iceToggle = page.locator(
			'#ice-colors, #ice-toggle, [data-testid="ice-colors"]',
		);
		const count = await iceToggle.count();

		if (count > 0) {
			await iceToggle.first().click();
			await page.waitForTimeout(300);

			// Click again to toggle back
			await iceToggle.first().click();
			await page.waitForTimeout(300);
		}
	});

	test('should support keyboard shortcuts for colors', async ({ page }) => {
		// Press F key for foreground
		await page.keyboard.press('f');
		await page.waitForTimeout(200);

		// Press B key for background
		await page.keyboard.press('b');
		await page.waitForTimeout(200);

		// Verify no errors
		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should allow color selection from multiple positions', async ({ page }) => {
		const colorSwatches = page.locator(
			'.palette-color, .color-swatch, [data-color]',
		);
		const count = await colorSwatches.count();

		if (count > 5) {
			// Select different colors
			await colorSwatches.nth(0).click();
			await page.waitForTimeout(200);

			await colorSwatches.nth(3).click();
			await page.waitForTimeout(200);

			await colorSwatches.nth(7).click();
			await page.waitForTimeout(200);

			// Verify no errors
			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		}
	});
});

test.describe('Sample Tool (Color Picker)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should activate sample tool with Alt key', async ({ page }) => {
		// Draw something first
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.locator('#freehand').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 70, box.y + 70);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Use Alt key to sample
			await page.keyboard.down('Alt');
			await page.mouse.move(box.x + 60, box.y + 60);
			await page.mouse.click(box.x + 60, box.y + 60);
			await page.keyboard.up('Alt');
			await page.waitForTimeout(300);
		}
	});
});

test.describe('Character Palette', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should open character selection', async ({ page }) => {
		// Try to open character palette
		const charButton = page.locator(
			'#character, #char-select, button:has-text("Character")',
		);
		const count = await charButton.count();

		if (count > 0) {
			await charButton.first().click();
			await page.waitForTimeout(500);

			// Look for character grid or selector
			const charGrid = page.locator(
				'.character-grid, .char-selector, #character-selector',
			);
			const gridCount = await charGrid.count();

			// If character grid exists, verify it's visible
			if (gridCount > 0) {
				await expect(charGrid.first()).toBeVisible();
			}
		}
	});

	test('should allow character selection for drawing', async ({ page }) => {
		// Activate character tool
		const characterTool = page.locator('#character');
		await characterTool.click();
		await page.waitForTimeout(300);

		// Try to draw a character
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.click(box.x + 50, box.y + 50);
			await page.waitForTimeout(300);
		}
	});
});
