/**
 * Golden screenshot suite (PLAN.md P0, O8) — the first pixel-regression
 * harness for the renderer. Matrix: fixture (CP437 bin / ice bin / 512-glyph
 * XBin with custom palette) x font (CP437, Topaz 1200) x zoom (1, 2) x
 * letter spacing (8px, 9px), minus nonsense combos. Plus real artwork
 * (docs/examples, the author's own pieces): dense shading/color coverage and
 * a real ANSI escape-code parse that no synthetic testcard reaches.
 *
 * Goldens are generated ONLY in the CI container (linux, dpr 1); local runs
 * on other machines execute the flows but skip pixel assertions
 * (ignoreSnapshots in playwright.config.js). To (re)generate goldens, run
 * the golden-update workflow and commit the artifact it uploads.
 *
 * P1 gate: the GL renderer must reproduce these shots at integer zoom with
 * threshold 0 (PLAN.md §4 P1).
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { waitForEditorReady } from '../e2e/helpers/editorHelpers.js';
import { testcardBin, testcardIceBin, testcard512Xb } from './testcard.js';

const snapshotDir = path.join(
	path.dirname(fileURLToPath(import.meta.url)),
	'golden.spec.js-snapshots',
);
// Goldens are linux-container artifacts (see header comment)
const goldenExists = name =>
	existsSync(path.join(snapshotDir, `${name.replace('.png', '')}-golden-linux.png`));

// Real artwork, read from docs/examples rather than copied: one source of
// truth, and the goldens derived from it are renders of the author's art,
// not test data
const realArtBytes = readFileSync(
	path.join(
		path.dirname(fileURLToPath(import.meta.url)),
		'../../docs/examples/ansi/x0-defcon25.ans',
	),
);

const FIXTURES = {
	cp437: { name: 'testcard.bin', bytes: testcardBin },
	ice: { name: 'testcard-ice.bin', bytes: testcardIceBin },
	xb512: { name: 'testcard-512.xb', bytes: testcard512Xb },
	realart: { name: 'x0-defcon25.ans', bytes: () => realArtBytes },
};

// fixture, font (null = keep the fixture's font), zoom, 9px letter spacing
const MATRIX = [];
for (const fixture of ['cp437', 'ice']) {
	for (const font of ['CP437 8x16', 'Topaz 1200 8x16']) {
		for (const zoom of [1, 2]) {
			for (const nine of [false, true]) {
				MATRIX.push({ fixture, font, zoom, nine });
			}
		}
	}
}
for (const zoom of [1, 2]) {
	for (const nine of [false, true]) {
		MATRIX.push({ fixture: 'xb512', font: null, zoom, nine });
	}
}

// Real artwork (x0-defcon25: 80x132, ice, IBM VGA). Taller than the viewport
// AND the GL slack window, so full-element capture would assert regions both
// renderers intentionally leave unrendered (virtualized chunks / GL slack);
// these shots are viewport clips at scroll positions instead, which also
// puts scroll re-anchoring itself under the pixel gate.
const REALART = [
	{ zoom: 1, nine: false, scroll: 'top' },
	{ zoom: 1, nine: false, scroll: 'mid' },
	{ zoom: 1, nine: false, scroll: 'bot' },
	{ zoom: 2, nine: true, scroll: 'mid' },
];

const shotName = ({ fixture, font, zoom, nine }) => {
	const fontSlug = font ? font.split(' ')[0].toLowerCase() : 'xbin';
	return `${fixture}-${fontSlug}-z${zoom}-${nine ? '9px' : '8px'}.png`;
};

const realartName = ({ zoom, nine, scroll }) =>
	`realart-vga-z${zoom}-${nine ? '9px' : '8px'}-${scroll}.png`;

const prepPage = async (page, testInfo) => {
	// The golden-gl project runs the SAME shots through the GL renderer
	// and asserts against the SAME goldens: the P1 pixel-parity gate
	const gl = testInfo.project.name === 'golden-gl';
	await page.goto(gl ? '/?test&renderer=gl' : '/?test');
	await waitForEditorReady(page);
	await page.waitForFunction(() => !!window.__t0wnz, null, { timeout: 10000 });
	// Cursor/selection overlays toggle with focus state, which is racy
	// across runs; only the art may decide golden pixels
	await page.addStyleTag({
		content:
			'#canvasContainer canvas.cursor,' +
			'#canvasContainer canvas.selectionCursor' +
			'{display:none !important}',
	});
};

const openFixture = async (page, fixture) => {
	const { name, bytes } = FIXTURES[fixture];
	await page.locator('#openFile').setInputFiles({
		name,
		mimeType: 'application/octet-stream',
		buffer: Buffer.from(bytes()),
	});
	// Wait out the load path (mirrors tests/e2e/helpers/openFile.js)
	await page.waitForTimeout(1500);
	await page.waitForFunction(() => {
		const modal = document.getElementById('modal');
		const loading = document.getElementById('loadingModal');
		return !modal?.open || loading?.classList.contains('hide');
	}, null, { timeout: 15000 });
};

const applyView = async (page, { font, zoom, nine, ice }) => {
	await page.evaluate(async ({ font, zoom, nine, ice }) => {
		const { State } = window.__t0wnz;
		if (font && State.textArtCanvas.getCurrentFontName() !== font) {
			await new Promise(resolve => State.textArtCanvas.setFont(font, resolve));
		}
		// Pin ice explicitly when asked: blink phase must never decide pixels
		if (ice !== undefined && State.textArtCanvas.getIceColors() !== ice) {
			State.textArtCanvas.setIceColors(ice);
		}
		if (State.font.getLetterSpacing() !== nine) {
			State.font.setLetterSpacing(nine);
		}
		if (State.font.getScaleFactor() !== zoom) {
			State.font.setScaleFactor(zoom);
		}
		// Settle with a full synchronous-progressive repaint
		await new Promise(resolve =>
			State.textArtCanvas.redrawEntireImage(null, resolve));
	}, { font, zoom, nine, ice });
	// One more frame for the compositor
	await page.waitForTimeout(100);
};

const seedSkip = (testInfo, name) =>
	// Until the golden-update workflow has seeded snapshots, CI runs
	// the flow but skips the pixel assertion instead of failing
	test.skip(
		!!process.env.CI &&
		testInfo.config.updateSnapshots === 'missing' &&
		!goldenExists(name),
		'golden not seeded; run the golden-update workflow and commit its artifact',
	);

test.describe('golden renderer screenshots', () => {
	for (const combo of MATRIX) {
		test(shotName(combo), async ({ page }, testInfo) => {
			seedSkip(testInfo, shotName(combo));
			await prepPage(page, testInfo);
			await openFixture(page, combo.fixture);
			await applyView(page, combo);
			await expect(page.locator('#canvasContainer')).toHaveScreenshot(
				shotName(combo),
				{ maxDiffPixels: 0, animations: 'disabled' },
			);
		});
	}
});

test.describe('golden real artwork screenshots', () => {
	for (const combo of REALART) {
		test(realartName(combo), async ({ page }, testInfo) => {
			// 132 rows through the chunk renderer at zoom 2 is slow in the
			// container; triple the budget
			test.slow();
			seedSkip(testInfo, realartName(combo));
			await prepPage(page, testInfo);
			await openFixture(page, 'realart');
			await applyView(page, { font: null, zoom: combo.zoom, nine: combo.nine, ice: true });
			// Jump the scroller, then let the scroll handlers run (GL
			// re-anchor, chunk virtualization) before settling
			await page.evaluate(where => {
				const viewport = document.getElementById('viewport');
				const max = viewport.scrollHeight - viewport.clientHeight;
				viewport.scrollTop =
					where === 'top' ? 0 : where === 'mid' ? Math.round(max / 2) : max;
			}, combo.scroll);
			await page.waitForTimeout(250);
			await page.evaluate(async () => {
				const { State } = window.__t0wnz;
				await new Promise(resolve =>
					State.textArtCanvas.redrawEntireImage(null, resolve));
			});
			await page.waitForTimeout(100);
			// Clip to the art visible inside the scroller (client area, so
			// scrollbars never enter the shot)
			const clip = await page.evaluate(() => {
				const viewport = document.getElementById('viewport');
				const container = document.getElementById('canvasContainer');
				const v = viewport.getBoundingClientRect();
				const c = container.getBoundingClientRect();
				const left = v.left + viewport.clientLeft;
				const top = v.top + viewport.clientTop;
				const x = Math.max(left, c.left);
				const y = Math.max(top, c.top);
				return {
					x,
					y,
					width: Math.min(left + viewport.clientWidth, c.right) - x,
					height: Math.min(top + viewport.clientHeight, c.bottom) - y,
				};
			});
			await expect(page).toHaveScreenshot(realartName(combo), {
				clip,
				maxDiffPixels: 0,
				animations: 'disabled',
			});
		});
	}
});
