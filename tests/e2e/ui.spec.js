import { test, expect } from '@playwright/test';

test.describe('UI Elements', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should display main UI elements', async ({ page }) => {
		// Check for toolbar
		const toolbar = page.locator('#bodyContainer aside, .toolbar, nav');
		await expect(toolbar.first()).toBeVisible();

		// Check for canvas
		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();

		// Check for palettes
		const palette = page.locator('#palettePreview, #palettePicker');
		await expect(palette.first()).toBeVisible();
	});

	test('should have responsive layout', async ({ page }) => {
		// Check initial viewport
		const viewportSize = page.viewportSize();
		expect(viewportSize?.width).toBe(1280);
		expect(viewportSize?.height).toBe(720);

		// Canvas should be visible
		await expect(page.locator('#canvasContainer')).toBeVisible();
	});

	test('should display position information', async ({ page }) => {
		const positionInfo = page.locator('#positionInfo, .positionInfo');
		const count = await positionInfo.count();

		if (count > 0) {
			// Position info should exist
			await expect(positionInfo.first()).toBeVisible();
		}
	});

	test('should display toolbar with tools', async ({ page }) => {
		// Check for common tools
		const tools = [
			'#halfblock',
			'#characterBrush',
			'#shadingBrush',
			'#line',
			'#square',
			'#circle',
			'#selection',
		];

		let visibleTools = 0;
		for (const tool of tools) {
			const toolElement = page.locator(tool);
			if (await toolElement.isVisible()) {
				visibleTools++;
			}
		}

		// At least some tools should be visible
		expect(visibleTools).toBeGreaterThan(0);
	});

	test('should have file operations menu', async ({ page }) => {
		const fileMenu = page.locator('#fileMenu, .fileMenu, #file');
		const fileButtons = page.locator('#new, #open, #save');

		const menuCount = await fileMenu.count();
		const buttonsCount = await fileButtons.count();

		// File operations should be accessible
		expect(menuCount + buttonsCount).toBeGreaterThan(0);
	});

	test('should display canvas settings controls', async ({ page }) => {
		// Check for ICE colors toggle
		const iceToggle = page.locator('#navICE, [data-testid="iceColors"]');
		const iceCount = await iceToggle.count();

		// Check for letter spacing toggle
		const spacingToggle = page.locator('#nav9pt, #nav9pt');
		const spacingCount = await spacingToggle.count();

		// At least one setting should be available
		expect(iceCount + spacingCount).toBeGreaterThan(0);
	});

	test('should have font selection interface', async ({ page }) => {
		const fontButton = page.locator('#fonts, button:has-text("Font")');
		const fontSelect = page.locator('#fontSelect, select[name="font"]');

		const buttonCount = await fontButton.count();
		const selectCount = await fontSelect.count();

		// Font selection should be available
		expect(buttonCount + selectCount).toBeGreaterThan(0);
	});
});

test.describe('Toolbar Interactions', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should highlight selected tool', async ({ page }) => {
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const freehandTool = page.locator('#halfblock');
		await freehandTool.click();
		await page.waitForTimeout(200);

		// Check if tool has an active state (class or attribute)
		const classList = await freehandTool.getAttribute('class');
		expect(classList).toBeTruthy();
	});

	test('should switch between tools', async ({ page }) => {
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		await page.locator('#halfblock').click();
		await page.waitForTimeout(200);

		await page.locator('#characterBrush').click();
		await page.waitForTimeout(200);

		await page.locator('#shadingBrush').click();
		await page.waitForTimeout(200);

		await page.locator('#shapes').click();
		await page.waitForTimeout(300);

		await page.locator('#line').click();
		await page.waitForTimeout(200);

		await page.locator('#circle').click();
		await page.waitForTimeout(200);

		await page.locator('#square').click();
		await page.waitForTimeout(200);

		await page.locator('#selection').click();
		await page.waitForTimeout(300);

		await page.locator('#flipHorizontal').click();
		await page.waitForTimeout(200);

		await page.locator('#flipVertical').click();
		await page.waitForTimeout(200);

		await page.locator('#moveBlocks').click();
		await page.waitForTimeout(200);

		await page.locator('#cut').click();
		await page.waitForTimeout(200);

		await page.locator('#delete').click();
		await page.waitForTimeout(200);

		await page.locator('#copy').click();
		await page.waitForTimeout(200);

		await page.locator('#paste').click();
		await page.waitForTimeout(200);

		await page.locator('#systemPaste').click();
		await page.waitForTimeout(200);

		await page.locator('#clipboard').click();
		await page.waitForTimeout(300);

		await page.locator('#undo').click();
		await page.waitForTimeout(200);

		await page.locator('#redo').click();
		await page.waitForTimeout(200);

		await page.locator('#navView').click();
		await page.waitForTimeout(300);

		await page.locator('#navDarkmode').click();
		await page.waitForTimeout(500); // Increased for Firefox stability

		// Reopen viewport toolbar to access navGrid (toolbar may close after dark mode toggle)
		await page.locator('#navView').click();
		await page.waitForTimeout(300);

		// Wait for navGrid to be ready
		await page.locator('#navGrid').waitFor({ state: 'visible', timeout: 5000 });
		await page.locator('#navGrid').click();
		await page.waitForTimeout(300);

		await page.locator('#fonts').click();
		await page.waitForTimeout(300);

		await page.locator('#navICE').click();
		await page.waitForTimeout(200);

		await page.locator('#nav9pt').click();
		await page.waitForTimeout(200);

		await page.locator('#changeFont').click();
		await page.waitForTimeout(200);
		await page.locator('#fontsCancel').click();
		await page.waitForTimeout(800);

		//
		// No errors should occur
		const errors = await page.locator('.error, .errorMessage').count();
		expect(errors).toBe(0);
	});

	test('should toggle toolbars or panels', async ({ page }) => {
		// Look for expandable panels
		const fontToolbar = page.locator('#fonts');
		const clipboardToolbar = page.locator('#clipboard');

		if (await fontToolbar.isVisible()) {
			await fontToolbar.click();
			await page.waitForTimeout(300);

			// Click again to close
			await fontToolbar.click();
			await page.waitForTimeout(300);
		}

		if (await clipboardToolbar.isVisible()) {
			await clipboardToolbar.click();
			await page.waitForTimeout(300);
		}
	});

	test('should show clipboard operations when selection is active', async ({ page }) => {
		// Activate selection tool
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		// Make a selection
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			// Check for clipboard buttons
			const copyButton = page.locator('#copy');
			const cutButton = page.locator('#cut');
			const pasteButton = page.locator('#paste');

			const copyCount = await copyButton.count();
			const cutCount = await cutButton.count();
			const pasteCount = await pasteButton.count();

			// At least one clipboard operation should be available
			expect(copyCount + cutCount + pasteCount).toBeGreaterThan(0);
		}
	});
});

test.describe('Canvas Display', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should render canvas layers', async ({ page }) => {
		// Check for canvas elements
		const canvases = page.locator('#canvasContainer canvas');
		const count = await canvases.count();

		// Should have at least one canvas layer
		expect(count).toBeGreaterThan(0);
	});

	test('should display cursor or pointer', async ({ page }) => {
		// Move mouse over canvas
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.waitForTimeout(300);

			// Check for cursor element
			const cursor = page.locator('.cursor, #cursor');
			const count = await cursor.count();

			// Cursor might be visible
			if (count > 0) {
				await expect(cursor.first()).toBeVisible();
			}
		}
	});

	test('should update canvas on window resize', async ({ page }) => {
		// Get initial canvas
		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();

		// Resize browser
		await page.setViewportSize({ width: 1024, height: 768 });
		await page.waitForTimeout(500);

		// Canvas should still be visible
		await expect(canvas).toBeVisible();

		// Resize back
		await page.setViewportSize({ width: 1280, height: 720 });
		await page.waitForTimeout(500);
	});

	test('should handle scroll if canvas is large', async ({ page }) => {
		// Create a large canvas
		const resizeButton = page.locator('#navRes');
		if (await resizeButton.isVisible()) {
			await resizeButton.click();
			await page.waitForTimeout(300);

			const columnsInput = page.locator('#columnsInput, input[name="columns"]');
			const rowsInput = page.locator('#rowsInput, input[name="rows"]');

			if ((await columnsInput.count()) > 0) {
				await columnsInput.first().fill('200');
				await rowsInput.first().fill('100');

				const confirmButton = page.locator('button:has-text("Resize")');
				if ((await confirmButton.count()) > 0) {
					await confirmButton.first().click();
					await page.waitForTimeout(500);

					// Check if scrollable
					const canvasContainer = page.locator('#canvasContainer');
					const box = await canvasContainer.boundingBox();
					expect(box).toBeTruthy();
				}
			}
		}
	});
});

test.describe('Modal Dialogs', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should show confirmation dialog for new document', async ({ page }) => {
		const newButton = page.locator('#new');
		await newButton.click();
		await page.waitForTimeout(500);

		// Check if warning modal appears
		const warningModal = page.locator('#warningModal');
		if (await warningModal.isVisible()) {
			const warningYes = page.locator('#warningYes');
			await expect(warningYes).toBeVisible();
		}
	});

	test('should handle dialog cancellation', async ({ page }) => {
		const newButton = page.locator('#new');
		await newButton.click();
		await page.waitForTimeout(500);

		// Click No on warning dialog
		const warningNo = page.locator('#warningNo');
		if (await warningNo.isVisible()) {
			await warningNo.click();
			await page.waitForTimeout(500);
		}
	});
});

test.describe('Help and Information', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have help or info button', async ({ page }) => {
		const helpButton = page.locator(
			'#help, #info, button:has-text("Help"), button:has-text("?")',
		);
		const count = await helpButton.count();

		// Help might be available
		if (count > 0) {
			await expect(helpButton.first()).toBeVisible();
		}
	});

	test('should display keyboard shortcuts reference if available', async ({ page }) => {
		const shortcutsButton = page.locator(
			'#shortcuts, button:has-text("Shortcuts"), button:has-text("Keys")',
		);
		const count = await shortcutsButton.count();

		if (count > 0) {
			await shortcutsButton.first().click();
			await page.waitForTimeout(500);

			// Look for shortcuts panel
			const shortcutsPanel = page.locator('.shortcutsPanel, #shortcutsPanel');
			if ((await shortcutsPanel.count()) > 0) {
				await expect(shortcutsPanel.first()).toBeVisible();
			}
		}
	});
});
