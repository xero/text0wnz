/**
 * Wait for the editor to be ready: the canvas container exists and main.js
 * has wired up every control (it sets data-ready on #bodyContainer)
 */
export async function waitForEditorReady(page, timeout = 10000) {
	await page.waitForSelector('#canvasContainer', { timeout });
	// Controls clicked before this point are silently ignored
	await page.waitForSelector('#bodyContainer[data-ready]', { state: 'attached', timeout });
	// Allow time for remaining async work (fonts, rendering, etc.)
	await page.waitForTimeout(1000);
}

/**
 * Wait for the test bridge: window.__t0wnz only exists when the page
 * was opened with /?test (main.js gates the import)
 */
export async function bridgeReady(page, timeout = 10000) {
	await page.waitForSelector('#canvasContainer', { timeout });
	await page.waitForSelector('#bodyContainer[data-ready]', { state: 'attached', timeout });
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout });
}

/**
 * Activate a tool through its icon stack, never the button center.
 * Tool buttons embed a native mode select there, and a chromium click
 * on a native select arms a stale pointerup that ends the next canvas
 * stroke early.
 */
export async function clickTool(page, id) {
	await page.locator(`#${id} .stack`).click();
}

/**
 * Client coordinates of a canvas cell, for synthetic pointer input
 */
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

/**
 * Read one canvas cell through the test bridge
 */
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
 * Read a rectangular region as one string per row in a single page
 * evaluation; charCode 0 reads as space
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

/**
 * Drag a stroke between two cells with interpolated pointer moves
 */
export async function drag(page, from, to, steps = 12) {
	const a = await cellCenter(page, from[0], from[1]);
	const b = await cellCenter(page, to[0], to[1]);
	await page.mouse.move(a.clientX, a.clientY);
	await page.mouse.down();
	await page.mouse.move(b.clientX, b.clientY, { steps });
	await page.mouse.up();
}

/**
 * Focus the canvas element for keyboard input
 * TODO: Replace timeout with focus state validation
 */
export async function focusCanvas(page) {
	// Click on viewport instead of canvas to avoid toolPreview overlay
	// interference, below the tool settings float that boots at (58,54)
	const viewport = page.locator('#viewport');
	await viewport.click({ position: { x: 100, y: 340 } });
	// TODO: Wait for specific focus state or activeElement change
	await page.waitForTimeout(200);
}

/**
 * Get canvas text content by reading from the DOM
 * TODO: Adjust based on actual DOM structure or window API if available
 */
export async function getCanvasText(page) {
	const textFromAPI = await page.evaluate(() => {
		if (window.State && window.State.textArtCanvas) {
			return window.State.textArtCanvas.toString();
		}
		return null;
	});

	if (textFromAPI) {
		return textFromAPI;
	}

	// placeholder until the editor exposes canvas data
	return '';
}

/**
 * Get the current viewport scroll position
 */
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

/**
 * Get the position info text displayed in the editor
 */
export async function getPositionInfo(page) {
	const positionInfo = page.locator('#positionInfo');
	return await positionInfo.textContent() || '';
}

/**
 * Check if a specific tool is active by checking for active class or similar
 * TODO: Adjust based on actual DOM structure for active tool indication
 */
export async function getActiveTool(page) {
	return await page.evaluate(() => {
		const activeTool = document.querySelector('aside > div.active, aside > div[class*="active"]');
		if (activeTool && activeTool.id) {
			return activeTool.id;
		}
		return null;
	});
}
