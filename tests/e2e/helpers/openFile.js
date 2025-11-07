import path from 'path';

/**
 * Open a file using the editor's file input element
 * Uses Playwright's file chooser API to simulate file selection
 */
export async function openFile(page, filePath) {
	// Get absolute path to the file
	const absolutePath = path.resolve(filePath);

	// Wait for file input to be present
	const fileInput = page.locator('#openFile');
	await fileInput.waitFor({ state: 'attached' });

	// Set the file on the input element
	await fileInput.setInputFiles(absolutePath);

	// Wait for file to be processed
	// TODO: Replace timeout with specific DOM change or loading complete indicator
	// Consider waiting for canvas update, position info change, or loading modal to disappear
	await page.waitForTimeout(2000);
}

/**
 * Alternative method: Open file via drag and drop
 * TODO: This is a placeholder - implement if needed
 */
export async function openFileViaDragDrop(page, filePath) {
	// This would simulate drag and drop onto the canvas
	// Implementation depends on the drag-drop controller behavior
	throw new Error('Not implemented - use openFile() instead');
}

/**
 * Alternative method: Open file via URL if editor supports it
 * This attempts to use a window API if available
 */
export async function openFileViaURL(page, fileURL) {
	const loaded = await page.evaluate((url) => {
		if (window.Load && window.Load.loadFileFromUrl) {
			window.Load.loadFileFromUrl(url);
			return true;
		}
		return false;
	}, fileURL);

	if (!loaded) {
		throw new Error('Load API not available on window object');
	}

	// Wait for file to be loaded
	// TODO: Replace timeout with specific loading complete indicator
	await page.waitForTimeout(2000);
}
