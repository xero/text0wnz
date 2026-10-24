import { describe, it, expect, afterEach, vi } from 'vitest';
import {
	fitGlyphCanvas,
	fitGlyphs,
	armPixelRatioWatch,
} from '../../src/js/client/glyphScale.js';

/**
 * Pixel-exact preview sizing: the CSS size must always land on a whole
 * device-pixel multiple of the glyph's base size, for every ratio the
 * spec calls out (1x, 1.25x, 1.5x, 2x).
 */

const stubEnvironment = (gw, dpr) => {
	vi.spyOn(window, 'getComputedStyle').mockReturnValue({ getPropertyValue: prop => (prop === '--gw' ? gw : '') });
	Object.defineProperty(window, 'devicePixelRatio', {
		value: dpr,
		configurable: true,
	});
};

const makeCanvas = (width = 8, height = 16) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

afterEach(() => {
	vi.restoreAllMocks();
	Object.defineProperty(window, 'devicePixelRatio', {
		value: 1,
		configurable: true,
	});
});

describe('fitGlyphCanvas', () => {
	it('doubles a 16px target at 1x', () => {
		stubEnvironment('16', 1);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		expect(canvas.style.width).toBe('16px');
		expect(canvas.style.height).toBe('32px');
	});

	it('lands on whole device pixels at 1.25x', () => {
		stubEnvironment('16', 1.25);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		// 2 device pixels per glyph pixel: 16 / 1.25 CSS px
		expect(canvas.style.width).toBe('12.8px');
		expect(parseFloat(canvas.style.width) * 1.25 % 8).toBe(0);
	});

	it('lands on whole device pixels at 1.5x', () => {
		stubEnvironment('16', 1.5);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		// 3 device pixels per glyph pixel: 24 device px wide
		expect(canvas.style.width).toBe('16px');
		expect(parseFloat(canvas.style.width) * 1.5 % 8).toBe(0);
	});

	it('lands on whole device pixels at 2x', () => {
		stubEnvironment('16', 2);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		expect(canvas.style.width).toBe('16px');
		expect(canvas.style.height).toBe('32px');
	});

	it('shrinks to the sidebar 8px target', () => {
		stubEnvironment('8', 1);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		expect(canvas.style.width).toBe('8px');
		expect(canvas.style.height).toBe('16px');
	});

	it('never drops below one glyph pixel per device pixel', () => {
		stubEnvironment('4', 1);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		expect(canvas.style.width).toBe('8px');
	});

	it('falls back to a 16px target without a --gw', () => {
		stubEnvironment('', 1);
		const canvas = makeCanvas();
		fitGlyphCanvas(canvas);
		expect(canvas.style.width).toBe('16px');
	});

	it('scales from the backing store, so 9px fonts stay exact', () => {
		stubEnvironment('16', 1);
		const canvas = makeCanvas(9, 16);
		fitGlyphCanvas(canvas);
		expect(canvas.style.width).toBe('9px');
		expect(canvas.style.height).toBe('16px');
	});

	it('survives a canvas without a computed style', () => {
		vi.spyOn(window, 'getComputedStyle').mockImplementation(() => {
			throw new TypeError('not an element');
		});
		expect(() => fitGlyphCanvas({ width: 8, height: 16 })).not.toThrow();
	});
});

describe('fitGlyphs', () => {
	it('fits every gc canvas under the root', () => {
		stubEnvironment('16', 1);
		const root = document.createElement('div');
		const a = makeCanvas();
		a.className = 'gc';
		const b = makeCanvas();
		b.className = 'gc';
		const plain = makeCanvas();
		root.append(a, b, plain);
		fitGlyphs(root);
		expect(a.style.width).toBe('16px');
		expect(b.style.width).toBe('16px');
		expect(plain.style.width).toBe('');
	});
});

describe('armPixelRatioWatch', () => {
	it('re-arms a fresh query after each ratio change', () => {
		const queries = [];
		vi.stubGlobal(
			'matchMedia',
			vi.fn(() => {
				const query = {
					handler: null,
					addEventListener: vi.fn((_type, fn) => {
						query.handler = fn;
					}),
					removeEventListener: vi.fn(),
				};
				queries.push(query);
				return query;
			}),
		);
		const onChange = vi.fn();
		armPixelRatioWatch(onChange);
		expect(queries).toHaveLength(1);
		queries[0].handler();
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(queries).toHaveLength(2);
		queries[1].handler();
		expect(onChange).toHaveBeenCalledTimes(2);
		expect(queries).toHaveLength(3);
		vi.unstubAllGlobals();
	});

	it('does nothing without matchMedia', () => {
		const original = window.matchMedia;
		delete window.matchMedia;
		expect(() => armPixelRatioWatch(vi.fn())).not.toThrow();
		if (original) {
			window.matchMedia = original;
		}
	});
});
