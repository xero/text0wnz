import { test, expect } from '@playwright/test';
import {
	getViewportScrollPosition,
	nextFrames,
	scrollSettled,
	waitForEditorReady,
} from './helpers/editorHelpers.js';
import { openFile } from './helpers/openFile.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TALL_FILE = path.join(
	__dirname,
	'../../docs/examples/ansi/x0-defcon25.ans',
);

test.describe('Minimap autoscroll', () => {
	let scrollTop;
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
		scrollTop = async () => (await getViewportScrollPosition(page)).scrollTop;
	});

	test('menu expands from the loop glyph and closes from the X', async ({ page }) => {
		const toggle = page.locator('#minimapMenuToggle');
		const menu = page.locator('#minimapMenu');
		await expect(menu).toBeHidden();
		await toggle.click();
		await expect(menu).toBeVisible();
		await expect(toggle).toHaveAttribute('aria-expanded', 'true');
		await expect(toggle.locator('use')).toHaveAttribute(
			'href',
			/#cancel$/,
		);
		await toggle.click();
		await expect(menu).toBeHidden();
		await expect(toggle.locator('use')).toHaveAttribute('href', /#loop$/);
	});

	test('play glides the viewport and the button becomes pause', async ({ page }) => {
		await openFile(page, TALL_FILE);
		await page.locator('#minimapMenuToggle').click();
		const transport = page.locator('#autoscrollToggle');
		await transport.click();
		await expect(transport).toHaveAttribute('aria-label', 'Pause');
		await expect.poll(scrollTop).toBeGreaterThan(0);
	});

	test('a manual scroll escapes playback in place', async ({ page }) => {
		await openFile(page, TALL_FILE);
		await page.locator('#minimapMenuToggle').click();
		const transport = page.locator('#autoscrollToggle');
		await transport.click();
		await expect.poll(scrollTop).toBeGreaterThan(0);
		await page.locator('#viewport').hover();
		await page.mouse.wheel(0, 300);
		await expect(transport).toHaveAttribute('aria-label', 'Play');
		await scrollSettled(page);
		const after = await scrollTop();
		// playback steps once a frame, so a still run of frames is a stop
		await nextFrames(page, 30);
		expect(await scrollTop()).toBe(after);
	});

	test('pause freezes and play resumes from the same spot', async ({ page }) => {
		await openFile(page, TALL_FILE);
		await page.locator('#minimapMenuToggle').click();
		const transport = page.locator('#autoscrollToggle');
		await transport.click();
		await expect.poll(scrollTop).toBeGreaterThan(0);
		await transport.click();
		await expect(transport).toHaveAttribute('aria-label', 'Play');
		await scrollSettled(page);
		const frozen = await scrollTop();
		await nextFrames(page, 30);
		expect(await scrollTop()).toBe(frozen);
		await transport.click();
		await expect.poll(scrollTop).toBeGreaterThan(frozen);
	});

	test('loop mode dims and disables the count row', async ({ page }) => {
		await page.locator('#minimapMenuToggle').click();
		const cluster = page.locator('#autoscrollCount');
		const up = page.locator('#autoscrollCountUp');
		await expect(cluster).not.toHaveClass(/dimmed/);
		await page
			.locator('#autoscrollMode .segment[data-value="loop"]')
			.click();
		await expect(cluster).toHaveClass(/dimmed/);
		await expect(up).toBeDisabled();
		await page
			.locator('#autoscrollMode .segment[data-value="count"]')
			.click();
		await expect(cluster).not.toHaveClass(/dimmed/);
		await expect(up).toBeEnabled();
	});

	test('speed survives a reload', async ({ page }) => {
		await page.locator('#minimapMenuToggle').click();
		const slider = page.locator('#autoscrollSpeed');
		await slider.fill('8');
		await page.reload();
		await waitForEditorReady(page);
		await page.locator('#minimapMenuToggle').click();
		await expect(page.locator('#autoscrollSpeed')).toHaveValue('8');
	});
});
