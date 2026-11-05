import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	drag,
	parkToolSettings,
	readBlock,
	readRegion,
	readSelection,
	tap,
	writeText,
} from './helpers/editorHelpers.js';

test.describe('Drawing Tools', () => {
	test.beforeEach(async ({ page }) => {
		// the ?test bridge lets these tests read cells back, so a drag
		// that silently dies fails instead of passing green
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	// a lit button alone can hide a stroke that never reached the tool,
	// so each brush must also leave ink under its drag
	for (const [id, name, inks] of [
		['halfblock', 'halfblock drawing', [219, 220, 223]],
		['characterBrush', 'character brush', null],
		['shadingBrush', 'shading brush', [176, 177, 178, 219]],
	]) {
		test(`should activate ${name} tool`, async ({ page }) => {
			await page.locator('#brushes').click();
			await clickTool(page, id);
			await expect(page.locator(`#${id}`)).toHaveClass(/toolbarDisplayed/);

			await drag(page, [10, 5], [20, 5]);
			const { charCode } = await readBlock(page, 15, 5);
			expect([0, 32]).not.toContain(charCode);
			if (inks) {
				expect(inks).toContain(charCode);
			}
		});
	}

	test('should activate line tool', async ({ page }) => {
		await page.locator('#shapes').click();
		await clickTool(page, 'line');
		await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [10, 5], [20, 10]);
		// endpoint ink proves the drag reached the tool
		expect([0, 32]).not.toContain((await readBlock(page, 10, 5)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 20, 10)).charCode);
	});

	test('should activate square tool', async ({ page }) => {
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
		await clickTool(page, 'selection');
		await expect(page.locator('#selection')).toHaveClass(/toolbarDisplayed/);

		await drag(page, [5, 4], [12, 9]);
		expect((await readSelection(page)).live).toEqual({ x: 5, y: 4, width: 8, height: 6 });
	});

	// a one cell flip only shows on a half block, which swaps sides
	for (const [key, from, to] of [['[', 221, 222], [']', 223, 220]]) {
		test(`${key} on a fresh selection tool flips the keyboard cursor cell`, async ({ page }) => {
			await writeText(page, 10, 5, String.fromCharCode(from));
			// keyboard mode is the boot tool: a tap parks its cursor
			await tap(page, 10, 5);
			await clickTool(page, 'selection');
			expect((await readSelection(page)).live).toBe(null);

			await page.keyboard.press(key);
			expect((await readBlock(page, 10, 5)).charCode).toBe(to);
			expect((await readSelection(page)).live).toEqual({ x: 10, y: 5, width: 1, height: 1 });
		});
	}

	test('should activate fill tool', async ({ page }) => {
		// fill lives in the brush submenu
		await clickTool(page, 'fill');
		await expect(page.locator('#fill')).toHaveClass(/toolbarDisplayed/);
	});

	test('should draw with multiple tools in sequence', async ({ page }) => {
		await page.locator('#brushes').click();
		await clickTool(page, 'halfblock');
		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
		await drag(page, [5, 5], [10, 8]);
		expect([0, 32]).not.toContain((await readBlock(page, 5, 5)).charCode);

		await page.locator('#shapes').click();
		await clickTool(page, 'line');
		await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);
		await drag(page, [15, 10], [25, 10]);
		expect([0, 32]).not.toContain((await readBlock(page, 20, 10)).charCode);

		await clickTool(page, 'square');
		await expect(page.locator('#square')).toHaveClass(/toolbarDisplayed/);
		await drag(page, [30, 3], [38, 9]);
		expect([0, 32]).not.toContain((await readBlock(page, 30, 3)).charCode);
		expect([0, 32]).not.toContain((await readBlock(page, 38, 9)).charCode);
	});

	test('mirror and the sample tool exclude each other', async ({ page }) => {
		await page.locator('#brushes').click();
		await clickTool(page, 'attrib');
		await page.locator('#mirror').click();
		await expect(page.locator('#mirror')).toHaveClass(/enabled/);

		await page.locator('#sample').click();
		await expect(page.locator('#sample')).toHaveClass(/toolbarDisplayed/);
		await expect(page.locator('#mirror')).not.toHaveClass(/enabled/);

		// arming mirror mid sample bounces back to the previous tool
		await page.locator('#mirror').click();
		await expect(page.locator('#mirror')).toHaveClass(/enabled/);
		await expect(page.locator('#sample')).not.toHaveClass(/toolbarDisplayed/);
		await expect(page.locator('#attrib')).toHaveClass(/toolbarDisplayed/);
	});
});

test.describe('Tool Features', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	const inked = async (page, x, y) =>
		![0, 32].includes((await readBlock(page, x, y)).charCode);

	test('should support undo operation', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await drag(page, [5, 5], [10, 8]);
		expect(await inked(page, 5, 5)).toBe(true);

		await page.keyboard.press('Control+z');
		await expect.poll(() => inked(page, 5, 5)).toBe(false);
	});

	test('should support redo operation', async ({ page }) => {
		await clickTool(page, 'halfblock');
		await drag(page, [5, 5], [10, 8]);
		await page.keyboard.press('Control+z');
		await expect.poll(() => inked(page, 5, 5)).toBe(false);

		await page.keyboard.press('Control+y');
		await expect.poll(() => inked(page, 5, 5)).toBe(true);
	});

	test('should support copy and paste with selection tool', async ({ page }) => {
		await writeText(page, 5, 5, 'AB');
		await clickTool(page, 'selection');
		await drag(page, [5, 5], [6, 5]);
		await page.locator('#copy').click();
		await expect(page.locator('#paste')).not.toHaveClass(/disabled/);

		// a click starts a one cell selection: paste lands at its corner
		await tap(page, 20, 10);
		await page.locator('#pasteMenu').click();
		await page.locator('#paste').click();
		expect(await readRegion(page, 20, 10, 21, 10)).toEqual(['AB']);
	});
});
