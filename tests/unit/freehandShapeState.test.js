import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Corners must not survive disable(), and the drag comparator must not
 * ignore a move landing back on the start cell. Either slip commits a
 * wrong shape, so both are pinned at the committed cell level in block
 * mode.
 */
const hoisted = vi.hoisted(() => ({ draws: []}));

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		palette: {
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		},
		textArtCanvas: {
			startUndo: vi.fn(),
			drawHalfBlock: vi.fn(callback => {
				callback((_fg, x, y) => hoisted.draws.push({ x, y }));
			}),
			draw: vi.fn(callback => {
				callback(() => {});
			}),
			getBlock: vi.fn(() => ({
				charCode: 32,
				foregroundColor: 7,
				backgroundColor: 0,
			})),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
		},
		toolSettings: {
			show: vi.fn(),
			hide: vi.fn(),
			mount: vi.fn(),
			get: vi.fn((_key, fallback) => fallback),
			set: vi.fn(),
		},
		toolPreview: {
			clear: vi.fn(),
			drawHalfBlock: vi.fn(),
			drawGlyph: vi.fn(),
		},
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	createSegmentedControl: vi.fn((id, options, onChange) => {
		let current = options[0]?.value;
		const el = {
			id: id,
			style: {},
			classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
			appendChild: vi.fn(),
		};
		return {
			getElement: () => el,
			value: () => current,
			set: value => {
				current = value;
			},
			select: value => {
				current = value;
				if (onChange) {
					onChange(value);
				}
			},
			setEnabled: vi.fn(),
		};
	}),
	$: vi.fn(() => ({
		style: {},
		classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
		addEventListener: vi.fn(),
		removeEventListener: vi.fn(),
		appendChild: vi.fn(),
		append: vi.fn(),
		prepend: vi.fn(),
		insertBefore: vi.fn(),
		value: 'block',
	})),
	$$: vi.fn(() => ({ textContent: 'mock' })),
	createToggleButton: vi.fn(() => ({
		getElement: vi.fn(() => ({ appendChild: vi.fn(), style: {} })),
		setStateOne: vi.fn(),
		setStateTwo: vi.fn(),
	})),
}));

const mockDocument = {
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	dispatchEvent: vi.fn(),
	createElement: vi.fn(() => ({
		style: {},
		classList: { add: vi.fn(), remove: vi.fn() },
		addEventListener: vi.fn(),
		appendChild: vi.fn(),
	})),
};
vi.stubGlobal('document', mockDocument);

const { createSquareController } = await import(
	'../../src/js/client/freehandTools.js'
);

const handler = name =>
	mockDocument.addEventListener.mock.calls
		.filter(c => c[0] === name)
		.at(-1)[1];

const at = (x, halfBlockY) => ({ detail: { x: x, y: halfBlockY >> 1, halfBlockY: halfBlockY } });

describe('shape drag state lifecycle', () => {
	beforeEach(() => {
		hoisted.draws.length = 0;
	});

	it('forgets a drag that never saw its up when the tool is disabled', () => {
		const square = createSquareController();
		square.enable();
		handler('onTextCanvasDown')(at(20, 16));
		handler('onTextCanvasDrag')(at(30, 20));
		square.disable();
		square.enable();
		handler('onTextCanvasDown')(at(60, 8));
		handler('onTextCanvasUp')();
		const xs = hoisted.draws.map(d => d.x);
		// a stale corner would stretch this tap into a 20..60 box
		expect(Math.min(...xs)).toBeGreaterThanOrEqual(59);
	});

	it('honors a drag that returns to its start cell', () => {
		const square = createSquareController();
		square.enable();
		handler('onTextCanvasDown')(at(5, 8));
		handler('onTextCanvasDrag')(at(10, 8));
		handler('onTextCanvasDrag')(at(5, 8));
		handler('onTextCanvasUp')();
		const xs = hoisted.draws.map(d => d.x);
		// ignoring the move back would commit 5..10
		expect(Math.max(...xs)).toBeLessThanOrEqual(6);
	});
});
