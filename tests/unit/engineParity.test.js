/**
 * Scripted-stroke identity gate: one seeded op script
 * runs against the live v2 textArtCanvas (jsdom, rendering mocked
 * inert), the frozen v2 reference (tests/parity), and the v3 editor
 * core over the three-plane doc; the full u16 image must match
 * word-for-word after every op. The frozen reference keeps the gate
 * meaningful if canvas.js itself swaps engines. Covers draws,
 * half-block painting, mirror mode, the bright-bg optimize pass,
 * areas, delete, network quickDraw, undo/redo group boundaries, and
 * ice toggles.
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
		modal: {
			loading: vi.fn(),
			close: vi.fn(),
			isOpen: vi.fn(() => false),
			current: vi.fn(() => false),
		},
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
import { createV2ReferenceEngine } from '../parity/v2ReferenceEngine.js';

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

/** Adapt the v3 core to the common v2-shaped surface. */
const wrapV3 = () => {
	const doc = createDocV3({ columns: COLUMNS, rows: ROWS });
	const v3 = createEditorCore(doc);
	return {
		name: 'v3-core',
		draw: v3.drawBlocks,
		drawHalfBlock: v3.drawHalfBlocks,
		deleteArea: v3.deleteArea,
		getArea: v3.getAreaU16,
		setArea: v3.setAreaU16,
		quickDraw: v3.quickDrawU16,
		startUndo: v3.startUndo,
		undo: v3.undo,
		redo: v3.redo,
		setMirrorMode: v3.setMirrorMode,
		setIceColors: v3.setIceColors,
		getIceColors: () => doc.getIceColors(),
		getBlock: v3.getBlock,
		getHalfBlock: v3.getHalfBlockAt,
		getImageData: () => v3.toU16().imageData,
	};
};

const buildEngines = async () => {
	const live = await makeV2();
	live.resize(COLUMNS, ROWS);
	live.name = 'v2-live';
	// the canvas area ops went plane native (selection fidelity); the
	// parity script speaks u16, and on classic content the EditCell
	// nibble mapping is exact, so these adapters stay lossless here
	live.getArea = (x, y, w, h) => {
		const area = live.getAreaCells(x, y, w, h);
		const data = new Uint16Array(w * h);
		for (let i = 0; i < data.length; i++) {
			const c = area.cells[i];
			data[i] = ((c.charCode & 0xff) << 8) | ((c.bg & 15) << 4) | (c.fg & 15);
		}
		return { data, width: w, height: h };
	};
	live.setArea = (area, x, y) =>
		live.setAreaCells(
			{
				cells: Array.from(area.data, word => ({
					charCode: word >> 8,
					fg: word & 15,
					bg: (word >> 4) & 15,
				})),
				width: area.width,
				height: area.height,
			},
			x,
			y,
		);
	const reference = createV2ReferenceEngine(COLUMNS, ROWS);
	reference.name = 'v2-reference';
	return [live, reference, wrapV3()];
};

describe('engine parity: v2 live vs v2 reference vs v3 core', () => {
	it('a 400-op seeded script leaves all engines word-identical', async () => {
		const engines = await buildEngines();

		const rand = prng(0x7e57);
		const randInt = max => Math.floor(rand() * max);

		const compare = opIndex => {
			const base = Array.from(engines[0].getImageData());
			for (const engine of engines.slice(1)) {
				const image = Array.from(engine.getImageData());
				if (image.length !== base.length) {
					throw new Error(
						`op ${opIndex}: ${engine.name} length ${image.length} vs ${base.length}`,
					);
				}
				for (let i = 0; i < base.length; i++) {
					if (base[i] !== image[i]) {
						throw new Error(
							`op ${opIndex}: cell ${i} ${engines[0].name}=0x${base[i].toString(16)} ${engine.name}=0x${image[i].toString(16)}`,
						);
					}
				}
				if (engine.getIceColors() !== engines[0].getIceColors()) {
					throw new Error(`op ${opIndex}: ${engine.name} ice flag diverged`);
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
				for (const engine of engines) {
					engine.startUndo();
					engine.draw(cb => writes.forEach(w => cb(...w)), optimise);
				}
			},
			// half-block strokes
			() => {
				const writes = [];
				for (let n = 0; n < 1 + randInt(16); n++) {
					writes.push([randInt(16), randInt(COLUMNS), randInt(ROWS * 2)]);
				}
				for (const engine of engines) {
					engine.startUndo();
					engine.drawHalfBlock(cb => writes.forEach(w => cb(...w)));
				}
			},
			// delete a region
			() => {
				const x = randInt(COLUMNS - 4);
				const y = randInt(ROWS - 4);
				const w = 1 + randInt(4);
				const h = 1 + randInt(4);
				const bg = randInt(16);
				for (const engine of engines) {
					engine.startUndo();
					engine.deleteArea(x, y, w, h, bg);
				}
			},
			// copy then paste elsewhere
			() => {
				const x = randInt(COLUMNS - 6);
				const y = randInt(ROWS - 6);
				const w = 1 + randInt(6);
				const h = 1 + randInt(6);
				const px = randInt(COLUMNS - 1);
				const py = randInt(ROWS - 1);
				const base = engines[0].getArea(x, y, w, h);
				for (const engine of engines) {
					const area = engine.getArea(x, y, w, h);
					expect(Array.from(area.data)).toEqual(Array.from(base.data));
					engine.startUndo();
					engine.setArea(area, px, py);
				}
			},
			// network write, never undoable
			() => {
				const blocks = [];
				for (let n = 0; n < 1 + randInt(6); n++) {
					const x = randInt(COLUMNS);
					const y = randInt(ROWS);
					const word = (randInt(256) << 8) | (randInt(16) << 4) | randInt(16);
					blocks.push([y * COLUMNS + x, word, x, y]);
				}
				for (const engine of engines) {
					engine.quickDraw(blocks);
				}
			},
			// undo a few groups
			() => {
				const n = 1 + randInt(3);
				for (let i = 0; i < n; i++) {
					for (const engine of engines) {
						engine.undo();
					}
				}
			},
			// redo a few groups
			() => {
				const n = 1 + randInt(3);
				for (let i = 0; i < n; i++) {
					for (const engine of engines) {
						engine.redo();
					}
				}
			},
			// mirror mode flip
			() => {
				const enabled = rand() < 0.5;
				for (const engine of engines) {
					engine.setMirrorMode(enabled);
				}
			},
			// ice colors flip (v2 flips a flag; v3 refolds the planes)
			() => {
				const ice = rand() < 0.5;
				for (const engine of engines) {
					engine.setIceColors(ice);
				}
			},
		];

		for (let op = 0; op < 400; op++) {
			const pick = randInt(ops.length);
			ops[pick]();
			compare(`${op} (kind ${pick})`);
		}

		// spot-check the read APIs against each other on the final state
		const [base, ...rest] = engines;
		for (let n = 0; n < 200; n++) {
			const x = randInt(COLUMNS);
			const y = randInt(ROWS);
			const hy = randInt(ROWS * 2);
			const block = base.getBlock(x, y);
			const half = base.getHalfBlock(x, hy);
			for (const engine of rest) {
				expect(engine.getBlock(x, y)).toEqual(block);
				const b = engine.getHalfBlock(x, hy);
				expect(b.isBlocky).toBe(half.isBlocky);
				expect(b.isVerticalBlocky).toBe(half.isVerticalBlocky);
				if (half.isBlocky) {
					expect(b.upperBlockColor).toBe(half.upperBlockColor);
					expect(b.lowerBlockColor).toBe(half.lowerBlockColor);
				}
				if (half.isVerticalBlocky) {
					expect(b.leftBlockColor).toBe(half.leftBlockColor);
					expect(b.rightBlockColor).toBe(half.rightBlockColor);
				}
			}
		}
	}, 30000);

	it('undo depth and group boundaries stay aligned through deep rewind', async () => {
		const engines = await buildEngines();
		const expectAligned = () => {
			const base = Array.from(engines[0].getImageData());
			for (const engine of engines.slice(1)) {
				expect(Array.from(engine.getImageData())).toEqual(base);
			}
		};

		for (let stroke = 0; stroke < 20; stroke++) {
			const writes = [[65 + stroke, stroke % 16, 0, stroke % 10, stroke % 10]];
			for (const engine of engines) {
				engine.startUndo();
				engine.draw(cb => writes.forEach(w => cb(...w)));
			}
		}
		for (let i = 0; i < 25; i++) {
			for (const engine of engines) {
				engine.undo();
			}
		}
		expectAligned();
		for (let i = 0; i < 25; i++) {
			for (const engine of engines) {
				engine.redo();
			}
		}
		expectAligned();
		// a new stroke kills the redo tail in every engine
		for (const engine of engines) {
			engine.undo();
			engine.startUndo();
			engine.draw(cb => cb(88, 7, 0, 5, 5));
			engine.redo();
		}
		expectAligned();
	});
});
