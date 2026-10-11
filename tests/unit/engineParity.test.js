/**
 * P2 GATE: scripted-stroke identity, v2 engine vs v3 editor core
 * (PLAN.md §4 P2). The same seeded op script runs against the real v2
 * textArtCanvas (jsdom, rendering mocked inert) and against
 * createEditorCore over a v3 doc; after EVERY op the full u16 image is
 * compared word-for-word. Covers draws, half-block painting, mirror
 * mode, the bright-bg optimize pass, areas, delete, network quickDraw,
 * undo/redo group boundaries, and ice toggles.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: {
			draw: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		},
		palette: {
			getRGBAColor: vi.fn(() => [255, 255, 255, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		},
		modal: { loading: vi.fn(), close: vi.fn() },
		loadingFromStorage: false,
		saveToLocalStorage: vi.fn(),
		saveUndoHistory: vi.fn(),
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(() => ({
		style: {},
		classList: { add: vi.fn(), remove: vi.fn() },
		appendChild: vi.fn(),
		addEventListener: vi.fn(),
	})),
	createCanvas: vi.fn(() => ({
		width: 640,
		height: 400,
		style: {},
		getContext: vi.fn(() => ({
			fillRect: vi.fn(),
			clearRect: vi.fn(),
			drawImage: vi.fn(),
			createImageData: vi.fn((w, h) => ({
				data: new Uint8ClampedArray(w * h * 4),
				width: w,
				height: h,
			})),
			putImageData: vi.fn(),
			getImageData: vi.fn((_x, _y, w, h) => ({
				data: new Uint8ClampedArray(w * h * 4),
				width: w,
				height: h,
			})),
		})),
	})),
}));

vi.mock('../../src/js/client/font.js', () => ({
	loadFontFromImage: vi.fn(() =>
		Promise.resolve({
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		})),
	loadFontFromXBData: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../src/js/client/palette.js', () => ({
	createPalette: vi.fn(() => ({ getRGBAColor: vi.fn(() => [255, 255, 255, 255]) })),
	createDefaultPalette: vi.fn(() => ({ getRGBAColor: vi.fn(() => [255, 255, 255, 255]) })),
}));

import { createTextArtCanvas } from '../../src/js/client/canvas.js';
import { createDocV3, createEditorCore } from '../../src/js/core/index';

const COLUMNS = 40;
const ROWS = 30;

/** mulberry32: deterministic script, same every run. */
const prng = seed => {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const makeV2 = () =>
	new Promise(resolve => {
		const container = {
			style: {},
			classList: { add: vi.fn(), remove: vi.fn() },
			appendChild: vi.fn(),
			removeChild: vi.fn(),
			addEventListener: vi.fn(),
			children: [],
		};
		const canvas = createTextArtCanvas(container, () => resolve(canvas));
	});

describe('engine parity: v2 canvas vs v3 editor core', () => {
	it('a 400-op seeded script leaves both engines word-identical', async () => {
		const v2 = await makeV2();
		v2.resize(COLUMNS, ROWS);

		const doc = createDocV3({ columns: COLUMNS, rows: ROWS });
		const v3 = createEditorCore(doc);

		const rand = prng(0x7e57);
		const randInt = max => Math.floor(rand() * max);
		let clipboard = null;

		const compare = opIndex => {
			const a = Array.from(v2.getImageData());
			const b = Array.from(v3.toU16().imageData);
			if (a.length !== b.length) {
				throw new Error(`op ${opIndex}: length ${a.length} vs ${b.length}`);
			}
			for (let i = 0; i < a.length; i++) {
				if (a[i] !== b[i]) {
					throw new Error(
						`op ${opIndex}: cell ${i} v2=0x${a[i].toString(16)} v3=0x${b[i].toString(16)}`,
					);
				}
			}
		};

		const ops = [
			// scattered block draws (sometimes with the optimize pass)
			() => {
				const optimise = rand() < 0.3;
				const writes = [];
				for (let n = 0; n < 1 + randInt(12); n++) {
					writes.push([
						randInt(256),
						randInt(16),
						randInt(16),
						randInt(COLUMNS),
						randInt(ROWS),
					]);
				}
				v2.startUndo();
				v2.draw(cb => writes.forEach(w => cb(...w)), optimise);
				v3.startUndo();
				v3.drawBlocks(cb => writes.forEach(w => cb(...w)), optimise);
			},
			// half-block strokes
			() => {
				const writes = [];
				for (let n = 0; n < 1 + randInt(16); n++) {
					writes.push([randInt(16), randInt(COLUMNS), randInt(ROWS * 2)]);
				}
				v2.startUndo();
				v2.drawHalfBlock(cb => writes.forEach(w => cb(...w)));
				v3.startUndo();
				v3.drawHalfBlocks(cb => writes.forEach(w => cb(...w)));
			},
			// delete a region
			() => {
				const x = randInt(COLUMNS - 4);
				const y = randInt(ROWS - 4);
				const w = 1 + randInt(4);
				const h = 1 + randInt(4);
				const bg = randInt(16);
				v2.startUndo();
				v2.deleteArea(x, y, w, h, bg);
				v3.startUndo();
				v3.deleteArea(x, y, w, h, bg);
			},
			// copy then paste elsewhere
			() => {
				const x = randInt(COLUMNS - 6);
				const y = randInt(ROWS - 6);
				clipboard = v2.getArea(x, y, 1 + randInt(6), 1 + randInt(6));
				const v3Area = v3.getAreaU16(
					x,
					y,
					clipboard.width,
					clipboard.height,
				);
				expect(Array.from(v3Area.data)).toEqual(Array.from(clipboard.data));
				const px = randInt(COLUMNS - 1);
				const py = randInt(ROWS - 1);
				v2.startUndo();
				v2.setArea(clipboard, px, py);
				v3.startUndo();
				v3.setAreaU16(v3Area, px, py);
			},
			// network write, never undoable
			() => {
				const blocks = [];
				for (let n = 0; n < 1 + randInt(6); n++) {
					const x = randInt(COLUMNS);
					const y = randInt(ROWS);
					const word =
						(randInt(256) << 8) | (randInt(16) << 4) | randInt(16);
					blocks.push([y * COLUMNS + x, word, x, y]);
				}
				v2.quickDraw(blocks);
				v3.quickDrawU16(blocks);
			},
			// undo a few groups
			() => {
				const n = 1 + randInt(3);
				for (let i = 0; i < n; i++) {
					v2.undo();
					v3.undo();
				}
			},
			// redo a few groups
			() => {
				const n = 1 + randInt(3);
				for (let i = 0; i < n; i++) {
					v2.redo();
					v3.redo();
				}
			},
			// mirror mode flip
			() => {
				const enabled = rand() < 0.5;
				v2.setMirrorMode(enabled);
				v3.setMirrorMode(enabled);
			},
			// ice colors flip (v2 flips a flag; v3 refolds the planes)
			() => {
				const ice = rand() < 0.5;
				v2.setIceColors(ice);
				v3.setIceColors(ice);
			},
		];

		for (let op = 0; op < 400; op++) {
			const pick = randInt(ops.length);
			ops[pick]();
			compare(`${op} (kind ${pick})`);
			expect(v2.getIceColors()).toBe(doc.getIceColors());
		}

		// spot-check the read APIs against each other on the final state
		for (let n = 0; n < 200; n++) {
			const x = randInt(COLUMNS);
			const y = randInt(ROWS);
			expect(v3.getBlock(x, y)).toEqual(v2.getBlock(x, y));
			const hy = randInt(ROWS * 2);
			const a = v2.getHalfBlock(x, hy);
			const b = v3.getHalfBlockAt(x, hy);
			expect(b.isBlocky).toBe(a.isBlocky);
			expect(b.isVerticalBlocky).toBe(a.isVerticalBlocky);
			if (a.isBlocky) {
				expect(b.upperBlockColor).toBe(a.upperBlockColor);
				expect(b.lowerBlockColor).toBe(a.lowerBlockColor);
			}
			if (a.isVerticalBlocky) {
				expect(b.leftBlockColor).toBe(a.leftBlockColor);
				expect(b.rightBlockColor).toBe(a.rightBlockColor);
			}
		}
	}, 30000);

	it('undo depth and group boundaries stay aligned through deep rewind', async () => {
		const v2 = await makeV2();
		v2.resize(10, 10);
		const doc = createDocV3({ columns: 10, rows: 10 });
		const v3 = createEditorCore(doc);

		for (let stroke = 0; stroke < 20; stroke++) {
			v2.startUndo();
			v3.startUndo();
			const writes = [[65 + stroke, stroke % 16, 0, stroke % 10, stroke % 10]];
			v2.draw(cb => writes.forEach(w => cb(...w)));
			v3.drawBlocks(cb => writes.forEach(w => cb(...w)));
		}
		// rewind everything, then replay everything
		for (let i = 0; i < 25; i++) {
			v2.undo();
			v3.undo();
		}
		expect(Array.from(v3.toU16().imageData)).toEqual(
			Array.from(v2.getImageData()),
		);
		for (let i = 0; i < 25; i++) {
			v2.redo();
			v3.redo();
		}
		expect(Array.from(v3.toU16().imageData)).toEqual(
			Array.from(v2.getImageData()),
		);
		// a new stroke kills the redo tail in both engines
		v2.undo();
		v3.undo();
		v2.startUndo();
		v3.startUndo();
		v2.draw(cb => cb(88, 7, 0, 5, 5));
		v3.drawBlocks(cb => cb(88, 7, 0, 5, 5));
		v2.redo();
		v3.redo();
		expect(Array.from(v3.toU16().imageData)).toEqual(
			Array.from(v2.getImageData()),
		);
	});
});
