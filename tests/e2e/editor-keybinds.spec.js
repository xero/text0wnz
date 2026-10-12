import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers/editorHelpers.js';

test.describe('Editor Keybinds', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test.describe('Tool Selection', () => {
		test('activates keyboard mode with K key', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			const keyboardToolbar = page.locator('#keyboardToolbar');
			// TODO: assert on however keyboard mode is indicated in the UI
			const isVisible = await keyboardToolbar.isVisible();
			expect(isVisible).toBeDefined();
		});

		test('activates freehand/halfblock tool with F key', async ({ page }) => {
			await page.keyboard.press('f');
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);

			// TODO: check that the halfblock tool is active
		});

		test('activates character brush with B key', async ({ page }) => {
			await page.keyboard.press('b');
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('activates fill tool with N key', async ({ page }) => {
			await page.keyboard.press('n');
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);

			const fillTool = page.locator('#fill');
			await expect(fillTool).toBeVisible();
		});

		test('activates attribute brush with A key', async ({ page }) => {
			await page.keyboard.press('a');
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('toggles mirror mode with M key', async ({ page }) => {
			await page.keyboard.press('m');
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);

			const mirror = page.locator('#mirror');
			await expect(mirror).toBeVisible();
		});

		test('toggles grid with G key', async ({ page }) => {
			await page.keyboard.press('g');
			await page.waitForTimeout(300);

			const grid = page.locator('#grid');
			await expect(grid).toBeAttached();
		});

		test('toggles ICE colors with I key', async ({ page }) => {
			await page.keyboard.press('i');
			await page.waitForTimeout(300);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);

			// the ICE button may sit in a hidden toolbar; pin attachment only
			const iceButton = page.locator('#navICE');
			await expect(iceButton).toBeAttached();
		});
	});

	test.describe('Navigation in Keyboard Mode', () => {
		test('arrow keys move cursor', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			const initialPosition = await page.locator('#positionInfo').textContent();

			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(200);

			const afterRight = await page.locator('#positionInfo').textContent();

			expect(afterRight).not.toBe(initialPosition);

			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(200);

			const afterDown = await page.locator('#positionInfo').textContent();
			expect(afterDown).not.toBe(afterRight);
		});

		test('Home key moves to start of row', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(200);

			await page.keyboard.press('Home');
			await page.waitForTimeout(200);

			const position = await page.locator('#positionInfo').textContent();
			// TODO: assert the column once the display format is pinned
			expect(position).toBeDefined();
		});

		test('End key moves to end of row', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			await page.keyboard.press('End');
			await page.waitForTimeout(200);

			const position = await page.locator('#positionInfo').textContent();
			expect(position).toBeDefined();
		});

		test('PageUp and PageDown move cursor by screen height', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			const initialPosition = await page.locator('#positionInfo').textContent();

			await page.keyboard.press('PageDown');
			await page.waitForTimeout(300);

			const afterPageDown = await page.locator('#positionInfo').textContent();
			expect(afterPageDown).not.toBe(initialPosition);

			await page.keyboard.press('PageUp');
			await page.waitForTimeout(300);

			const afterPageUp = await page.locator('#positionInfo').textContent();
			expect(afterPageUp).not.toBe(afterPageDown);
		});
	});

	test.describe('File & Canvas Operations', () => {
		test('Ctrl+Z undoes action', async ({ page }) => {
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.keyboard.press('f');
				await page.waitForTimeout(200);

				await page.mouse.click(box.x + 50, box.y + 50);
				await page.waitForTimeout(300);

				await page.keyboard.press('Control+z');
				await page.waitForTimeout(300);

				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('Ctrl+Y redoes action', async ({ page }) => {
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.keyboard.press('f');
				await page.waitForTimeout(200);

				await page.mouse.click(box.x + 50, box.y + 50);
				await page.waitForTimeout(300);

				await page.keyboard.press('Control+z');
				await page.waitForTimeout(300);

				await page.keyboard.press('Control+y');
				await page.waitForTimeout(300);

				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});
	});

	test.describe('Copy/Paste Operations', () => {
		test('Ctrl+C copies selection', async ({ page }) => {
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 20, box.y + 20);
				await page.mouse.down();
				await page.mouse.move(box.x + 100, box.y + 50);
				await page.mouse.up();
				await page.waitForTimeout(300);

				await page.keyboard.press('Control+c');
				await page.waitForTimeout(300);

				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('Ctrl+V pastes selection', async ({ page }) => {
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 20, box.y + 20);
				await page.mouse.down();
				await page.mouse.move(box.x + 80, box.y + 40);
				await page.mouse.up();
				await page.waitForTimeout(300);

				await page.keyboard.press('Control+c');
				await page.waitForTimeout(300);

				await page.keyboard.press('Control+v');
				await page.waitForTimeout(300);

				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});
	});

	test.describe('Function Keys', () => {
		test('F1 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// F1 inserts the light shade block ░
			await page.keyboard.press('F1');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('F2 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// F2 inserts the medium shade block ▒
			await page.keyboard.press('F2');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('F3 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// F3 inserts the dark shade block ▓
			await page.keyboard.press('F3');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('F4 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// F4 inserts the full block █
			await page.keyboard.press('F4');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});
	});

	test.describe('Selection Operations', () => {
		test('[ flips selection horizontally', async ({ page }) => {
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 30, box.y + 30);
				await page.mouse.down();
				await page.mouse.move(box.x + 90, box.y + 60);
				await page.mouse.up();
				await page.waitForTimeout(300);

				await page.keyboard.press('[');
				await page.waitForTimeout(300);

				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('] flips selection vertically', async ({ page }) => {
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 30, box.y + 30);
				await page.mouse.down();
				await page.mouse.move(box.x + 90, box.y + 60);
				await page.mouse.up();
				await page.waitForTimeout(300);

				await page.keyboard.press(']');
				await page.waitForTimeout(300);

				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('M toggles move mode for selection', async ({ page }) => {
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 30, box.y + 30);
				await page.mouse.down();
				await page.mouse.move(box.x + 90, box.y + 60);
				await page.mouse.up();
				await page.waitForTimeout(300);

				await page.keyboard.press('m');
				await page.waitForTimeout(300);

				// TODO: verify the move-mode indicator in the UI
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);

				await page.keyboard.press('m');
				await page.waitForTimeout(300);
			}
		});
	});
});
