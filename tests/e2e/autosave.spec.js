import { test, expect } from '@playwright/test';
import {
	bridgeReady,
	cellCenter,
	clickTool,
	clickViewToggle,
	drag,
	loadSettled,
	openMenu,
	parkToolSettings,
	readBlock,
	readRegion,
	tap,
	writeText,
} from './helpers/editorHelpers.js';
import { durOf, openBuffer } from './helpers/archiveFixtures.js';

/**
 * A digest of every plane of every frame, plus the size and iCE flag,
 * read from the live doc or from a replay of the autosave journal
 */
const digest = (page, source) =>
	page.evaluate(async from => {
		const c = window.__t0wnz.State.textArtCanvas;
		const doc =
			from === 'journal' ? (await c.loadJournalSnapshot())?.doc : c.getDoc();
		if (!doc) {
			return null;
		}
		let h = 0x811c9dc5;
		const mix = plane => {
			for (const v of plane) {
				h = Math.imul(h ^ v, 0x01000193) >>> 0;
			}
		};
		doc.frames.forEach(f => {
			mix(f.glyph);
			mix(f.fg);
			mix(f.bg);
		});
		return `${doc.getColumns()}x${doc.getRows()} ice=${doc.getIceColors()} frames=${doc.frames.length} ${h.toString(16)}`;
	}, source);

const storedIce = page =>
	page.evaluate(
		() => JSON.parse(localStorage.getItem('text0wnz-settings'))?.iceColors,
	);

/**
 * The journal holds the live doc and the settings the restore reads.
 * Nothing here commits the last stroke, which reaches the journal once
 * editing idles, as it does for a user who stops and reloads
 */
const persisted = async (page, ice) => {
	const live = await digest(page, 'live');
	await expect.poll(() => digest(page, 'journal')).toBe(live);
	await expect.poll(() => storedIce(page)).toBe(ice);
	return live;
};

const boot = async page => {
	await bridgeReady(page);
	await page.waitForFunction(() => !window.__t0wnz.State.loadingFromStorage);
	await loadSettled(page);
};

const reload = async page => {
	await page.reload();
	await boot(page);
};

const halfblock = async (page, cells) => {
	await clickTool(page, 'halfblock');
	for (const [x, y] of cells) {
		await tap(page, x, y);
	}
};

test.describe('Autosave across reloads', () => {
	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await boot(page);
		// the journal store's own probe: OPFS, then IndexedDB (Playwright's
		// WebKit refuses OPFS), then a memory log no reload survives. A
		// throw counts as a refusal there too
		const durable = await page.evaluate(async () => {
			try {
				if (typeof Worker !== 'undefined') {
					await navigator.storage.getDirectory();
					return true;
				}
			} catch {
				// fall through
			}
			return new Promise(resolve => {
				try {
					const open = indexedDB.open('text0wnz-probe');
					open.onsuccess = () => {
						open.result.close();
						indexedDB.deleteDatabase('text0wnz-probe');
						resolve(true);
					};
					open.onerror = () => resolve(false);
				} catch {
					resolve(false);
				}
			});
		});
		test.skip(!durable, 'no OPFS or IndexedDB in this browser');
	});

	for (const ice of [true, false]) {
		test(`a drawing with iCE ${ice ? 'on' : 'off'} comes back, and so does one drawn after the restore`, async ({ page }) => {
			if (ice) {
				await page.locator('#navICE').click();
			}
			await halfblock(page, [[3, 2], [10, 4], [20, 6]]);
			const first = await persisted(page, ice);
			expect(first).toMatch(new RegExp(`^80x25 ice=${ice} frames=1 `));

			await reload(page);
			expect(await digest(page, 'live')).toBe(first);

			// the restore's own keyframe runs now, and these strokes land
			// in front of it or behind it
			await halfblock(page, [[30, 8], [40, 10]]);
			const second = await persisted(page, ice);
			expect(second).not.toBe(first);

			await reload(page);
			expect(await digest(page, 'live')).toBe(second);
		});
	}

	// the first commit's append asks for the session keyframe; the
	// edits after it append behind that keyframe, so the last one
	// reaches the journal only as a commit of its own
	const keyframed = page =>
		expect.poll(() => digest(page, 'journal')).not.toBeNull();

	test('the last tap before a reload comes back with no edit after it', async ({ page }) => {
		await halfblock(page, [[3, 2], [10, 4]]);
		await keyframed(page);
		await tap(page, 20, 6);
		const saved = await persisted(page, false);

		await reload(page);
		expect(await digest(page, 'live')).toBe(saved);
		expect((await readBlock(page, 20, 6)).charCode).not.toBe(0);
	});

	test('a backspace, which fires no keypress, comes back', async ({ page }) => {
		// keyboard mode is the boot tool, with its cursor at 0,0
		await page.keyboard.type('Test');
		await keyframed(page);
		await page.keyboard.press('Backspace');
		await page.keyboard.press('Backspace');
		await expect.poll(() => readRegion(page, 0, 0, 3, 0)).toEqual(['Te  ']);
		const saved = await persisted(page, false);

		await reload(page);
		expect(await digest(page, 'live')).toBe(saved);
		expect(await readRegion(page, 0, 0, 3, 0)).toEqual(['Te  ']);
	});

	test('a selection still floating in move mode comes back', async ({ page }) => {
		await writeText(page, 10, 5, 'AB');
		await page.locator('#selection').click();
		await drag(page, [10, 5], [11, 5]);
		await keyframed(page);
		await page.keyboard.press('m');
		await expect(page.locator('#moveBlocks')).toHaveClass(/enabled/);
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		expect(await readRegion(page, 10, 5, 13, 5)).toEqual(['  AB']);
		const saved = await persisted(page, false);
		await expect(page.locator('#moveBlocks')).toHaveClass(/enabled/);

		await reload(page);
		expect(await digest(page, 'live')).toBe(saved);
		expect(await readRegion(page, 10, 5, 13, 5)).toEqual(['  AB']);
	});

	test('a floating move stepped just before a reload keeps that step', async ({ page, browserName }) => {
		// the IndexedDB journal appends across tasks, and WebKit unloads
		// first; OPFS posts the record to its worker in the step's task
		test.skip(browserName === 'webkit', 'the IndexedDB journal loses the race');
		await writeText(page, 10, 5, 'AB');
		await page.locator('#selection').click();
		await drag(page, [10, 5], [11, 5]);
		await keyframed(page);
		await page.keyboard.press('m');
		await expect(page.locator('#moveBlocks')).toHaveClass(/enabled/);
		await page.keyboard.press('ArrowRight');
		await expect.poll(() => digest(page, 'journal')).toBe(await digest(page, 'live'));
		// no idle runs before the reload: only the page leaving journals it
		await page.keyboard.press('ArrowRight');

		await reload(page);
		expect(await readRegion(page, 10, 5, 13, 5)).toEqual(['  AB']);
	});

	test('Update Editor with no update waiting clears the art, and a later settings save brings none back', async ({ page }) => {
		await halfblock(page, [[3, 2], [10, 4]]);
		await persisted(page, false);
		await openMenu(page);
		await page.locator('#update').click();
		await expect(page.locator('#updateModal')).toBeVisible();
		await Promise.all([
			page.waitForEvent('load'),
			page.locator('#updateReload').click(),
		]);
		await boot(page);
		expect((await readBlock(page, 3, 2)).charCode).toBe(0);

		// a font pick saves settings over the blank canvas and journals
		// nothing
		await page.locator('#changeFont').click();
		await page.locator('#font-topaz-437-8x16').click();
		await page.locator('#fontsApply').click();
		await expect
			.poll(() =>
				page.evaluate(
					() => JSON.parse(localStorage.getItem('text0wnz-settings'))?.fontName,
				))
			.toBe('Topaz-437 8x16');

		await reload(page);
		expect((await readBlock(page, 3, 2)).charCode).toBe(0);
		expect((await readBlock(page, 10, 4)).charCode).toBe(0);
	});

	test('a resize and a new frame come back', async ({ page }) => {
		await page.locator('#navICE').click();
		await halfblock(page, [[3, 2]]);
		await page.locator('#resolution').click();
		await page.locator('#columnsInput').fill('100');
		await page.locator('#rowsInput').fill('30');
		await page.locator('#resizeApply').click();
		await expect(page.locator('#resolutionLabel')).toHaveText('100x30');
		await halfblock(page, [[90, 20]]);
		await clickViewToggle(page, 'navFrames');
		await page.keyboard.press('Escape');
		await page.locator('#frameAdd').click();
		await expect(page.locator('#frameLabel')).toHaveText('2/2');
		await halfblock(page, [[50, 12], [95, 25]]);
		const saved = await persisted(page, true);
		expect(saved).toMatch(/^100x30 ice=true frames=2 /);

		await reload(page);
		expect(await digest(page, 'live')).toBe(saved);
	});

	test('an opened movie comes back with every frame', async ({ page }) => {
		// the legacy u16 snapshot keeps one frame, so two coming back
		// came from the journal
		await openBuffer(page, 'movie.dur', durOf(['FRAME1'], ['FRAME2']));
		await expect.poll(() => readRegion(page, 0, 0, 5, 0)).toEqual(['FRAME1']);
		const live = await persisted(page, true);
		expect(live).toMatch(/ frames=2 /);

		await reload(page);
		expect(await digest(page, 'live')).toBe(live);
		expect(await readRegion(page, 0, 0, 5, 0)).toEqual(['FRAME1']);
	});
});

// the idle that lands an edit in the journal never splits the step a
// gesture is still building
test.describe('Idle commit keeps each undo step whole', () => {
	const steps = page =>
		page.evaluate(() => window.__t0wnz.State.historyLabels.count());
	const inked = async (page, x, y) =>
		(await readBlock(page, x, y)).charCode !== 0;

	test.beforeEach(async ({ page }) => {
		await parkToolSettings(page);
		await page.goto('/?test');
		await boot(page);
	});

	test('a drag held still past the idle is one step', async ({ page }) => {
		await clickTool(page, 'halfblock');
		const before = await steps(page);
		const [a, b, c] = await Promise.all(
			[5, 9, 13].map(x => cellCenter(page, x, 5)),
		);
		await page.mouse.move(a.clientX, a.clientY);
		await page.mouse.down();
		await page.mouse.move(b.clientX, b.clientY, { steps: 6 });
		await page.waitForTimeout(800);
		await page.mouse.move(c.clientX, c.clientY, { steps: 6 });
		await page.mouse.up();
		await expect.poll(() => steps(page)).toBe(before + 1);

		await page.keyboard.press('Control+z');
		expect(await inked(page, 5, 5)).toBe(false);
		expect(await inked(page, 13, 5)).toBe(false);
	});

	test('a selection move paused between steps is one step', async ({ page }) => {
		await writeText(page, 10, 5, 'AB');
		// the seed commits now, not inside the count below
		await page.evaluate(() => window.__t0wnz.State.textArtCanvas.endUndo());
		const before = await steps(page);
		await page.locator('#selection').click();
		await drag(page, [10, 5], [11, 5]);
		await page.keyboard.press('m');
		await expect(page.locator('#moveBlocks')).toHaveClass(/enabled/);
		for (let i = 0; i < 2; i++) {
			await page.keyboard.press('ArrowRight');
			await page.waitForTimeout(800);
		}
		await page.keyboard.press('m');
		await expect(page.locator('#moveBlocks')).not.toHaveClass(/enabled/);
		expect(await readRegion(page, 10, 5, 13, 5)).toEqual(['  AB']);
		await expect.poll(() => steps(page)).toBe(before + 1);

		await page.keyboard.press('Control+z');
		expect(await readRegion(page, 10, 5, 13, 5)).toEqual(['AB  ']);
	});
});
