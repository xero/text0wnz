import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	parkToolSettings,
	readBlock,
	readColors,
	tap,
} from './helpers/editorHelpers.js';

// the picker is one canvas: dark colors 0-7 run down the left column,
// their bright twins down the right
const pickColor = async (page, index, button = 'left', modifiers = []) => {
	const picker = page.locator('#palettePicker');
	const box = await picker.boundingBox();
	await picker.click({
		button,
		modifiers,
		position: {
			x: (box.width / 4) * (index > 7 ? 3 : 1),
			y: (box.height / 8) * ((index % 8) + 0.5),
		},
	});
};

test.describe('Color Palette', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should display color palette', async ({ page }) => {
		const palette = page.locator('#palettePicker');
		await expect(palette).toBeVisible();
	});

	test('should have foreground and background color indicators', async ({ page }) => {
		// the palette preview canvas shows the current colors
		const palettePreview = page.locator('#palettePreview');
		await expect(palettePreview).toBeVisible();
	});

	test('should change foreground color on left click', async ({ page }) => {
		await pickColor(page, 2);
		expect((await readColors(page)).fg).toBe(2);
	});

	test('should change background color on right click', async ({ page }) => {
		// the picker's own handler runs before this one, so the flag
		// reads whether the swatch suppressed the browser menu
		await page.evaluate(() => {
			window.addEventListener('contextmenu', e => {
				window.__menuSuppressed = e.defaultPrevented;
			});
		});
		await pickColor(page, 5, 'right');
		expect(await readColors(page)).toEqual({ fg: 7, bg: 5 });
		expect(await page.evaluate(() => window.__menuSuppressed)).toBe(true);

		// a left pick right after it is a pick, not a double click
		await pickColor(page, 12);
		expect(await readColors(page)).toEqual({ fg: 12, bg: 5 });
		await expect(page.locator('#customColor')).toHaveClass(/hide/);
	});

	test('should change background color on ctrl click', async ({ page }) => {
		await pickColor(page, 9, 'left', ['Control']);
		expect(await readColors(page)).toEqual({ fg: 7, bg: 9 });
		await expect(page.locator('#customColor')).toHaveClass(/hide/);
	});

	test('should pick the same way from the xterm 256 grid and the recent row', async ({ page }) => {
		// extended picks are tag-bit palette words (doc.ts paletteColor)
		const xterm = index => (0x80000000 | index) >>> 0;
		const swatch = index =>
			page.locator(`#colorGrid .colorSwatch[title^="${index} "]`);
		await page.locator('#paletteMore').click();

		await swatch(16).click();
		expect(await readColors(page)).toEqual({ fg: xterm(16), bg: 0 });
		await swatch(17).click({ modifiers: ['Control']});
		expect(await readColors(page)).toEqual({ fg: xterm(16), bg: xterm(17) });
		await swatch(18).click({ button: 'right' });
		expect(await readColors(page)).toEqual({ fg: xterm(16), bg: xterm(18) });

		// one entry per press: a doubled pick would spill onto a neighbor
		const recent = page.locator('#colorRecent .colorSwatch');
		await expect(recent).toHaveCount(3);
		await recent.nth(2).click({ modifiers: ['Control']});
		expect(await readColors(page)).toEqual({ fg: xterm(16), bg: xterm(16) });
		await expect(recent).toHaveCount(3);
	});

	test('should have ICE colors toggle', async ({ page }) => {
		// the iCE chip lives in the sidebar canvas panel, always visible
		const iceToggle = page.locator('#navICE');
		await expect(iceToggle).toBeVisible();

		await iceToggle.click();
		await expect(iceToggle).toHaveClass(/enabled/);
		expect(
			await page.evaluate(() => window.__t0wnz.State.textArtCanvas.getIceColors()),
		).toBe(true);

		await iceToggle.click();
		await expect(iceToggle).not.toHaveClass(/enabled/);
	});

	test('should support keyboard shortcuts for colors', async ({ page }) => {
		// a repeat press of the current color's digit picks its bright twin
		await page.keyboard.press('Control+2');
		expect((await readColors(page)).fg).toBe(2);
		await page.keyboard.press('Control+2');
		expect((await readColors(page)).fg).toBe(10);

		await page.keyboard.press('Alt+3');
		expect((await readColors(page)).bg).toBe(3);
		await page.keyboard.press('Alt+3');
		expect((await readColors(page)).bg).toBe(11);

		// q and d are paint shortcuts, so they need typing mode off
		await clickTool(page, 'halfblock');
		await page.keyboard.press('q');
		expect(await readColors(page)).toEqual({ fg: 11, bg: 10 });
		await page.keyboard.press('d');
		expect(await readColors(page)).toEqual({ fg: 7, bg: 0 });
	});

	test('should allow color selection from multiple positions', async ({ page }) => {
		for (const index of [0, 3, 7, 12]) {
			// two picks inside 300ms read as a double click, which opens
			// the color editor instead of picking
			await page.waitForTimeout(350);
			await pickColor(page, index);
			expect((await readColors(page)).fg).toBe(index);
		}
	});
});

// a held finger needs CDP Input.dispatchTouchEvent, so the touch hold
// tests run on the Chrome project only; the unit tests cover the
// timer, the slop, and the native contextmenu race on every surface
test.describe('Color Palette touch hold', () => {
	test.beforeEach(async ({ page, browserName }) => {
		test.skip(browserName !== 'chromium', 'CDP touch is Chromium-only');
		await page.goto('/?test');
		await bridgeReady(page);
	});

	// the palette announces every set, so the log counts a stray pick
	// that repeats a color, which a color readout cannot see
	const logPicks = page =>
		page.evaluate(() => {
			window.__picks = [];
			const log = ground => e => window.__picks.push([ground, e.detail]);
			document.addEventListener('onForegroundChange', log('fg'));
			document.addEventListener('onBackgroundChange', log('bg'));
		});
	const picks = page => page.evaluate(() => window.__picks);

	// a hold keeps the finger down until the app's own timer has made
	// the pick, so the wait follows the app instead of a clock
	const press = async (page, { x, y }, until) => {
		const cdp = await page.context().newCDPSession(page);
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [{ x, y, id: 1 }],
		});
		if (until) {
			await expect.poll(() => picks(page)).toEqual(until);
		}
		await cdp.send('Input.dispatchTouchEvent', {
			type: 'touchEnd',
			touchPoints: [],
		});
		await cdp.detach();
	};

	const center = async locator => {
		const box = await locator.boundingBox();
		return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	};

	const stripPoint = async (page, index) => {
		const box = await page.locator('#palettePicker').boundingBox();
		return {
			x: box.x + (box.width / 4) * (index > 7 ? 3 : 1),
			y: box.y + (box.height / 8) * ((index % 8) + 0.5),
		};
	};

	test('a hold on the 16-color strip picks the background once, and a tap right after it picks the foreground', async ({ page }) => {
		const [five, twelve] = [
			await stripPoint(page, 5),
			await stripPoint(page, 12),
		];
		await logPicks(page);
		await press(page, five, [['bg', 5]]);
		// the hold's lift is not half of a double tap
		await press(page, twelve);
		await expect
			.poll(() => picks(page))
			.toEqual([
				['bg', 5],
				['fg', 12],
			]);
		await expect(page.locator('#customColor')).toHaveClass(/hide/);
	});

	test('a hold on the xterm 256 grid picks the background once, and a tap the foreground', async ({ page }) => {
		const xterm = index => (0x80000000 | index) >>> 0;
		const swatch = index =>
			page.locator(`#colorGrid .colorSwatch[title^="${index} "]`);
		await page.locator('#paletteMore').click();
		await logPicks(page);

		await press(page, await center(swatch(17)), [['bg', xterm(17)]]);
		await press(page, await center(swatch(16)));
		await expect
			.poll(() => picks(page))
			.toEqual([
				['bg', xterm(17)],
				['fg', xterm(16)],
			]);
		await expect(page.locator('#colorRecent .colorSwatch')).toHaveCount(2);
	});
});

test.describe('Sample Tool (Color Picker)', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	// the ink under the Alt click is fg 7, so only a real sample moves
	// fg off 4
	const altSample = async page => {
		await clickTool(page, 'halfblock');
		await tap(page, 10, 5);
		await pickColor(page, 4);
		expect((await readColors(page)).fg).toBe(4);

		await page.keyboard.down('Alt');
		await tap(page, 10, 5);
		await page.keyboard.up('Alt');
	};

	test('should sample with Alt once the sample tool has loaded', async ({ page }) => {
		await page.locator('#sample').click();
		await expect(page.locator('#sample')).toHaveClass(/toolbarDisplayed/);
		await altSample(page);

		expect((await readColors(page)).fg).toBe(7);
		// Alt modifies the active tool, so halfblock stays lit
		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
	});

	test('should sample with Alt on a fresh page', async ({ page }) => {
		await altSample(page);

		// the sampler loads on the first Alt click, so poll for it
		await expect.poll(async () => (await readColors(page)).fg).toBe(7);
		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
	});
});

test.describe('Character Palette', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should open character selection', async ({ page }) => {
		await page.locator('#brushes').click();
		await clickTool(page, 'characterBrush');

		// the 256 glyph picker rides the settings window
		await expect(page.locator('#toolSettings')).toBeVisible();
		await expect(page.locator('#toolSettingsTitle')).toHaveText(
			'Character Brush',
		);
		await expect(page.locator('#tsCharacter canvas').first()).toBeVisible();
	});

	test('should allow character selection for drawing', async ({ page }) => {
		await pickColor(page, 14);
		await clickTool(page, 'characterBrush');
		await tap(page, 10, 5);

		const cell = await readBlock(page, 10, 5);
		expect([0, 32]).not.toContain(cell.charCode);
		expect(cell.fg).toBe(14);
	});
});
