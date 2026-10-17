/**
 * The unified tool settings window: the context law (each settings
 * tool shows its own section, the rest hide the window), the reopen
 * rule, drag and position persistence, stack focus, and the controls
 * driving real ink.
 */
import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	drag,
	readBlock,
	setAsciiWidth,
	setFill,
	setSquareMode,
} from './helpers/editorHelpers.js';

const openLine = async page => {
	await page.locator('#shapes').click();
	await expect(page.locator('#line')).toHaveClass(/toolbarDisplayed/);
};

test.describe('tool settings window', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('each settings tool shows its section, the rest hide the window', async ({ page }) => {
		const panel = page.locator('#toolSettings');
		// the keyboard tool boots enabled: no settings, no window
		await expect(panel).toBeHidden();

		// the shapes group lands on the line tool
		await openLine(page);
		await expect(panel).toBeVisible();
		await expect(page.locator('#tsLine')).toBeVisible();
		await expect(page.locator('#tsSquare')).toBeHidden();
		await expect(page.locator('#toolSettingsTitle')).toHaveText('Line');

		await clickTool(page, 'square');
		await expect(page.locator('#tsSquare')).toBeVisible();
		await expect(page.locator('#tsLine')).toBeHidden();
		await expect(page.locator('#toolSettingsTitle')).toHaveText('Square');

		await clickTool(page, 'circle');
		await expect(page.locator('#tsCircle')).toBeVisible();

		// the brushes group lands on halfblock: no settings
		await page.locator('#brushes').click();
		await expect(panel).toBeHidden();

		await clickTool(page, 'asciiBrush');
		await expect(page.locator('#tsAscii')).toBeVisible();

		await clickTool(page, 'attrib');
		await expect(page.locator('#tsAttrib')).toBeVisible();

		await page.locator('#shadingBrush').click();
		await expect(page.locator('#tsShading')).toBeVisible();
		await expect(page.locator('#toolSettingsTitle')).toHaveText(
			'Shading Brush',
		);

		await page.locator('#characterBrush').click();
		await expect(page.locator('#tsCharacter')).toBeVisible();
		await expect(page.locator('#tsCharacter canvas').first()).toBeVisible();

		await page.locator('#fill').click();
		await expect(panel).toBeHidden();
	});

	test('the X closes until the next tool selection reopens', async ({ page }) => {
		await openLine(page);
		const panel = page.locator('#toolSettings');
		await expect(panel).toBeVisible();
		await page.locator('#toolSettings .hidePanel').click();
		await expect(panel).toBeHidden();
		await clickTool(page, 'square');
		await expect(panel).toBeVisible();
		await expect(page.locator('#tsSquare')).toBeVisible();
	});

	test('a drag moves the window and a reload restores the spot', async ({ page }) => {
		await openLine(page);
		const panel = page.locator('#toolSettings');
		const before = await panel.boundingBox();
		// grab the drag strip, clear of any control
		await page.mouse.move(before.x + 100, before.y + 8);
		await page.mouse.down();
		await page.mouse.move(before.x + 300, before.y + 158, { steps: 8 });
		await page.mouse.up();
		const after = await panel.boundingBox();
		expect(Math.round(after.x - before.x)).toBe(200);
		expect(Math.round(after.y - before.y)).toBe(150);

		await page.reload();
		await bridgeReady(page);
		await openLine(page);
		const restored = await panel.boundingBox();
		expect(Math.abs(restored.x - after.x)).toBeLessThan(2);
		expect(Math.abs(restored.y - after.y)).toBeLessThan(2);
	});

	test('an off screen position clamps back into the viewport', async ({ page }) => {
		await page.addInitScript(() => {
			localStorage.setItem(
				'toolSettingsPos',
				JSON.stringify({ x: 5000, y: 5000 }),
			);
		});
		await page.goto('/?test');
		await bridgeReady(page);
		await openLine(page);
		const box = await page.locator('#toolSettings').boundingBox();
		expect(box.x).toBeLessThanOrEqual(1280 - 80);
		expect(box.y).toBeLessThanOrEqual(720 - 80);
	});

	test('pressing the window lifts it above the frames panel', async ({ page }) => {
		// open the frames panel first (its toggle lives in the view bar)
		await page.locator('#navView').click();
		await page.locator('#navFrames').click();
		const frames = page.locator('#framesPanel');
		await expect(frames).toBeVisible();

		await openLine(page);
		const panel = page.locator('#toolSettings');
		const fbox = await frames.boundingBox();
		const pbox = await panel.boundingBox();

		// drag the window onto the frames panel
		await page.mouse.move(pbox.x + 100, pbox.y + 8);
		await page.mouse.down();
		await page.mouse.move(fbox.x + 120, fbox.y - 8, { steps: 8 });
		await page.mouse.up();
		const moved = await panel.boundingBox();
		const overlap = {
			x: Math.max(moved.x, fbox.x) + 20,
			y: Math.max(moved.y, fbox.y) + 8,
		};

		// focus frames, then the window: the last press wins the stack
		await page.mouse.click(fbox.x + 4, fbox.y + fbox.height - 4);
		await page.mouse.click(moved.x + 100, moved.y + 8);
		const topId = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.closest('#toolSettings, #framesPanel')?.id,
			[overlap.x, overlap.y],
		);
		expect(topId).toBe('toolSettings');
	});

	test('an open menu drops above the tool window', async ({ page }) => {
		await openLine(page);
		const panel = page.locator('#toolSettings');
		const pbox = await panel.boundingBox();
		// top the panel stack first so the menu has something to beat
		await page.mouse.click(pbox.x + 100, pbox.y + 8);

		await page.locator('#fileMenu').click();
		const menu = page.locator('#fileList');
		await expect(menu).toBeVisible();
		const mbox = await menu.boundingBox();

		// a point inside both rectangles must land on the menu
		const x = Math.max(mbox.x, pbox.x) + 10;
		const y = Math.max(mbox.y, pbox.y) + 10;
		const topId = await page.evaluate(
			([px, py]) =>
				document.elementFromPoint(px, py)?.closest('#fileList, #toolSettings')
					?.id,
			[x, y],
		);
		expect(topId).toBe('fileList');
	});

	test('the width setting survives a reload and still drives ink', async ({ page }) => {
		await page.locator('#brushes').click();
		await clickTool(page, 'asciiBrush');
		await setAsciiWidth(page, 5);
		await page.reload();
		await bridgeReady(page);
		await page.locator('#brushes').click();
		await clickTool(page, 'asciiBrush');
		await expect(
			page.locator('#asciiWidth [data-value="5"]'),
		).toHaveClass(/enabled/);
		// a width five stroke is a nu skool ribbon, not a thin line
		await drag(page, [30, 12], [50, 12]);
		expect((await readBlock(page, 40, 12)).charCode).toBe(36);
	});

	test('old skool dims the fill pair and the choice returns with the mode', async ({ page }) => {
		await page.locator('#shapes').click();
		await clickTool(page, 'square');
		await setFill(page, 'square', true);
		await setSquareMode(page, 'oldskool');
		await expect(page.locator('#squareFill')).toHaveClass(/dimmed/);
		await expect(
			page.locator('#squareFill [data-value="outline"]'),
		).toHaveClass(/enabled/);
		await setSquareMode(page, 'nuskool');
		await expect(page.locator('#squareFill')).not.toHaveClass(/dimmed/);
		await expect(
			page.locator('#squareFill [data-value="filled"]'),
		).toHaveClass(/enabled/);
	});
});
