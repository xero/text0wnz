/**
 * Minimap panel: toggle lifecycle and the no-markup guard. The
 * pixel render itself is exercised in the browser (jsdom has no 2D
 * context); render() must no-op gracefully there.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createMinimap } from '../../src/js/client/minimap.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: { getHeight: () => 16, getWidth: () => 8 },
		palette: { getRGBAColor: vi.fn(() => [255, 0, 0, 255]) },
		textArtCanvas: null,
	},
}));

const MARKUP = `
	<div id="navMinimap"></div>
	<div id="minimapPanel" class="hide">
		<button id="minimapMenuToggle"></button>
		<div id="minimapMenu" class="hide"></div>
		<div id="minimapScroll">
			<canvas id="minimapArt" width="80" height="25"></canvas>
			<div id="minimapViewport"></div>
		</div>
	</div>
	<div id="viewport"></div>
`;

beforeEach(() => {
	localStorage.removeItem('minimapVisible');
	document.body.innerHTML = MARKUP;
	State.textArtCanvas = {
		getColumns: () => 4,
		getRows: () => 2,
		getCurrentFrame: () => 0,
		getDoc: () => ({
			frames: [
				{
					glyph: new Uint32Array(8),
					fg: new Uint32Array(8),
					bg: new Uint32Array(8),
				},
			],
		}),
	};
});

afterEach(() => {
	document.body.innerHTML = '';
	vi.useRealTimers();
});

describe('minimap', () => {
	it('returns null without its markup', () => {
		document.body.innerHTML = '';
		expect(createMinimap()).toBeNull();
	});

	it('starts VISIBLE by default and remembers the toggle', () => {
		vi.useFakeTimers();
		const minimap = createMinimap();
		// owner call: on by default; the panel manager renders the flag
		expect(minimap.isVisible()).toBe(true);
		// the refresh tick must not throw without a 2D context
		expect(() => vi.advanceTimersByTime(1100)).not.toThrow();
		// main.js wires the button through createSettingToggle
		minimap.hide();
		expect(minimap.isVisible()).toBe(false);
		expect(localStorage.getItem('minimapVisible')).toBe('false');
		// a remembered OFF stays off on the next boot
		document.body.innerHTML = MARKUP;
		const next = createMinimap();
		expect(next.isVisible()).toBe(false);
	});

	it('sizes the art canvas to the doc on render', () => {
		const minimap = createMinimap();
		minimap.render();
		const art = document.getElementById('minimapArt');
		expect(art.width).toBe(4);
		expect(art.height).toBe(2);
	});

	describe('tap vs drag', () => {
		// art rect 100px tall, doc 2 rows x 16px = 32 doc px: a pointer at
		// y=50 is fraction 0.5, so scrollTop lands at 16
		let scroller;
		let vp;
		const point = (type, y, pointerType = 'mouse') => {
			const e = new MouseEvent(type, { clientY: y, bubbles: true });
			Object.defineProperty(e, 'pointerType', { value: pointerType });
			scroller.dispatchEvent(e);
		};

		beforeEach(() => {
			createMinimap();
			scroller = document.getElementById('minimapScroll');
			vp = document.getElementById('viewport');
			vp.scrollTop = 0;
			document.getElementById('minimapArt').getBoundingClientRect = () => ({
				top: 0,
				bottom: 100,
				left: 0,
				right: 128,
				width: 128,
				height: 100,
			});
			// jsdom rects are zero-sized, which would put every pointer in
			// the auto-scroll edge zone; give the slice a real height
			scroller.getBoundingClientRect = () => ({
				top: 0,
				bottom: 400,
				left: 0,
				right: 140,
				width: 140,
				height: 400,
			});
		});

		it('commits a tap on release, never on pointerdown', () => {
			point('pointerdown', 50);
			expect(vp.scrollTop).toBe(0);
			point('pointerup', 50);
			expect(vp.scrollTop).toBe(16);
		});

		it('a touch drag pans natively when the map overflows the panel', () => {
			Object.defineProperty(scroller, 'scrollHeight', {
				value: 200,
				configurable: true,
			});
			Object.defineProperty(scroller, 'clientHeight', {
				value: 100,
				configurable: true,
			});
			point('pointerdown', 50, 'touch');
			point('pointermove', 80, 'touch');
			point('pointerup', 80, 'touch');
			expect(vp.scrollTop).toBe(0);
		});

		it('a touch drag on the focus box scrubs even when the map overflows', () => {
			Object.defineProperty(scroller, 'scrollHeight', {
				value: 200,
				configurable: true,
			});
			Object.defineProperty(scroller, 'clientHeight', {
				value: 100,
				configurable: true,
			});
			const frame = document.getElementById('minimapViewport');
			const onFrame = (type, y) => {
				const e = new MouseEvent(type, { clientY: y, bubbles: true });
				Object.defineProperty(e, 'pointerType', { value: 'touch' });
				frame.dispatchEvent(e);
			};
			onFrame('pointerdown', 10);
			onFrame('pointermove', 50);
			expect(vp.scrollTop).toBe(16);
			onFrame('pointerup', 50);
		});

		it('a touch drag scrubs when the map fits the panel', () => {
			point('pointerdown', 10, 'touch');
			point('pointermove', 50, 'touch');
			expect(vp.scrollTop).toBe(16);
			point('pointerup', 50, 'touch');
			expect(vp.scrollTop).toBe(16);
		});

		it('a mouse drag scrubs past slop without a release jump', () => {
			point('pointerdown', 10);
			point('pointermove', 50);
			expect(vp.scrollTop).toBe(16);
			point('pointermove', 100);
			expect(vp.scrollTop).toBe(32);
			point('pointerup', 100);
			expect(vp.scrollTop).toBe(32);
		});

		it('pointercancel clears the pending tap', () => {
			point('pointerdown', 50);
			point('pointercancel', 50);
			point('pointerup', 50);
			expect(vp.scrollTop).toBe(0);
		});
	});
});
