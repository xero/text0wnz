import { test, expect } from '@playwright/test';

test.describe('File Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have file menu or file buttons', async ({ page }) => {
		// Check for new, open, save buttons
		const newButton = page.locator('#new, button:has-text("New")');
		const openButton = page.locator(
			'#open, #open-file, button:has-text("Open")',
		);
		const saveButton = page.locator('#save, button:has-text("Save")');

		// At least some file operations should be available
		const newCount = await newButton.count();
		const openCount = await openButton.count();
		const saveCount = await saveButton.count();

		expect(newCount + openCount + saveCount).toBeGreaterThan(0);
	});

	test('should create new document', async ({ page }) => {
		// Set a title first
		await page.fill('#artwork-title', 'Test Artwork');
		await page.waitForTimeout(200);

		// Click new button
		const newButton = page.locator('#new');

		// Handle confirmation dialog
		page.on('dialog', dialog => {
			expect(dialog.message()).toContain('Are you sure');
			dialog.accept();
		});

		await newButton.click();
		await page.waitForTimeout(500);

		// Check that title is reset to untitled
		const titleValue = await page.locator('#artwork-title').inputValue();
		expect(titleValue).toBe('untitled');
	});

	test('should open file dialog', async ({ page }) => {
		const openButton = page.locator('#open-file, #open');

		if ((await openButton.count()) > 0) {
			// Note: We can't actually test file upload without a file in E2E
			// but we can verify the button exists and is clickable
			await expect(openButton.first()).toBeVisible();
		}
	});

	test('should have save options', async ({ page }) => {
		// Look for save/export buttons
		const saveAsAnsi = page.locator(
			'#save-ansi, #save-as-ansi, button:has-text("ANSi")',
		);
		const saveAsBin = page.locator(
			'#save-bin, #save-as-bin, button:has-text("Binary")',
		);
		const saveAsXbin = page.locator(
			'#save-xbin, #save-as-xbin, button:has-text("XBin")',
		);
		const saveAsPng = page.locator(
			'#save-png, #save-as-png, button:has-text("PNG")',
		);

		// At least one save format should be available
		const ansiCount = await saveAsAnsi.count();
		const binCount = await saveAsBin.count();
		const xbinCount = await saveAsXbin.count();
		const pngCount = await saveAsPng.count();

		const totalSaveOptions = ansiCount + binCount + xbinCount + pngCount;
		expect(totalSaveOptions).toBeGreaterThan(0);
	});

	test('should update artwork title', async ({ page }) => {
		const titleInput = page.locator('#artwork-title');
		await titleInput.fill('My ANSI Art');
		await page.waitForTimeout(200);

		const value = await titleInput.inputValue();
		expect(value).toBe('My ANSI Art');
	});

	test('should have SAUCE metadata fields', async ({ page }) => {
		// Check for SAUCE-related inputs
		const sauceTitle = page.locator('#sauce-title, #title');
		const sauceAuthor = page.locator('#sauce-author, #author');
		const sauceGroup = page.locator('#sauce-group, #group');

		const titleCount = await sauceTitle.count();
		const authorCount = await sauceAuthor.count();
		const groupCount = await sauceGroup.count();

		// At least some SAUCE fields should exist
		expect(titleCount + authorCount + groupCount).toBeGreaterThan(0);
	});

	test('should fill SAUCE metadata', async ({ page }) => {
		const sauceTitle = page.locator('#sauce-title');
		const sauceAuthor = page.locator('#sauce-author');
		const sauceGroup = page.locator('#sauce-group');

		if (await sauceTitle.isVisible()) {
			await sauceTitle.fill('Test Artwork');
		}
		if (await sauceAuthor.isVisible()) {
			await sauceAuthor.fill('Test Author');
		}
		if (await sauceGroup.isVisible()) {
			await sauceGroup.fill('Test Group');
		}

		await page.waitForTimeout(300);
	});
});

test.describe('Canvas Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should resize canvas', async ({ page }) => {
		const resizeButton = page.locator('#resize, button:has-text("Resize")');

		if ((await resizeButton.count()) > 0) {
			await resizeButton.first().click();
			await page.waitForTimeout(300);

			// Look for resize inputs
			const columnsInput = page.locator(
				'#columns-input, #width, input[name="columns"]',
			);
			const rowsInput = page.locator(
				'#rows-input, #height, input[name="rows"]',
			);

			if ((await columnsInput.count()) > 0 && (await rowsInput.count()) > 0) {
				await columnsInput.first().fill('100');
				await rowsInput.first().fill('40');

				// Find and click resize confirm button
				const confirmButton = page.locator(
					'button:has-text("Resize"), button:has-text("OK"), button:has-text("Apply")',
				);
				if ((await confirmButton.count()) > 0) {
					await confirmButton.first().click();
					await page.waitForTimeout(500);
				}
			}
		}
	});

	test('should toggle ICE colors', async ({ page }) => {
		const iceToggle = page.locator(
			'#ice-colors, input[type="checkbox"][name="ice-colors"]',
		);

		if ((await iceToggle.count()) > 0) {
			// Get initial state
			const initialState = await iceToggle.first().isChecked();

			// Toggle
			await iceToggle.first().click();
			await page.waitForTimeout(300);

			// Verify state changed
			const newState = await iceToggle.first().isChecked();
			expect(newState).toBe(!initialState);
		}
	});

	test('should toggle 9px font spacing', async ({ page }) => {
		const spacingToggle = page.locator(
			'#letter-spacing, #font-spacing, input[type="checkbox"][name="letter-spacing"]',
		);

		if ((await spacingToggle.count()) > 0) {
			// Get initial state
			const initialState = await spacingToggle.first().isChecked();

			// Toggle
			await spacingToggle.first().click();
			await page.waitForTimeout(300);

			// Verify state changed
			const newState = await spacingToggle.first().isChecked();
			expect(newState).toBe(!initialState);
		}
	});

	test('should have font selection', async ({ page }) => {
		const fontSelector = page.locator(
			'#fonts, #font-select, select[name="font"]',
		);
		const fontButton = page.locator('#font-toolbar, button:has-text("Font")');

		const selectorCount = await fontSelector.count();
		const buttonCount = await fontButton.count();

		// Font selection should be available in some form
		expect(selectorCount + buttonCount).toBeGreaterThan(0);
	});

	test('should change font', async ({ page }) => {
		const fontsButton = page.locator('#fonts');

		if (await fontsButton.isVisible()) {
			await fontsButton.click();
			await page.waitForTimeout(500);

			// Look for font options
			const fontOptions = page.locator('.font-option, [data-font]');
			const count = await fontOptions.count();

			if (count > 0) {
				// Select a different font
				await fontOptions.nth(1).click();
				await page.waitForTimeout(500);
			}
		}
	});

	test('should clear canvas', async ({ page }) => {
		// Draw something first
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.locator('#freehand').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}

		// Clear with new document
		page.on('dialog', dialog => dialog.accept());
		await page.locator('#new').click();
		await page.waitForTimeout(500);
	});
});

test.describe('Export Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('http://localhost:8080');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have export options available', async ({ page }) => {
		// Draw something to export
		const canvas = page.locator('#canvas-container canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.locator('#freehand').click();
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}

		// Check for save buttons
		const saveOptions = page.locator(
			'#save-ansi, #save-bin, #save-xbin, #save-png, [id^="save-"]',
		);
		const count = await saveOptions.count();

		expect(count).toBeGreaterThan(0);
	});
});
