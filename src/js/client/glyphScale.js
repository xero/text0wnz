/**
 * Pixel-exact glyph preview sizing. A preview canvas (class gc) keeps
 * its backing store at the base glyph size and gets a CSS size that is
 * a whole multiple of device pixels: the largest n glyph-pixel
 * multiple that fits the context's --gw target. Anything else lets a
 * fractional devicePixelRatio smear single-pixel glyph rows across
 * device pixel boundaries.
 */

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

export { fitGlyphCanvas, fitGlyphs, armPixelRatioWatch };
export default { fitGlyphCanvas, fitGlyphs, armPixelRatioWatch };
