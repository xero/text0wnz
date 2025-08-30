import { test, expect } from '@playwright/test';

test('loads the editor UI', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await expect(page.locator('#editor-canvas')).toBeVisible();
});
