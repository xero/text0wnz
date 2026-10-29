import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	cursorAt,
	drag,
	parkToolSettings,
	readBlock,
	readRegion,
	tap,
	writeText,
} from './helpers/editorHelpers.js';

const inked = async (page, x, y) =>
	![0, 32].includes((await readBlock(page, x, y)).charCode);

test.describe('Editor Keybinds', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	// keyboard mode is the boot tool and turns paint shortcuts off, so
	// every letter test leaves typing mode first or it only types
	test.describe('Tool Selection', () => {
		test('activates keyboard mode with K key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			await expect(page.locator('#tsKeyboard')).toBeHidden();
			await page.keyboard.press('k');

			await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
			await expect(page.locator('#tsKeyboard')).toBeVisible();
		});

		test('activates the halfblock brush with F key', async ({ page }) => {
			await clickTool(page, 'characterBrush');
			await page.keyboard.press('f');

			await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
			await expect(page.locator('#characterBrush')).not.toHaveClass(
				/toolbarDisplayed/,
			);
		});

		test('activates character brush with B key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			await page.keyboard.press('b');

			await expect(page.locator('#characterBrush')).toHaveClass(
				/toolbarDisplayed/,
			);
			await expect(page.locator('#halfblock')).not.toHaveClass(/toolbarDisplayed/);
		});

		test('activates fill tool with N key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			await page.keyboard.press('n');

			// activating a tool closes the flyout; reopen it to see the
			// lit item
			await page.locator('#brushes').click();
			const fillTool = page.locator('#fill');
			await expect(fillTool).toBeVisible();
			await expect(fillTool).toHaveClass(/toolbarDisplayed/);
		});

		test('activates attribute brush with A key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			await page.keyboard.press('a');

			await expect(page.locator('#attrib')).toHaveClass(/toolbarDisplayed/);
		});

		test('toggles mirror mode with M key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			const mirror = page.locator('#mirror');
			await expect(mirror).not.toHaveClass(/enabled/);

			await page.keyboard.press('m');
			await expect(mirror).toHaveClass(/enabled/);
			await page.keyboard.press('m');
			await expect(mirror).not.toHaveClass(/enabled/);
		});

		test('toggles grid with G key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			const grid = page.locator('#navGrid');
			await expect(grid).not.toHaveClass(/enabled/);

			await page.keyboard.press('g');
			await expect(grid).toHaveClass(/enabled/);
			await page.keyboard.press('g');
			await expect(grid).not.toHaveClass(/enabled/);
		});

		test('toggles ICE colors with I key', async ({ page }) => {
			await clickTool(page, 'halfblock');
			const ice = page.locator('#navICE');
			await expect(ice).not.toHaveClass(/enabled/);

			await page.keyboard.press('i');
			await expect(ice).toHaveClass(/enabled/);
			await page.keyboard.press('i');
			await expect(ice).not.toHaveClass(/enabled/);
		});
	});

	test.describe('Navigation in Keyboard Mode', () => {
		test('arrow keys move cursor', async ({ page }) => {
			const start = await cursorAt(page);

			await page.keyboard.press('ArrowRight');
			expect(await cursorAt(page)).toEqual({ x: start.x + 1, y: start.y });

			await page.keyboard.press('ArrowDown');
			expect(await cursorAt(page)).toEqual({ x: start.x + 1, y: start.y + 1 });
		});

		test('Home key moves to start of row', async ({ page }) => {
			await tap(page, 10, 4);
			await page.keyboard.press('Home');

			expect(await cursorAt(page)).toEqual({ x: 0, y: 4 });
		});

		test('End key moves to end of row', async ({ page }) => {
			await tap(page, 10, 4);
			await page.keyboard.press('End');

			expect(await cursorAt(page)).toEqual({ x: 79, y: 4 });
		});

		test('PageUp and PageDown move cursor by screen height', async ({ page }) => {
			// taller than the viewport, or PageDown clamps at the last row
			// before it travels a full screen
			const screen = await page.evaluate(() => {
				const s = window.__t0wnz.State;
				s.textArtCanvas.resize(80, 200);
				return Math.floor(
					document.getElementById('viewport').clientHeight /
					s.font.getHeight(),
				);
			});
			expect(screen).toBeGreaterThan(1);
			await tap(page, 10, 4);

			await page.keyboard.press('PageDown');
			expect(await cursorAt(page)).toEqual({ x: 10, y: 4 + screen });

			await page.keyboard.press('PageUp');
			expect(await cursorAt(page)).toEqual({ x: 10, y: 4 });
		});
	});

	test.describe('File & Canvas Operations', () => {
		test('Ctrl+Z undoes action', async ({ page }) => {
			await clickTool(page, 'halfblock');
			await tap(page, 5, 5);
			expect(await inked(page, 5, 5)).toBe(true);

			await page.keyboard.press('Control+z');
			expect(await inked(page, 5, 5)).toBe(false);
		});

		test('Ctrl+Y redoes action', async ({ page }) => {
			await clickTool(page, 'halfblock');
			await tap(page, 5, 5);
			await page.keyboard.press('Control+z');
			expect(await inked(page, 5, 5)).toBe(false);

			await page.keyboard.press('Control+y');
			expect(await inked(page, 5, 5)).toBe(true);
		});
	});

	test.describe('Copy/Paste Operations', () => {
		test('Ctrl+C copies selection', async ({ page }) => {
			await writeText(page, 10, 5, 'ABC');
			await expect(page.locator('#paste')).toHaveClass(/disabled/);

			// no tool click: a keyboard mode drag hands over to selection
			await drag(page, [10, 5], [12, 5]);
			await expect(page.locator('#selection')).toHaveClass(/toolbarDisplayed/);
			await page.keyboard.press('Control+c');

			await expect(page.locator('#paste')).not.toHaveClass(/disabled/);
		});

		test('Ctrl+V pastes selection', async ({ page }) => {
			await writeText(page, 10, 5, 'ABC');
			await page.locator('#selection').click();
			await drag(page, [10, 5], [12, 5]);
			await page.keyboard.press('Control+c');
			await tap(page, 30, 10);
			await page.keyboard.press('Control+v');

			expect(await readRegion(page, 30, 10, 32, 10)).toEqual(['ABC']);
		});
	});

	test.describe('Function Keys', () => {
		// the boot page is the shades and blocks set
		const firstFour = [176, 177, 178, 219];
		for (const [i, code] of firstFour.entries()) {
			test(`F${i + 1} inserts character in keyboard mode`, async ({ page }) => {
				const at = await cursorAt(page);
				await page.keyboard.press(`F${i + 1}`);

				expect((await readBlock(page, at.x, at.y)).charCode).toBe(code);
				expect(await cursorAt(page)).toEqual({ x: at.x + 1, y: at.y });
			});
		}
	});

	test.describe('Selection Operations', () => {
		test('[ flips selection horizontally', async ({ page }) => {
			await writeText(page, 10, 5, 'ABC');
			await page.locator('#selection').click();
			await drag(page, [10, 5], [12, 5]);
			await page.keyboard.press('[');

			expect(await readRegion(page, 10, 5, 12, 5)).toEqual(['CBA']);
		});

		test('] flips selection vertically', async ({ page }) => {
			await writeText(page, 10, 5, 'A');
			await writeText(page, 10, 6, 'B');
			await page.locator('#selection').click();
			await drag(page, [10, 5], [10, 6]);
			await page.keyboard.press(']');

			expect(await readRegion(page, 10, 5, 10, 6)).toEqual(['B', 'A']);
		});

		test('M toggles move mode for selection', async ({ page }) => {
			await writeText(page, 10, 5, 'AB');
			await page.locator('#selection').click();
			await drag(page, [10, 5], [11, 5]);
			const move = page.locator('#moveBlocks');

			await page.keyboard.press('m');
			await expect(move).toHaveClass(/enabled/);
			await page.keyboard.press('ArrowRight');
			expect(await readRegion(page, 10, 5, 12, 5)).toEqual([' AB']);

			await page.keyboard.press('m');
			await expect(move).not.toHaveClass(/enabled/);
		});
	});
});
