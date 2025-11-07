import { test, expect } from '@playwright/test';
import { waitForEditorReady, focusCanvas, getViewportScrollPosition } from './helpers/editorHelpers';
import { openFile } from './helpers/openFile';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.describe('File Open and Scrolling', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test('opens example ANSI file via file open', async ({ page }) => {
		// Path to the example ANSI file in the repository
		const exampleFilePath = path.join(__dirname, '../../docs/examples/ansi/x0-defcon25.ans');

		// Open the file using the file input
		await openFile(page, exampleFilePath);

		// Wait for the file to be loaded and rendered
		await page.waitForTimeout(1500);

		// Check that the canvas container is still visible (basic sanity check)
		const canvasContainer = page.locator('#canvasContainer');
		await expect(canvasContainer).toBeVisible();

		// Verify file loaded by checking for known content
		// The first line of x0-defcon25.ans contains "this one goes out to all the"
		// We can check if the page content includes this text or check DOM
		// TODO: Adjust this assertion based on how the editor exposes loaded content
		// For now, we'll check that at least one canvas element exists
		const canvases = page.locator('#canvasContainer canvas');
		const canvasCount = await canvases.count();
		expect(canvasCount).toBeGreaterThan(0);

		// Additional check: position info should show valid coordinates
		const positionInfo = page.locator('#positionInfo');
		await expect(positionInfo).toBeVisible();
	});

	test('page down and page up keyboard scrolling', async ({ page }) => {
		// First, load a large file to enable scrolling
		const exampleFilePath = path.join(__dirname, '../../docs/examples/ansi/x0-defcon25.ans');
		await openFile(page, exampleFilePath);
		await page.waitForTimeout(1500);

		// Focus the canvas/editor for keyboard input
		await focusCanvas(page);

		// Get initial scroll position
		const initialScroll = await getViewportScrollPosition(page);

		// Press PageDown
		await page.keyboard.press('PageDown');
		await page.waitForTimeout(500);

		// Get new scroll position - should have moved down
		const afterPageDown = await getViewportScrollPosition(page);

		// Verify scroll position changed (scrolled down)
		// Note: The exact amount depends on viewport height and font size
		expect(afterPageDown.scrollTop).toBeGreaterThan(initialScroll.scrollTop);

		// Press PageUp
		await page.keyboard.press('PageUp');
		await page.waitForTimeout(500);

		// Get scroll position after PageUp
		const afterPageUp = await getViewportScrollPosition(page);

		// Verify scroll position moved back up (should be closer to initial)
		expect(afterPageUp.scrollTop).toBeLessThan(afterPageDown.scrollTop);
	});

	test('mouse wheel scrolls canvas', async ({ page }) => {
		// Load a large file to enable scrolling
		const exampleFilePath = path.join(__dirname, '../../docs/examples/ansi/x0-defcon25.ans');
		await openFile(page, exampleFilePath);
		await page.waitForTimeout(1500);

		// Get the canvas container or viewport element
		const viewport = page.locator('#viewport');
		const box = await viewport.boundingBox();

		if (!box) {
			throw new Error('Viewport not found or not visible');
		}

		// Get initial scroll position
		const initialScroll = await getViewportScrollPosition(page);

		// Scroll down with mouse wheel
		// Move mouse to center of viewport first
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		// Scroll down (positive deltaY)
		await page.mouse.wheel(0, 300);
		await page.waitForTimeout(500);

		// Get new scroll position
		const afterScrollDown = await getViewportScrollPosition(page);

		// Verify scrolled down
		expect(afterScrollDown.scrollTop).toBeGreaterThan(initialScroll.scrollTop);

		// Scroll back up with mouse wheel
		await page.mouse.wheel(0, -300);
		await page.waitForTimeout(500);

		// Get scroll position after scrolling up
		const afterScrollUp = await getViewportScrollPosition(page);

		// Verify scrolled back up (should be closer to initial position)
		expect(afterScrollUp.scrollTop).toBeLessThan(afterScrollDown.scrollTop);
	});
});
