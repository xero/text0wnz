/**
 * Wait for the editor to be ready by checking for the canvas container
 * and allowing time for initialization
 * TODO: Replace timeout with specific readiness indicator from editor state
 */
export async function waitForEditorReady(page, timeout = 10000) {
	await page.waitForSelector('#canvasContainer', { timeout });
	// Allow time for editor initialization (fonts, state, etc.)
	// TODO: Wait for specific initialization complete event or DOM state
	await page.waitForTimeout(1000);
}

/**
 * Focus the canvas element for keyboard input
 * Clicks on the viewport container instead of canvas to avoid overlay interference
 * TODO: Replace timeout with focus state validation
 */
export async function focusCanvas(page) {
	// Click on viewport instead of canvas to avoid toolPreview overlay interference
	const viewport = page.locator('#viewport');
	await viewport.click({ position: { x: 100, y: 100 } });
	// Allow time for focus to be established
	// TODO: Wait for specific focus state or activeElement change
	await page.waitForTimeout(200);
}

/**
 * Get canvas text content by reading from the DOM
 * TODO: Adjust based on actual DOM structure or window API if available
 */
export async function getCanvasText(page) {
	// Attempt to get text from canvas via window API if exposed
	const textFromAPI = await page.evaluate(() => {
		if (window.State && window.State.textArtCanvas) {
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
export async function getViewportScrollPosition(page) {
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
export async function getPositionInfo(page) {
	const positionInfo = page.locator('#positionInfo');
	return await positionInfo.textContent() || '';
}

/**
 * Check if a specific tool is active by checking for active class or similar
 * TODO: Adjust based on actual DOM structure for active tool indication
 */
export async function getActiveTool(page) {
	return await page.evaluate(() => {
		// Check for active tool in sidebar
		const activeTool = document.querySelector('aside > div.active, aside > div[class*="active"]');
		if (activeTool && activeTool.id) {
			return activeTool.id;
		}
		return null;
	});
}
