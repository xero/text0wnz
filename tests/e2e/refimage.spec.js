import { test, expect } from '@playwright/test';
import {
	clickViewToggle,
	waitForEditorReady,
} from './helpers/editorHelpers.js';

// 1x1 png: the overlay math only needs a real decodable image
const PNG = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const loadRef = async page => {
	// the ref toggle lives in the viewport toolbar behind the View tool
	await page.locator('#navView').click();
	await clickViewToggle(page, 'navRef');
	await page.locator('#refFileInput').setInputFiles({
		name: 'trace.png',
		mimeType: 'image/png',
		buffer: PNG,
	});
	await expect(page.locator('#refOverlay')).toBeVisible();
};

const dragOverlay = async (page, dx, dy) => {
	const box = await page.locator('#refOverlay').boundingBox();
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + dx, cy + dy, { steps: 4 });
	await page.mouse.up();
};

test.describe('Reference image', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test('drag mode unlocks the overlay and moves it', async ({ page }) => {
		await loadRef(page);
		const toggle = page.locator('#refDrag');
		const overlay = page.locator('#refOverlay');
		await expect(overlay).not.toHaveClass(/dragging/);
		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect(overlay).toHaveClass(/dragging/);

		await dragOverlay(page, 96, 48);
		const saved = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('refImage')));
		expect(saved.x).toBeGreaterThan(0);
		expect(saved.y).toBeGreaterThan(0);

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await expect(overlay).not.toHaveClass(/dragging/);
	});

	test('the sliders still work while drag mode is on', async ({ page }) => {
		await loadRef(page);
		await page.locator('#refDrag').click();
		await page.locator('#refOpacity').fill('70');
		await expect(page.locator('#refOverlay')).toHaveCSS('opacity', '0.7');
		const saved = await page.evaluate(() =>
			JSON.parse(localStorage.getItem('refImage')));
		expect(saved.opacity).toBe(70);
	});

	test('the whole setup survives a reload', async ({ page }) => {
		await loadRef(page);
		await page.locator('#refOpacity').fill('65');
		await page.locator('#refDrag').click();
		await dragOverlay(page, 96, 48);
		// the image blob write to IndexedDB is fire and forget; poll the
		// store instead of trusting a sleep on a slow runner
		await expect
			.poll(() =>
				page.evaluate(
					() =>
						new Promise(resolve => {
							const req = indexedDB.open('text0wnz');
							req.onsuccess = () => {
								const db = req.result;
								const get = db
									.transaction('refImage', 'readonly')
									.objectStore('refImage')
									.get('currentRef');
								get.onsuccess = () => {
									resolve(Boolean(get.result));
									db.close();
								};
								get.onerror = () => {
									resolve(false);
									db.close();
								};
							};
							req.onerror = () => resolve(false);
						}),
				))
			.toBe(true);

		await page.reload();
		await waitForEditorReady(page);
		const overlay = page.locator('#refOverlay');
		await expect(overlay).toBeVisible();
		await expect(page.locator('#refOpacity')).toHaveValue('65');
		await expect(overlay).toHaveCSS('opacity', '0.65');
		const transform = await overlay.evaluate(el => el.style.transform);
		expect(transform).not.toBe('');
		expect(transform).not.toBe('translate(0px, 0px)');
		// drag mode is a session gesture, never a saved setting
		await expect(page.locator('#refDrag')).toHaveAttribute(
			'aria-pressed',
			'false',
		);
		// a restored trace reopens its panel and relights the nav button
		await expect(page.locator('#refPanel')).toBeVisible();
		await page.locator('#navView').click();
		await expect(page.locator('#navRef')).toHaveClass(/enabled/);
	});

	test('clear resets the tool and its storage to defaults', async ({ page }) => {
		await loadRef(page);
		await page.locator('#refOpacity').fill('70');
		await page.locator('#refDrag').click();
		await dragOverlay(page, 96, 48);

		await page.locator('#refClear').click();
		await expect(page.locator('#refOverlay')).toBeHidden();
		await expect(page.locator('#refOpacity')).toHaveValue('40');
		await expect(page.locator('#refScale')).toHaveValue('100');
		await expect(page.locator('#refDrag')).toHaveAttribute(
			'aria-pressed',
			'false',
		);
		const saved = await page.evaluate(() => localStorage.getItem('refImage'));
		expect(saved).toBeNull();

		await page.reload();
		await waitForEditorReady(page);
		await expect(page.locator('#refOverlay')).toBeHidden();
	});
});
