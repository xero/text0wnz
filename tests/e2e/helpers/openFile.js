import { expect } from '@playwright/test';
import path from 'path';
import { loadSettled } from './editorHelpers.js';

/**
 * Opens a path on disk, or a { name, mimeType, buffer } payload,
 * through the hidden file input
 */
export async function openFile(page, file) {
	const fileInput = page.locator('#openFile');
	await fileInput.waitFor({ state: 'attached' });
	await fileInput.setInputFiles(typeof file === 'string' ? path.resolve(file) : file);

	// an art open clears the input once its doc lands or its parse
	// fails; image and archive opens clear it up front, before their
	// async work, so this wait holds for art files only
	await expect(fileInput).toHaveValue('', { timeout: 15000 });
	await loadSettled(page);
}
