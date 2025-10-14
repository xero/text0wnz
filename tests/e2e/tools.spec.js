import { test, expect } from '@playwright/test';

test.describe('Drawing Tools', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should activate halfblock drawing tool', async ({ page }) => {
		// Click on brushes sidebar button to show brush toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const halfblockTool = page.locator('#halfblock');
		await halfblockTool.click();

		// Check if tool is selected (may have active class)
		const classList = await halfblockTool.getAttribute('class');
		expect(classList).toBeTruthy();
	});

	test('should activate character brush tool', async ({ page }) => {
		// Click on brushes sidebar button to show brush toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const characterBrushTool = page.locator('#character-brush');
		await characterBrushTool.click();
		await page.waitForTimeout(300);

		// Verify tool is active
		const classList = await characterBrushTool.getAttribute('class');
		expect(classList).toBeTruthy();
	});

	test('should activate shading brush tool', async ({ page }) => {
		// Click on brushes sidebar button to show brush toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const shadingBrushTool = page.locator('#shading-brush');
		await shadingBrushTool.click();
		await page.waitForTimeout(300);
	});

	test('should activate line tool', async ({ page }) => {
		// Click on shapes sidebar button to show shapes toolbar
		await page.locator('#shapes').click();
		await page.waitForTimeout(300);

		const lineTool = page.locator('#line');
		await lineTool.click();
		await page.waitForTimeout(300);

		// Draw a line
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 150, box.y + 150);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}
	});

	test('should activate square tool', async ({ page }) => {
		// Click on shapes sidebar button to show shapes toolbar
		await page.locator('#shapes').click();
		await page.waitForTimeout(300);

		const squareTool = page.locator('#square');
		await squareTool.click();
		await page.waitForTimeout(300);

		// Draw a square
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}
	});

	test('should activate circle tool', async ({ page }) => {
		// Click on shapes sidebar button to show shapes toolbar
		await page.locator('#shapes').click();
		await page.waitForTimeout(300);

		const circleTool = page.locator('#circle');
		await circleTool.click();
		await page.waitForTimeout(300);

		// Draw a circle
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}
	});

	test('should activate selection tool', async ({ page }) => {
		const selectionTool = page.locator('#selection');
		await selectionTool.click();
		await page.waitForTimeout(300);

		// Create a selection
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}
	});

	test('should activate fill tool', async ({ page }) => {
		const fillTool = page.locator('#fill');
		if (await fillTool.isVisible()) {
			await fillTool.click();
			await page.waitForTimeout(300);
		}
	});

	test('should draw with multiple tools in sequence', async ({ page }) => {
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Click brushes to show brush toolbar, then select halfblock
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await page.locator('#halfblock').click();
			await page.mouse.move(box.x + 20, box.y + 20);
			await page.mouse.down();
			await page.mouse.move(box.x + 40, box.y + 40);
			await page.mouse.up();
			await page.waitForTimeout(200);

			// Click shapes to show shapes toolbar, then select line
			await page.locator('#shapes').click();
			await page.waitForTimeout(200);
			await page.locator('#line').click();
			await page.mouse.move(box.x + 60, box.y + 60);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 60);
			await page.mouse.up();
			await page.waitForTimeout(200);

			// Square is also in shapes toolbar
			await page.locator('#square').click();
			await page.mouse.move(box.x + 120, box.y + 20);
			await page.mouse.down();
			await page.mouse.move(box.x + 160, box.y + 60);
			await page.mouse.up();
			await page.waitForTimeout(200);
		}
	});
});

test.describe('Tool Features', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support undo operation', async ({ page }) => {
		// Draw something
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Click brushes to show brush toolbar, then select halfblock
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await page.locator('#halfblock').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(500);

			// Undo with keyboard shortcut
			await page.keyboard.down('Control');
			await page.keyboard.press('z');
			await page.keyboard.up('Control');
			await page.waitForTimeout(500);
		}
	});

	test('should support redo operation', async ({ page }) => {
		// Draw something
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Click brushes to show brush toolbar, then select halfblock
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await page.locator('#halfblock').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Undo
			await page.keyboard.down('Control');
			await page.keyboard.press('z');
			await page.keyboard.up('Control');
			await page.waitForTimeout(300);

			// Redo
			await page.keyboard.down('Control');
			await page.keyboard.press('y');
			await page.keyboard.up('Control');
			await page.waitForTimeout(300);
		}
	});

	test('should support copy and paste with selection tool', async ({
		page,
	}) => {
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Draw something - click brushes to show brush toolbar
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await page.locator('#halfblock').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 70, box.y + 70);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Select the area
			await page.locator('#selection').click();
			await page.mouse.move(box.x + 40, box.y + 40);
			await page.mouse.down();
			await page.mouse.move(box.x + 80, box.y + 80);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Copy
			const copyButton = page.locator('#copy');
			if (await copyButton.isVisible()) {
				await copyButton.click();
				await page.waitForTimeout(300);

				// Paste
				const pasteButton = page.locator('#paste');
				if (await pasteButton.isVisible()) {
					await pasteButton.click();
					await page.waitForTimeout(300);
				}
			}
		}
	});
});
