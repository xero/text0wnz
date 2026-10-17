/**
 * Ascii brush e2e: the old skool stamp engine drives the controller, so
 * strokes resolve to classic ascii line glyphs by slope, fully live.
 * Glyph choice itself is pinned by the core goldens; these tests pin
 * the browser wiring: pointer path in, revised cells out, one undo
 * group per stroke, backgrounds preserved.
 */
import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	cellCenter,
	clickTool,
	drag,
	readBlock,
	readRegion,
	setAsciiWidth,
	setCircleMode,
	setFill,
	setLineMode,
	setSquareMode,
} from './helpers/editorHelpers.js';

const UNDERSCORE = 95;
const BACKSLASH = 92;
const PERIOD = 46;

const selectAsciiBrush = async page => {
	await page.locator('#brushes').click();
	await clickTool(page, 'asciiBrush');
	await expect(page.locator('#asciiBrush')).toHaveClass(/toolbarDisplayed/);
};

test.describe('ascii brush', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
		await selectAsciiBrush(page);
	});

	test('a tap leaves a pebble in the foreground color', async ({ page }) => {
		const pt = await cellCenter(page, 6, 4);
		// cell centers land in the lower half, so the pebble is a period
		await page.mouse.click(pt.clientX, pt.clientY);
		const block = await readBlock(page, 6, 4);
		expect(block.charCode).toBe(PERIOD);
		expect(block.fg).toBe(7);
	});

	test('a flat drag resolves to underscores on the row', async ({ page }) => {
		await drag(page, [5, 8], [20, 8]);
		for (let x = 5; x <= 20; x++) {
			expect((await readBlock(page, x, 8)).charCode).toBe(UNDERSCORE);
		}
		expect((await readBlock(page, 4, 8)).charCode).not.toBe(UNDERSCORE);
		expect((await readBlock(page, 21, 8)).charCode).not.toBe(UNDERSCORE);
	});

	test('a 45 degree drag resolves to backslashes, gap free', async ({ page }) => {
		await drag(page, [30, 2], [42, 14]);
		for (let i = 0; i <= 12; i++) {
			expect((await readBlock(page, 30 + i, 2 + i)).charCode).toBe(BACKSLASH);
		}
	});

	test('the width knob turns strokes nu skool', async ({ page }) => {
		await setAsciiWidth(page, 5);
		await drag(page, [40, 18], [40, 23]);
		// a width five vertical is a solid five column fill ribbon
		for (let y = 19; y <= 21; y++) {
			for (let x = 38; x <= 42; x++) {
				expect((await readBlock(page, x, y)).charCode).toBe(36);
			}
		}
		// the live tip taper narrows the last rows toward the exit, so
		// the ribbon stays continuous but sheds columns monotonically
		const fills = async y => {
			let n = 0;
			for (let x = 36; x <= 44; x++) {
				if ((await readBlock(page, x, y)).charCode === 36) {
					n++;
				}
			}
			return n;
		};
		expect((await readBlock(page, 40, 22)).charCode).toBe(36);
		const tail = await fills(23);
		expect(tail).toBeGreaterThan(0);
		expect(await fills(22)).toBeLessThan(5);
		expect(tail).toBeLessThan(await fills(22));
		await setAsciiWidth(page, 1);
		await drag(page, [50, 18], [50, 23]);
		expect((await readBlock(page, 50, 20)).charCode).toBe(124);
	});

	test('a wide stroke at the left edge never wraps to the right', async ({ page }) => {
		await setAsciiWidth(page, 5);
		// skeleton hugs column 0, so the ribbon reaches x -2
		await drag(page, [0, 16], [0, 22]);
		expect((await readBlock(page, 0, 18)).charCode).toBe(36);
		const columns = await page.evaluate(() =>
			window.__t0wnz.State.textArtCanvas.getColumns());
		for (let y = 15; y <= 22; y++) {
			for (let x = columns - 3; x < columns; x++) {
				// blank, not merely not-fill: a wrapped taper pebble or AA
				// glyph must fail this too
				expect([0, 32]).toContain((await readBlock(page, x, y)).charCode);
			}
		}
		await setAsciiWidth(page, 1);
	});

	test('crossings and terminal contacts voice junctions', async ({ page }) => {
		await drag(page, [5, 8], [20, 8]);
		// a second stroke passing through the line reads as a crossing
		await drag(page, [12, 4], [12, 12]);
		expect((await readBlock(page, 12, 8)).charCode).toBe(43);
		// a stroke rising from below and ENDING on the underscore line
		// knots with a period: underscore ink hugs the cell bottom
		await drag(page, [16, 12], [16, 8]);
		expect((await readBlock(page, 16, 8)).charCode).toBe(PERIOD);
		// and one STARTING mid line and dropping away joins the same way
		await drag(page, [18, 8], [18, 12]);
		expect((await readBlock(page, 18, 8)).charCode).toBe(PERIOD);
		// a diagonal overshooting the line by one cell snaps back: the
		// crossing cell takes the hook, the whisker comes off
		await drag(page, [7, 5], [11, 9]);
		expect((await readBlock(page, 10, 8)).charCode).toBe(74);
		expect([0, 32]).toContain((await readBlock(page, 11, 9)).charCode);
	});

	test('one stroke is one undo step', async ({ page }) => {
		await drag(page, [50, 5], [60, 5]);
		expect((await readBlock(page, 55, 5)).charCode).toBe(UNDERSCORE);
		await page.evaluate(() => window.__t0wnz.State.textArtCanvas.undo());
		for (let x = 50; x <= 60; x++) {
			expect((await readBlock(page, x, 5)).charCode).not.toBe(UNDERSCORE);
		}
	});
});

test.describe('line tool brush modes', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
		await page.locator('#shapes').click();
		await clickTool(page, 'line');
		await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);
	});

	test('block mode draws half blocks like before', async ({ page }) => {
		await setLineMode(page, 'block');
		await drag(page, [5, 8], [20, 8]);
		expect([220, 223, 219]).toContain((await readBlock(page, 10, 8)).charCode);
	});

	test('ascii mode rules a flat line of underscores', async ({ page }) => {
		await setLineMode(page, 'oldskool');
		await drag(page, [5, 12], [20, 12]);
		for (let x = 6; x <= 19; x++) {
			expect((await readBlock(page, x, 12)).charCode).toBe(UNDERSCORE);
		}
	});

	test('ascii mode rules a 45 degree line of backslashes', async ({ page }) => {
		await setLineMode(page, 'oldskool');
		await drag(page, [30, 2], [42, 14]);
		// the first two cells voice the entry curl; the body is diagonal
		for (let i = 2; i <= 12; i++) {
			expect((await readBlock(page, 30 + i, 2 + i)).charCode).toBe(BACKSLASH);
		}
	});

	test('nu skool mode rules a dollar fill ribbon', async ({ page }) => {
		await setLineMode(page, 'nuskool');
		await drag(page, [10, 18], [30, 21]);
		// the whole region pins shape and emptiness alike: the taper
		// ladder descends with chisel leads, and nothing strays outside
		expect(await readRegion(page, 8, 17, 32, 23)).toEqual([
			'                         ',
			'  $$$                    ',
			'   `Y$$$$$$:.            ',
			'          `Y$$$$$$:.     ',
			'                 `Y$$$$b.',
			'                         ',
			'                         ',
		]);
	});

	test('an ascii line is one undo group', async ({ page }) => {
		await setLineMode(page, 'oldskool');
		await drag(page, [5, 16], [20, 16]);
		expect((await readBlock(page, 10, 16)).charCode).toBe(UNDERSCORE);
		await page.keyboard.press('Control+z');
		for (let x = 5; x <= 20; x++) {
			expect([0, 32]).toContain((await readBlock(page, x, 16)).charCode);
		}
	});
});

test.describe('shape tool brush modes', () => {
	const DOLLAR = 36;
	const VBAR = 124;

	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
		await page.locator('#shapes').click();
		// one readiness pin: a failed lazy shapes import otherwise dies
		// as an unrelated locator timeout in every test below
		await expect(page.locator('#shapesToolbar')).toBeVisible();
	});

	test('ascii square rules box edges with corner glyphs', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [5, 5], [20, 12]);
		// period shoulders, backtick and quote feet, dash edges top and
		// bottom (per half voicing densified stacked boxes to equals),
		// bar sides
		expect((await readBlock(page, 5, 5)).charCode).toBe(PERIOD);
		expect((await readBlock(page, 20, 5)).charCode).toBe(PERIOD);
		expect((await readBlock(page, 5, 12)).charCode).toBe(96);
		expect((await readBlock(page, 20, 12)).charCode).toBe(39);
		expect((await readBlock(page, 10, 5)).charCode).toBe(45);
		expect((await readBlock(page, 10, 12)).charCode).toBe(45);
		expect((await readBlock(page, 5, 8)).charCode).toBe(VBAR);
		expect((await readBlock(page, 20, 8)).charCode).toBe(VBAR);
	});

	test('nu skool square rules a hollow dollar rim', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'nuskool');
		await drag(page, [40, 5], [60, 12]);
		expect((await readBlock(page, 50, 5)).charCode).toBe(DOLLAR);
		expect((await readBlock(page, 50, 12)).charCode).toBe(DOLLAR);
		expect((await readBlock(page, 40, 8)).charCode).toBe(DOLLAR);
		expect((await readBlock(page, 60, 8)).charCode).toBe(DOLLAR);
		expect([0, 32]).toContain((await readBlock(page, 50, 8)).charCode);
	});

	test('nu skool filled square pours a dollar slab', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'nuskool');
		await setFill(page, 'square', true);
		await drag(page, [40, 15], [60, 22]);
		expect((await readBlock(page, 50, 18)).charCode).toBe(DOLLAR);
		expect((await readBlock(page, 40, 15)).charCode).toBe(DOLLAR);
		expect((await readBlock(page, 60, 22)).charCode).toBe(DOLLAR);
	});

	test('a block circle survives a sub cell drag', async ({ page }) => {
		await clickTool(page, 'circle');
		await setCircleMode(page, 'block');
		// zero radii once spun the ellipse walk forever and froze the
		// page; the degenerate drag must land ink and return
		await drag(page, [40, 16], [40, 16]);
		expect([220, 223]).toContain((await readBlock(page, 40, 16)).charCode);
	});

	test('old skool circle fills its drag box with the golden anatomy', async ({ page }) => {
		await clickTool(page, 'circle');
		await setCircleMode(page, 'oldskool');
		// a 16 x 8 box drag stamps the owner's golden circle box true
		await drag(page, [36, 16], [51, 23]);
		expect((await readBlock(page, 36, 19)).charCode).toBe(VBAR);
		expect((await readBlock(page, 51, 19)).charCode).toBe(VBAR);
		expect((await readBlock(page, 51, 20)).charCode).toBe(VBAR);
		expect((await readBlock(page, 36, 21)).charCode).toBe(92); // \
		expect((await readBlock(page, 51, 21)).charCode).toBe(47); // /
		expect((await readBlock(page, 40, 16)).charCode).toBe(95); // _ cap tail
		expect([0, 32]).toContain((await readBlock(page, 43, 19)).charCode);
	});

	test('nu skool circle rims a hollow eight body ring', async ({ page }) => {
		await clickTool(page, 'circle');
		await setCircleMode(page, 'nuskool');
		// nu skool inscribes its center anchored ring inside the drag box
		await drag(page, [37, 16], [49, 23]);
		// the whole region pins the quadrant grammar: chisel caps, colon
		// dressed 8 walls, a hollow center, no dollar ribbon, and a one
		// cell empty margin all around
		expect(await readRegion(page, 36, 15, 50, 24)).toEqual([
			'               ',
			'   ,,dd"bb,,   ',
			' ,8"       "8, ',
			' d\'         `b ',
			' 8:         :8 ',
			' 8:         :8 ',
			' Y,         ,P ',
			' `8,       ,8\' ',
			'   `"YbadP"\'   ',
			'               ',
		]);
	});

	test('nu skool filled circle pours the slab', async ({ page }) => {
		await clickTool(page, 'circle');
		await setCircleMode(page, 'nuskool');
		await setFill(page, 'circle', true);
		await drag(page, [37, 16], [49, 23]);
		expect((await readBlock(page, 43, 20)).charCode).toBe(DOLLAR);
	});

	test('a flat drag grows into a two row box', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [50, 8], [60, 8]);
		expect((await readBlock(page, 50, 8)).charCode).toBe(PERIOD);
		expect((await readBlock(page, 55, 8)).charCode).toBe(45);
		expect((await readBlock(page, 50, 9)).charCode).toBe(96);
		expect((await readBlock(page, 60, 9)).charCode).toBe(39);
		expect((await readBlock(page, 55, 9)).charCode).toBe(45);
	});

	test('a thin drag grows into a two column box', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [70, 4], [70, 8]);
		expect((await readBlock(page, 70, 4)).charCode).toBe(PERIOD);
		expect((await readBlock(page, 71, 4)).charCode).toBe(PERIOD);
		expect((await readBlock(page, 70, 8)).charCode).toBe(96);
		expect((await readBlock(page, 71, 8)).charCode).toBe(39);
		expect((await readBlock(page, 70, 6)).charCode).toBe(124);
		expect((await readBlock(page, 71, 6)).charCode).toBe(124);
	});

	test('a square crossing another voices plus and keeps its bars', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [10, 6], [30, 10]);
		await drag(page, [15, 3], [25, 14]);
		// the second box's bars cross the first box's edges: plus at
		// every crossing, and the bar cells between its own corner and
		// the crossing survive (a root snap-back once ate them)
		for (const x of [15, 25]) {
			expect((await readBlock(page, x, 6)).charCode).toBe(43);
			expect((await readBlock(page, x, 10)).charCode).toBe(43);
			expect((await readBlock(page, x, 4)).charCode).toBe(124);
			expect((await readBlock(page, x, 5)).charCode).toBe(124);
			expect((await readBlock(page, x, 3)).charCode).toBe(PERIOD);
		}
	});

	test('boxes hanging off a line voice terminal joints', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [10, 6], [30, 10]);
		// a box hanging below the line stands its top corners as tees
		await drag(page, [15, 10], [25, 14]);
		expect((await readBlock(page, 15, 10)).charCode).toBe(84);
		expect((await readBlock(page, 25, 10)).charCode).toBe(84);
		// a box standing on the line roots its bottom corners as plus
		await drag(page, [15, 2], [25, 6]);
		expect((await readBlock(page, 15, 6)).charCode).toBe(43);
		expect((await readBlock(page, 25, 6)).charCode).toBe(43);
	});

	test('three row and three column boxes rule true edges', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		// one cell paths once stamped the engine's lone tap apostrophe
		await drag(page, [10, 2], [20, 4]);
		expect((await readBlock(page, 10, 3)).charCode).toBe(124);
		expect((await readBlock(page, 20, 3)).charCode).toBe(124);
		expect((await readBlock(page, 15, 2)).charCode).toBe(45);
		expect((await readBlock(page, 15, 4)).charCode).toBe(45);
		await drag(page, [30, 2], [32, 6]);
		expect((await readBlock(page, 31, 2)).charCode).toBe(45);
		expect((await readBlock(page, 31, 6)).charCode).toBe(45);
		expect((await readBlock(page, 30, 4)).charCode).toBe(124);
		expect((await readBlock(page, 32, 4)).charCode).toBe(124);
	});

	test('corners landing on an underscore voice the period knot', async ({ page }) => {
		// activate line explicitly instead of leaning on the shapes
		// controller auto picking it
		await clickTool(page, 'line');
		await setLineMode(page, 'oldskool');
		await drag(page, [5, 8], [25, 8]);
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [10, 8], [20, 12]);
		expect((await readBlock(page, 10, 8)).charCode).toBe(PERIOD);
		expect((await readBlock(page, 20, 8)).charCode).toBe(PERIOD);
	});

	test('a crossing under a corner cap leaves the cap alone', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [10, 4], [20, 9]);
		// the second box's bottom edge crosses the first box's bar one
		// row under its corner cap; the junction sweep once ate the cap
		await drag(page, [14, 2], [24, 5]);
		expect((await readBlock(page, 20, 5)).charCode).toBe(43);
		expect((await readBlock(page, 20, 4)).charCode).toBe(PERIOD);
	});

	test('an edge over a buried bar end reconnects it', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [10, 6], [30, 10]);
		// the second box's top edge is collinear with the first box's
		// bottom line: the feet with bars above them voice plus instead
		// of drowning under plain dashes
		await drag(page, [5, 10], [35, 14]);
		expect((await readBlock(page, 10, 10)).charCode).toBe(43);
		expect((await readBlock(page, 30, 10)).charCode).toBe(43);
	});

	test('an ascii square is one undo group', async ({ page }) => {
		await clickTool(page, 'square');
		await setSquareMode(page, 'oldskool');
		await drag(page, [5, 16], [15, 20]);
		expect((await readBlock(page, 10, 16)).charCode).toBe(45);
		await page.keyboard.press('Control+z');
		for (let y = 16; y <= 20; y++) {
			for (let x = 5; x <= 15; x++) {
				expect([0, 32]).toContain((await readBlock(page, x, y)).charCode);
			}
		}
	});
});
