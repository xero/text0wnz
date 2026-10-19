import { test, expect } from '@playwright/test';
import {
	waitForEditorReady,
	getViewportScrollPosition,
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
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
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
		await page.waitForTimeout(1200);
		const scrolled = await getViewportScrollPosition(page);
		expect(scrolled.scrollTop).toBeGreaterThan(0);
	});

	test('a manual scroll escapes playback in place', async ({ page }) => {
		await openFile(page, TALL_FILE);
		await page.locator('#minimapMenuToggle').click();
		const transport = page.locator('#autoscrollToggle');
		await transport.click();
		await page.waitForTimeout(600);
		await page.locator('#viewport').hover();
		await page.mouse.wheel(0, 300);
		await expect(transport).toHaveAttribute('aria-label', 'Play');
		// the app's row settle snap nudges a stopped viewport once; let
		// it land before pinning the position
		await page.waitForTimeout(400);
		const after = await getViewportScrollPosition(page);
		await page.waitForTimeout(600);
		const later = await getViewportScrollPosition(page);
		expect(later.scrollTop).toBe(after.scrollTop);
	});

	test('pause freezes and play resumes from the same spot', async ({ page }) => {
		await openFile(page, TALL_FILE);
		await page.locator('#minimapMenuToggle').click();
		const transport = page.locator('#autoscrollToggle');
		await transport.click();
		await page.waitForTimeout(800);
		await transport.click();
		await expect(transport).toHaveAttribute('aria-label', 'Play');
		// let the row settle snap land before pinning the position
		await page.waitForTimeout(400);
		const frozen = await getViewportScrollPosition(page);
		expect(frozen.scrollTop).toBeGreaterThan(0);
		await page.waitForTimeout(500);
		const still = await getViewportScrollPosition(page);
		expect(still.scrollTop).toBe(frozen.scrollTop);
		await transport.click();
		await page.waitForTimeout(600);
		const resumed = await getViewportScrollPosition(page);
		expect(resumed.scrollTop).toBeGreaterThan(frozen.scrollTop);
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
