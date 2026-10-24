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
