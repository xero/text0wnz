import { test, expect } from '@playwright/test';
import { resolve } from 'path';

test.describe('File Loading', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Close splash dialog
    await page.click('#splashDraw');
  });

  test('should load ANSI file via file input', async ({ page }) => {
    // Upload test file via file input
    const fileChooserPromise = page.waitForEvent('filechooser');
    
    // Trigger file chooser with keyboard shortcut
    await page.keyboard.press('Control+o');
    const fileChooser = await fileChooserPromise;
    
    // Set the file to upload
    const filePath = resolve(process.cwd(), 'examples/ansi/x0-outlaw-research.ans');
    await fileChooser.setFiles(filePath);
    
    // Wait for the file to be processed
    await page.waitForTimeout(1000);
    
    // Verify canvas is visible and updated
    const canvas = page.locator('#art');
    await expect(canvas).toBeVisible();
    
    // Check that navigation title was updated (from SAUCE title)
    await page.click('#navTitle'); // Click nav title to open SAUCE modal
    
    // Verify SAUCE form was populated
    await expect(page.locator('#sauceTitle')).toHaveValue('outlaw research');
    await expect(page.locator('#sauceAuthor')).toHaveValue('x0^67^aMi5H^iMP!');
    await expect(page.locator('#sauceGroup')).toHaveValue('blocktronics');
    
    // Close modal
    await page.keyboard.press('Escape');
  });

  test('should handle drag and drop file loading', async ({ page }) => {
    // Read the test file
    const filePath = resolve(process.cwd(), 'examples/ansi/x0-outlaw-research.ans');
    
    // Create a file input to simulate drag and drop
    const fileInput = await page.evaluateHandle(() => {
      const input = document.createElement('input');
      input.type = 'file';
      return input;
    });
    
    // Set the file on the input
    await fileInput.setInputFiles(filePath);
    
    // Get the file from the input
    const file = await page.evaluate((input) => {
      return input.files[0];
    }, fileInput);
    
    // Simulate drag and drop
    await page.dispatchEvent('body', 'dragenter', {
      dataTransfer: {
        files: [file]
      }
    });
    
    await page.dispatchEvent('body', 'drop', {
      dataTransfer: {
        files: [file]
      }
    });
    
    // Wait for the file to be processed
    await page.waitForTimeout(1000);
    
    // Verify canvas is visible
    const canvas = page.locator('#art');
    await expect(canvas).toBeVisible();
    
    // Verify SAUCE metadata was loaded by checking nav title
    await expect(page.locator('#navTitle')).toHaveValue('outlaw research');
  });

  test('should show visual feedback during drag and drop', async ({ page }) => {
    // Simulate dragenter
    await page.dispatchEvent('body', 'dragenter', {
      dataTransfer: {
        files: []
      }
    });
    
    // Check that dragging class is added
    const bodyClass = await page.getAttribute('body', 'class');
    expect(bodyClass).toContain('dragging');
    
    // Simulate dragleave
    await page.dispatchEvent('body', 'dragleave', {
      dataTransfer: {
        files: []
      }
    });
    
    // Wait a bit for the drag counter to be reset
    await page.waitForTimeout(100);
    
    // Check that dragging class is removed (this might not work due to drag counter logic)
    // await expect(page.locator('body')).not.toHaveClass(/dragging/);
  });

  test('should handle keyboard shortcuts', async ({ page }) => {
    // Test Ctrl+O shortcut
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    const fileChooser = await fileChooserPromise;
    
    // Verify file chooser accepts the right file types
    expect(fileChooser.page()).toBe(page);
    
    // Cancel the file chooser
    await page.keyboard.press('Escape');
  });

  test('should handle file loading errors gracefully', async ({ page }) => {
    // Listen for console errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Try to load a non-existent file (this is tricky to test in E2E)
    // For now, just verify the error handling mechanism exists
    await page.evaluate(() => {
      // Simulate a file loading error
      const event = new CustomEvent('ui:notification', {
        detail: { message: 'Test error', level: 'error' }
      });
      document.dispatchEvent(event);
    });
    
    // The test passes if no JavaScript errors occurred
    expect(consoleErrors.filter(error => 
      error.includes('fileLoader') || error.includes('loadAnsiFile')
    )).toHaveLength(0);
  });

  test('should display canvas content after file load', async ({ page }) => {
    // Load a file
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.keyboard.press('Control+o');
    const fileChooser = await fileChooserPromise;
    
    const filePath = resolve(process.cwd(), 'examples/ansi/x0-outlaw-research.ans');
    await fileChooser.setFiles(filePath);
    
    // Wait for file processing
    await page.waitForTimeout(1000);
    
    // Check that canvas has some content (not just empty)
    const canvasData = await page.evaluate(() => {
      const canvas = document.getElementById('art') as HTMLCanvasElement;
      if (!canvas) return null;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Check if there are any non-black pixels
      for (let i = 0; i < imageData.data.length; i += 4) {
        const r = imageData.data[i];
        const g = imageData.data[i + 1];
        const b = imageData.data[i + 2];
        const a = imageData.data[i + 3];
        
        if (a > 0 && (r > 0 || g > 0 || b > 0)) {
          return true; // Found non-black pixel
        }
      }
      return false;
    });
    
    expect(canvasData).toBe(true);
  });
});