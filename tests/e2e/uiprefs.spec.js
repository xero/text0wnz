import { test, expect } from '@playwright/test';
import {
	clickViewToggle,
	waitForEditorReady,
} from './helpers/editorHelpers.js';

const isDark = page =>
	page.evaluate(() => document.documentElement.classList.contains('dark'));

test.describe('UI preferences', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test('day/night mode survives a reload', async ({ page }) => {
		// the headless browser's own color scheme sets the boot default,
		// so flip from whatever it is and pin the flipped state
		const before = await isDark(page);
		await page.locator('#navView').click();
		await clickViewToggle(page, 'navDarkmode');
		expect(await isDark(page)).toBe(!before);

		await page.reload();
		await waitForEditorReady(page);
		expect(await isDark(page)).toBe(!before);
	});

	test('the grid survives a reload and relights its button', async ({ page }) => {
		await page.locator('#navView').click();
		await clickViewToggle(page, 'navGrid');
		const grid = page.locator('#grid');
		await expect(grid).toHaveClass(/enabled/);

		await page.reload();
		await waitForEditorReady(page);
		await expect(grid).toHaveClass(/enabled/);
		await expect(page.locator('#navGrid')).toHaveClass(/enabled/);
		// the restore defers building until the boot font lands
		await expect(grid.locator('canvas').first()).toBeAttached();

		await page.locator('#navView').click();
		await clickViewToggle(page, 'navGrid');
		await expect(grid).not.toHaveClass(/enabled/);
		await page.reload();
		await waitForEditorReady(page);
		await expect(grid).not.toHaveClass(/enabled/);
	});
});
