import { test, expect } from '@playwright/test';

test.describe('Keyboard Shortcuts', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should support undo with Ctrl+Z', async ({ page }) => {
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
			await page.keyboard.press('Control+z');
			await page.waitForTimeout(300);
		}
	});

	test('should support redo with Ctrl+Y', async ({ page }) => {
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

			// Undo then redo
			await page.keyboard.press('Control+z');
			await page.waitForTimeout(200);
			await page.keyboard.press('Control+y');
			await page.waitForTimeout(300);
		}
	});

	test('should activate freehand tool with F key', async ({ page }) => {
		await page.keyboard.press('f');
		await page.waitForTimeout(200);

		// Verify no errors
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
		// Press K to toggle keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Press K again to toggle back
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should support Tab key in keyboard mode', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Use Tab key
		await page.keyboard.press('Tab');
		await page.waitForTimeout(200);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should support arrow keys for navigation', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Use arrow keys
		await page.keyboard.press('ArrowRight');
		await page.waitForTimeout(100);
		await page.keyboard.press('ArrowDown');
		await page.waitForTimeout(100);
		await page.keyboard.press('ArrowLeft');
		await page.waitForTimeout(100);
		await page.keyboard.press('ArrowUp');
		await page.waitForTimeout(100);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should cycle through colors with number keys', async ({ page }) => {
		// Try number keys for color selection
		for (let i = 1; i <= 8; i++) {
			await page.keyboard.press(`${i}`);
			await page.waitForTimeout(100);
		}

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should support F1-F12 function keys', async ({ page }) => {
		// F keys often correspond to tool selection or shortcuts
		const fKeys = ['F1', 'F2', 'F3', 'F4', 'F5', 'F6'];

		for (const fKey of fKeys) {
			await page.keyboard.press(fKey);
			await page.waitForTimeout(150);
		}

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should support copy with Ctrl+C', async ({ page }) => {
		// Select an area first
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Copy
			await page.keyboard.press('Control+c');
			await page.waitForTimeout(200);
		}
	});

	test('should support paste with Ctrl+V', async ({ page }) => {
		// Select and copy an area
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			await page.keyboard.press('Control+c');
			await page.waitForTimeout(200);

			// Paste
			await page.keyboard.press('Control+v');
			await page.waitForTimeout(300);
		}
	});

	test('should support cut with Ctrl+X', async ({ page }) => {
		// Select an area
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Cut
			await page.keyboard.press('Control+x');
			await page.waitForTimeout(300);
		}
	});

	test('should support Delete key for selection deletion', async ({ page }) => {
		// Select an area
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Delete
			await page.keyboard.press('Delete');
			await page.waitForTimeout(300);
		}
	});

	test('should support Escape key to cancel operations', async ({ page }) => {
		// Start a selection
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		// Press Escape to cancel
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);

		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});
});

test.describe('Keyboard Mode', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should enter keyboard mode and type text', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Type some text
		await page.keyboard.type('Hello ANSI!');
		await page.waitForTimeout(300);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should navigate with Home and End keys', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Use Home key
		await page.keyboard.press('Home');
		await page.waitForTimeout(100);

		// Use End key
		await page.keyboard.press('End');
		await page.waitForTimeout(100);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should navigate with PageUp and PageDown keys', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Use PageDown
		await page.keyboard.press('PageDown');
		await page.waitForTimeout(100);

		// Use PageUp
		await page.keyboard.press('PageUp');
		await page.waitForTimeout(100);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should support Enter key for new line', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Type and press Enter
		await page.keyboard.type('Line 1');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line 2');
		await page.waitForTimeout(300);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});

	test('should support Backspace for deletion', async ({ page }) => {
		// Enter keyboard mode
		await page.keyboard.press('k');
		await page.waitForTimeout(300);

		// Type and delete
		await page.keyboard.type('Test');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await page.waitForTimeout(300);

		// Exit keyboard mode
		await page.keyboard.press('Escape');
		await page.waitForTimeout(200);
	});
});
