// Pins move mode's abort contract with a stateful canvas and selection
// cursor: moveSelection clears the origin as the selection drags away,
// so a tool-switch abort must not write to the canvas. A finalize on
// disable would erase never-moved art when an event hides the rect
// mid-move, since a later shift arrow starts a fresh rect at the cursor.
import { describe, it, expect, vi } from 'vitest';
import { createSelectionTool } from '../../src/js/client/keyboard.js';
import State from '../../src/js/client/state.js';

const COLS = 80;

vi.mock('../../src/js/client/state.js', () => {
	const buffer = new Uint16Array(80 * 25);
	const pack = (charCode, fg, bg) =>
		((charCode << 8) | (bg << 4) | fg) & 0xffff;

	const textArtCanvas = {
		startUndo: vi.fn(),
		draw: callback => {
			callback((charCode, fg, bg, x, y) => {
				buffer[y * 80 + x] = pack(charCode, fg, bg);
			});
		},
		getBlock: (x, y) => {
			const w = buffer[y * 80 + x];
			return {
				charCode: w >> 8,
				foregroundColor: w & 15,
				backgroundColor: (w >> 4) & 15,
			};
		},
		getColumns: () => 80,
		getRows: () => 25,
		getArea: (x, y, width, height) => {
			const data = new Uint16Array(width * height);
			for (let dy = 0, j = 0; dy < height; dy++) {
				for (let dx = 0; dx < width; dx++, j++) {
					data[j] = buffer[(y + dy) * 80 + (x + dx)];
				}
			}
			return { data, width, height };
		},
		setArea: (area, x, y) => {
			for (let py = 0; py < area.height; py++) {
				for (let px = 0; px < area.width; px++) {
					buffer[(y + py) * 80 + (x + px)] = area.data[py * area.width + px];
				}
			}
		},
		deleteArea: (x, y, width, height, background) => {
			for (let dy = y; dy < y + height; dy++) {
				for (let dx = x; dx < x + width; dx++) {
					buffer[dy * 80 + dx] = pack(0, 0, background);
				}
			}
		},
		_buffer: buffer,
	};

	// stateful stand-in mirroring createSelectionCursor: hide really
	// nulls getSelection, which is what the abort path sees in the app
	let sx = 0,
			sy = 0,
			dx = 0,
			dy = 0,
			scx = 0,
			scy = 0,
			w = 1,
			h = 1;
	let visible = false;
	const processCoords = () => {
		scx = Math.max(Math.min(sx, dx), 0);
		scy = Math.max(Math.min(sy, dy), 0);
		w = Math.min(Math.abs(dx - sx) + 1, 80 - scx);
		h = Math.min(Math.abs(dy - sy) + 1, 25 - scy);
	};
	const selectionCursor = {
		show: () => {},
		hide: () => {
			visible = false;
		},
		setStart: (x, y) => {
			sx = x;
			sy = y;
			processCoords();
			scx = x;
			scy = y;
			w = 1;
			h = 1;
		},
		setEnd: (x, y) => {
			dx = x;
			dy = y;
			processCoords();
			visible = true;
		},
		isVisible: () => visible,
		getPos: () => ({ x: scx, y: scy }),
		getSelection: () =>
			visible ? { x: scx, y: scy, width: w, height: h } : null,
		getElement: () => ({ classList: { add: () => {}, remove: () => {} } }),
	};

	let cx = 0,
			cy = 0;
	const cursor = {
		move: (x, y) => {
			cx = x;
			cy = y;
		},
		getX: () => cx,
		getY: () => cy,
		hide: () => {},
		show: () => {},
	};

	return {
		default: {
			fontWidth: 8,
			fontHeight: 16,
			palette: {
				getForegroundColor: () => 7,
				getBackgroundColor: () => 0,
			},
			textArtCanvas,
			font: { getWidth: () => 8, getHeight: () => 16 },
			positionInfo: { update: () => {} },
			selectionCursor,
			cursor,
			pasteTool: { disable: () => {}, setSelection: () => {} },
		},
	};
});

vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		add: vi.fn(() => ({ enable: vi.fn() })),
		switchTool: vi.fn(),
		returnToPreviousTool: vi.fn(),
	},
}));

// captures the tool's keydown handler so moves run through the real one
const keydownHandlers = [];
vi.stubGlobal('document', {
	createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
	addEventListener: (type, fn) => {
		if (type === 'keydown') {
			keydownHandlers.push(fn);
		}
	},
	removeEventListener: (type, fn) => {
		if (type === 'keydown') {
			const i = keydownHandlers.indexOf(fn);
			if (i >= 0) {
				keydownHandlers.splice(i, 1);
			}
		}
	},
	dispatchEvent: () => {},
});

vi.mock('../../src/js/client/ui.js', () => ({
	$: () => ({
		style: {},
		classList: { add() {}, remove() {} },
		addEventListener() {},
		removeEventListener() {},
		appendChild() {},
		getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
		clientWidth: 100,
		clientHeight: 100,
		scrollTop: 0,
		scrollLeft: 0,
	}),
	$$: () => ({}),
	createCanvas: (width, height) => ({
		width: width || 1,
		height: height || 1,
		style: {},
		classList: { add() {}, remove() {}, contains: () => false },
		getContext: () => ({
			clearRect() {},
			strokeRect() {},
			save() {},
			restore() {},
			setLineDash() {},
		}),
	}),
}));

const key = code => ({
	code,
	key: 'x',
	preventDefault() {},
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	metaKey: false,
});

describe('selection move mode', () => {
	it('clears the origin while moving and writes nothing on a tool-switch abort', () => {
		const buf = State.textArtCanvas._buffer;
		buf[10 * COLS + 10] = (65 << 8) | 7;
		buf[10 * COLS + 11] = (65 << 8) | 7;

		const tool = createSelectionTool();
		tool.enable();
		State.selectionCursor.setStart(10, 10);
		State.selectionCursor.setEnd(11, 10);
		tool.toggleMoveMode();
		const kd = keydownHandlers[keydownHandlers.length - 1];
		for (let i = 0; i < 5; i++) {
			kd(key('ArrowRight'));
		}
		expect(State.selectionCursor.getSelection()).toEqual({
			x: 15,
			y: 10,
			width: 2,
			height: 1,
		});

		const at = (x, y) => buf[y * COLS + x] >> 8;
		// the origin is clear BEFORE any disable: moveSelection restores
		// the seeded empty area at the old spot on the first step
		expect([at(10, 10), at(11, 10)]).toEqual([0, 0]);
		expect([at(15, 10), at(16, 10)]).toEqual([65, 65]);

		// a tool switch runs the keyboard controller's disable first,
		// which hides the rect before this tool's disable sees it
		State.selectionCursor.hide();
		const snapshot = Uint16Array.from(buf);
		const undoCalls = State.textArtCanvas.startUndo.mock.calls.length;
		tool.disable();

		expect(State.textArtCanvas.startUndo.mock.calls.length).toBe(undoCalls);
		expect(Uint16Array.from(buf)).toEqual(snapshot);
	});
});
