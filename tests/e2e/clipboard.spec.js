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

const select = async (page, from, to) => {
	await page.locator('#selection').click();
	await drag(page, from, to);
};

// paste lands at the top left of whatever selection is live, so a tap
// picks the target cell. Targets sit below the last selection: the
// selection bar floats just above it and would swallow the tap
const pasteAt = async (page, x, y) => {
	await tap(page, x, y);
	await page.keyboard.press('Control+v');
};

test.describe('Clipboard', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('copies a selection and pastes it at the next one', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await select(page, [10, 5], [12, 5]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 20, 8);

		expect(await readRegion(page, 20, 8, 22, 8)).toEqual(['ABC']);
		expect(await readRegion(page, 10, 5, 12, 5)).toEqual(['ABC']);
	});

	test('pastes foreground colors with the glyphs', async ({ page }) => {
		await writeText(page, 10, 5, 'AB', 12, 0);
		await select(page, [10, 5], [11, 5]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 20, 8);

		expect(await readBlock(page, 20, 8)).toEqual({ charCode: 65, fg: 12, bg: 0 });
		expect(await readBlock(page, 21, 8)).toEqual({ charCode: 66, fg: 12, bg: 0 });
	});

	test('pastes background colors with the glyphs', async ({ page }) => {
		await writeText(page, 10, 5, 'A', 7, 4);
		await select(page, [10, 5], [10, 5]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 20, 8);

		expect(await readBlock(page, 20, 8)).toEqual({ charCode: 65, fg: 7, bg: 4 });
	});

	test('copies text typed in keyboard mode', async ({ page }) => {
		// keyboard mode is the boot tool, its cursor parked at 0,0
		await tap(page, 4, 3);
		await page.keyboard.type('Test');
		await expect.poll(() => readRegion(page, 4, 3, 7, 3)).toEqual(['Test']);

		await select(page, [4, 3], [7, 3]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 30, 10);

		expect(await readRegion(page, 30, 10, 33, 10)).toEqual(['Test']);
	});

	test('the latest copy replaces the clipboard', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await writeText(page, 10, 7, 'XYZ');
		await select(page, [10, 5], [12, 5]);
		await page.keyboard.press('Control+c');
		await drag(page, [10, 7], [12, 7]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 20, 9);

		expect(await readRegion(page, 20, 9, 22, 9)).toEqual(['XYZ']);
	});

	test('cut clears the source and pastes elsewhere', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await select(page, [10, 5], [12, 5]);
		await page.keyboard.press('Control+x');

		expect(await readRegion(page, 10, 5, 12, 5)).toEqual(['   ']);

		await pasteAt(page, 20, 8);
		expect(await readRegion(page, 20, 8, 22, 8)).toEqual(['ABC']);
	});

	test('one copy pastes at several positions', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await select(page, [10, 5], [12, 5]);
		await page.keyboard.press('Control+c');

		for (const [x, y] of [[40, 12], [5, 16], [60, 20]]) {
			await pasteAt(page, x, y);
			expect(await readRegion(page, x, y, x + 2, y)).toEqual(['ABC']);
		}
	});

	test('pastes at the keyboard cursor', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC');
		await select(page, [10, 5], [12, 5]);
		await page.keyboard.press('Control+c');

		await page.locator('#keyboard').click();
		await tap(page, 25, 6);
		await page.keyboard.press('Control+v');

		expect(await readRegion(page, 25, 6, 27, 6)).toEqual(['ABC']);
	});

	test('a paste with an empty clipboard changes nothing', async ({ page }) => {
		await writeText(page, 10, 5, 'X');
		await page.locator('#selection').click();
		await tap(page, 10, 5);
		await expect(page.locator('#paste')).toHaveClass(/disabled/);
		await page.keyboard.press('Control+v');

		expect(await readRegion(page, 9, 5, 11, 5)).toEqual([' X ']);
	});

	test('copies a multi row selection', async ({ page }) => {
		const rows = ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY'];
		for (const [i, row] of rows.entries()) {
			await writeText(page, 10, 5 + i, row);
		}
		await select(page, [10, 5], [14, 9]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 40, 12);

		expect(await readRegion(page, 40, 12, 44, 16)).toEqual(rows);
	});

	test('pastes truecolor cells without quantizing them', async ({ page }) => {
		// the clipboard holds plane-native cells; a round trip through the
		// 16 color buffer would snap the RGB word to a palette index
		await writeText(page, 10, 5, 'A', 0xff8800, 0x0044cc);
		await select(page, [10, 5], [10, 5]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 20, 8);

		expect(await readBlock(page, 20, 8)).toEqual({
			charCode: 65,
			fg: 0xff8800,
			bg: 0x0044cc,
		});
	});

	test('pastes unicode glyphs without folding them to ?', async ({ page }) => {
		// zhe has no CP437 twin, so the u16 area would store '?'
		const zhe = 0x0436;
		const id = await page.evaluate(async cp => {
			const c = window.__t0wnz.State.textArtCanvas;
			const glyph = (await c.resolveUnicode([cp])).get(cp);
			c.startUndo();
			c.draw(cb => cb(glyph, 7, 0, 10, 5), false);
			return glyph;
		}, zhe);
		expect(id).toBeGreaterThan(0xff);

		await select(page, [10, 5], [10, 5]);
		await page.keyboard.press('Control+c');
		await pasteAt(page, 20, 8);

		const pasted = await readBlock(page, 20, 8);
		expect(pasted.charCode).toBe(id);
		expect(
			await page.evaluate(
				g => window.__t0wnz.State.textArtCanvas.getDoc().glyphTable.get(g)?.codepoint,
				pasted.charCode,
			),
		).toBe(zhe);
	});

	test('cut and delete blank the rect to the background color', async ({ page }) => {
		await writeText(page, 10, 5, 'ABC', 7, 1);
		await writeText(page, 10, 7, 'XYZ', 7, 1);
		await page.evaluate(() => window.__t0wnz.State.palette.setBackgroundColor(4));
		const blank = { charCode: 0, fg: 0, bg: 4 };

		await select(page, [10, 5], [12, 5]);
		await page.keyboard.press('Control+x');
		await drag(page, [10, 7], [12, 7]);
		await page.locator('#delete').click();

		for (const y of [5, 7]) {
			for (let x = 10; x <= 12; x++) {
				expect(await readBlock(page, x, y), `${x},${y}`).toEqual(blank);
			}
		}
	});

	test.describe('on a fresh selection tool', () => {
		// keyboard mode is the boot tool: a tap parks its cursor, and the
		// selection tool opens with nothing selected
		const pick = async (page, x, y) => {
			await tap(page, x, y);
			await clickTool(page, 'selection');
			expect((await readSelection(page)).live).toBe(null);
		};

		test('ctrl c and ctrl v act at the keyboard cursor', async ({ page }) => {
			await writeText(page, 10, 5, 'Q');
			await pick(page, 10, 5);
			await page.keyboard.press('Control+c');
			expect((await readSelection(page)).live).toEqual({ x: 10, y: 5, width: 1, height: 1 });

			await page.keyboard.press('ArrowDown');
			await page.keyboard.press('Control+v');
			expect(await readRegion(page, 10, 5, 10, 6)).toEqual(['Q', 'Q']);

			// a paste that ran twice would leave its first copy behind
			await page.keyboard.press('Control+z');
			await expect.poll(() => readRegion(page, 10, 5, 10, 6)).toEqual(['Q', ' ']);
		});

		test('ctrl backspace deletes the keyboard cursor cell', async ({ page }) => {
			await writeText(page, 10, 5, 'ABC');
			await pick(page, 11, 5);
			await page.keyboard.press('Control+Backspace');
			expect(await readRegion(page, 10, 5, 12, 5)).toEqual(['A C']);

			await page.keyboard.press('Control+z');
			await expect.poll(() => readRegion(page, 10, 5, 12, 5)).toEqual(['ABC']);
		});

		test('ctrl v with nothing copied leaves the tool bare', async ({ page }) => {
			await writeText(page, 10, 5, 'Q');
			await pick(page, 10, 5);
			await page.keyboard.press('Control+v');
			expect((await readSelection(page)).live).toBe(null);
			expect(await readRegion(page, 10, 5, 10, 5)).toEqual(['Q']);
		});
	});
});
