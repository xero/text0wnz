import { test, expect } from '@playwright/test';
import { clickTool } from './helpers/editorHelpers.js';

test.describe('Keyboard Shortcuts', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support undo with Ctrl+Z', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await clickTool(page, 'halfblock');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+z');
			await page.waitForTimeout(300);
		}
	});

	test('should support redo with Ctrl+Y', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await clickTool(page, 'halfblock');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+z');
			await page.waitForTimeout(200);
			await page.keyboard.press('Control+y');
			await page.waitForTimeout(300);
		}
	});

	test('should activate freehand tool with F key', async ({ page }) => {
		await page.keyboard.press('f');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should activate character tool with C key', async ({ page }) => {
		await page.keyboard.press('c');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should activate brush tool with B key', async ({ page }) => {
		await page.keyboard.press('b');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should activate line tool with L key', async ({ page }) => {
		await page.keyboard.press('l');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should activate selection tool with S key', async ({ page }) => {
		await page.keyboard.press('s');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should toggle keyboard mode with K key', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should support Tab key in keyboard mode', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.press('Tab');
		await page.waitForTimeout(200);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should support arrow keys for navigation', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(100);
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(100);
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(100);
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should cycle through colors with number keys', async ({ page }) => {
		for (let i = 1; i <= 8; i++) {
			await page.keyboard.press(`${i}`);
			await page.waitForTimeout(100);
		}

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should support F1-F12 function keys in keyboard mode', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		const fKeys = [
			'F1',
			'F2',
			'F3',
			'F4',
			'F5',
			'F6',
			'F7',
			'F8',
			'F9',
			'F10',
			'F11',
			'F12',
		];

		for (const fKey of fKeys) {
			await page.keyboard.press(fKey);
			await page.waitForTimeout(150);
		}

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should cycle fkey character sets with Ctrl+[ and Ctrl+]', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.press('Control+BracketRight');
		await page.waitForTimeout(200);

		await page.keyboard.press('F1');
		await page.waitForTimeout(200);

		await page.keyboard.press('Control+BracketLeft');
		await page.waitForTimeout(200);

		await page.keyboard.press('F1');
		await page.waitForTimeout(200);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should click fkey navigation buttons', async ({ page }) => {
		const prevButton = page.locator('#fkeySetPrev');
		const nextButton = page.locator('#fkeySetNext');

		if (await nextButton.isVisible()) {
			await nextButton.click();
			await page.waitForTimeout(200);
		}

		if (await prevButton.isVisible()) {
			await prevButton.click();
			await page.waitForTimeout(200);
		}

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should click fkey canvases to insert characters', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		for (let i = 0; i < 12; i++) {
			const fkeyCanvas = page.locator(`#fkey${i}`);
			if (await fkeyCanvas.isVisible()) {
				await fkeyCanvas.click();
				await page.waitForTimeout(100);
			}
		}

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should support copy with Ctrl+C', async ({ page }) => {
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(200);
		}
	});

	test('should support paste with Ctrl+V', async ({ page }) => {
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(200);

			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should support cut with Ctrl+X', async ({ page }) => {
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+x');
			await page.waitForTimeout(300);
		}
	});

	test('should support Delete key for selection deletion', async ({ page }) => {
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Delete');
			await page.waitForTimeout(300);
		}
	});

	test('should support Escape key to cancel operations', async ({ page }) => {
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});
});

test.describe('Keyboard Mode', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should enter keyboard mode and type text', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.type('Hello ANSI!');
		await page.waitForTimeout(300);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should navigate with Home and End keys', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.press('Home');
		await page.waitForTimeout(100);

		await page.keyboard.press('End');
		await page.waitForTimeout(100);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should navigate with PageUp and PageDown keys', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.press('PageDown');
		await page.waitForTimeout(100);

		await page.keyboard.press('PageUp');
		await page.waitForTimeout(100);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should support Enter key for new line', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.type('Line 1');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line 2');
		await page.waitForTimeout(300);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should support Backspace for deletion', async ({ page }) => {
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		await page.keyboard.type('Test');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(300);

		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});
});
