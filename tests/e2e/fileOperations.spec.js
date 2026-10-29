import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	clickTool,
	drag,
	parkToolSettings,
	readBlock,
} from './helpers/editorHelpers.js';
import {
	concatBytes,
	makeAnsi,
	makeSauce,
	makeUtf8Ansi,
} from '../corpus/generators.js';

test.describe('File Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('the file menu lists New, Open, and the save formats', async ({ page }) => {
		await page.locator('#fileMenu button').click();
		await expect(page.locator('#new')).toBeVisible();
		await expect(page.locator('#open')).toBeVisible();

		// the save items sit inside the collapsed "Save as" group
		await page.locator('#fileList summary', { hasText: 'Save as' }).click();
		for (const id of [
			'saveAnsi',
			'saveBin',
			'saveXbin',
			'saveTundra',
			'saveDur',
			'saveOwnz',
		]) {
			await expect(page.locator(`#${id}`)).toBeVisible();
		}
	});

	const docFlags = page =>
		page.evaluate(() => {
			const { State } = window.__t0wnz;
			return [
				State.textArtCanvas.getIceColors(),
				State.font.getLetterSpacing(),
			];
		});

	const newDocument = async page => {
		await page.locator('#navICE').click();
		await page.locator('#nav9pt').click();
		await expect(page.locator('#navICE')).toHaveClass(/enabled/);
		await expect(page.locator('#nav9pt')).toHaveClass(/enabled/);

		await page.locator('#fileMenu button').click();
		await page.locator('#new').click();
		await page.locator('#warningYes').click();
	};

	test('should create new document', async ({ page }) => {
		await page.evaluate(() => window.__t0wnz.State.textArtCanvas.resize(100, 30));
		await expect(page.locator('#resolutionLabel')).toHaveText('100x30');
		await newDocument(page);

		await expect(page.locator('#resolutionLabel')).toHaveText('80x25');
		await expect.poll(() => docFlags(page)).toEqual([false, false]);
	});

	test('a new document turns the iCE and 9pt chips off', async ({ page }) => {
		await newDocument(page);
		await expect.poll(() => docFlags(page)).toEqual([false, false]);
		await expect(page.locator('#navICE')).not.toHaveClass(/enabled/);
		await expect(page.locator('#nav9pt')).not.toHaveClass(/enabled/);

		// one click turns each back on: a stale chip would need two
		await page.locator('#navICE').click();
		await page.locator('#nav9pt').click();
		await expect.poll(() => docFlags(page)).toEqual([true, true]);
	});

	test('Open hands the chosen file to the loader', async ({ page }) => {
		await page.locator('#fileMenu button').click();
		const [chooser] = await Promise.all([
			page.waitForEvent('filechooser'),
			page.locator('#open').click(),
		]);
		await chooser.setFiles({
			name: 'hi.ans',
			mimeType: 'application/octet-stream',
			buffer: Buffer.from('HI'),
		});

		await expect.poll(async () => (await readBlock(page, 1, 0)).charCode).toBe(73);
		expect((await readBlock(page, 0, 0)).charCode).toBe(72);
	});

	test('should fill SAUCE metadata', async ({ page }) => {
		await page.locator('#navSauce').click();
		await page.locator('#sauceTitle').fill('Test Artwork');
		await page.locator('#sauceAuthor').fill('Test Author');
		await page.locator('#sauceGroup').fill('Test Group');
		await page.locator('#sauceDone').click();

		await expect(page.locator('#sauceInfoTitle')).toHaveText('Test Artwork');
		await expect(page.locator('#sauceInfoByline')).toHaveText(
			'Test Author / Test Group',
		);
	});
});

test.describe('Canvas Operations', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await bridgeReady(page);
	});

	test('should resize canvas', async ({ page }) => {
		await page.locator('#resolution').click();
		await page.locator('#columnsInput').fill('100');
		await page.locator('#rowsInput').fill('40');
		await page.locator('#resizeApply').click();

		await expect(page.locator('#resolutionLabel')).toHaveText('100x40');
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

	test('should change font', async ({ page }) => {
		const current = page.locator('#currentFontDisplay');
		await expect(current).toHaveText('CP437 8x16');

		await page.locator('#changeFont').click();
		await page.locator('#font-topaz-437-8x16').click();
		await page.locator('#fontsApply').click();

		await expect(current).toHaveText('Topaz-437 8x16');
	});

	test('should clear canvas', async ({ page }) => {
		const ink = async () =>
			![0, 32].includes((await readBlock(page, 8, 5)).charCode);
		await clickTool(page, 'halfblock');
		await drag(page, [5, 5], [12, 5]);
		expect(await ink()).toBe(true);

		await page.locator('#fileMenu button').click();
		await page.locator('#new').click();
		await page.locator('#warningYes').click();

		await expect.poll(ink).toBe(false);
	});
});

test.describe('Export Operations', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('Save XBin routes through the export modal', async ({ page }) => {
		// the menu click must not land as xb's compress argument: that
		// skips the modal entirely and forces RLE on
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
});
