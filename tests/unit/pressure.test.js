/**
 * Pen pressure (PLAN §3.5 "pen draws with pressure"): the shading
 * brush picks its shade from pen pressure quartiles; mouse and touch
 * keep the classic darken/lighten cycle. Also pins the attribute
 * brush's shift-line path, which needs the modifiers the normalizer
 * delivers in detail.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createShadingController,
	createAttributeBrushController,
} from '../../src/js/client/freehandTools.js';

const mocks = vi.hoisted(() => {
	const drawn = [];
	return {
		drawn,
		state: {
			fontWidth: 8,
			fontHeight: 16,
			palette: {
				getForegroundColor: vi.fn(() => 7),
				getBackgroundColor: vi.fn(() => 0),
				getRGBAColor: vi.fn(() => [255, 0, 0, 255]),
			},
			textArtCanvas: {
				startUndo: vi.fn(),
				draw: vi.fn(callback => {
					callback((charCode, fg, bg, x, y) =>
						drawn.push({ charCode, fg, bg, x, y }));
				}),
				getBlock: vi.fn(() => ({
					charCode: 32,
					foregroundColor: 7,
					backgroundColor: 0,
				})),
				getHalfBlock: vi.fn(() => ({ isBlocky: false })),
				getColumns: vi.fn(() => 80),
				getRows: vi.fn(() => 25),
				getMirrorMode: vi.fn(() => false),
			},
			positionInfo: { update: vi.fn() },
			toolPreview: { clear: vi.fn(), drawHalfBlock: vi.fn() },
			font: { getWidth: vi.fn(() => 8), getHeight: vi.fn(() => 16) },
		},
	};
});

vi.mock('../../src/js/client/state.js', () => ({ default: mocks.state }));
vi.mock('../../src/js/client/ui.js', () => ({
	$: () => {
		const el = document.createElement('div');
		el.classList.add('stub');
		return el;
	},
	createCanvas: (w, h) => {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		return c;
	},
}));

const shadingPanelStub = {
	enable: vi.fn(),
	disable: vi.fn(),
	getMode: () => ({ halfBlockMode: false, foreground: 7, background: 0 }),
	ignore: vi.fn(),
	unignore: vi.fn(),
};

const down = detail =>
	document.dispatchEvent(new CustomEvent('onTextCanvasDown', { detail }));
const drag = detail =>
	document.dispatchEvent(new CustomEvent('onTextCanvasDrag', { detail }));
const up = () =>
	document.dispatchEvent(new CustomEvent('onTextCanvasUp', { detail: {} }));

beforeEach(() => {
	mocks.drawn.length = 0;
	mocks.state.textArtCanvas.draw.mockClear();
});

describe('shading brush pressure', () => {
	it('pen pressure quartiles pick the shade directly', () => {
		const tool = createShadingController(shadingPanelStub, false);
		tool.enable();
		const base = { y: 0, halfBlockY: 0, pointerType: 'pen' };
		down({ ...base, x: 0, pressure: 0.1 });
		drag({ ...base, x: 1, pressure: 0.3 });
		drag({ ...base, x: 2, pressure: 0.6 });
		drag({ ...base, x: 3, pressure: 0.95 });
		up();
		tool.disable();
		expect(mocks.drawn.map(d => d.charCode)).toEqual([176, 177, 178, 219]);
	});

	it('mouse keeps the classic cycle (no pressure override)', () => {
		mocks.state.textArtCanvas.getBlock.mockReturnValue({
			charCode: 176,
			foregroundColor: 7,
			backgroundColor: 0,
		});
		const tool = createShadingController(shadingPanelStub, false);
		tool.enable();
		down({ x: 0, y: 0, halfBlockY: 0, pointerType: 'mouse', pressure: 0.5 });
		up();
		tool.disable();
		// 176 darkens to 177 via the cycle, not pressure (0.5 would be 178)
		expect(mocks.drawn.map(d => d.charCode)).toEqual([177]);
	});
});

describe('attribute brush modifiers (revived by the normalizer)', () => {
	it('shift+down paints a line from the last point', () => {
		// cell colors differ from the palette so every paint lands
		mocks.state.textArtCanvas.getBlock.mockReturnValue({
			charCode: 65,
			foregroundColor: 2,
			backgroundColor: 1,
		});
		const tool = createAttributeBrushController();
		tool.enable();
		down({ x: 0, y: 0, halfBlockY: 0, shiftKey: false, altKey: false });
		up();
		const plainClick = mocks.state.textArtCanvas.draw.mock.calls.length;
		expect(plainClick).toBe(1);
		down({ x: 3, y: 0, halfBlockY: 0, shiftKey: true, altKey: false });
		up();
		tool.disable();
		// shift paints the whole connecting line: cells 0..3
		expect(mocks.state.textArtCanvas.draw.mock.calls.length).toBe(
			plainClick + 4,
		);
	});
});
