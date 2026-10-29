import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	cursorAt,
	drag,
	parkToolSettings,
	readBlock,
	readColors,
	readRegion,
	tap,
	writeText,
} from './helpers/editorHelpers.js';

const inked = async (page, x, y) =>
	![0, 32].includes((await readBlock(page, x, y)).charCode);

const boot = async page => {
	await parkToolSettings(page);
	await page.goto('/?test');
	await bridgeReady(page);
};

const selectRow = async (page, x0, x1, y) => {
	await page.locator('#selection').click();
	await drag(page, [x0, y], [x1, y]);
};

// keyboard mode is the boot tool: its cursor sits at 0,0 and letters
// type instead of firing paint shortcuts
test.describe('Keyboard Shortcuts', () => {
	test.beforeEach(async ({ page }) => {
		await boot(page);
	});

	test('should support undo with Ctrl+Z', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await drag(page, [5, 5], [10, 5]);
		expect(await inked(page, 5, 5)).toBe(true);

		await page.keyboard.press('Control+z');
		expect(await inked(page, 5, 5)).toBe(false);
		expect(await inked(page, 10, 5)).toBe(false);
	});

	test('should support redo with Ctrl+Y', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await drag(page, [5, 5], [10, 5]);
		await page.keyboard.press('Control+z');
		expect(await inked(page, 10, 5)).toBe(false);

		await page.keyboard.press('Control+y');
		expect(await inked(page, 5, 5)).toBe(true);
		expect(await inked(page, 10, 5)).toBe(true);
	});

	test('should activate freehand tool with F key', async ({ page }) => {
		await clickTool(page, 'characterBrush');
		await page.keyboard.press('f');

		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
	});

	test('should activate brush tool with B key', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await page.keyboard.press('b');

		await expect(page.locator('#characterBrush')).toHaveClass(
			/toolbarDisplayed/,
		);
	});

	test('should type letters instead of switching tools in keyboard mode', async ({ page }) => {
		await page.keyboard.type('fbcls');

		await expect.poll(() => readRegion(page, 0, 0, 4, 0)).toEqual(['fbcls']);
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
		await expect(page.locator('#halfblock')).not.toHaveClass(/toolbarDisplayed/);
	});

	test('should enter keyboard mode with K key', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await page.keyboard.press('k');

		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
		await expect(page.locator('#halfblock')).not.toHaveClass(/toolbarDisplayed/);
	});

	test('should support Tab key in keyboard mode', async ({ page }) => {
		await page.keyboard.press('Tab');

		expect((await readBlock(page, 0, 0)).charCode).toBe(9);
		expect(await cursorAt(page)).toEqual({ x: 1, y: 0 });
	});

	test('should support arrow keys for navigation', async ({ page }) => {
		await tap(page, 10, 10);
		await page.keyboard.press('ArrowRight');
		expect(await cursorAt(page)).toEqual({ x: 11, y: 10 });
		await page.keyboard.press('ArrowDown');
		expect(await cursorAt(page)).toEqual({ x: 11, y: 11 });
		await page.keyboard.press('ArrowLeft');
		expect(await cursorAt(page)).toEqual({ x: 10, y: 11 });
		await page.keyboard.press('ArrowUp');
		expect(await cursorAt(page)).toEqual({ x: 10, y: 10 });
	});

	test('should cycle through colors with number keys', async ({ page }) => {
		// bare digits are paint shortcuts, so typing mode goes first
		await clickTool(page, 'halfblock');
		for (let i = 0; i <= 7; i++) {
			await page.keyboard.press(`${i}`);
			expect((await readColors(page)).fg).toBe(i);
		}
		await page.keyboard.press('7');
		expect((await readColors(page)).fg).toBe(15);
	});

	test('should support F1-F12 function keys in keyboard mode', async ({ page }) => {
		// the boot page is the shades and blocks set
		const codes = [176, 177, 178, 219, 223, 220, 221, 222, 254, 250, 7, 32];
		for (let i = 1; i <= 12; i++) {
			await page.keyboard.press(`F${i}`);
		}

		const cells = [];
		for (let x = 0; x < 12; x++) {
			cells.push((await readBlock(page, x, 0)).charCode);
		}
		expect(cells).toEqual(codes);
	});

	test('should cycle fkey character sets with Ctrl+[ and Ctrl+]', async ({ page }) => {
		const page6 = page.locator('#charsetPage');
		await expect(page6).toHaveText(/^6\//);

		await page.keyboard.press('Control+BracketRight');
		await expect(page6).toHaveText(/^7\//);
		await page.keyboard.press('F1');
		expect((await readBlock(page, 0, 0)).charCode).toBe(1);

		await page.keyboard.press('Control+BracketLeft');
		await expect(page6).toHaveText(/^6\//);
		await page.keyboard.press('F1');
		expect((await readBlock(page, 1, 0)).charCode).toBe(176);
	});

	test('should click fkey navigation buttons', async ({ page }) => {
		const counter = page.locator('#charsetPage');
		await expect(counter).toHaveText(/^6\//);

		await page.locator('#fkeySetNext').click();
		await expect(counter).toHaveText(/^7\//);

		await page.locator('#fkeySetPrev').click();
		await page.locator('#fkeySetPrev').click();
		await expect(counter).toHaveText(/^5\//);
	});

	test('should click fkey canvases to insert characters', async ({ page }) => {
		for (let i = 0; i < 4; i++) {
			await page.locator(`#fkey${i}w`).click();
		}

		expect(await readRegion(page, 0, 0, 3, 0)).toEqual([String.fromCharCode(176, 177, 178, 219)]);
	});

	test('should support copy with Ctrl+C', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await selectRow(page, 10, 12, 5);
		await expect(page.locator('#paste')).toHaveClass(/disabled/);

		await page.keyboard.press('Control+c');
		await expect(page.locator('#paste')).not.toHaveClass(/disabled/);
	});

	test('should support paste with Ctrl+V', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await selectRow(page, 10, 12, 5);
		await page.keyboard.press('Control+c');
		await tap(page, 30, 10);
		await page.keyboard.press('Control+v');

		expect(await readRegion(page, 30, 10, 32, 10)).toEqual(['ABC']);
	});

	test('should support cut with Ctrl+X', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await selectRow(page, 10, 12, 5);
		await page.keyboard.press('Control+x');

		expect(await readRegion(page, 10, 5, 12, 5)).toEqual(['   ']);
		await expect(page.locator('#paste')).not.toHaveClass(/disabled/);
	});

	test('should delete the selection with Ctrl+Backspace', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await selectRow(page, 10, 11, 5);
		await page.keyboard.press('Control+Backspace');

		expect(await readRegion(page, 10, 5, 12, 5)).toEqual(['  C']);
	});

	test('should support Escape key to cancel operations', async ({ page }) => {
		await selectRow(page, 10, 12, 5);
		const visible = () =>
			page.evaluate(() => window.__t0wnz.State.selectionCursor.isVisible());
		expect(await visible()).toBe(true);

		await page.keyboard.press('Escape');
		expect(await visible()).toBe(false);
		await expect(page.locator('#selection')).toHaveClass(/toolbarDisplayed/);

		await page.keyboard.press('Escape');
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
	});
});

test.describe('Keyboard Mode', () => {
	test.beforeEach(async ({ page }) => {
		await boot(page);
	});

	test('should enter keyboard mode and type text', async ({ page }) => {
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
		await page.keyboard.type('Hello ANSI!');

		await expect
			.poll(() => readRegion(page, 0, 0, 10, 0))
			.toEqual(['Hello ANSI!']);
	});

	test('should navigate with Home and End keys', async ({ page }) => {
		await tap(page, 10, 3);

		await page.keyboard.press('Home');
		expect(await cursorAt(page)).toEqual({ x: 0, y: 3 });

		await page.keyboard.press('End');
		expect(await cursorAt(page)).toEqual({ x: 79, y: 3 });
	});

	test('should navigate with PageUp and PageDown keys', async ({ page }) => {
		await page.keyboard.press('PageDown');
		const down = await cursorAt(page);
		expect(down.y).toBeGreaterThan(0);

		await page.keyboard.press('PageUp');
		expect(await cursorAt(page)).toEqual({ x: 0, y: 0 });
	});

	test('should support Enter key for new line', async ({ page }) => {
		await page.keyboard.type('Line 1');
		await page.keyboard.press('Enter');
		await page.keyboard.type('Line 2');

		await expect
			.poll(() => readRegion(page, 0, 0, 5, 1))
			.toEqual(['Line 1', 'Line 2']);
	});

	test('should support Backspace for deletion', async ({ page }) => {
		await page.keyboard.type('Test');
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');

		await expect.poll(() => readRegion(page, 0, 0, 3, 0)).toEqual(['Te  ']);
		expect(await cursorAt(page)).toEqual({ x: 2, y: 0 });
	});
});
