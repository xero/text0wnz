/**
 * Panel docking: the top and bottom docks, bar rows and columns, the
 * pull-out threshold, and the frames default home. The sidebar moves
 * are covered by toolSettings.spec and the dom suite; this exercises
 * the dock geometry end to end.
 */
import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickViewToggle,
} from './helpers/editorHelpers.js';

const dragPanel = async (page, from, to) => {
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move(to.x, to.y, { steps: 12 });
	await page.mouse.up();
	await page.waitForTimeout(250);
};

const headerPoint = async (page, selector) => {
	const box = await page.locator(`${selector} .modHeader`).boundingBox();
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const dockSauceTop = async page => {
	const vp = await page.locator('#viewport').boundingBox();
	await dragPanel(page, await headerPoint(page, '#saucePanel'), {
		x: vp.x + vp.width / 2,
		y: vp.y + 20,
	});
};

test.describe('panel docking', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('a sidebar panel docks to the top as a bar above the canvas', async ({ page }) => {
		await dockSauceTop(page);
		await expect(page.locator('#saucePanel')).toHaveClass(/tb/);
		expect(await page.locator('#dockTop .drow #saucePanel').count()).toBe(1);
		// the dock pushes the canvas down instead of covering it
		const dock = await page.locator('#dockTop').boundingBox();
		const vp = await page.locator('#viewport').boundingBox();
		expect(vp.y).toBeGreaterThanOrEqual(dock.y + dock.height);
	});

	test('small panels form a column beside each other', async ({ page }) => {
		await dockSauceTop(page);
		const row = await page.locator('#dockTop .drow').first().boundingBox();
		await dragPanel(page, await headerPoint(page, '#canvasPanel'), {
			x: row.x + row.width * 0.75,
			y: row.y + row.height / 2,
		});
		const rows = page.locator('#dockTop .drow');
		await expect(rows).toHaveCount(1);
		expect(await rows.first().locator('.mod').count()).toBe(2);
	});

	test('a drop near a row edge stacks a second row', async ({ page }) => {
		await dockSauceTop(page);
		const row = await page.locator('#dockTop .drow').first().boundingBox();
		await dragPanel(page, await headerPoint(page, '#zoomPanel'), {
			x: row.x + row.width / 2,
			y: row.y + row.height + 30,
		});
		await expect(page.locator('#dockTop .drow')).toHaveCount(2);
	});

	test('a bar ignores small pulls and floats on a real pull', async ({ page }) => {
		await dockSauceTop(page);
		const box = await page.locator('#saucePanel').boundingBox();
		// grab the dotted grip on the bar's left edge, clear of controls
		const grab = { x: box.x + 10, y: box.y + box.height / 2 };
		await dragPanel(page, grab, { x: grab.x, y: grab.y + 14 });
		await expect(page.locator('#saucePanel')).toHaveClass(/tb/);
		// a third of the floating height tears it out
		const again = await page.locator('#saucePanel').boundingBox();
		await dragPanel(
			page,
			{ x: again.x + 10, y: again.y + again.height / 2 },
			{ x: again.x + 200, y: again.y + 260 },
		);
		await expect(page.locator('#saucePanel')).toHaveClass(/fl/);
	});

	test('frames opens docked to the bottom by default', async ({ page }) => {
		await page.locator('#navView').click();
		await clickViewToggle(page, 'navFrames');
		const frames = page.locator('#framesPanel');
		await expect(frames).toBeVisible();
		await expect(frames).toHaveClass(/tb/);
		expect(await page.locator('#dockBottom .drow #framesPanel').count()).toBe(1);
		// the bottom dock sits below the canvas area
		const dock = await page.locator('#dockBottom').boundingBox();
		const vp = await page.locator('#viewport').boundingBox();
		expect(dock.y).toBeGreaterThanOrEqual(vp.y + vp.height);
	});
});

test.describe('panel docking menu', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('right-click opens the menu and docks the panel to the top', async ({ page }) => {
		await page.locator('#saucePanel .modHeader').click({ button: 'right' });
		await expect(page.locator('#panelMenu')).toBeVisible();
		// the panel's current home reads disabled
		await expect(page.locator('#panelDockSide')).toHaveClass(/disabled/);
		await page.locator('#panelDockTop').click();
		await expect(page.locator('#panelMenu')).toBeHidden();
		await expect(page.locator('#saucePanel')).toHaveClass(/tb/);
		expect(await page.locator('#dockTop .drow #saucePanel').count()).toBe(1);
	});

	test('float from the menu lifts a docked panel', async ({ page }) => {
		await page.locator('#zoomPanel .modHeader').click({ button: 'right' });
		await page.locator('#panelFloat').click();
		await expect(page.locator('#zoomPanel')).toHaveClass(/fl/);
	});

	test('the menu works without a pointer end to end', async ({ page }) => {
		await page.locator('#saucePanel .modShade').focus();
		await page.keyboard.press('Shift+F10');
		await expect(page.locator('#panelMenu')).toBeVisible();
		// walk from the disabled Dock Left row to Dock Top and take it
		await page.keyboard.press('ArrowDown');
		await page.keyboard.press('Enter');
		await expect(page.locator('#panelMenu')).toBeHidden();
		await expect(page.locator('#saucePanel')).toHaveClass(/tb/);
	});

	test('move down reorders and keeps the menu open for repeats', async ({ page }) => {
		await page.locator('#saucePanel .modHeader').click({ button: 'right' });
		await page.locator('#panelMoveDown').click();
		await expect(page.locator('#panelMenu')).toBeVisible();
		let keys = await page.$$eval('#sidebar > .mod', els =>
			els.map(m => m.dataset.m));
		expect(keys[1]).toBe('sauce');
		await page.locator('#panelMoveDown').click();
		keys = await page.$$eval('#sidebar > .mod', els =>
			els.map(m => m.dataset.m));
		expect(keys[2]).toBe('sauce');
		// Escape shuts the menu and hands focus back to the strip
		await page.keyboard.press('Escape');
		await expect(page.locator('#panelMenu')).toBeHidden();
		await expect(page.locator('#saucePanel .modShade')).toBeFocused();
	});
});

test.describe('phone layout', () => {
	test.use({ viewport: { width: 390, height: 844 } });

	test.beforeEach(async ({ page }) => {
		// the ?test default hides the minimap; the strip wants it on
		await page.addInitScript(() => {
			localStorage.setItem('minimapVisible', 'true');
		});
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('the phone shell routes every module to its phone home', async ({ page }) => {
		await expect(page.locator('#bodyContainer')).toHaveClass(/phone/);
		await expect(page.locator('#topStrip')).toBeVisible();
		// the rail rides the bottom edge, below the canvas
		const rail = await page.locator('#bodyContainer > aside').boundingBox();
		const vp = await page.locator('#viewport').boundingBox();
		expect(rail.y).toBeGreaterThanOrEqual(vp.y + vp.height);
		// the keyboard tool boots the settings sheet at its peek height
		const sheet = page.locator('#toolSettings');
		await expect(sheet).toHaveClass(/sheet/);
		await expect(sheet).toBeVisible();
		await expect(page.locator('#toolSettings .fkeyRow')).toBeVisible();
		// the minimap docks as the strip beside the canvas
		const map = page.locator('#minimapPanel');
		await expect(map).toHaveClass(/st/);
		expect(await page.locator('#mapStrip #minimapPanel').count()).toBe(1);
		const strip = await page.locator('#mapStrip').boundingBox();
		expect(Math.round(strip.width)).toBe(58);
		// the palette folds out of the rail into the swatch flyout
		await expect(page.locator('#palettePicker')).toBeHidden();
		expect(await page.locator('#paletteFlyoutBody #palettePicker').count()).toBe(1);
	});

	test('the top strip title opens the drawer and Escape shuts it', async ({ page }) => {
		const sidebar = page.locator('#sidebar');
		await expect(page.locator('#canvasPanel')).not.toBeInViewport();
		await page.locator('#drawerButton').click();
		await expect(sidebar).toHaveClass(/open/);
		await expect(page.locator('#canvasPanel')).toBeInViewport();
		await page.keyboard.press('Escape');
		await expect(sidebar).not.toHaveClass(/open/);
	});

	test('the swatch opens the palette flyout and a tap picks a color', async ({ page }) => {
		await page.locator('#palettePreview').click();
		const flyout = page.locator('#paletteFlyout');
		await expect(flyout).toBeVisible();
		// the flyout opens upward from the bottom rail
		const fly = await flyout.boundingBox();
		const rail = await page.locator('#bodyContainer > aside').boundingBox();
		expect(fly.y + fly.height).toBeLessThanOrEqual(rail.y + 1);
		// row 4 of the left column is red (index 4)
		const picker = await page.locator('#paletteFlyout #palettePicker').boundingBox();
		await page.mouse.click(
			picker.x + picker.width / 4,
			picker.y + picker.height * (4.5 / 8),
		);
		const fg = await page.evaluate(() =>
			window.__t0wnz.State.palette.getForegroundColor());
		expect(fg).toBe(4);
	});

	test('the sheet drags between snaps and a pull-down dismisses it', async ({ page }) => {
		const sheet = page.locator('#toolSettings');
		const peek = (await sheet.boundingBox()).height;
		const handle = await page.locator('#toolSettings .modHandle').boundingBox();
		const grab = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
		await dragPanel(page, grab, { x: grab.x, y: grab.y - 250 });
		const half = (await sheet.boundingBox()).height;
		expect(half).toBeGreaterThan(peek + 100);
		// a hard pull down closes it; the drag stays inside the window
		// because Firefox drops pointer moves past the viewport edge
		const again = await page.locator('#toolSettings .modHandle').boundingBox();
		await dragPanel(
			page,
			{ x: again.x + again.width / 2, y: again.y + 10 },
			{ x: again.x + again.width / 2, y: again.y + 10 + (half - 40) },
		);
		await expect(sheet).toBeHidden();
		await page.locator('#keyboard').click();
		await expect(sheet).toBeVisible();
		await expect(sheet).toHaveClass(/sheet/);
	});

	test('width flips preserve the saved wide layout', async ({ page }) => {
		await expect(page.locator('#bodyContainer')).toHaveClass(/phone/);
		await page.setViewportSize({ width: 1280, height: 720 });
		await expect(page.locator('#bodyContainer')).not.toHaveClass(/phone/);
		// the defaults return: sidebar modules docked, tool floating
		await expect(page.locator('#saucePanel')).toHaveClass(/dk/);
		expect(await page.locator('#sidebar #saucePanel').count()).toBe(1);
		await expect(page.locator('#toolSettings')).toHaveClass(/fl/);
		expect(await page.locator('#bodyContainer > aside #palettePicker').count()).toBe(1);
		await page.setViewportSize({ width: 390, height: 844 });
		await expect(page.locator('#bodyContainer')).toHaveClass(/phone/);
		await expect(page.locator('#toolSettings')).toHaveClass(/sheet/);
	});
});
