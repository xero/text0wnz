import { test, expect } from '@playwright/test';

test.describe('text0wnz File Operations', () => {
  test('shows Open button on splash screen', async ({ page }) => {
    await page.goto('/');
    
    // Verify Open button is present on splash screen
    const openButton = page.locator('#splashOpen');
    await expect(openButton).toBeVisible();
    await expect(openButton).toContainText('Open');
  });

  test('file operation elements exist in DOM', async ({ page }) => {
    await page.goto('/');
    
    // Verify file section exists in DOM but is hidden
    const fileSection = page.locator('#file');
    await expect(fileSection).toBeAttached(); // exists in DOM
    await expect(fileSection).toHaveClass(/hide/); // but hidden
    
    // Verify file operation buttons exist in DOM - use more specific selectors due to duplicate IDs
    await expect(page.locator('#file #fileDraw').first()).toBeAttached(); 
    await expect(page.locator('#fileOpen')).toBeAttached(); 
    await expect(page.locator('#fileJoint')).toBeAttached(); 
  });

  test('shows canvas size indicator in footer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for editor to load
    await expect(page.locator('#art')).toBeVisible();
    
    // Verify canvas size button is visible in footer
    const canvasSizeButton = page.locator('button', { hasText: '80 cols x 25 rows' });
    await expect(canvasSizeButton).toBeVisible();
    
    // Verify it shows the expected dimensions
    await expect(canvasSizeButton).toContainText('80 cols x 25 rows');
  });

  test('shows title input in footer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for editor to load
    await expect(page.locator('#art')).toBeVisible();
    
    // Verify title input is visible
    const titleInput = page.locator('#title');
    await expect(titleInput).toBeVisible();
    await expect(titleInput).toHaveValue('untitled');
  });
});