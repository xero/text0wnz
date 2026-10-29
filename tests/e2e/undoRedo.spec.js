import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickHistoryAction,
	clickTool,
	drag,
	parkToolSettings,
	readBlock,
	readRegion,
	tap,
} from './helpers/editorHelpers.js';

const inked = async (page, x, y) =>
	![0, 32].includes((await readBlock(page, x, y)).charCode);

const halfblockTaps = async (page, cells) => {
	await clickTool(page, 'halfblock');
	for (const [x, y] of cells) {
		await tap(page, x, y);
	}
};

test.describe('Advanced Undo/Redo Operations', () => {
	test.beforeEach(async ({ page }) => {
		// the ?test bridge lets every test read cells back across the
		// undo/redo cycle
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should undo and redo multiple drawing operations', async ({ page }) => {
		await halfblockTaps(page, [[5, 5], [10, 5], [15, 5]]);
		expect(await inked(page, 15, 5)).toBe(true);

		await page.keyboard.press('Control+z');
		expect(await inked(page, 15, 5)).toBe(false);
		expect(await inked(page, 10, 5)).toBe(true);
		await page.keyboard.press('Control+z');
		await page.keyboard.press('Control+z');
		expect(await inked(page, 5, 5)).toBe(false);

		await page.keyboard.press('Control+y');
		expect(await inked(page, 5, 5)).toBe(true);
		expect(await inked(page, 10, 5)).toBe(false);
		await page.keyboard.press('Control+y');
		await page.keyboard.press('Control+y');
		expect(await inked(page, 10, 5)).toBe(true);
		expect(await inked(page, 15, 5)).toBe(true);
	});

	test('should handle undo after tool switching', async ({ page }) => {
		await halfblockTaps(page, [[5, 5]]);
		await clickTool(page, 'characterBrush');
		await tap(page, 10, 5);
		expect(await inked(page, 10, 5)).toBe(true);

		await page.keyboard.press('Control+z');
		expect(await inked(page, 10, 5)).toBe(false);
		expect(await inked(page, 5, 5)).toBe(true);

		await page.keyboard.press('Control+z');
		expect(await inked(page, 5, 5)).toBe(false);
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
		await halfblockTaps(page, [[5, 5]]);
		const blank = await readBlock(page, 40, 12);

		await clickTool(page, 'fill');
		await tap(page, 40, 12);
		const filled = await readBlock(page, 40, 12);
		expect(filled).not.toEqual(blank);

		await page.keyboard.press('Control+z');
		expect(await readBlock(page, 40, 12)).toEqual(blank);
		expect(await inked(page, 5, 5)).toBe(true);

		await page.keyboard.press('Control+y');
		expect(await readBlock(page, 40, 12)).toEqual(filled);
	});

	test('should start a fresh undo history after canvas resize', async ({ page }) => {
		await halfblockTaps(page, [[5, 5]]);

		await page.locator('#resolution').click();
		await page.locator('#columnsInput').fill('100');
		await page.locator('#rowsInput').fill('30');
		await page.locator('#resizeApply').click();
		await expect(page.locator('#resolutionLabel')).toHaveText('100x30');

		// editor.ts resize() clears the history arena. The first undo
		// proves the keys reach the editor, so the second one finding
		// nothing is the cleared history, not a swallowed key
		await halfblockTaps(page, [[90, 28]]);
		expect(await inked(page, 90, 28)).toBe(true);
		await page.keyboard.press('Control+z');
		expect(await inked(page, 90, 28)).toBe(false);
		await page.keyboard.press('Control+z');
		expect(await inked(page, 5, 5)).toBe(true);
	});

	test('should handle rapid undo/redo operations', async ({ page }) => {
		const cells = [[5, 5], [8, 5], [11, 5], [14, 5], [17, 5]];
		await halfblockTaps(page, cells);

		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Control+z');
		}
		for (const [x, y] of cells) {
			expect(await inked(page, x, y)).toBe(false);
		}

		for (let i = 0; i < 5; i++) {
			await page.keyboard.press('Control+y');
		}
		for (const [x, y] of cells) {
			expect(await inked(page, x, y)).toBe(true);
		}
	});

	test('should clear redo stack when new operation is performed', async ({ page }) => {
		await halfblockTaps(page, [[5, 5], [10, 5]]);
		await page.keyboard.press('Control+z');
		expect(await inked(page, 10, 5)).toBe(false);

		await tap(page, 15, 5);
		await page.keyboard.press('Control+y');
		expect(await inked(page, 10, 5)).toBe(false);
		expect(await inked(page, 15, 5)).toBe(true);
	});

	test('should handle undo/redo with selection tool', async ({ page }) => {
		await halfblockTaps(page, [[5, 5], [6, 5], [7, 5]]);
		const source = await readBlock(page, 6, 5);

		await page.locator('#selection').click();
		await drag(page, [5, 5], [7, 5]);
		await page.keyboard.press('Control+c');
		await tap(page, 20, 10);
		await page.keyboard.press('Control+v');
		expect(await readBlock(page, 21, 10)).toEqual(source);

		await page.keyboard.press('Control+z');
		expect(await inked(page, 21, 10)).toBe(false);
		expect(await inked(page, 6, 5)).toBe(true);

		await page.keyboard.press('Control+y');
		expect(await readBlock(page, 21, 10)).toEqual(source);
	});

	test('should handle undo with keyboard mode text input', async ({ page }) => {
		// keyboard mode is the boot tool, its cursor parked at 0,0
		await page.keyboard.type('Hello');
		await expect.poll(() => readRegion(page, 0, 0, 4, 0)).toEqual(['Hello']);

		// every typed glyph is its own undo step
		await page.keyboard.press('Control+z');
		expect(await readRegion(page, 0, 0, 4, 0)).toEqual(['Hell ']);

		await page.keyboard.press('Control+y');
		expect(await readRegion(page, 0, 0, 4, 0)).toEqual(['Hello']);
	});

	test('should undo and redo from the history buttons', async ({ page }) => {
		await halfblockTaps(page, [[5, 5]]);

		await clickHistoryAction(page, 'undo');
		expect(await inked(page, 5, 5)).toBe(false);

		await clickHistoryAction(page, 'redo');
		expect(await inked(page, 5, 5)).toBe(true);
	});
});
