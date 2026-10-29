// Pins move mode's finish and abort contracts with a stateful canvas
// and selection cursor: moveSelection clears the origin as the
// selection drags away, so neither the move mode toggle nor a
// tool-switch abort writes to the canvas. A finalize on disable would
// erase never-moved art when an event hides the rect mid-move, since a
// later shift arrow starts a fresh rect at the cursor.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createSelectionTool } from '../../src/js/client/keyboard.js';
import { createTextArtCanvas } from '../../src/js/client/canvas.js';
import State from '../../src/js/client/state.js';

const COLS = 80;

vi.mock('../../src/js/client/state.js', () => {
	const buffer = new Uint16Array(80 * 25);
	const pack = (charCode, fg, bg) =>
		((charCode << 8) | (bg << 4) | fg) & 0xffff;

	// strokes keep each cell's first before and last after, like
	// core/patchArena.ts, and every flush point the editor has commits
	// the open one
	const strokes = [];
	const redos = [];
	let open = null;
	let writes = 0;
	const put = (i, word) => {
		open ??= new Map();
		if (!open.has(i)) {
			open.set(i, [buffer[i]]);
		}
		buffer[i] = word;
		writes++;
	};
	const flush = () => {
		if (open) {
			open.forEach((patch, i) => {
				patch[1] = buffer[i];
			});
			strokes.push(open);
			redos.length = 0;
			open = null;
		}
	};

	const textArtCanvas = {
		startUndo: vi.fn(flush),
		endUndo: vi.fn(flush),
		undo: () => {
			flush();
			const stroke = strokes.pop();
			if (stroke) {
				stroke.forEach(([before], i) => {
					buffer[i] = before;
				});
				redos.push(stroke);
			}
		},
		redo: () => {
			const stroke = redos.pop();
			if (stroke) {
				stroke.forEach(([, after], i) => {
					buffer[i] = after;
				});
				strokes.push(stroke);
			}
		},
		draw: callback => {
			callback((charCode, fg, bg, x, y) => {
				put(y * 80 + x, pack(charCode, fg, bg));
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
		getAreaCells: (x, y, width, height) => {
			const cells = new Array(width * height);
			for (let dy = 0, j = 0; dy < height; dy++) {
				for (let dx = 0; dx < width; dx++, j++) {
					const w = buffer[(y + dy) * 80 + (x + dx)];
					cells[j] = { charCode: w >> 8, fg: w & 15, bg: (w >> 4) & 15 };
				}
			}
			return { cells, width, height };
		},
		setAreaCells: (area, x, y) => {
			for (let py = 0; py < area.height; py++) {
				for (let px = 0; px < area.width; px++) {
					const c = area.cells[py * area.width + px];
					put((y + py) * 80 + (x + px), pack(c.charCode, c.fg, c.bg));
				}
			}
		},
		deleteArea: (x, y, width, height, background) => {
			for (let dy = y; dy < y + height; dy++) {
				for (let dx = x; dx < x + width; dx++) {
					put(dy * 80 + dx, pack(0, 0, background));
				}
			}
		},
		_buffer: buffer,
		// every undoable write is a draw frame on the wire
		_writes: () => writes,
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
	let everSelected = false;
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
			everSelected = true;
		},
		isVisible: () => visible,
		getPos: () => ({ x: scx, y: scy }),
		getSelection: () =>
			visible ? { x: scx, y: scy, width: w, height: h } : null,
		getLastSelection: () =>
			everSelected ? { x: scx, y: scy, width: w, height: h } : null,
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
				getBackgroundColor: vi.fn(() => 0),
				getRGBAColor: () => [255, 255, 255, 255],
			},
			textArtCanvas,
			font: { getWidth: () => 8, getHeight: () => 16 },
			positionInfo: { update: () => {} },
			selectionCursor,
			cursor,
			pasteTool: { disable: () => {}, setSelection: () => {} },
			modal: { loading: () => {}, close: () => {} },
			loadingFromStorage: false,
			saveToLocalStorage: () => {},
		},
	};
});

// the real canvas renders inert: its font and palette load as stubs
const stubFont = () =>
	Promise.resolve({
		draw: () => {},
		drawWithAlpha: () => {},
		getWidth: () => 8,
		getHeight: () => 16,
		setLetterSpacing: () => {},
		getLetterSpacing: () => false,
	});
vi.mock('../../src/js/client/font.js', () => ({
	loadFontFromImage: () => stubFont(),
	loadFontFromXBData: () => stubFont(),
}));
vi.mock('../../src/js/client/palette.js', () => ({
	createPalette: () => ({ getRGBAColor: () => [255, 255, 255, 255]}),
	createDefaultPalette: () => ({ getRGBAColor: () => [255, 255, 255, 255]}),
}));

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
	isTextEntry: () => false,
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
			fillRect() {},
			drawImage() {},
			putImageData() {},
			createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
			getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
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
	afterEach(() => {
		State.palette.getBackgroundColor.mockReturnValue(0);
	});

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

	it('restores the last selection after a tool switch round trip', () => {
		const tool = createSelectionTool();
		tool.enable();
		State.selectionCursor.setStart(5, 3);
		State.selectionCursor.setEnd(9, 6);
		// the switch away: the keyboard controller's disable hides the
		// rect before this tool's disable runs
		State.selectionCursor.hide();
		tool.disable();
		expect(State.selectionCursor.getSelection()).toBe(null);
		tool.enable();
		expect(State.selectionCursor.getSelection()).toEqual({
			x: 5,
			y: 3,
			width: 5,
			height: 4,
		});
		tool.disable();
	});

	it('moves blank cells transparently over artwork', () => {
		const buf = State.textArtCanvas._buffer;
		// floating 'A' with a SPACE beside it (fg set, bg 0: a scene
		// file blank), moving onto 'B' artwork
		buf[20 * COLS + 10] = (65 << 8) | 7;
		buf[20 * COLS + 11] = (32 << 8) | 7;
		buf[20 * COLS + 30] = (66 << 8) | 7;
		buf[20 * COLS + 31] = (66 << 8) | 7;

		const tool = createSelectionTool();
		tool.enable();
		State.selectionCursor.setStart(10, 20);
		State.selectionCursor.setEnd(11, 20);
		tool.toggleMoveMode();
		const kd = keydownHandlers[keydownHandlers.length - 1];
		for (let i = 0; i < 20; i++) {
			kd(key('ArrowRight'));
		}
		expect(State.selectionCursor.getSelection()).toEqual({
			x: 30,
			y: 20,
			width: 2,
			height: 1,
		});

		const at = x => buf[20 * COLS + x] >> 8;
		// the glyph lands, the art under the blank survives, and the
		// origin is clear
		expect(at(30)).toBe(65);
		expect(at(31)).toBe(66);
		expect([at(10), at(11)]).toEqual([0, 0]);
		tool.toggleMoveMode();
		tool.disable();
	});

	it('restores the rect at the moved position after a move mode abort', () => {
		const buf = State.textArtCanvas._buffer;
		buf[5 * COLS + 20] = (66 << 8) | 7;
		const tool = createSelectionTool();
		tool.enable();
		State.selectionCursor.setStart(20, 5);
		State.selectionCursor.setEnd(20, 5);
		tool.toggleMoveMode();
		const kd = keydownHandlers[keydownHandlers.length - 1];
		kd(key('ArrowDown'));
		kd(key('ArrowDown'));
		State.selectionCursor.hide();
		tool.disable();
		tool.enable();
		expect(State.selectionCursor.getSelection()).toEqual({
			x: 20,
			y: 7,
			width: 1,
			height: 1,
		});
		expect(tool.isMoveMode()).toBe(false);
		expect(buf[7 * COLS + 20] >> 8).toBe(66);
		tool.disable();
	});

	it.each([
		['clear of', 5, [10, 11]],
		['overlapping', 1, [10]],
	])(
		'finishes a move %s its origin without writing, leaving it blank on black under any background',
		(_, steps, vacated) => {
			const buf = State.textArtCanvas._buffer;
			buf[15 * COLS + 10] = (67 << 8) | (2 << 4) | 7;
			buf[15 * COLS + 11] = (67 << 8) | (2 << 4) | 7;
			State.palette.getBackgroundColor.mockReturnValue(4);

			const tool = createSelectionTool();
			tool.enable();
			State.selectionCursor.setStart(10, 15);
			State.selectionCursor.setEnd(11, 15);
			tool.toggleMoveMode();
			const kd = keydownHandlers[keydownHandlers.length - 1];
			for (let i = 0; i < steps; i++) {
				kd(key('ArrowRight'));
			}
			const snapshot = Uint16Array.from(buf);
			const writes = State.textArtCanvas._writes();
			const undoCalls = State.textArtCanvas.startUndo.mock.calls.length;
			tool.toggleMoveMode();

			expect(Uint16Array.from(buf)).toEqual(snapshot);
			expect(State.textArtCanvas._writes()).toBe(writes);
			expect(State.textArtCanvas.startUndo.mock.calls.length).toBe(undoCalls);
			expect(vacated.map(x => buf[15 * COLS + x])).toEqual(vacated.map(() => 0));
			tool.disable();
		},
	);

	it('undoes and redoes a finished move in one step', () => {
		const buf = State.textArtCanvas._buffer;
		buf[18 * COLS + 40] = (68 << 8) | 7;
		buf[18 * COLS + 41] = (68 << 8) | 7;
		buf[19 * COLS + 43] = (69 << 8) | 7;
		const before = Uint16Array.from(buf);

		const tool = createSelectionTool();
		tool.enable();
		State.selectionCursor.setStart(40, 18);
		State.selectionCursor.setEnd(41, 18);
		tool.toggleMoveMode();
		const kd = keydownHandlers[keydownHandlers.length - 1];
		for (const code of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowRight']) {
			kd(key(code));
		}
		tool.toggleMoveMode();
		expect(buf[19 * COLS + 43] >> 8).toBe(68);
		expect(buf[18 * COLS + 40]).toBe(0);
		const moved = Uint16Array.from(buf);

		State.textArtCanvas.undo();
		expect(Uint16Array.from(buf)).toEqual(before);
		State.textArtCanvas.redo();
		expect(Uint16Array.from(buf)).toEqual(moved);
		tool.disable();
	});

	// the real canvas undo and redo, which every entry point calls, with
	// a peer buffer fed the draw packets a collab session would send
	const withLiveCanvas = async body => {
		const container = {
			style: {},
			classList: { add() {}, remove() {} },
			appendChild() {},
			removeChild() {},
			addEventListener() {},
			children: [],
		};
		const live = await new Promise(resolve => {
			const canvas = createTextArtCanvas(container, () => resolve(canvas));
		});
		const peer = Uint16Array.from(live.getImageData());
		const { textArtCanvas, font } = State;
		Object.assign(State, {
			textArtCanvas: live,
			network: {
				draw: cells => {
					for (const { x, y, block: b } of cells) {
						peer[y * COLS + x] = (b.code << 8) | (b.bg << 4) | b.fg;
					}
				},
			},
		});
		const tool = createSelectionTool();
		State.selectionTool = tool;
		try {
			live.startUndo();
			live.draw(draw => {
				for (let x = 10; x < 13; x++) {
					draw(70, 7, 0, x, 4);
					draw(71, 7, 0, x, 5);
				}
			});
			tool.enable();
			State.selectionCursor.setStart(10, 4);
			State.selectionCursor.setEnd(12, 5);
			await body(live, tool, peer);
			tool.disable();
		} finally {
			Object.assign(State, {
				textArtCanvas,
				font,
				network: undefined,
				selectionTool: undefined,
			});
		}
	};

	it('undo mid-move lands the block first, so the next arrow stamps no copy', () =>
		withLiveCanvas((live, tool, peer) => {
			const before = Array.from(live.getImageData());
			tool.toggleMoveMode();
			const kd = keydownHandlers[keydownHandlers.length - 1];
			for (let i = 0; i < 3; i++) {
				kd(key('ArrowRight'));
			}
			expect(live.getBlock(13, 4).charCode).toBe(70);

			live.undo();
			expect(tool.isMoveMode()).toBe(false);
			expect(Array.from(live.getImageData())).toEqual(before);
			expect(Array.from(peer)).toEqual(before);
			kd(key('ArrowRight'));
			expect(Array.from(live.getImageData())).toEqual(before);
		}));

	it('redo before the first step lands the block, so the move carries the redone cells', () =>
		withLiveCanvas((live, tool, peer) => {
			live.startUndo();
			live.draw(draw => draw(90, 7, 0, 11, 4));
			live.undo();

			// the block copy taken here predates the redo
			tool.toggleMoveMode();
			live.redo();
			expect(tool.isMoveMode()).toBe(false);
			expect(live.getBlock(11, 4).charCode).toBe(90);

			tool.toggleMoveMode();
			keydownHandlers[keydownHandlers.length - 1](key('ArrowRight'));
			expect(live.getBlock(12, 4).charCode).toBe(90);
			expect(Array.from(peer)).toEqual(Array.from(live.getImageData()));
		}));
});
