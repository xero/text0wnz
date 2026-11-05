import { expect } from '@playwright/test';

/**
 * The loading modal covers the viewport while a file or the autosave
 * loads. Waits on it alone: other modals depend on server, storage, or
 * session state
 */
export async function loadSettled(page, timeout = 15000) {
	await page.waitForFunction(
		() => {
			const modal = document.getElementById('modal');
			const loading = document.getElementById('loadingModal');
			return !modal?.open || loading?.classList.contains('hide');
		},
		null,
		{ timeout },
	);
}

/**
 * main.js sets data-ready on #bodyContainer once every control is wired
 */
export async function waitForEditorReady(page, timeout = 10000) {
	await page.waitForSelector('#canvasContainer', { timeout });
	// controls clicked before this point are silently ignored
	await page.waitForSelector('#bodyContainer[data-ready]', { state: 'attached', timeout });
	// the autosave restore opens the loading modal before data-ready
	// lands and holds it until the saved doc is back
	await loadSettled(page, timeout);
}

/**
 * Resolves n animation frames later. UI that places itself on the
 * next frame (the selection bar) has landed after two, so an absence
 * check cannot pass before the element arrives; a longer run is the
 * window for a check that per-frame motion has stopped
 */
export async function nextFrames(page, n = 2) {
	await page.evaluate(
		count =>
			new Promise(resolve => {
				const step = left => (left ? requestAnimationFrame(() => step(left - 1)) : resolve());
				step(count);
			}),
		n,
	);
}

/**
 * main.js nudges the viewport onto a row boundary 150ms after the last
 * scroll event, so a scroll has settled once the viewport stays quiet
 * past that timer; a position read any sooner can still jump. The limit
 * fails a viewport that never stops (playback left running) with its
 * own message instead of the test timeout's
 */
export async function scrollSettled(page, { quiet = 250, limit = 5000 } = {}) {
	await page.evaluate(
		({ quiet, limit }) =>
			new Promise((resolve, reject) => {
				const vp = document.getElementById('viewport');
				let timer = 0;
				const end = () => {
					clearTimeout(timer);
					clearTimeout(deadline);
					vp.removeEventListener('scroll', arm);
				};
				const arm = () => {
					clearTimeout(timer);
					timer = setTimeout(() => {
						end();
						resolve();
					}, quiet);
				};
				const deadline = setTimeout(() => {
					end();
					reject(new Error(`#viewport still scrolling after ${limit} ms (scrollTop ${vp.scrollTop})`));
				}, limit);
				vp.addEventListener('scroll', arm, { passive: true });
				arm();
			}),
		{ quiet, limit },
	);
}

/**
 * Boxes are final once a drop's relayout has rendered and no CSS
 * transition (the sheet snaps glide) still runs
 */
export async function layoutSettled(page) {
	await nextFrames(page);
	await page.waitForFunction(
		() =>
			!document
				.getAnimations()
				.some(a => a instanceof window.CSSTransition && a.playState === 'running'),
	);
}

/**
 * window.__t0wnz only exists when the page was opened with /?test
 * (main.js gates the import)
 */
export async function bridgeReady(page, timeout = 10000) {
	await page.waitForSelector('#canvasContainer', { timeout });
	await page.waitForSelector('#bodyContainer[data-ready]', { state: 'attached', timeout });
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout });
}

/**
 * Group members live in rail flyouts, so the group opens first when
 * its item is hidden. Tools with an icon stack are clicked through it,
 * never the button center: those buttons embed a native mode select
 * there, and a chromium click on a native select arms a stale
 * pointerup that ends the next canvas stroke early.
 */
const TOOL_GROUPS = {
	halfblock: 'brushes',
	shadingBrush: 'brushes',
	asciiBrush: 'brushes',
	characterBrush: 'brushes',
	attrib: 'brushes',
	fill: 'brushes',
	line: 'shapes',
	square: 'shapes',
	circle: 'shapes',
};

export async function clickTool(page, id) {
	const group = TOOL_GROUPS[id];
	if (group && !(await page.locator(`#${id}`).isVisible())) {
		await page.locator(`#${group}`).click();
	}
	const stack = page.locator(`#${id} .stack`);
	if (await stack.count()) {
		await stack.click();
	} else {
		await page.locator(`#${id}`).click();
	}
	// most tools load lazily: a stroke sent before the button lights
	// lands on whatever tool was active before
	await expect(page.locator(`#${id}`)).toHaveClass(/toolbarDisplayed/);
}

/**
 * Undo and redo live in the history flyout, which stays open across
 * presses.
 */
export async function clickHistoryAction(page, id) {
	if (!(await page.locator(`#${id}`).isVisible())) {
		await page.locator('#clipboard').click();
	}
	await page.locator(`#${id}`).click();
}

/**
 * View toggles (grid, dark mode, frames, minimap, ref image) live in
 * the View flyout.
 */
export async function clickViewToggle(page, id) {
	if (!(await page.locator(`#${id}`).isVisible())) {
		await page.locator('#navView').click();
	}
	await page.locator(`#${id}`).click();
}

export async function openMenu(page, tab = 'file') {
	if (!(await page.locator('#mainMenu').isVisible())) {
		await page.locator('#fileMenu').click();
	}
	await page
		.locator(tab === 'edit' ? '#menuTabEdit' : '#menuTabFile')
		.click();
}

export async function cellCenter(page, x, y) {
	return page.evaluate(
		([cx, cy]) => {
			const s = window.__t0wnz.State;
			const rect = document
				.getElementById('canvasContainer')
				.getBoundingClientRect();
			return {
				clientX: rect.left + cx * s.font.getWidth() + s.font.getWidth() / 2,
				// three quarters down the cell: the half block seam sits at
				// exactly h/2, where any subpixel origin flips the parity
				clientY: rect.top + cy * s.font.getHeight() + (s.font.getHeight() * 3) / 4,
			};
		},
		[x, y],
	);
}

export async function readBlock(page, x, y) {
	return page.evaluate(
		([cx, cy]) => {
			const b = window.__t0wnz.State.textArtCanvas.getBlock(cx, cy);
			return {
				charCode: b.charCode,
				fg: b.foregroundColor,
				bg: b.backgroundColor,
			};
		},
		[x, y],
	);
}

/**
 * Park the settings window clear of the canvas before the page loads:
 * its default perch covers the canvas's top left corner, where most
 * test strokes land. Call before page.goto.
 */
export async function parkToolSettings(page) {
	await page.addInitScript(() => {
		localStorage.setItem(
			'toolSettingsPos',
			JSON.stringify({ x: 960, y: 560 }),
		);
	});
}

/**
 * One page evaluation for the whole region, not a round trip per cell
 */
export async function readRegion(page, x0, y0, x1, y1) {
	return page.evaluate(
		([ax, ay, bx, by]) => {
			const c = window.__t0wnz.State.textArtCanvas;
			const rows = [];
			for (let y = ay; y <= by; y++) {
				let row = '';
				for (let x = ax; x <= bx; x++) {
					const code = c.getBlock(x, y).charCode;
					row += code === 0 ? ' ' : String.fromCharCode(code);
				}
				rows.push(row);
			}
			return rows;
		},
		[x0, y0, x1, y1],
	);
}

/**
 * Seeds art through the editor core as one undo stroke, so a spec
 * sets up cells without leaning on a tool it does not test
 */
export async function writeText(page, x, y, text, fg = 7, bg = 0) {
	await page.evaluate(
		([cx, cy, t, f, b]) => {
			const c = window.__t0wnz.State.textArtCanvas;
			c.startUndo();
			c.draw(cb => {
				[...t].forEach((ch, i) => cb(ch.charCodeAt(0), f, b, cx + i, cy));
			}, false);
		},
		[x, y, text, fg, bg],
	);
}

export async function tap(page, x, y) {
	const c = await cellCenter(page, x, y);
	await page.mouse.click(c.clientX, c.clientY);
}

export async function readSelection(page) {
	return page.evaluate(() => {
		const c = window.__t0wnz.State.selectionCursor;
		return { live: c.getSelection(), last: c.getLastSelection() };
	});
}

export async function cursorAt(page) {
	return page.evaluate(() => {
		const c = window.__t0wnz.State.cursor;
		return { x: c.getX(), y: c.getY() };
	});
}

export async function readColors(page) {
	return page.evaluate(() => {
		const p = window.__t0wnz.State.palette;
		return { fg: p.getForegroundColor(), bg: p.getBackgroundColor() };
	});
}

/**
 * Tool settings seam: specs change modes and knobs only through
 * these, so a settings UI redesign edits the bodies here and never
 * touches a spec
 */
export async function setLineMode(page, mode) {
	await page.locator(`#lineMode [data-value="${mode}"]`).click();
}

export async function setSquareMode(page, mode) {
	await page.locator(`#squareMode [data-value="${mode}"]`).click();
}

export async function setCircleMode(page, mode) {
	await page.locator(`#circleMode [data-value="${mode}"]`).click();
}

export async function setFill(page, tool, filled) {
	await page
		.locator(`#${tool}Fill [data-value="${filled ? 'filled' : 'outline'}"]`)
		.click();
}

export async function setAsciiWidth(page, width) {
	await page.locator(`#asciiWidth [data-value="${width}"]`).click();
}

export async function setAttribSize(page, size) {
	// a range input takes no fill(); set the value and announce it the
	// way a thumb drag would
	await page.locator('#attribSize').evaluate((el, v) => {
		el.value = v;
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, String(size));
}

export async function drag(page, from, to, steps = 12) {
	const a = await cellCenter(page, from[0], from[1]);
	const b = await cellCenter(page, to[0], to[1]);
	await page.mouse.move(a.clientX, a.clientY);
	await page.mouse.down();
	await page.mouse.move(b.clientX, b.clientY, { steps });
	await page.mouse.up();
}

export async function focusCanvas(page) {
	// the viewport, not the canvas, so the toolPreview overlay cannot
	// intercept; below the tool settings float that boots at (58,54)
	const viewport = page.locator('#viewport');
	await viewport.click({ position: { x: 100, y: 340 } });
	// keys typed into a field never reach the editor
	await expect
		.poll(() =>
			page.evaluate(() =>
				Boolean(document.activeElement?.closest('input, textarea, select, [contenteditable]'))))
		.toBe(false);
}

export async function getViewportScrollPosition(page) {
	return await page.evaluate(() => {
		const viewport = document.getElementById('viewport');
		if (viewport) {
			return {
				scrollTop: viewport.scrollTop,
				scrollLeft: viewport.scrollLeft,
			};
		}
		return { scrollTop: 0, scrollLeft: 0 };
	});
}
