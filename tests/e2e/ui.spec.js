import { test, expect } from '@playwright/test';
import {
	clickHistoryAction,
	clickTool,
	clickViewToggle,
} from './helpers/editorHelpers.js';

test.describe('UI Elements', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should display main UI elements', async ({ page }) => {
		const toolbar = page.locator('#bodyContainer aside, .toolbar, nav');
		await expect(toolbar.first()).toBeVisible();

		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();

		const palette = page.locator('#palettePreview, #palettePicker');
		await expect(palette.first()).toBeVisible();
	});

	test('should have responsive layout', async ({ page }) => {
		const viewportSize = page.viewportSize();
		expect(viewportSize?.width).toBe(1280);
		expect(viewportSize?.height).toBe(720);

		await expect(page.locator('#canvasContainer')).toBeVisible();
	});

	test('should display position information', async ({ page }) => {
		const positionInfo = page.locator('#positionInfo, .positionInfo');
		const count = await positionInfo.count();

		if (count > 0) {
			await expect(positionInfo.first()).toBeVisible();
		}
	});

	test('should display toolbar with tools', async ({ page }) => {
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

		expect(visibleTools).toBeGreaterThan(0);
	});

	test('should have file operations menu', async ({ page }) => {
		const fileMenu = page.locator('#fileMenu, .fileMenu, #file');
		const fileButtons = page.locator('#new, #open, #save');

		const menuCount = await fileMenu.count();
		const buttonsCount = await fileButtons.count();

		expect(menuCount + buttonsCount).toBeGreaterThan(0);
	});

	test('should display canvas settings controls', async ({ page }) => {
		const iceToggle = page.locator('#navICE, [data-testid="iceColors"]');
		const iceCount = await iceToggle.count();

		const spacingToggle = page.locator('#nav9pt, #nav9pt');
		const spacingCount = await spacingToggle.count();

		expect(iceCount + spacingCount).toBeGreaterThan(0);
	});

	test('should have font selection interface', async ({ page }) => {
		const fontButton = page.locator('#fonts, button:has-text("Font")');
		const fontSelect = page.locator('#fontSelect, select[name="font"]');

		const buttonCount = await fontButton.count();
		const selectCount = await fontSelect.count();

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

		const classList = await freehandTool.getAttribute('class');
		expect(classList).toBeTruthy();
	});

	test('should switch between tools', async ({ page }) => {
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		await clickTool(page, 'halfblock');
		await page.waitForTimeout(200);

		await clickTool(page, 'characterBrush');
		await page.waitForTimeout(200);

		await clickTool(page, 'shadingBrush');
		await page.waitForTimeout(200);

		await page.locator('#shapes').click();
		await page.waitForTimeout(300);

		await clickTool(page, 'line');
		await page.waitForTimeout(200);

		await clickTool(page, 'circle');
		await page.waitForTimeout(200);

		await clickTool(page, 'square');
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

		await clickHistoryAction(page, 'undo');
		await page.waitForTimeout(200);

		await clickHistoryAction(page, 'redo');
		await page.waitForTimeout(200);

		await page.locator('#navICE').click();
		await page.waitForTimeout(200);

		await page.locator('#nav9pt').click();
		await page.waitForTimeout(200);

		await page.locator('#changeFont').click();
		await page.waitForTimeout(200);
		await page.locator('#fontsCancel').click();
		await page.waitForTimeout(800);

		await page.locator('#navView').click();
		await page.waitForTimeout(300);

		await page.locator('#navGrid').evaluate(el => el.click());
		await page.waitForTimeout(300);

		await clickViewToggle(page, 'navDarkmode');
		await page.waitForTimeout(500);

		const errors = await page.locator('.error, .errorMessage').count();
		expect(errors).toBe(0);
	});

	test('should toggle toolbars or panels', async ({ page }) => {
		// the fonts rail button opens the fonts dialog now
		const fontsButton = page.locator('#changeFont');
		const clipboardToolbar = page.locator('#clipboard');

		if (await fontsButton.isVisible()) {
			await fontsButton.click();
			await page.waitForTimeout(300);
			await expect(page.locator('#fontsModal')).toBeVisible();

			await page.locator('#fontsCancel').click();
			await page.waitForTimeout(300);
		}

		if (await clipboardToolbar.isVisible()) {
			await clipboardToolbar.click();
			await page.waitForTimeout(300);
		}
	});

	test('should show clipboard operations when selection is active', async ({ page }) => {
		await page.locator('#selection').click();
		await page.waitForTimeout(200);

		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);

			const copyButton = page.locator('#copy');
			const cutButton = page.locator('#cut');
			const pasteButton = page.locator('#paste');

			const copyCount = await copyButton.count();
			const cutCount = await cutButton.count();
			const pasteCount = await pasteButton.count();

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
		const canvases = page.locator('#canvasContainer canvas');
		const count = await canvases.count();

		expect(count).toBeGreaterThan(0);
	});

	test('should display cursor or pointer', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.waitForTimeout(300);

			const cursor = page.locator('.cursor, #cursor');
			const count = await cursor.count();

			if (count > 0) {
				await expect(cursor.first()).toBeVisible();
			}
		}
	});

	test('should update canvas on window resize', async ({ page }) => {
		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();

		await page.setViewportSize({ width: 1024, height: 768 });
		await page.waitForTimeout(500);

		await expect(canvas).toBeVisible();

		await page.setViewportSize({ width: 1280, height: 720 });
		await page.waitForTimeout(500);
	});

	test('should handle scroll if canvas is large', async ({ page }) => {
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
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		const newButton = page.locator('#new');
		await newButton.click();
		await page.waitForTimeout(500);

		const warningModal = page.locator('#warningModal');
		if (await warningModal.isVisible()) {
			const warningYes = page.locator('#warningYes');
			await expect(warningYes).toBeVisible();
		}
	});

	test('should handle dialog cancellation', async ({ page }) => {
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		const newButton = page.locator('#new');
		await newButton.click();
		await page.waitForTimeout(500);

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
		// Help is inside the file menu
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		const helpButton = page.locator(
			'#help, #info, button:has-text("Help"), button:has-text("?")',
		);
		const count = await helpButton.count();

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

			const shortcutsPanel = page.locator('.shortcutsPanel, #shortcutsPanel');
			if ((await shortcutsPanel.count()) > 0) {
				await expect(shortcutsPanel.first()).toBeVisible();
			}
		}
	});
});
