import { test, expect } from '@playwright/test';

test.describe('text0wnz Editor', () => {
  test('loads the homepage and shows splash dialog', async ({ page }) => {
    await page.goto('/');
    
    // Check that the page loads and has the correct title
    await expect(page).toHaveTitle('.:teXt0wnz:.');
    
    // Verify splash dialog is open by default
    const splashDialog = page.locator('#msg');
    await expect(splashDialog).toBeVisible();
    
    // Verify splash content
    const splashSection = page.locator('#splash');
    await expect(splashSection).toBeVisible();
    await expect(splashSection.locator('h1')).toContainText('Welcome to teXt0wnz');
    await expect(splashSection.locator('blockquote')).toContainText('the online collaborative text art editor');
    
    // Verify splash buttons are present
    await expect(page.locator('#splashJoint')).toBeVisible();
    await expect(page.locator('#splashOpen')).toBeVisible(); 
    await expect(page.locator('#splashDraw')).toBeVisible();
    
    // Verify main canvas is present but may be hidden behind dialog
    const mainCanvas = page.locator('#art');
    await expect(mainCanvas).toBeAttached();
  });

  test('can start drawing by clicking Draw button', async ({ page }) => {
    await page.goto('/');
    
    // Click the Draw button to close splash and start editing
    await page.locator('#splashDraw').click();
    
    // Wait for dialog to close 
    const splashDialog = page.locator('#msg');
    await expect(splashDialog).not.toBeVisible();
    
    // Verify main canvas is now visible and ready
    const mainCanvas = page.locator('#art');
    await expect(mainCanvas).toBeVisible();
    
    // Verify palette canvas is visible
    const paletteCanvas = page.locator('#paletteColors');
    await expect(paletteCanvas).toBeVisible();
    
    // Verify current colors canvas is visible  
    const currentColors = page.locator('#currentColors');
    await expect(currentColors).toBeVisible();
  });

  test('can select different tools and see tool options', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for the editor to be ready
    await expect(page.locator('#art')).toBeVisible();
    
    // Click on brush tool
    const brushTool = page.locator('#brush');
    await expect(brushTool).toBeVisible();
    await brushTool.click();
    
    // Verify brush options become visible
    const brushOpts = page.locator('#brushOpts');
    await expect(brushOpts).toBeVisible();
    
    // Check for specific brush options
    await expect(page.locator('#blockBrush')).toBeVisible();
    await expect(page.locator('#shadeBrush')).toBeVisible();
    await expect(page.locator('#characterBrush')).toBeVisible();
  });

  test('can change font selection', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for the editor to be ready
    await expect(page.locator('#art')).toBeVisible();
    
    // Click font button to open font selection
    const fontButton = page.locator('#font');
    await expect(fontButton).toBeVisible();
    await fontButton.click();
    
    // Verify font selection dialog appears
    const fontsSection = page.locator('#fonts');
    await expect(fontsSection).toBeVisible();
    
    // Verify font selector is present
    const fontSelect = page.locator('#fontName');
    await expect(fontSelect).toBeVisible();
    
    // Verify font preview is present
    const fontPreview = page.locator('#fontPreview');
    await expect(fontPreview).toBeVisible();
  });

  test('can interact with color palette', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for the editor to be ready
    await expect(page.locator('#art')).toBeVisible();
    
    // Verify palette canvas is interactive
    const paletteCanvas = page.locator('#paletteColors');
    await expect(paletteCanvas).toBeVisible();
    
    // Get canvas dimensions to click on it  
    const canvasBox = await paletteCanvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    
    if (canvasBox) {
      // Click on the palette (should work even if we can't verify exact color change)
      await paletteCanvas.click({
        position: { x: canvasBox.width / 4, y: canvasBox.height / 2 }
      });
    }
    
    // Verify current colors canvas is still visible after interaction
    const currentColors = page.locator('#currentColors');
    await expect(currentColors).toBeVisible();
  });

  test('can simulate drawing on canvas', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for the editor to be ready
    await expect(page.locator('#art')).toBeVisible();
    
    // Select brush tool first
    await page.locator('#brush').click();
    await expect(page.locator('#brushOpts')).toBeVisible();
    
    // Select a brush type
    await page.locator('#blockBrush').click();
    
    // Get main canvas and simulate drawing
    const mainCanvas = page.locator('#art');
    const canvasBox = await mainCanvas.boundingBox();
    expect(canvasBox).toBeTruthy();
    
    if (canvasBox) {
      // Simulate a few clicks on the canvas to "draw"
      await mainCanvas.click({
        position: { x: canvasBox.width / 3, y: canvasBox.height / 3 }
      });
      
      await mainCanvas.click({
        position: { x: canvasBox.width / 2, y: canvasBox.height / 2 }
      });
      
      // Canvas should still be visible and interactive
      await expect(mainCanvas).toBeVisible();
    }
  });

  test('shows cursor position in footer', async ({ page }) => {
    await page.goto('/');
    await page.locator('#splashDraw').click();
    
    // Wait for the editor to be ready
    await expect(page.locator('#art')).toBeVisible();
    
    // Verify cursor position indicator is present
    const cursor = page.locator('#cursor');
    await expect(cursor).toBeVisible();
    await expect(cursor).toContainText(/\d+,\d+/); // Should show coordinates like "1,1"
  });
});
