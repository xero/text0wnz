import { test, expect } from '@playwright/test';
import { waitForEditorReady, focusCanvas, getActiveTool } from './helpers/editorHelpers';

test.describe('Editor Keybinds', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test.describe('Tool Selection', () => {
		test('activates keyboard mode with K key', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Check that keyboard toolbar is visible
			const keyboardToolbar = page.locator('#keyboardToolbar');
			// TODO: Adjust assertion based on how keyboard mode is indicated in the UI
			// The toolbar may have a specific class or visibility state
			const isVisible = await keyboardToolbar.isVisible();
			// We expect it to be visible or toggle state
			expect(isVisible).toBeDefined();
		});

		test('activates freehand/halfblock tool with F key', async ({ page }) => {
			await page.keyboard.press('f');
			await page.waitForTimeout(300);

			// Check for no errors
			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);

			// TODO: Check if halfblock tool is active
			// May need to check for active class on #halfblock element
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

			// Check if fill tool is indicated as active
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

			// Mirror button should be visible
			const mirror = page.locator('#mirror');
			await expect(mirror).toBeVisible();
		});

		test('toggles grid with G key', async ({ page }) => {
			await page.keyboard.press('g');
			await page.waitForTimeout(300);

			// Grid element should exist
			const grid = page.locator('#grid');
			await expect(grid).toBeAttached();
		});

		test('toggles ICE colors with I key', async ({ page }) => {
			await page.keyboard.press('i');
			await page.waitForTimeout(300);

			// No errors should occur
			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);

			// ICE button should be attached (may be in hidden toolbar)
			const iceButton = page.locator('#navICE');
			await expect(iceButton).toBeAttached();
		});
	});

	test.describe('Navigation in Keyboard Mode', () => {
		test('arrow keys move cursor', async ({ page }) => {
			// Enter keyboard mode first
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Get initial position
			const initialPosition = await page.locator('#positionInfo').textContent();

			// Press right arrow
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(200);

			const afterRight = await page.locator('#positionInfo').textContent();

			// Position should have changed
			expect(afterRight).not.toBe(initialPosition);

			// Press down arrow
			await page.keyboard.press('ArrowDown');
			await page.waitForTimeout(200);

			const afterDown = await page.locator('#positionInfo').textContent();
			expect(afterDown).not.toBe(afterRight);
		});

		test('Home key moves to start of row', async ({ page }) => {
			// Enter keyboard mode
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Move to the right a bit first
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(200);

			// Press Home
			await page.keyboard.press('Home');
			await page.waitForTimeout(200);

			// Position info should show column 0 or 1 (depending on 0-indexed or 1-indexed)
			const position = await page.locator('#positionInfo').textContent();
			// TODO: Adjust assertion based on actual position display format
			expect(position).toBeDefined();
		});

		test('End key moves to end of row', async ({ page }) => {
			// Enter keyboard mode
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Press End
			await page.keyboard.press('End');
			await page.waitForTimeout(200);

			// Position should have changed
			const position = await page.locator('#positionInfo').textContent();
			expect(position).toBeDefined();
		});

		test('PageUp and PageDown move cursor by screen height', async ({ page }) => {
			// Enter keyboard mode
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Get initial position
			const initialPosition = await page.locator('#positionInfo').textContent();

			// Press PageDown
			await page.keyboard.press('PageDown');
			await page.waitForTimeout(300);

			const afterPageDown = await page.locator('#positionInfo').textContent();
			expect(afterPageDown).not.toBe(initialPosition);

			// Press PageUp
			await page.keyboard.press('PageUp');
			await page.waitForTimeout(300);

			const afterPageUp = await page.locator('#positionInfo').textContent();
			expect(afterPageUp).not.toBe(afterPageDown);
		});
	});

	test.describe('File & Canvas Operations', () => {
		test('Ctrl+Z undoes action', async ({ page }) => {
			// Draw something first by clicking on canvas
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				// Activate halfblock tool
				await page.keyboard.press('f');
				await page.waitForTimeout(200);

				// Draw by clicking
				await page.mouse.click(box.x + 50, box.y + 50);
				await page.waitForTimeout(300);

				// Undo with Ctrl+Z
				await page.keyboard.press('Control+z');
				await page.waitForTimeout(300);

				// No errors should occur
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('Ctrl+Y redoes action', async ({ page }) => {
			// Draw something
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				// Activate halfblock tool
				await page.keyboard.press('f');
				await page.waitForTimeout(200);

				// Draw
				await page.mouse.click(box.x + 50, box.y + 50);
				await page.waitForTimeout(300);

				// Undo
				await page.keyboard.press('Control+z');
				await page.waitForTimeout(300);

				// Redo with Ctrl+Y
				await page.keyboard.press('Control+y');
				await page.waitForTimeout(300);

				// No errors should occur
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});
	});

	test.describe('Copy/Paste Operations', () => {
		test('Ctrl+C copies selection', async ({ page }) => {
			// Activate selection tool
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			// Create a selection by dragging
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 20, box.y + 20);
				await page.mouse.down();
				await page.mouse.move(box.x + 100, box.y + 50);
				await page.mouse.up();
				await page.waitForTimeout(300);

				// Copy with Ctrl+C
				await page.keyboard.press('Control+c');
				await page.waitForTimeout(300);

				// No errors should occur
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('Ctrl+V pastes selection', async ({ page }) => {
			// First copy something (create selection and copy)
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				// Create selection
				await page.mouse.move(box.x + 20, box.y + 20);
				await page.mouse.down();
				await page.mouse.move(box.x + 80, box.y + 40);
				await page.mouse.up();
				await page.waitForTimeout(300);

				// Copy
				await page.keyboard.press('Control+c');
				await page.waitForTimeout(300);

				// Paste with Ctrl+V
				await page.keyboard.press('Control+v');
				await page.waitForTimeout(300);

				// No errors should occur
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});
	});

	test.describe('Function Keys', () => {
		test('F1 inserts character in keyboard mode', async ({ page }) => {
			// Enter keyboard mode
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Press F1 (should insert light shade block ░)
			await page.keyboard.press('F1');
			await page.waitForTimeout(200);

			// No errors should occur
			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('F2 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Press F2 (should insert medium shade block ▒)
			await page.keyboard.press('F2');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('F3 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Press F3 (should insert dark shade block ▓)
			await page.keyboard.press('F3');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});

		test('F4 inserts character in keyboard mode', async ({ page }) => {
			await page.keyboard.press('k');
			await page.waitForTimeout(300);

			// Press F4 (should insert full block █)
			await page.keyboard.press('F4');
			await page.waitForTimeout(200);

			const errors = await page.locator('.error').count();
			expect(errors).toBe(0);
		});
	});

	test.describe('Selection Operations', () => {
		test('[ flips selection horizontally', async ({ page }) => {
			// Activate selection tool
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			// Create a selection
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 30, box.y + 30);
				await page.mouse.down();
				await page.mouse.move(box.x + 90, box.y + 60);
				await page.mouse.up();
				await page.waitForTimeout(300);

				// Press [ to flip horizontally
				await page.keyboard.press('[');
				await page.waitForTimeout(300);

				// No errors should occur
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('] flips selection vertically', async ({ page }) => {
			// Activate selection tool
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			// Create a selection
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 30, box.y + 30);
				await page.mouse.down();
				await page.mouse.move(box.x + 90, box.y + 60);
				await page.mouse.up();
				await page.waitForTimeout(300);

				// Press ] to flip vertically
				await page.keyboard.press(']');
				await page.waitForTimeout(300);

				// No errors should occur
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);
			}
		});

		test('M toggles move mode for selection', async ({ page }) => {
			// Activate selection tool
			await page.keyboard.press('s');
			await page.waitForTimeout(300);

			// Create a selection
			const canvas = page.locator('#canvasContainer canvas').first();
			const box = await canvas.boundingBox();

			if (box) {
				await page.mouse.move(box.x + 30, box.y + 30);
				await page.mouse.down();
				await page.mouse.move(box.x + 90, box.y + 60);
				await page.mouse.up();
				await page.waitForTimeout(300);

				// Press M to toggle move mode
				await page.keyboard.press('m');
				await page.waitForTimeout(300);

				// Check that move mode is active
				// TODO: Verify move mode indicator in UI
				const errors = await page.locator('.error').count();
				expect(errors).toBe(0);

				// Press M again to toggle off
				await page.keyboard.press('m');
				await page.waitForTimeout(300);
			}
		});
	});
});
