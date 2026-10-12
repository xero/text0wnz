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
		font: { getHeight: () => 16 },
		palette: { getRGBAColor: vi.fn(() => [255, 0, 0, 255]) },
		textArtCanvas: null,
	},
}));

const MARKUP = `
	<div id="navMinimap"></div>
	<div id="minimapPanel" class="hide">
		<canvas id="minimapArt" width="80" height="25"></canvas>
		<div id="minimapViewport"></div>
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
		const panel = document.getElementById('minimapPanel');
		// owner call: on by default
		expect(minimap.isVisible()).toBe(true);
		expect(panel.classList.contains('hide')).toBe(false);
		// the refresh tick must not throw without a 2D context
		expect(() => vi.advanceTimersByTime(1100)).not.toThrow();
		// main.js wires the button through createSettingToggle
		minimap.hide();
		expect(minimap.isVisible()).toBe(false);
		expect(panel.classList.contains('hide')).toBe(true);
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
});
