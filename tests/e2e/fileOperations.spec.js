import { test, expect } from '@playwright/test';
import { clickTool } from './helpers/editorHelpers.js';
import {
	concatBytes,
	makeAnsi,
	makeSauce,
	makeUtf8Ansi,
} from '../corpus/generators.js';

test.describe('File Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have file menu or file buttons', async ({ page }) => {
		const newButton = page.locator('#new, button:has-text("New")');
		const openButton = page.locator(
			'#open, #openFile, button:has-text("Open")',
		);
		const saveButton = page.locator('#save, button:has-text("Save")');

		const newCount = await newButton.count();
		const openCount = await openButton.count();
		const saveCount = await saveButton.count();

		expect(newCount + openCount + saveCount).toBeGreaterThan(0);
	});

	test('should create new document', async ({ page }) => {
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		const newButton = page.locator('#new');

		await newButton.click();
		await page.waitForTimeout(500);

		const warningYes = page.locator('#warningYes');
		if (await warningYes.isVisible()) {
			await warningYes.click();
		}
		await page.waitForTimeout(500);
	});

	test('should open file dialog', async ({ page }) => {
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		// target the visible menu item, not the hidden file input
		const openButton = page.locator('#open');

		if ((await openButton.count()) > 0) {
			// the upload itself is untestable here; pin the menu item
			await expect(openButton.first()).toBeVisible();
		}
	});

	test('should have save options', async ({ page }) => {
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		const saveAsAnsi = page.locator(
			'#saveAnsi, #saveAsAnsi, button:has-text("ANSi")',
		);
		const saveAsBin = page.locator(
			'#saveBin, #saveAsBin, button:has-text("Binary")',
		);
		const saveAsXbin = page.locator(
			'#saveXbin, #saveAsXbin, button:has-text("XBin")',
		);
		const saveAsPng = page.locator(
			'#savePng, #saveAsPng, button:has-text("PNG")',
		);

		const ansiCount = await saveAsAnsi.count();
		const binCount = await saveAsBin.count();
		const xbinCount = await saveAsXbin.count();
		const pngCount = await saveAsPng.count();

		const totalSaveOptions = ansiCount + binCount + xbinCount + pngCount;
		expect(totalSaveOptions).toBeGreaterThan(0);
	});

	test('should have SAUCE metadata fields', async ({ page }) => {
		const sauceTitle = page.locator('#sauceTitle, #title');
		const sauceAuthor = page.locator('#sauceAuthor, #author');
		const sauceGroup = page.locator('#sauceGroup, #group');

		const titleCount = await sauceTitle.count();
		const authorCount = await sauceAuthor.count();
		const groupCount = await sauceGroup.count();

		expect(titleCount + authorCount + groupCount).toBeGreaterThan(0);
	});

	test('should fill SAUCE metadata', async ({ page }) => {
		const sauceTitle = page.locator('#sauceTitle');
		const sauceAuthor = page.locator('#sauceAuthor');
		const sauceGroup = page.locator('#sauceGroup');

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
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should resize canvas', async ({ page }) => {
		const resizeButton = page.locator('#navRes, button:has-text("Resize")');

		if ((await resizeButton.count()) > 0) {
			await resizeButton.first().click();
			await page.waitForTimeout(300);

			const columnsInput = page.locator(
				'#columnsInput, #width, input[name="columns"]',
			);
			const rowsInput = page.locator('#rowsInput, #height, input[name="rows"]');

			if ((await columnsInput.count()) > 0 && (await rowsInput.count()) > 0) {
				await columnsInput.first().fill('100');
				await rowsInput.first().fill('40');

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
		// the iCE chip lives in the sidebar canvas panel, always visible
		const iceToggle = page.locator('#navICE');
		await expect(iceToggle).toBeVisible();

		await iceToggle.click();
		await page.waitForTimeout(300);
		await expect(iceToggle).toHaveClass(/enabled/);

		await iceToggle.click();
		await page.waitForTimeout(300);
		await expect(iceToggle).not.toHaveClass(/enabled/);
	});

	test('should toggle 9px font spacing', async ({ page }) => {
		// the 9pt chip lives in the sidebar canvas panel, always visible
		const spacingToggle = page.locator('#nav9pt');
		await expect(spacingToggle).toBeVisible();

		await spacingToggle.click();
		await page.waitForTimeout(300);
		await expect(spacingToggle).toHaveClass(/enabled/);

		await spacingToggle.click();
		await page.waitForTimeout(300);
		await expect(spacingToggle).not.toHaveClass(/enabled/);
	});

	test('opening a SAUCE-less file keeps the 9px toggle', async ({ page }) => {
		const spacingToggle = page.locator('#nav9pt');
		await spacingToggle.click();
		await page.waitForTimeout(300);
		await expect(spacingToggle).toHaveClass(/enabled/);
		// no SAUCE record states no preference: the artist's toggle holds
		await page.locator('#openFile').setInputFiles({
			name: 'plain.ans',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from(makeAnsi({ columns: 10, rows: 2 })),
		});
		await page.waitForTimeout(1000);
		await expect(spacingToggle).toHaveClass(/enabled/);
	});

	test('a 9px SAUCE flag applies on a utf8 open', async ({ page }) => {
		const body = makeUtf8Ansi({ columns: 10, rows: 2 });
		const bytes = concatBytes([
			body,
			new Uint8Array([0x1a]),
			makeSauce({ fileSize: body.length, tinfo1: 10, flags: 0b00000100 }),
		]);
		const spacingToggle = page.locator('#nav9pt');
		await expect(spacingToggle).not.toHaveClass(/enabled/);
		// the docNative open path applies the explicit flag end to end
		await page.locator('#openFile').setInputFiles({
			name: 'art.utf8.ans',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from(bytes),
		});
		await page.waitForTimeout(1000);
		await expect(spacingToggle).toHaveClass(/enabled/);
	});

	test('should have font selection', async ({ page }) => {
		const fontSelector = page.locator(
			'#fonts, #fontSelect, select[name="font"]',
		);
		const fontButton = page.locator('#fontToolbar, button:has-text("Font")');

		const selectorCount = await fontSelector.count();
		const buttonCount = await fontButton.count();

		expect(selectorCount + buttonCount).toBeGreaterThan(0);
	});

	test('should change font', async ({ page }) => {
		const fontsButton = page.locator('#changeFont');

		if (await fontsButton.isVisible()) {
			await fontsButton.click();
			await page.waitForTimeout(500);

			const fontOptions = page.locator('.fontOption, [data-font]');
			const count = await fontOptions.count();

			if (count > 0) {
				await fontOptions.nth(1).click();
				await page.waitForTimeout(500);
			}
		}
	});

	test('should clear canvas', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Click brushes to show brush toolbar, then select halfblock
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await clickTool(page, 'halfblock');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}

		// Clear with new document - handle warning modal
		const fileMenuButton = page.locator('#fileMenu button');
		await fileMenuButton.click();
		await page.waitForTimeout(200);

		await page.locator('#new').click();
		await page.waitForTimeout(500);
		const warningYes = page.locator('#warningYes');
		if (await warningYes.isVisible()) {
			await warningYes.click();
		}
		await page.waitForTimeout(500);
	});
});

test.describe('Export Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('Save XBin routes through the export modal', async ({ page }) => {
		// the menu click used to arrive as xb's compress argument and
		// skip the modal entirely, forcing RLE on
		await page.locator('#fileMenu button').click();
		await page.waitForTimeout(200);
		// the save items sit inside the collapsed "Save as" group
		await page
			.locator('#fileList summary', { hasText: 'Save as' })
			.click();
		await page.waitForTimeout(200);
		await page.locator('#saveXbin').click();
		await page.waitForTimeout(300);
		const modal = page.locator('#exportModal');
		await expect(modal).toBeVisible();
		await expect(page.locator('#exportFormatLabel')).toHaveText('XBin');
		await expect(page.locator('#exportCompress')).toBeVisible();
		await page.locator('#exportCancel').click();
		await page.waitForTimeout(200);
		await expect(modal).not.toBeVisible();
	});

	test('should have export options available', async ({ page }) => {
		const canvas = page.locator('#canvasContainer canvas').first();
		const box = await canvas.boundingBox();

		if (box) {
			// Click brushes to show brush toolbar, then select halfblock
			await page.locator('#brushes').click();
			await page.waitForTimeout(200);
			await clickTool(page, 'halfblock');
			await page.mouse.move(box.x + 50, box.y + 50);
			await page.mouse.down();
			await page.mouse.move(box.x + 100, box.y + 100);
			await page.mouse.up();
			await page.waitForTimeout(300);
		}

		const saveOptions = page.locator(
			'#saveAnsi, #saveBin, #saveXbin, #savePng, [id^="save"]',
		);
		const count = await saveOptions.count();

		expect(count).toBeGreaterThan(0);
	});
});
