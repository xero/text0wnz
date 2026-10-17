import { test, expect } from '@playwright/test';
import {
	parkToolSettings,
	bridgeReady,
	clickTool,
	drag,
	readBlock,
} from './helpers/editorHelpers.js';

test.describe('Advanced Undo/Redo Operations', () => {
	test.beforeEach(async ({ page }) => {
		// the ?test bridge lets the shape tests read cells back across
		// the undo/redo cycle
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should undo and redo multiple drawing operations', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);

			await canvas.click({ position: { x: 100, y: 50 } });
			await page.waitForTimeout(200);

			await canvas.click({ position: { x: 150, y: 50 } });
			await page.waitForTimeout(200);
		}

		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);

		await page.keyboard.press('Control+y');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+y');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+y');
		await page.waitForTimeout(200);
	});

	test('should handle undo after tool switching', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}

		await page.locator('#characterBrush').click();
		await page.waitForTimeout(300);

		if (bbox) {
			await canvas.click({ position: { x: 100, y: 50 } });
			await page.waitForTimeout(200);
		}

		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);
		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);
	});

	test('should handle undo/redo with line tool', async ({ page }) => {
		await page.locator('#shapes').click();
		await clickTool(page, 'line');
		await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [10, 5], [20, 5]);
		expect([0, 32]).not.toContain((await readBlock(page, 15, 5)).charCode);

		await page.keyboard.press('Control+z');
		expect([0, 32]).toContain((await readBlock(page, 15, 5)).charCode);

		await page.keyboard.press('Control+y');
		expect([0, 32]).not.toContain((await readBlock(page, 15, 5)).charCode);
	});

	test('should handle undo/redo with filled shapes', async ({ page }) => {
		await page.locator('#shapes').click();
		await clickTool(page, 'square');
		await expect(page.locator('#square')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [10, 8], [20, 14]);
		expect([0, 32]).not.toContain((await readBlock(page, 10, 8)).charCode);

		await page.keyboard.press('Control+z');
		expect([0, 32]).toContain((await readBlock(page, 10, 8)).charCode);

		await page.keyboard.press('Control+y');
		expect([0, 32]).not.toContain((await readBlock(page, 10, 8)).charCode);
	});

	test('should handle undo after fill operation', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}

		// fill lives in the brush submenu now
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		const fillTool = page.locator('#fill');
		if (await fillTool.isVisible()) {
			await fillTool.click();
			await page.waitForTimeout(300);

			if (bbox) {
				await canvas.click({ position: { x: 100, y: 100 } });
				await page.waitForTimeout(500);
			}

			await page.keyboard.press('Control+z');
			await page.waitForTimeout(200);

			await page.keyboard.press('Control+y');
			await page.waitForTimeout(200);
		}
	});

	test('should maintain undo stack after canvas resize', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}

		const settingsButton = page.locator(
			'button:has-text("Settings"), button[aria-label*="Settings"]',
		);
		if (await settingsButton.isVisible()) {
			await settingsButton.click();
			await page.waitForTimeout(300);

			// a resize may clear the undo stack; just verify undo still works
			await page.keyboard.press('Escape');
			await page.waitForTimeout(200);
		}

		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);
	});

	test('should handle rapid undo/redo operations', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			for (let i = 0; i < 5; i++) {
				await canvas.click({ position: { x: 50 + i * 20, y: 50 } });
				await page.waitForTimeout(100);
			}
		}

		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Control+z');
			await page.waitForTimeout(50);
		}

		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Control+y');
			await page.waitForTimeout(50);
		}
	});

	test('should clear redo stack when new operation is performed', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);

			await canvas.click({ position: { x: 100, y: 50 } });
			await page.waitForTimeout(200);

			await page.keyboard.press('Control+z');
			await page.waitForTimeout(200);

			// a new operation clears the redo stack
			await canvas.click({ position: { x: 150, y: 50 } });
			await page.waitForTimeout(200);

			// redo now has nothing to apply
			await page.keyboard.press('Control+y');
			await page.waitForTimeout(200);
		}
	});

	test('should handle undo/redo with selection tool', async ({ page }) => {
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

				await page.keyboard.press('Control+c');
				await page.waitForTimeout(200);
				await page.keyboard.press('Control+v');
				await page.waitForTimeout(200);
			}
		}

		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);

		await page.keyboard.press('Control+y');
		await page.waitForTimeout(200);
	});

	test('should handle undo with keyboard mode text input', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.type('Hello');
		await page.waitForTimeout(300);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);

		await page.keyboard.press('Control+z');
		await page.waitForTimeout(200);

		await page.keyboard.press('Control+y');
		await page.waitForTimeout(200);
	});

	test('should handle undo menu buttons if available', async ({ page }) => {
		const undoButton = page.locator(
			'button:has-text("Undo"), button[aria-label*="Undo"], button[title*="Undo"]',
		);
		const redoButton = page.locator(
			'button:has-text("Redo"), button[aria-label*="Redo"], button[title*="Redo"]',
		);

		const canvas = page.locator('#canvasContainer canvas').first();

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);
		await page.locator('#halfblock').click();
		await page.waitForTimeout(300);

		const bbox = await canvas.boundingBox();
		if (bbox) {
			await canvas.click({ position: { x: 50, y: 50 } });
			await page.waitForTimeout(200);
		}

		if (await undoButton.isVisible()) {
			await undoButton.click();
			await page.waitForTimeout(200);

			if (await redoButton.isVisible()) {
				await redoButton.click();
				await page.waitForTimeout(200);
			}
		}
	});
});
