import { test, expect } from '@playwright/test';

test.describe('text0wnz Collaboration Features', () => {
  test('shows collaboration UI elements on splash screen', async ({ page }) => {
    await page.goto('/');
    
    // Verify Join button is present on splash screen
    const joinButton = page.locator('#splashJoint');
    await expect(joinButton).toBeVisible();
    await expect(joinButton).toContainText('Join');
    
    // Verify the button has proper styling indicating it may be disabled
    await expect(joinButton).toHaveClass(/cancel/);
  });

  test('collaboration elements exist in DOM but are hidden', async ({ page }) => {
    await page.goto('/');
    
    // Verify collaboration section exists in DOM but is hidden
    const collabSection = page.locator('#collab');
    await expect(collabSection).toBeAttached(); // exists in DOM
    await expect(collabSection).toHaveClass(/hide/); // but hidden
    
    // Verify collaboration buttons exist
    await expect(page.locator('#joint')).toBeAttached();
    await expect(page.locator('#offline')).toBeAttached();
  });
});