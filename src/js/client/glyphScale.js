/**
 * Pixel-exact glyph preview sizing. A preview canvas (class gc) keeps
 * its backing store at the base glyph size and gets a CSS size that is
 * a whole multiple of device pixels: the largest n glyph-pixel
 * multiple that fits the context's --gw target. Anything else lets a
 * fractional devicePixelRatio smear single-pixel glyph rows across
 * device pixel boundaries.
 */

import State from './state.js';
import { createLazyFont } from './lazyFont.js';

// previews are chrome, not canvas: panels and fkey tiles draw through
// a shared 1x font so zoom can never scale or crop them, and the
// backing store stays at base glyph size. One cached instance serves
// every preview; building per call would stack orphaned pregeneration
// drains and rerasterize every glyph. Null until a font loads
let oneXFont = null;
let oneXKey = null;

const get1xFont = () => {
	if (!State.font || !State.font.getData) {
		return null;
	}
	const data = State.font.getData();
	const spacing = State.font.getLetterSpacing?.() ?? false;
	if (
		!oneXFont ||
		oneXKey.data !== data ||
		oneXKey.palette !== State.palette ||
		oneXKey.spacing !== spacing
	) {
		oneXFont?.dispose();
		oneXFont = createLazyFont(data, State.palette, spacing, 1);
		oneXKey = { data: data, palette: State.palette, spacing: spacing };
	}
	return oneXFont;
};

const drop1xFont = () => {
	oneXFont?.dispose();
	oneXFont = null;
	oneXKey = null;
};

// a palette edit mutates State.palette in place, invisible to the key
// compare above, so every event that repaints a preview retires the
// cache first. Consumers import this module before they register their
// own listeners, so these always run ahead of the repaints
for (const name of [
	'onPaletteChange',
	'onLetterSpacingChange',
	'onFontChange',
	'onXBFontLoaded',
	'onOpenedFile',
]) {
	document.addEventListener(name, drop1xFont);
}

const fitGlyphCanvas = canvas => {
	let style;
	try {
		style = window.getComputedStyle(canvas);
	} catch {
		// a stubbed canvas (unit tests) has no computed style, and the
		// fit is presentation only
		return;
	}
	const dpr = window.devicePixelRatio || 1;
	const target = parseFloat(style.getPropertyValue('--gw')) || 16;
	const baseW = canvas.width || 8;
	const baseH = canvas.height || 16;
	// the epsilon forgives float error when target * dpr lands exactly
	// on a multiple, which 1.25x and 1.5x ratios hit constantly
	const n = Math.max(1, Math.floor((target * dpr) / baseW + 0.01));
	canvas.style.width = `${(n * baseW) / dpr}px`;
	canvas.style.height = `${(n * baseH) / dpr}px`;
};

const fitGlyphs = (root = document) => {
	for (const canvas of root.querySelectorAll('canvas.gc')) {
		// hidden sections re-fit when they reveal (every reveal lays out
		// again); measuring them on each layout is pure waste. Markup
		// visibility (.hide, [hidden]), not geometry: the layoutless
		// test DOM reports zero rects for everything
		if (canvas.closest?.('.hide, [hidden]')) {
			continue;
		}
		fitGlyphCanvas(canvas);
	}
};

// a resolution media query matches exactly one ratio, so each firing
// burns the listener and a fresh query arms for the next monitor move
const armPixelRatioWatch = onChange => {
	// no matchMedia (test DOMs) means no ratio changes to watch
	if (typeof window.matchMedia !== 'function') {
		return;
	}
	const arm = () => {
		const query = window.matchMedia(
			`(resolution: ${window.devicePixelRatio || 1}dppx)`,
		);
		const fired = () => {
			query.removeEventListener('change', fired);
			onChange();
			arm();
		};
		query.addEventListener('change', fired);
	};
	arm();
};

export { fitGlyphCanvas, fitGlyphs, armPixelRatioWatch, get1xFont };
export default { fitGlyphCanvas, fitGlyphs, armPixelRatioWatch, get1xFont };
