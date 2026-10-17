import { test, expect } from '@playwright/test';
import {
	parkToolSettings,
	bridgeReady,
	clickTool,
	drag,
	readBlock,
} from './helpers/editorHelpers.js';

test.describe('Drawing Tools', () => {
	test.beforeEach(async ({ page }) => {
		// the ?test bridge lets these tests read cells back, so a drag
		// that silently dies fails instead of passing green
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should activate halfblock drawing tool', async ({ page }) => {
		// Click on brushes sidebar button to show brush toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const halfblockTool = page.locator('#halfblock');
		await halfblockTool.click();

		const classList = await halfblockTool.getAttribute('class');
		expect(classList).toBeTruthy();
	});

	test('should activate character brush tool', async ({ page }) => {
		// Click on brushes sidebar button to show brush toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const characterBrushTool = page.locator('#characterBrush');
		await characterBrushTool.click();
		await page.waitForTimeout(300);

		const classList = await characterBrushTool.getAttribute('class');
		expect(classList).toBeTruthy();
	});

	test('should activate shading brush tool', async ({ page }) => {
		// Click on brushes sidebar button to show brush toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const shadingBrushTool = page.locator('#shadingBrush');
		await shadingBrushTool.click();
		await page.waitForTimeout(300);
	});

	test('should activate line tool', async ({ page }) => {
		// Click on shapes sidebar button to show shapes toolbar
		await page.locator('#shapes').click();
		await clickTool(page, 'line');
		await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [10, 5], [20, 10]);
		// endpoint ink proves the drag reached the tool
		expect([0, 32]).not.toContain((await readBlock(page, 10, 5)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 20, 10)).charCode);
	});

	test('should activate square tool', async ({ page }) => {
		// Click on shapes sidebar button to show shapes toolbar
		await page.locator('#shapes').click();
		await clickTool(page, 'square');
		await expect(page.locator('#square')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [30, 5], [40, 10]);
		// every corner carries ink when the drag really lands
		expect([0, 32]).not.toContain((await readBlock(page, 30, 5)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 40, 5)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 30, 10)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 40, 10)).charCode);
	});

	test('should activate circle tool', async ({ page }) => {
		// Click on shapes sidebar button to show shapes toolbar
		await page.locator('#shapes').click();
		await clickTool(page, 'circle');
		await expect(page.locator('#circle')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [50, 8], [56, 12]);
		// rim placement differs by mode, so pin only that ink landed
		const inked = await page.evaluate(() => {
			const c = window.__t0wnz.State.textArtCanvas;
			let n = 0;
			for (let y = 0; y < c.getRows(); y++) {
				for (let x = 0; x < c.getColumns(); x++) {
					const code = c.getBlock(x, y).charCode;
					if (code !== 0 && code !== 32) {
						n++;
					}
				}
			}
			return n;
		});
		expect(inked).toBeGreaterThan(0);
	});

	test('should activate selection tool', async ({ page }) => {
		const selectionTool = page.locator('#selection');
		await selectionTool.click();
		await page.waitForTimeout(300);

		const canvas = page.locator('#canvasContainer canvas').first();
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
		// fill lives in the brush submenu now
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		const fillTool = page.locator('#fill');
		await fillTool.click();
		await page.waitForTimeout(300);
		await expect(fillTool).toHaveClass(/toolbarDisplayed/);
	});

	test('should draw with multiple tools in sequence', async ({ page }) => {
		// Click brushes to show brush toolbar, then select halfblock
		await page.locator('#brushes').click();
		await page.locator('#halfblock').click();
		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
		await drag(page, [5, 5], [10, 8]);
		expect([0, 32]).not.toContain((await readBlock(page, 5, 5)).charCode);

		// Click shapes to show shapes toolbar, then select line
		await page.locator('#shapes').click();
		await clickTool(page, 'line');
		await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);
		await drag(page, [15, 10], [25, 10]);
		expect([0, 32]).not.toContain((await readBlock(page, 20, 10)).charCode);

		// Square is also in shapes toolbar
		await clickTool(page, 'square');
		await expect(page.locator('#square')).toHaveClass(/toolbarDisplayed/);
		await drag(page, [30, 3], [38, 9]);
		expect([0, 32]).not.toContain((await readBlock(page, 30, 3)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 38, 9)).charCode);
	});
});

test.describe('Tool Features', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support undo operation', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
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

			await page.keyboard.down('Control');
			await page.keyboard.press('z');
			await page.keyboard.up('Control');
			await page.waitForTimeout(500);
		}
	});

	test('should support redo operation', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
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

			await page.keyboard.down('Control');
			await page.keyboard.press('z');
			await page.keyboard.up('Control');
			await page.waitForTimeout(300);

			await page.keyboard.down('Control');
			await page.keyboard.press('y');
			await page.keyboard.up('Control');
			await page.waitForTimeout(300);
		}
	});

	test('should support copy and paste with selection tool', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Click brushes to show the brush toolbar
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await page.locator('#halfblock').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 70, box.y + 70);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.locator('#selection').click();
			await page.mouse.move(box.x + 40, box.y + 40);
			await page.mouse.down();
			await page.mouse.move(box.x + 80, box.y + 80);
			await page.mouse.up();
			await page.waitForTimeout(300);

			const copyButton = page.locator('#copy');
			if (await copyButton.isVisible()) {
				await copyButton.click();
				await page.waitForTimeout(300);

				const pasteButton = page.locator('#paste');
				if (await pasteButton.isVisible()) {
					await pasteButton.click();
					await page.waitForTimeout(300);
				}
			}
		}
	});
});
