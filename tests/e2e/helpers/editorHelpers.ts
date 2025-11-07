import { Page } from '@playwright/test';

/**
 * Wait for the editor to be ready by checking for the canvas container
 * and allowing time for initialization
 */
export async function waitForEditorReady(page: Page, timeout = 10000): Promise<void> {
	await page.waitForSelector('#canvasContainer', { timeout });
	// Give the editor time to fully initialize
	await page.waitForTimeout(1000);
}

/**
 * Focus the canvas element for keyboard input
 * Clicks on the viewport container instead of canvas to avoid overlay interference
 */
export async function focusCanvas(page: Page): Promise<void> {
	// Click on viewport instead of canvas to avoid toolPreview overlay interference
	const viewport = page.locator('#viewport');
	await viewport.click({ position: { x: 100, y: 100 } });
	await page.waitForTimeout(200);
}

/**
 * Get canvas text content by reading from the DOM
 * TODO: This is a placeholder - adjust based on actual DOM structure
 * or window API if available. May need to read from State.textArtCanvas
 * via page.evaluate() if that's exposed.
 */
export async function getCanvasText(page: Page): Promise<string> {
	// Attempt to get text from canvas via window API if exposed
	const textFromAPI = await page.evaluate(() => {
		// @ts-ignore - checking if API exists
		if (window.State && window.State.textArtCanvas) {
			// @ts-ignore
			return window.State.textArtCanvas.toString();
		}
		return null;
	});

	if (textFromAPI) {
		return textFromAPI;
	}

	// Fallback: try to get text from DOM or return empty
	// This is a placeholder - actual implementation depends on how
	// the editor exposes canvas data
	return '';
}

/**
 * Get the current viewport scroll position
 */
export async function getViewportScrollPosition(page: Page): Promise<{ scrollTop: number; scrollLeft: number }> {
	return await page.evaluate(() => {
		const viewport = document.getElementById('viewport');
		if (viewport) {
			return {
				scrollTop: viewport.scrollTop,
				scrollLeft: viewport.scrollLeft,
			};
		}
		return { scrollTop: 0, scrollLeft: 0 };
	});
}

/**
 * Get the position info text displayed in the editor
 */
export async function getPositionInfo(page: Page): Promise<string> {
	const positionInfo = page.locator('#positionInfo');
	return await positionInfo.textContent() || '';
}

/**
 * Check if a specific tool is active by checking for active class or similar
 * TODO: Adjust based on actual DOM structure for active tool indication
 */
export async function getActiveTool(page: Page): Promise<string | null> {
	return await page.evaluate(() => {
		// Check for active tool in sidebar
		const activeTool = document.querySelector('aside > div.active, aside > div[class*="active"]');
		if (activeTool && activeTool.id) {
			return activeTool.id;
		}
		return null;
	});
}
