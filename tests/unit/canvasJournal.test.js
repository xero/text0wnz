/**
 * Autosave journal wiring through the live canvas: strokes append on
 * commit, doc-level ops write debounced keyframes, loadJournalSnapshot
 * restores, and collab sessions never journal. Runs on the real
 * journalStore (jsdom auto-picks the in-memory backend).
 */
import { describe, it, expect, vi } from 'vitest';

const stateMock = vi.hoisted(() => ({
	font: {
		draw: () => {},
		getWidth: () => 8,
		getHeight: () => 16,
		setLetterSpacing: () => {},
		getLetterSpacing: () => false,
	},
	palette: {
		getRGBAColor: () => [255, 255, 255, 255],
		getForegroundColor: () => 7,
		getBackgroundColor: () => 0,
	},
	modal: { loading: () => {}, close: () => {} },
	loadingFromStorage: false,
	saveToLocalStorage: () => {},
	saveUndoHistory: () => {},
	network: null,
}));

vi.mock('../../src/js/client/state.js', () => ({ default: stateMock }));

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
import { v3ToU16Lossy } from '../../src/js/core/index';
import magicNumbers from '../../src/js/client/magicNumbers.js';

const makeCanvas = () =>
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

const settle = () =>
	new Promise(resolve =>
		setTimeout(resolve, magicNumbers.JOURNAL_KEYFRAME_DEBOUNCE_MS + 150));

describe('canvas autosave journal wiring', () => {
	it('journals strokes + session keyframe and restores the drawing', async () => {
		const canvas = await makeCanvas();
		expect(await canvas.loadJournalSnapshot()).toBeNull();

		canvas.startUndo();
		canvas.draw(cb => {
			cb(219, 14, 1, 3, 2);
			cb(176, 7, 0, 4, 2);
		});
		// strokes commit at the next startUndo boundary (v2 semantics);
		// the first commit schedules the session keyframe
		canvas.startUndo();
		await settle();

		// a stroke committed AFTER the keyframe lands as an appended record
		canvas.draw(cb => cb(88, 12, 0, 0, 0));
		canvas.startUndo();
		await new Promise(resolve => setTimeout(resolve, 50)); // append chain

		const snapshot = await canvas.loadJournalSnapshot();
		expect(snapshot).not.toBeNull();
		expect(snapshot.doc.getColumns()).toBe(80);
		expect(snapshot.doc.getRows()).toBe(25);
		expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(
			Array.from(canvas.getImageData()),
		);
	});

	it('undo rewrites the keyframe so replay matches the rewound doc', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 3, 2));
		canvas.startUndo();
		canvas.draw(cb => cb(177, 7, 0, 5, 5));
		canvas.undo();
		await settle();

		const snapshot = await canvas.loadJournalSnapshot();
		const u16 = v3ToU16Lossy(snapshot.doc);
		expect(Array.from(u16.imageData)).toEqual(
			Array.from(canvas.getImageData()),
		);
		expect(u16.imageData[5 * 80 + 5]).toBe(0);
	});

	it('never journals while a collab session is connected', async () => {
		const canvas = await makeCanvas();
		stateMock.network = { isConnected: () => true };
		try {
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			await settle();
			expect(await canvas.loadJournalSnapshot()).toBeNull();
		} finally {
			stateMock.network = null;
		}
	});

	it('restores iceColors through the snapshot', async () => {
		const canvas = await makeCanvas();
		canvas.setIceColors(true);
		canvas.startUndo();
		canvas.draw(cb => cb(219, 7, 9, 1, 1)); // bright bg, legal under ice
		await settle();

		const snapshot = await canvas.loadJournalSnapshot();
		expect(snapshot.doc.getIceColors()).toBe(true);
		expect(v3ToU16Lossy(snapshot.doc).imageData[1 * 80 + 1]).toBe(
			(219 << 8) | (9 << 4) | 7,
		);
	});

	it('restores every frame of an animation, not frame 0 alone', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 3, 2));
		canvas.startUndo();
		canvas.addFrame();
		canvas.draw(cb => cb(177, 7, 0, 5, 5));
		canvas.startUndo();
		await settle();

		const snapshot = await canvas.loadJournalSnapshot();
		expect(snapshot).not.toBeNull();
		expect(snapshot.doc.frames.length).toBe(2);
	});

	it('a stroke right after a resize survives the restore', async () => {
		const canvas = await makeCanvas();
		canvas.resize(40, 20);
		// no settle: the stroke lands inside the keyframe window, where
		// an appended record would replay against the pre-resize grid
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 39, 19));
		canvas.startUndo();
		await settle();

		const snapshot = await canvas.loadJournalSnapshot();
		expect(snapshot.doc.getColumns()).toBe(40);
		expect(v3ToU16Lossy(snapshot.doc).imageData[19 * 40 + 39]).toBe(
			(219 << 8) | (1 << 4) | 14,
		);
	});
});
