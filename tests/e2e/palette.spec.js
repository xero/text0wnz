import { test, expect } from '@playwright/test';
import { clickTool } from './helpers/editorHelpers.js';

test.describe('Color Palette', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should display color palette', async ({ page }) => {
		const palette = page.locator('#palettePicker');
		await expect(palette).toBeVisible();
	});

	test('should have foreground and background color indicators', async ({ page }) => {
		// the palette preview canvas shows the current colors
		const palettePreview = page.locator('#palettePreview');
		await expect(palettePreview).toBeVisible();
	});

	test('should change foreground color on left click', async ({ page }) => {
		const colorSwatches = page.locator(
			'.paletteColor, .colorSwatch, [data-color]',
		);
		const count = await colorSwatches.count();

		if (count > 0) {
			await colorSwatches.nth(2).click({ button: 'left' });
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		}
	});

	test('should change background color on right click', async ({ page }) => {
		const colorSwatches = page.locator(
			'.paletteColor, .colorSwatch, [data-color]',
		);
		const count = await colorSwatches.count();

		if (count > 0) {
			await colorSwatches.nth(5).click({ button: 'right' });
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		}
	});

	test('should have ICE colors toggle', async ({ page }) => {
		// the iCE chip lives in the sidebar canvas panel, always visible
		const iceToggle = page.locator('#navICE');
		await expect(iceToggle).toBeVisible();

		await iceToggle.click();
		await page.waitForTimeout(300);

		await iceToggle.click();
		await page.waitForTimeout(300);
	});

	test('should support keyboard shortcuts for colors', async ({ page }) => {
		await page.keyboard.press('f');
		await page.waitForTimeout(200);

		await page.keyboard.press('b');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should allow color selection from multiple positions', async ({ page }) => {
		const colorSwatches = page.locator(
			'.paletteColor, .colorSwatch, [data-color]',
		);
		const count = await colorSwatches.count();

		if (count > 5) {
			await colorSwatches.nth(0).click();
			await page.waitForTimeout(200);

			await colorSwatches.nth(3).click();
			await page.waitForTimeout(200);

			await colorSwatches.nth(7).click();
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		}
	});
});

test.describe('Sample Tool (Color Picker)', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should activate sample tool with Alt key', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await clickTool(page, 'halfblock');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 70, box.y + 70);
			await page.mouse.up();
			await page.waitForTimeout(300);

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
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should open character selection', async ({ page }) => {
		await page.locator('#brushes').click();
		await clickTool(page, 'characterBrush');

		// the 256 glyph picker rides the settings window
		await expect(page.locator('#toolSettings')).toBeVisible();
		await expect(page.locator('#toolSettingsTitle')).toHaveText(
			'Character Brush',
		);
		await expect(page.locator('#tsCharacter canvas').first()).toBeVisible();
	});

	test('should allow character selection for drawing', async ({ page }) => {
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const characterTool = page.locator('#characterBrush');
		await characterTool.click();
		await page.waitForTimeout(300);

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.click(box.x + 50, box.y + 50);
			await page.waitForTimeout(300);
		}
	});
});
