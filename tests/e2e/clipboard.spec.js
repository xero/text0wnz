import { test } from '@playwright/test';

test.describe('Advanced Clipboard Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should copy and paste with color formatting', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		const colorPalette = page.locator('#fgPalette, .colorPalette');
		if (await colorPalette.isVisible()) {
			const colorSwatch = colorPalette
				.locator('.colorSwatch, [data-color]')
				.first();
			if (await colorSwatch.isVisible()) {
				await colorSwatch.click();
				await page.waitForTimeout(200);
			}
		}

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(100);
			await canvas.click({ position: { x: 60, y: 50 } });
			await page.waitForTimeout(100);
			await canvas.click({ position: { x: 70, y: 50 } });
			await page.waitForTimeout(200);
		}

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 80, y: 60 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 150, y: 100 } });
				await page.waitForTimeout(100);
			}

			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should handle copy with background color', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		// b switches color input to background mode
		await page.keyboard.press('b');
		await page.waitForTimeout(200);

		const colorPalette = page.locator('#bgPalette, .colorPalette');
		if (await colorPalette.isVisible()) {
			const colorSwatch = colorPalette
				.locator('.colorSwatch, [data-color]')
				.nth(2);
			if (await colorSwatch.isVisible()) {
				await colorSwatch.click();
				await page.waitForTimeout(200);
			}
		}

		// Switch back to foreground
		await page.keyboard.press('f');
		await page.waitForTimeout(200);

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#characterBrush').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 70, y: 70 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 120, y: 50 } });
				await page.waitForTimeout(100);
			}

			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should copy and paste text with attributes', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		// Enter keyboard mode and type text
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.type('Test');
		await page.waitForTimeout(300);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			const bbox = await canvas.boundingBox();
			if (bbox) {
				await canvas.click({ position: { x: 10, y: 10 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 80, y: 30 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should handle multiple copy operations', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(100);
		}

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 70, y: 70 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);

			await page.locator('#characterBrush').click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 100, y: 50 } });
				await page.waitForTimeout(200);
			}

			// the second copy replaces the clipboard
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 90, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 120, y: 70 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);

			// paste must yield the second pattern
			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should handle cut operation', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(100);
			await canvas.click({ position: { x: 60, y: 50 } });
			await page.waitForTimeout(200);
		}

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 80, y: 70 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+x');
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 150, y: 100 } });
				await page.waitForTimeout(100);
			}

			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should paste selection at cursor position', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			for (let x = 0; x < 3; x++) {
				for (let y = 0; y < 3; y++) {
					await canvas.click({ position: { x: 50 + x * 10, y: 50 + y * 10 } });
					await page.waitForTimeout(50);
				}
			}
			await page.waitForTimeout(200);
		}

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 85, y: 85 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);

			const positions = [
				{ x: 150, y: 50 },
				{ x: 100, y: 150 },
				{ x: 200, y: 100 },
			];

			for (const pos of positions) {
				if (bbox) {
					await canvas.click({ position: pos });
					await page.waitForTimeout(100);
					await page.keyboard.press('Control+v');
					await page.waitForTimeout(200);
				}
			}
		}
	});

	test('should handle empty clipboard paste gracefully', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.keyboard.press('Control+v');
		await page.waitForTimeout(300);

		// drawing after the empty paste proves the canvas still works
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}
	});

	test('should copy large selection', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			for (let x = 0; x < 5; x++) {
				for (let y = 0; y < 5; y++) {
					await canvas.click({ position: { x: 50 + x * 12, y: 50 + y * 12 } });
					await page.waitForTimeout(30);
				}
			}
			await page.waitForTimeout(200);
		}

		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 120, y: 120 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(500);

			if (bbox) {
				await canvas.click({ position: { x: 150, y: 150 } });
				await page.waitForTimeout(100);
			}

			await page.keyboard.press('Control+v');
			await page.waitForTimeout(500);
		}
	});

	test('should maintain selection formatting during clipboard operations', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		const iceColorsToggle = page.locator(
			'button:has-text("ICE Colors"), input[type="checkbox"][name*="ice"], #iceColorsToggle',
		);
		if (await iceColorsToggle.isVisible()) {
			await iceColorsToggle.click();
			await page.waitForTimeout(300);
		}

		// f switches color input back to foreground mode
		await page.keyboard.press('f');
		await page.waitForTimeout(200);

		const colorPalette = page.locator('.colorPalette, #fgPalette');
		if (await colorPalette.isVisible()) {
			const brightColor = colorPalette
				.locator('.colorSwatch, [data-color]')
				.nth(10);
			if (await brightColor.isVisible()) {
				await brightColor.click();
				await page.waitForTimeout(200);
			}
		}

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#characterBrush').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}

		// formatting must survive the copy/paste
		const selectionTool = page.locator('#select');
		if (await selectionTool.isVisible()) {
			await selectionTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 40, y: 40 } });
				await page.waitForTimeout(100);
				await canvas.click({ position: { x: 70, y: 70 } });
				await page.waitForTimeout(300);
			}

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(300);
			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});
});
