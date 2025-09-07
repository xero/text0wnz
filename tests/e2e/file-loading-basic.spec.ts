import { test, expect } from '@playwright/test';

test.describe('File Loading Basic', () => {
  test('should load the app and have file loading capability', async ({ page }) => {
    await page.goto('/');
    
    // Close splash dialog
    await page.click('#splashDraw');
    
    // Verify the app loaded correctly
    const canvas = page.locator('#art');
    await expect(canvas).toBeVisible();
    
    // Verify keyboard shortcut triggers file chooser
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    const fileChooser = await fileChooserPromise;
    expect(fileChooser.page()).toBe(page);
    
    // Cancel the file chooser
    await page.keyboard.press('Escape');
  });
});