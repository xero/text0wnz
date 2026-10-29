import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	cellCenter,
	clickHistoryAction,
	clickTool,
	clickViewToggle,
	drag,
	parkToolSettings,
	readRegion,
	tap,
} from './helpers/editorHelpers.js';

test.describe('UI Elements', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should display main UI elements', async ({ page }) => {
		const toolbar = page.locator('#bodyContainer aside, .toolbar, nav');
		await expect(toolbar.first()).toBeVisible();

		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();

		const palette = page.locator('#palettePreview, #palettePicker');
		await expect(palette.first()).toBeVisible();
	});

	test('should have responsive layout', async ({ page }) => {
		const viewportSize = page.viewportSize();
		expect(viewportSize?.width).toBe(1280);
		expect(viewportSize?.height).toBe(720);

		await expect(page.locator('#canvasContainer')).toBeVisible();
	});

	test('should display toolbar with tools', async ({ page }) => {
		const tools = [
			'#halfblock',
			'#characterBrush',
			'#shadingBrush',
			'#line',
			'#square',
			'#circle',
			'#selection',
		];

		let visibleTools = 0;
		for (const tool of tools) {
			const toolElement = page.locator(tool);
			if (await toolElement.isVisible()) {
				visibleTools++;
			}
		}

		expect(visibleTools).toBeGreaterThan(0);
	});

	test('should display canvas settings controls', async ({ page }) => {
		await expect(page.locator('#navICE')).toBeVisible();
		await expect(page.locator('#nav9pt')).toBeVisible();
	});
});

test.describe('Toolbar Interactions', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should highlight selected tool', async ({ page }) => {
		await expect(page.locator('#keyboard')).toHaveClass(/toolbarDisplayed/);
		await clickTool(page, 'halfblock');

		await expect(page.locator('#halfblock')).toHaveClass(/toolbarDisplayed/);
		await expect(page.locator('#keyboard')).not.toHaveClass(/toolbarDisplayed/);
	});

	test('every toolbar control runs without a page error', async ({ page }) => {
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));

		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		await clickTool(page, 'halfblock');
		await page.waitForTimeout(200);

		await clickTool(page, 'characterBrush');
		await page.waitForTimeout(200);

		await clickTool(page, 'shadingBrush');
		await page.waitForTimeout(200);

		await page.locator('#shapes').click();
		await page.waitForTimeout(300);

		await clickTool(page, 'line');
		await page.waitForTimeout(200);

		await clickTool(page, 'circle');
		await page.waitForTimeout(200);

		await clickTool(page, 'square');
		await page.waitForTimeout(200);

		await page.locator('#selection').click();
		await page.waitForTimeout(300);

		await page.locator('#flipHorizontal').click();
		await page.waitForTimeout(200);

		await page.locator('#flipVertical').click();
		await page.waitForTimeout(200);

		await page.locator('#moveBlocks').click();
		await page.waitForTimeout(200);

		await page.locator('#cut').click();
		await page.waitForTimeout(200);

		await page.locator('#delete').click();
		await page.waitForTimeout(200);

		await page.locator('#copy').click();
		await page.waitForTimeout(200);

		// paste actions live behind the bar's submenu face
		await page.locator('#pasteMenu').click();
		await page.locator('#paste').click();
		await page.waitForTimeout(200);

		await page.locator('#pasteMenu').click();
		await page.locator('#systemPaste').click();
		await page.waitForTimeout(200);

		await page.locator('#clipboard').click();
		await page.waitForTimeout(300);

		await clickHistoryAction(page, 'undo');
		await page.waitForTimeout(200);

		await clickHistoryAction(page, 'redo');
		await page.waitForTimeout(200);

		await page.locator('#navICE').click();
		await page.waitForTimeout(200);

		await page.locator('#nav9pt').click();
		await page.waitForTimeout(200);

		await page.locator('#changeFont').click();
		await page.waitForTimeout(200);
		await page.locator('#fontsCancel').click();
		await page.waitForTimeout(800);

		await page.locator('#navView').click();
		await page.waitForTimeout(300);

		await page.locator('#navGrid').evaluate(el => el.click());
		await page.waitForTimeout(300);

		await clickViewToggle(page, 'navDarkmode');
		await page.waitForTimeout(500);

		expect(errors).toEqual([]);
	});

	test('should open and close the fonts dialog and the history flyout', async ({ page }) => {
		const fontsModal = page.locator('#fontsModal');
		await page.locator('#changeFont').click();
		await expect(fontsModal).toBeVisible();
		await page.locator('#fontsCancel').click();
		await expect(fontsModal).toBeHidden();

		const undo = page.locator('#undo');
		await expect(undo).toBeHidden();
		await page.locator('#clipboard').click();
		await expect(undo).toBeVisible();
		await page.locator('#clipboard').click();
		await expect(undo).toBeHidden();
	});

	test('should show clipboard operations when selection is active', async ({ page }) => {
		const bar = page.locator('#selectionToolbar');
		await clickTool(page, 'selection');
		await drag(page, [5, 5], [9, 7]);
		await expect(bar).toBeVisible();
		await expect(page.locator('#selectionSize')).toHaveText('5x3');
		for (const id of ['cut', 'copy', 'delete']) {
			await expect(page.locator(`#${id}`)).not.toHaveClass(/disabled/);
		}
	});
});

test.describe('Canvas Display', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should render canvas layers', async ({ page }) => {
		const canvases = page.locator('#canvasContainer canvas');
		const count = await canvases.count();

		expect(count).toBeGreaterThan(0);
	});

	test('should display the keyboard cursor over the clicked cell', async ({ page }) => {
		// keyboard mode is the boot tool
		await tap(page, 10, 5);
		const cursor = page.locator('#canvasContainer canvas.cursor').first();
		await expect(cursor).toBeVisible();

		const box = await cursor.boundingBox();
		const cell = await cellCenter(page, 10, 5);
		expect(cell.clientX).toBeGreaterThan(box.x);
		expect(cell.clientX).toBeLessThan(box.x + box.width);
		expect(cell.clientY).toBeGreaterThan(box.y);
		expect(cell.clientY).toBeLessThan(box.y + box.height);
	});

	test('should update canvas on window resize', async ({ page }) => {
		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();
		const viewportWidth = () =>
			page.locator('#viewport').evaluate(el => el.clientWidth);
		const wide = await viewportWidth();

		await page.setViewportSize({ width: 1024, height: 768 });
		await expect.poll(viewportWidth).toBeLessThan(wide);
		await expect(canvas).toBeVisible();

		await page.setViewportSize({ width: 1280, height: 720 });
		await expect.poll(viewportWidth).toBe(wide);
	});

	test('should handle scroll if canvas is large', async ({ page }) => {
		const overflow = () =>
			page.locator('#viewport').evaluate(el => ({
				x: el.scrollWidth > el.clientWidth,
				y: el.scrollHeight > el.clientHeight,
			}));
		expect(await overflow()).toEqual({ x: false, y: false });

		await page.locator('#resolution').click();
		await page.locator('#columnsInput').fill('200');
		await page.locator('#rowsInput').fill('100');
		await page.locator('#resizeApply').click();
		await expect(page.locator('#resolutionLabel')).toHaveText('200x100');

		await expect.poll(overflow).toEqual({ x: true, y: true });
	});
});

test.describe('Modal Dialogs', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should handle dialog cancellation', async ({ page }) => {
		// keyboard mode is the boot tool, its cursor parked at 0,0
		await page.keyboard.type('abc');
		await expect.poll(() => readRegion(page, 0, 0, 2, 0)).toEqual(['abc']);

		await page.locator('#fileMenu button').click();
		await page.locator('#new').click();
		await expect(page.locator('#warningModal')).toBeVisible();
		await page.locator('#warningNo').click();

		await expect(page.locator('#warningModal')).toBeHidden();
		expect(await readRegion(page, 0, 0, 2, 0)).toEqual(['abc']);
	});
});

test.describe('Help and Information', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('Help opens the manual in a new tab', async ({ page }) => {
		// a new tab, so reading the manual cannot end a live session
		await page.evaluate(() => {
			window.open = (...args) => {
				window.__opened = args;
			};
		});
		await page.locator('#fileMenu button').click();
		await page.locator('#help').click();

		expect(await page.evaluate(() => window.__opened)).toEqual([
			'https://github.com/xero/text0wnz/wiki/manual',
			'_blank',
			'noopener',
		]);
	});
});
