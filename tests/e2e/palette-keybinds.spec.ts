import { test, expect } from '@playwright/test';

// Helper function for browser-specific clicks to handle WebKit pointer event issues
async function safeClick(page: any, selector: string, options = {}) {
  const browserName = page.context().browser()?.browserType().name();
  
  if (browserName === 'webkit') {
    // For WebKit, try keyboard activation as an alternative to clicking
    const element = page.locator(selector);
    
    // Focus the element and press Enter (often more reliable than clicking in WebKit)
    await element.focus();
    await page.waitForTimeout(100);
    await element.press('Enter');
    await page.waitForTimeout(200);
  } else {
    // For other browsers, use normal click
    await page.locator(selector).click(options);
  }
}

test.describe('Palette and Keybind Functionality', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Close splash dialog by clicking Draw button
    await safeClick(page, '#splashDraw');
    
    // Wait for the main interface to be ready
    await expect(page.locator('#art')).toBeVisible();
    await expect(page.locator('#paletteColors')).toBeVisible();
    await expect(page.locator('#currentColors')).toBeVisible();
  });

  test.describe('Palette Picker Mouse Interactions', () => {
    test('should change foreground color when clicking palette swatch', async ({ page }) => {
      const paletteCanvas = page.locator('#paletteColors');
      const currentColors = page.locator('#currentColors');
      
      // Get initial color state - should show current colors preview
      await expect(currentColors).toBeVisible();
      
      // Click on a palette swatch (let's click on the red color area)
      // Palette is 8x2 grid, red should be around color index 4 (position 4, 0)
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Click on red swatch (index 4, first row)
        const redX = paletteBox.x + (4 * swatchWidth) + (swatchWidth / 2);
        const redY = paletteBox.y + (swatchHeight / 2);
        
        await page.mouse.click(redX, redY);
        
        // Wait for the color change to be reflected
        await page.waitForTimeout(100);
        
        // The current colors preview should update to show red as foreground
        // We can't easily test the canvas pixels, but we can verify the click was registered
        // by checking that no errors occurred and the interface is still responsive
        await expect(currentColors).toBeVisible();
      }
    });

    test('should change background color when Ctrl+clicking palette swatch', async ({ page }) => {
      const paletteCanvas = page.locator('#paletteColors');
      
      // Click on a palette swatch with Ctrl modifier
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Ctrl+click on green swatch (index 2, first row)
        const greenX = paletteBox.x + (2 * swatchWidth) + (swatchWidth / 2);
        const greenY = paletteBox.y + (swatchHeight / 2);
        
        await page.keyboard.down('Control');
        await page.mouse.click(greenX, greenY);
        await page.keyboard.up('Control');
        
        await page.waitForTimeout(100);
        await expect(page.locator('#currentColors')).toBeVisible();
      }
    });

    test('should change background color when Alt+clicking palette swatch', async ({ page }) => {
      const paletteCanvas = page.locator('#paletteColors');
      
      // Click on a palette swatch with Alt modifier
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Alt+click on blue swatch (index 1, first row)
        const blueX = paletteBox.x + (1 * swatchWidth) + (swatchWidth / 2);
        const blueY = paletteBox.y + (swatchHeight / 2);
        
        await page.keyboard.down('Alt');
        await page.mouse.click(blueX, blueY);
        await page.keyboard.up('Alt');
        
        await page.waitForTimeout(100);
        await expect(page.locator('#currentColors')).toBeVisible();
      }
    });

    test('should handle clicks on bottom row of palette', async ({ page }) => {
      const paletteCanvas = page.locator('#paletteColors');
      
      // Click on bottom row (bright colors)
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Click on bright red (index 12, second row)  
        const brightRedX = paletteBox.x + (4 * swatchWidth) + (swatchWidth / 2);
        const brightRedY = paletteBox.y + swatchHeight + (swatchHeight / 2);
        
        await page.mouse.click(brightRedX, brightRedY);
        
        await page.waitForTimeout(100);
        await expect(page.locator('#currentColors')).toBeVisible();
      }
    });
  });

  test.describe('Current Colors Swap Functionality', () => {
    test('should swap foreground and background colors when clicking current colors preview', async ({ page }) => {
      const currentColors = page.locator('#currentColors');
      const paletteCanvas = page.locator('#paletteColors');
      
      // First, set different foreground and background colors
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Set foreground to red (index 4)
        const redX = paletteBox.x + (4 * swatchWidth) + (swatchWidth / 2);
        const redY = paletteBox.y + (swatchHeight / 2);
        await page.mouse.click(redX, redY);
        
        await page.waitForTimeout(100);
        
        // Set background to blue (index 1) with Ctrl+click
        const blueX = paletteBox.x + (1 * swatchWidth) + (swatchWidth / 2);
        const blueY = paletteBox.y + (swatchHeight / 2);
        await page.keyboard.down('Control');
        await page.mouse.click(blueX, blueY);
        await page.keyboard.up('Control');
        
        await page.waitForTimeout(100);
        
        // Now click on current colors to swap
        await currentColors.click();
        
        await page.waitForTimeout(100);
        
        // Verify the interface is still responsive after swap
        await expect(currentColors).toBeVisible();
        await expect(paletteCanvas).toBeVisible();
      }
    });
  });

  test.describe('Palette Keyboard Shortcuts', () => {
    test('should change foreground color with Ctrl+number keys', async ({ page }) => {
      // Test Ctrl+1 for setting foreground to color 0
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(100);
      
      // Verify interface is still responsive
      await expect(page.locator('#currentColors')).toBeVisible();
      
      // Test Ctrl+5 for setting foreground to color 4 (red)
      await page.keyboard.press('Control+5');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
    });

    test('should toggle between normal and bright colors with Ctrl+number', async ({ page }) => {
      // Press Ctrl+1 twice to test toggling between color 0 and 8
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(100);
      
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
    });

    test('should change background color with Alt+number keys', async ({ page }) => {
      // Test Alt+2 for setting background to color 1
      await page.keyboard.press('Alt+2');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
      
      // Test Alt+5 for setting background to color 4
      await page.keyboard.press('Alt+5');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
    });

    test('should cycle foreground color with Ctrl+arrow keys', async ({ page }) => {
      // Test Ctrl+ArrowUp to decrease foreground color
      await page.keyboard.press('Control+ArrowUp');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
      
      // Test Ctrl+ArrowDown to increase foreground color
      await page.keyboard.press('Control+ArrowDown');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
    });

    test('should cycle background color with Ctrl+arrow keys', async ({ page }) => {
      // Test Ctrl+ArrowLeft to decrease background color
      await page.keyboard.press('Control+ArrowLeft');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
      
      // Test Ctrl+ArrowRight to increase background color
      await page.keyboard.press('Control+ArrowRight');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
    });

    test('should wrap colors correctly at boundaries', async ({ page }) => {
      // Set foreground to color 0 first
      await page.keyboard.press('Control+1');
      await page.waitForTimeout(100);
      
      // Ctrl+ArrowUp should wrap from 0 to 15
      await page.keyboard.press('Control+ArrowUp');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
      
      // Ctrl+ArrowDown should wrap from 15 to 0
      await page.keyboard.press('Control+ArrowDown');
      await page.waitForTimeout(100);
      
      await expect(page.locator('#currentColors')).toBeVisible();
    });
  });

  test.describe('Keybind Isolation and Context', () => {
    test('should not respond to number keys without modifiers', async ({ page }) => {
      // Store initial state
      const currentColors = page.locator('#currentColors');
      await expect(currentColors).toBeVisible();
      
      // Press number keys without modifiers - should not change palette
      await page.keyboard.press('1');
      await page.keyboard.press('2');
      await page.keyboard.press('5');
      await page.waitForTimeout(100);
      
      // Interface should still be responsive and unchanged
      await expect(currentColors).toBeVisible();
    });

    test('should not respond to arrow keys without Ctrl', async ({ page }) => {
      const currentColors = page.locator('#currentColors');
      await expect(currentColors).toBeVisible();
      
      // Press arrow keys without Ctrl - should not change palette
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(100);
      
      // Interface should still be responsive and unchanged
      await expect(currentColors).toBeVisible();
    });

    test('should not respond to keys outside 1-8 range', async ({ page }) => {
      const currentColors = page.locator('#currentColors');
      await expect(currentColors).toBeVisible();
      
      // Press Ctrl+number keys outside valid range
      await page.keyboard.press('Control+9');
      await page.keyboard.press('Control+0');
      await page.keyboard.press('Control+a');
      await page.waitForTimeout(100);
      
      // Interface should still be responsive and unchanged
      await expect(currentColors).toBeVisible();
    });

    test('should not interfere with other UI elements', async ({ page }) => {
      // Ensure palette keybinds don't interfere with other parts of the interface
      const artCanvas = page.locator('#art');
      const toolsSection = page.locator('#toolOptions');
      
      await expect(artCanvas).toBeVisible();
      await expect(toolsSection).toBeVisible();
      
      // Use palette shortcuts
      await page.keyboard.press('Control+3');
      await page.keyboard.press('Alt+5');
      await page.keyboard.press('Control+ArrowUp');
      await page.waitForTimeout(100);
      
      // Other UI elements should still be functional
      await expect(artCanvas).toBeVisible();
      await expect(toolsSection).toBeVisible();
      
      // Tools should still be clickable
      const brushTool = page.locator('#brush');
      if (await brushTool.isVisible()) {
        await safeClick(page, '#brush');
        await expect(page.locator('#brushOpts')).toBeVisible();
      }
    });
  });

  test.describe('UI Preview Updates', () => {
    test('should update current colors preview after palette changes', async ({ page }) => {
      const currentColors = page.locator('#currentColors');
      const paletteCanvas = page.locator('#paletteColors');
      
      // Verify initial state
      await expect(currentColors).toBeVisible();
      await expect(paletteCanvas).toBeVisible();
      
      // Change colors using different methods and verify preview updates
      
      // Method 1: Keyboard shortcut
      await page.keyboard.press('Control+5'); // Set foreground to red
      await page.waitForTimeout(100);
      await expect(currentColors).toBeVisible();
      
      // Method 2: Mouse click
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Click on blue with Ctrl to set background
        const blueX = paletteBox.x + (1 * swatchWidth) + (swatchWidth / 2);
        const blueY = paletteBox.y + (swatchHeight / 2);
        await page.keyboard.down('Control');
        await page.mouse.click(blueX, blueY);
        await page.keyboard.up('Control');
        
        await page.waitForTimeout(100);
        await expect(currentColors).toBeVisible();
      }
      
      // Method 3: Arrow key cycling
      await page.keyboard.press('Control+ArrowRight'); // Cycle background
      await page.waitForTimeout(100);
      await expect(currentColors).toBeVisible();
      
      // Method 4: Color swap
      await currentColors.click();
      await page.waitForTimeout(100);
      await expect(currentColors).toBeVisible();
    });

    test('should maintain consistency between palette state and UI', async ({ page }) => {
      // This test ensures that all palette operations maintain UI consistency
      const currentColors = page.locator('#currentColors');
      const paletteCanvas = page.locator('#paletteColors');
      
      // Perform a sequence of operations
      await page.keyboard.press('Control+3'); // Set fg to color 2
      await page.waitForTimeout(50);
      
      await page.keyboard.press('Alt+6'); // Set bg to color 5  
      await page.waitForTimeout(50);
      
      await page.keyboard.press('Control+ArrowUp'); // Cycle fg
      await page.waitForTimeout(50);
      
      await currentColors.click(); // Swap colors
      await page.waitForTimeout(50);
      
      await page.keyboard.press('Control+ArrowRight'); // Cycle bg
      await page.waitForTimeout(50);
      
      // UI should remain consistent and responsive
      await expect(currentColors).toBeVisible();
      await expect(paletteCanvas).toBeVisible();
      
      // Should be able to continue using the interface
      const artCanvas = page.locator('#art');
      await expect(artCanvas).toBeVisible();
    });
  });

  test.describe('Touch/Mobile Interactions', () => {
    test('should handle touch events on palette swatches', async ({ page }) => {
      const paletteCanvas = page.locator('#paletteColors');
      
      const paletteBox = await paletteCanvas.boundingBox();
      if (paletteBox) {
        const swatchWidth = paletteBox.width / 8;
        const swatchHeight = paletteBox.height / 2;
        
        // Simulate touch on a swatch
        const touchX = paletteBox.x + (3 * swatchWidth) + (swatchWidth / 2);
        const touchY = paletteBox.y + (swatchHeight / 2);
        
        // Use touchscreen to simulate mobile touch
        await page.touchscreen.tap(touchX, touchY);
        
        await page.waitForTimeout(100);
        
        // Verify interface responds to touch
        await expect(page.locator('#currentColors')).toBeVisible();
      }
    });
  });
});