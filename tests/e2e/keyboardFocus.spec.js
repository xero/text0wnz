import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickViewToggle,
	cursorAt,
	drag,
	parkToolSettings,
	readSelection,
} from './helpers/editorHelpers.js';

// char codes, not readRegion's latin-1 string: 177 is ▒ on the canvas
const codesAt = (page, x0, x1, y) =>
	page.evaluate(
		([a, b, row]) => {
			const c = window.__t0wnz.State.textArtCanvas;
			const codes = [];
			for (let x = a; x <= b; x++) {
				codes.push(c.getBlock(x, row).charCode);
			}
			return codes;
		},
		[x0, x1, y],
	);

// ?test pages start with the minimap hidden, so its autoscroll menu
// needs the View toggle first
const openAutoscrollMenu = async page => {
	await clickViewToggle(page, 'navMinimap');
	await page.locator('#minimapMenuToggle').click();
};

// the menu animates open, and a control in it takes focus only once the
// reveal lets it, so the focus that stands in for a Tab retries
const keyboardFocus = async locator => {
	await expect(async () => {
		await locator.focus();
		await expect(locator).toBeFocused({ timeout: 200 });
	}).toPass();
};

// keyboard mode is the boot tool, and the boot F-key page puts ▒ on F2.
// A locator focus() reaches a control the way the keyboard does; a
// click focuses it by pointer in Chrome and Firefox, while WebKit
// leaves focus where it was, which the canvas owns either way
test.describe('Focused controls in keyboard mode', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
		await page.evaluate(() => window.__t0wnz.State.cursor.move(2, 3));
	});

	test('Space presses an F-key button the keyboard reached and types no space', async ({ page }) => {
		await page.locator('#fkey1w').focus();
		await page.keyboard.type('a b');

		await expect.poll(() => codesAt(page, 2, 4, 3)).toEqual([97, 177, 98]);
		expect(await cursorAt(page)).toEqual({ x: 5, y: 3 });
	});

	test('Space after a click on an F-key button types a space and presses nothing', async ({ page }) => {
		await page.locator('#fkey1w').click();
		await page.keyboard.type('a b');

		await expect.poll(() => codesAt(page, 2, 5, 3)).toEqual([177, 97, 32, 98]);
		expect(await cursorAt(page)).toEqual({ x: 6, y: 3 });
	});

	test('arrows on a button the keyboard reached leave the canvas cursor', async ({ page }) => {
		await page.locator('#fkey1w').focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Shift+ArrowRight');

		expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
	});

	test('arrows after a click on a button move the canvas cursor', async ({ page }) => {
		await page.locator('#fkey1w').click();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowDown');

		await expect.poll(() => cursorAt(page)).toEqual({ x: 4, y: 4 });
	});

	test('arrows step a segmented control the keyboard reached and leave the canvas cursor', async ({ page }) => {
		await openAutoscrollMenu(page);
		await keyboardFocus(page.locator('#autoscrollMode .segment[data-value="count"]'));
		await page.keyboard.press('ArrowRight');

		await expect(
			page.locator('#autoscrollMode .segment[data-value="loop"]'),
		).toHaveAttribute('aria-checked', 'true');
		expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
	});

	test('letters and arrows after a click on the autoscroll speed slider go to the canvas', async ({ page }) => {
		await openAutoscrollMenu(page);
		const speed = page.locator('#autoscrollSpeed');
		await speed.click();
		const value = await speed.inputValue();
		await page.keyboard.type('ab');
		await page.keyboard.press('ArrowDown');

		await expect.poll(() => codesAt(page, 2, 3, 3)).toEqual([97, 98]);
		await expect.poll(() => cursorAt(page)).toEqual({ x: 4, y: 4 });
		expect(await speed.inputValue()).toBe(value);
	});

	test('arrows on the autoscroll speed slider the keyboard reached step it', async ({ page }) => {
		await openAutoscrollMenu(page);
		const speed = page.locator('#autoscrollSpeed');
		const before = Number(await speed.inputValue());
		await keyboardFocus(speed);
		await page.keyboard.press('ArrowLeft');

		await expect(speed).toHaveValue(String(Math.max(before - 1, 1)));
		expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
	});

	// closing a modal dialog hands focus back to the button that opened
	// it, in every engine that focused that button on the click
	test('Space and arrows after the character set picker closes go to the canvas', async ({ page }) => {
		await page.locator('#charsetButton').click();
		await expect(page.locator('#charsetModal')).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(page.locator('#modal')).toBeHidden();
		await page.keyboard.type('a b');
		await page.keyboard.press('ArrowDown');

		await expect.poll(() => codesAt(page, 2, 4, 3)).toEqual([97, 32, 98]);
		await expect.poll(() => cursorAt(page)).toEqual({ x: 5, y: 4 });
		await expect(page.locator('#modal')).toBeHidden();
	});

	test('Home and End on the autoscroll speed slider the keyboard reached jump it', async ({ page }) => {
		await openAutoscrollMenu(page);
		const speed = page.locator('#autoscrollSpeed');
		await keyboardFocus(speed);
		await page.keyboard.press('End');
		await expect(speed).toHaveValue('9');
		await page.keyboard.press('Home');
		await expect(speed).toHaveValue('1');

		expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
	});

	test('a frames panel field keeps every key', async ({ page }) => {
		await clickViewToggle(page, 'navFrames');
		const before = await codesAt(page, 0, 6, 3);
		const delay = page.locator('#frameDelay');
		await delay.click();
		await page.keyboard.type('12');
		await page.keyboard.press('Backspace');
		await expect(delay).toHaveValue('1');

		// F1 stays out: a browser may open its help page on it, and the
		// unit suite covers the F-key guard
		for (const key of ['Enter', 'Space', 'Home', 'ArrowUp']) {
			await page.keyboard.press(key);
		}
		await expect(delay).toBeFocused();
		expect(await codesAt(page, 0, 6, 3)).toEqual(before);
		expect(await cursorAt(page)).toEqual({ x: 2, y: 3 });
	});
});

test.describe('Focused controls with the selection tool', () => {
	const rect = { x: 10, y: 5, width: 2, height: 1 };

	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
		await page.locator('#selection').click();
		await drag(page, [10, 5], [11, 5]);
		expect((await readSelection(page)).live).toEqual(rect);
	});

	test('arrows on a button the keyboard reached leave the rect', async ({ page }) => {
		await page.locator('#file').focus();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('Shift+ArrowDown');

		expect((await readSelection(page)).live).toEqual(rect);
	});

	test('Space after a click on a button presses nothing', async ({ page }) => {
		await clickViewToggle(page, 'navMinimap');
		const toggle = page.locator('#minimapMenuToggle');
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await page.keyboard.press('Space');

		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		expect((await readSelection(page)).live).toEqual(rect);
	});

	test('arrows after a click on a segmented control move the rect and leave the control', async ({ page }) => {
		await openAutoscrollMenu(page);
		const count = page.locator('#autoscrollMode .segment[data-value="count"]');
		await count.click();
		await page.keyboard.press('ArrowRight');

		await expect
			.poll(async () => (await readSelection(page)).live)
			.toEqual({ ...rect, x: 11 });
		await expect(count).toHaveAttribute('aria-checked', 'true');
	});
});
