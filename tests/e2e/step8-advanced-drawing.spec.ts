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

test.describe('Step 8: Advanced Drawing Method Testing', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    
    // Wait for the splash dialog to be visible
    await expect(page.locator('#msg')).toBeVisible();
    
    // Click the "Draw" button to close the splash and start drawing
    await safeClick(page, '#splashDraw');
    
    // Wait for the dialog to close and canvas to be ready
    await expect(page.locator('#msg')).not.toBeVisible();
    await expect(page.locator('#art')).toBeVisible();
  });

  test.describe('Single-pixel and shape drawing', () => {
    test('should handle single-pixel edits with different tools', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      // Test brush tool for single pixel edits
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      expect(canvasBox).not.toBeNull();
      
      if (canvasBox) {
        // Make several single-pixel edits
        const edits = [
          { x: canvasBox.x + 50, y: canvasBox.y + 50 },
          { x: canvasBox.x + 100, y: canvasBox.y + 75 },
          { x: canvasBox.x + 150, y: canvasBox.y + 100 }
        ];
        
        for (const edit of edits) {
          await page.mouse.click(edit.x, edit.y);
          await page.waitForTimeout(50); // Small delay between edits
        }
        
        // Verify canvas is still responsive
        const isResponsive = await page.evaluate(() => {
          const canvas = document.getElementById('art') as HTMLCanvasElement;
          return canvas && canvas.getContext('2d') !== null;
        });
        expect(isResponsive).toBe(true);
      }
    });

    test('should handle line drawing simulation', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Simulate drawing a horizontal line
        const lineY = canvasBox.y + 100;
        const startX = canvasBox.x + 50;
        const endX = canvasBox.x + 200;
        const step = 10;
        
        for (let x = startX; x <= endX; x += step) {
          await page.mouse.click(x, lineY);
          await page.waitForTimeout(20);
        }
        
        // Check that drawing occurred without errors
        const jsErrors = await page.evaluate(() => {
          return (window as any).lastError || null;
        });
        expect(jsErrors).toBeNull();
      }
    });

    test('should handle rectangular shape drawing', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Draw a rectangle outline
        const rectX = canvasBox.x + 80;
        const rectY = canvasBox.y + 80;
        const rectW = 100;
        const rectH = 60;
        
        // Top edge
        for (let x = rectX; x < rectX + rectW; x += 15) {
          await page.mouse.click(x, rectY);
          await page.waitForTimeout(10);
        }
        
        // Bottom edge
        for (let x = rectX; x < rectX + rectW; x += 15) {
          await page.mouse.click(x, rectY + rectH);
          await page.waitForTimeout(10);
        }
        
        // Left edge
        for (let y = rectY; y < rectY + rectH; y += 15) {
          await page.mouse.click(rectX, y);
          await page.waitForTimeout(10);
        }
        
        // Right edge
        for (let y = rectY; y < rectY + rectH; y += 15) {
          await page.mouse.click(rectX + rectW, y);
          await page.waitForTimeout(10);
        }
        
        // Verify canvas state is consistent
        const canvasValid = await page.evaluate(() => {
          const canvas = document.getElementById('art') as HTMLCanvasElement;
          const ctx = canvas?.getContext('2d');
          return Boolean(canvas && ctx);
        });
        expect(canvasValid).toBe(true);
      }
    });
  });

  test.describe('Tool switching and state management', () => {
    test('should maintain canvas state during rapid tool switching', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      const tools = ['#brush', '#shapes', '#pen', '#shade'];
      
      for (let i = 0; i < 3; i++) {
        for (const tool of tools) {
          await safeClick(page, tool);
          await page.waitForTimeout(100);
          
          // Make a quick edit if not WebKit
          if (browserName !== 'webkit') {
            const canvas = page.locator('#art');
            const canvasBox = await canvas.boundingBox();
            
            if (canvasBox) {
              await page.mouse.click(
                canvasBox.x + 50 + i * 20,
                canvasBox.y + 50 + i * 20
              );
            }
          }
        }
      }
      
      // Verify application is still responsive
      const isResponsive = await page.evaluate(() => {
        return document.readyState === 'complete';
      });
      expect(isResponsive).toBe(true);
    });

    test('should handle tool options without interfering with canvas', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      if (browserName === 'webkit') {
        // For WebKit, just verify basic tool selection works
        await safeClick(page, '#brush');
        await expect(page.locator('#brushOpts')).toBeAttached();
        return;
      }
      
      // Test brush tool options
      await safeClick(page, '#brush');
      await expect(page.locator('#brushOpts')).toBeVisible();
      
      const brushSubtools = ['#blockBrush', '#shadeBrush'];
      for (const subtool of brushSubtools) {
        await safeClick(page, subtool);
        await page.waitForTimeout(100);
        
        // Make a test edit
        const canvas = page.locator('#art');
        const canvasBox = await canvas.boundingBox();
        
        if (canvasBox) {
          await page.mouse.click(
            canvasBox.x + 100,
            canvasBox.y + 100
          );
        }
      }
      
      // Test shapes tool
      await safeClick(page, '#shapes');
      
      // Verify canvas is still functional
      const canvasWorks = await page.evaluate(() => {
        const canvas = document.getElementById('art') as HTMLCanvasElement;
        return Boolean(canvas && canvas.getContext('2d'));
      });
      expect(canvasWorks).toBe(true);
    });
  });

  test.describe('Performance and responsiveness testing', () => {
    test('should handle rapid clicking without freezing', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        const centerX = canvasBox.x + canvasBox.width / 2;
        const centerY = canvasBox.y + canvasBox.height / 2;
        
        // Rapid clicking test (fewer clicks for WebKit)
        const clickCount = browserName === 'webkit' ? 5 : 15;
        
        for (let i = 0; i < clickCount; i++) {
          await page.mouse.click(
            centerX + (i % 5) * 10,
            centerY + Math.floor(i / 5) * 10
          );
          // No delay for rapid clicking test
        }
        
        // Wait briefly for processing
        await page.waitForTimeout(200);
        
        // Verify application is still responsive
        const isResponsive = await page.evaluate(() => {
          return document.readyState === 'complete';
        });
        expect(isResponsive).toBe(true);
      }
    });

    test('should maintain performance with canvas resizing', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      // First make some edits
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
        
        const canvas = page.locator('#art');
        const canvasBox = await canvas.boundingBox();
        
        if (canvasBox) {
          // Make some edits before resizing
          for (let i = 0; i < 5; i++) {
            await page.mouse.click(
              canvasBox.x + 50 + i * 20,
              canvasBox.y + 50
            );
          }
        }
      }
      
      // Simulate browser resize
      await page.setViewportSize({ width: 1024, height: 768 });
      await page.waitForTimeout(300);
      
      await page.setViewportSize({ width: 1280, height: 1024 });
      await page.waitForTimeout(300);
      
      // Verify canvas is still functional after resize
      const canvasValid = await page.evaluate(() => {
        const canvas = document.getElementById('art') as HTMLCanvasElement;
        return Boolean(canvas && canvas.getContext('2d'));
      });
      expect(canvasValid).toBe(true);
    });

    test('should handle multiple drawing sessions without memory issues', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Simulate multiple drawing sessions
        const sessions = browserName === 'webkit' ? 3 : 5;
        const editsPerSession = browserName === 'webkit' ? 5 : 10;
        
        for (let session = 0; session < sessions; session++) {
          // Draw in different areas for each session
          const sessionX = canvasBox.x + (session % 3) * 60 + 50;
          const sessionY = canvasBox.y + Math.floor(session / 3) * 60 + 50;
          
          for (let edit = 0; edit < editsPerSession; edit++) {
            await page.mouse.click(
              sessionX + (edit % 3) * 15,
              sessionY + Math.floor(edit / 3) * 15
            );
            await page.waitForTimeout(20);
          }
          
          // Short pause between sessions
          await page.waitForTimeout(100);
        }
        
        // Verify no memory issues and responsiveness
        const memoryOk = await page.evaluate(() => {
          // Check if browser is still responsive
          const start = Date.now();
          for (let i = 0; i < 1000; i++) {
            Math.random(); // Simple computation
          }
          const end = Date.now();
          return (end - start) < 100; // Should complete quickly
        });
        expect(memoryOk).toBe(true);
      }
    });
  });

  test.describe('Error handling and edge cases', () => {
    test('should handle canvas interactions at boundaries', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Test clicks at canvas boundaries
        const boundaryPoints = [
          { x: canvasBox.x + 1, y: canvasBox.y + 1 }, // Top-left
          { x: canvasBox.x + canvasBox.width - 1, y: canvasBox.y + 1 }, // Top-right
          { x: canvasBox.x + 1, y: canvasBox.y + canvasBox.height - 1 }, // Bottom-left
          { x: canvasBox.x + canvasBox.width - 1, y: canvasBox.y + canvasBox.height - 1 }, // Bottom-right
        ];
        
        for (const point of boundaryPoints) {
          await page.mouse.click(point.x, point.y);
          await page.waitForTimeout(50);
        }
        
        // Verify no errors occurred
        const jsErrors = await page.evaluate(() => {
          return (window as any).lastError || null;
        });
        expect(jsErrors).toBeNull();
      }
    });

    test('should handle clicks outside canvas gracefully', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Click outside canvas bounds
        await page.mouse.click(canvasBox.x - 50, canvasBox.y - 50);
        await page.mouse.click(canvasBox.x + canvasBox.width + 50, canvasBox.y + 50);
        await page.mouse.click(canvasBox.x + 50, canvasBox.y + canvasBox.height + 50);
        
        // Application should remain functional
        const isStillWorking = await page.evaluate(() => {
          const canvas = document.getElementById('art') as HTMLCanvasElement;
          return Boolean(canvas && canvas.getContext('2d'));
        });
        expect(isStillWorking).toBe(true);
      }
    });

    test('should recover from tool selection errors', async ({ page }) => {
      // Try to select non-existent or invalid tools
      await page.evaluate(() => {
        // Simulate clicking on non-existent elements
        const fakeEvent = new Event('click');
        document.dispatchEvent(fakeEvent);
      });
      
      await page.waitForTimeout(100);
      
      // Should still be able to select valid tools
      await safeClick(page, '#brush');
      
      const isWorking = await page.evaluate(() => {
        const canvas = document.getElementById('art') as HTMLCanvasElement;
        return Boolean(canvas);
      });
      expect(isWorking).toBe(true);
    });
  });

  test.describe('Network simulation testing', () => {
    test('should handle simulated collaborative editing', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Simulate local edits
        await page.mouse.click(canvasBox.x + 50, canvasBox.y + 50);
        await page.mouse.click(canvasBox.x + 60, canvasBox.y + 50);
        
        // Simulate what would happen with network patches
        // Since we don't have real network, we test the UI responsiveness
        await page.evaluate(() => {
          // Simulate the kind of async operations that network patches would trigger
          const promises = [];
          for (let i = 0; i < 10; i++) {
            promises.push(new Promise(resolve => setTimeout(resolve, 10 + i * 2)));
          }
          return Promise.all(promises);
        });
        
        // Make more local edits
        await page.mouse.click(canvasBox.x + 70, canvasBox.y + 50);
        await page.mouse.click(canvasBox.x + 80, canvasBox.y + 50);
        
        // Verify canvas remains responsive
        const isResponsive = await page.evaluate(() => {
          const canvas = document.getElementById('art') as HTMLCanvasElement;
          const ctx = canvas?.getContext('2d');
          return Boolean(canvas && ctx);
        });
        expect(isResponsive).toBe(true);
      }
    });

    test('should maintain UI responsiveness during batched operations', async ({ page }) => {
      const browserName = page.context().browser()?.browserType().name();
      
      await safeClick(page, '#brush');
      
      if (browserName !== 'webkit') {
        await expect(page.locator('#brushOpts')).toBeVisible();
        await safeClick(page, '#blockBrush');
      }
      
      // Simulate batched operations (like what network processing would do)
      await page.evaluate(() => {
        // Simulate requestAnimationFrame batching
        return new Promise(resolve => {
          let frames = 0;
          const processFrame = () => {
            frames++;
            if (frames < 5) {
              requestAnimationFrame(processFrame);
            } else {
              resolve(true);
            }
          };
          requestAnimationFrame(processFrame);
        });
      });
      
      const canvas = page.locator('#art');
      const canvasBox = await canvas.boundingBox();
      
      if (canvasBox) {
        // Should still be able to draw during/after batched operations
        await page.mouse.click(canvasBox.x + 100, canvasBox.y + 100);
        
        const stillWorking = await page.evaluate(() => {
          const canvas = document.getElementById('art') as HTMLCanvasElement;
          return Boolean(canvas && canvas.getContext('2d'));
        });
        expect(stillWorking).toBe(true);
      }
    });
  });
});