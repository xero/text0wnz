import path from 'path';

export async function openFile(page, filePath) {
	const absolutePath = path.resolve(filePath);

	const fileInput = page.locator('#openFile');
	await fileInput.waitFor({ state: 'attached' });

	await fileInput.setInputFiles(absolutePath);

	// TODO: replace the timeout with a loading-complete indicator (canvas
	// update, position info change, or loading modal gone)
	await page.waitForTimeout(2000);

	// the loading modal can outlast the timeout on slower machines, and
	// it covers the viewport. Wait on it alone: other modals depend on
	// server, storage, or session state
	await page.waitForFunction(
		() => {
			const modal = document.getElementById('modal');
			const loading = document.getElementById('loadingModal');
			return !modal?.open || loading?.classList.contains('hide');
		},
		null,
		{ timeout: 15000 },
	);
}

export async function openFileViaDragDrop(_page, _filePath) {
	throw new Error('Not implemented - use openFile() instead');
}

export async function openFileViaURL(page, fileURL) {
	const loaded = await page.evaluate(url => {
		if (window.Load && window.Load.loadFileFromUrl) {
			window.Load.loadFileFromUrl(url);
			return true;
		}
		return false;
	}, fileURL);

	if (!loaded) {
		throw new Error('Load API not available on window object');
	}

	// TODO: Replace timeout with specific loading complete indicator
	await page.waitForTimeout(2000);
}
