/**
 * Runs on the real journalStore: jsdom auto-picks the in-memory
 * backend. A reload test hands two canvases one shared backend.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

// A test can hold a keyframe's encode open to commit strokes inside
// its gzip window, or count the keyframes taken of a doc. The real
// createJournal still runs at call time, so the snapshot timing stays
// the production one.
const encodes = vi.hoisted(() => ({ held: [], docs: [], hold: false }));

vi.mock('../../src/js/core/index', async importOriginal => {
	const actual = await importOriginal();
	return {
		...actual,
		createJournal: (...args) => {
			encodes.docs.push(args[0]);
			const bytes = actual.createJournal(...args);
			return encodes.hold
				? new Promise((resolve, reject) =>
						encodes.held.push({
							release: () => resolve(bytes),
							fail: () => reject(new Error('encode failed')),
						}))
				: bytes;
		},
	};
});

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
	network: null,
}));

vi.mock('../../src/js/client/state.js', () => ({ default: stateMock }));

// a test can count the strokes a canvas hands its store, which encode
// in the call's own task
const disk = vi.hoisted(() => ({ backend: null, last: null }));

vi.mock('../../src/js/client/journalStore.js', async importOriginal => {
	const actual = await importOriginal();
	return {
		...actual,
		createJournalStore: options => {
			const store = actual.createJournalStore({
				backend: disk.backend ?? undefined,
				...options,
			});
			const { appendStroke } = store;
			store.appended = 0;
			store.appendStroke = bytes => {
				store.appended += 1;
				return appendStroke(bytes);
			};
			disk.last = store;
			return store;
		},
	};
});

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
			getData: vi.fn(() => ({ width: 8, height: 16 })),
			dispose: vi.fn(),
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
import { createMemoryBackend } from '../../src/js/client/journalStore.js';
import { DEFAULT_COMPACT_STROKES, v3ToU16Lossy } from '../../src/js/core/index';
import magicNumbers from '../../src/js/client/magicNumbers.js';

const stores = new WeakMap();

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
		stores.set(canvas, disk.last);
	});

const appendsOf = canvas => stores.get(canvas).appended;

const settle = () =>
	new Promise(resolve =>
		setTimeout(resolve, magicNumbers.JOURNAL_KEYFRAME_DEBOUNCE_MS + 150));

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));

describe('canvas autosave journal wiring', () => {
	afterEach(() => {
		encodes.hold = false;
		encodes.held.splice(0).forEach(encode => encode.release());
		encodes.docs.length = 0;
	});

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

	it('a stopped journal lets go of the store and keeps later docs and strokes out of the autosave', async () => {
		const memory = createMemoryBackend();
		const close = vi.fn(memory.close);
		disk.backend = { ...memory, close };
		try {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();
			const art = Array.from(canvas.getImageData());

			// the stroke goes first: behind a doc load it waits for the load's
			// keyframe instead of appending, so a stroke-side leak hides
			await canvas.stopJournal();
			expect(close).toHaveBeenCalledTimes(1);
			canvas.startUndo();
			canvas.draw(cb => cb(88, 12, 0, 1, 1));
			canvas.startUndo();
			canvas.setImageData(4, 2, new Uint16Array(8).fill(0x58f0), false);
			await settle();

			const snapshot = await (await makeCanvas()).loadJournalSnapshot();
			expect(snapshot.doc.getColumns()).toBe(80);
			expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(art);
		} finally {
			disk.backend = null;
		}
	});

	it('a wiped journal restores nothing, and the next stroke reaches it through a keyframe', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 3, 2));
		canvas.startUndo();
		await settle();

		await canvas.wipeJournal();
		expect(await canvas.loadJournalSnapshot()).toBeNull();
		canvas.draw(cb => cb(88, 12, 0, 5, 5));
		canvas.startUndo();
		await settle();
		const snapshot = await canvas.loadJournalSnapshot();
		expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(
			Array.from(canvas.getImageData()),
		);
	});

	it('a keyframe still waiting when the journal is wiped never writes the doc back', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 3, 2));
		canvas.startUndo();
		canvas.draw(cb => cb(88, 12, 0, 5, 5));
		canvas.startUndo();
		await settle();
		// an undo's keyframe waits out the debounce
		canvas.undo();
		canvas.wipeJournal();
		await settle();
		expect(await canvas.loadJournalSnapshot()).toBeNull();
	});

	it('a stroke still open at a wipe commits ahead of it, so New never gets the old doc back', async () => {
		const palette = stateMock.palette;
		try {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();

			// File > New with the last stroke still open: the wipe, the XB
			// clear, then an idle commit while the font loads
			canvas.draw(cb => cb(88, 12, 0, 5, 5));
			canvas.wipeJournal();
			canvas.clearXBData();
			await settle();
			expect(await canvas.loadJournalSnapshot()).toBeNull();
		} finally {
			stateMock.palette = palette;
		}
	});

	it('an append ahead of a wipe that makes compaction due leaves the journal empty', async () => {
		const canvas = await makeCanvas();
		canvas.draw(cb => cb(219, 14, 1, 0, 0));
		canvas.startUndo();
		await settle();
		for (let i = 1; i < DEFAULT_COMPACT_STROKES; i++) {
			canvas.draw(cb => cb(65 + (i % 26), 7, 0, i % 80, Math.floor(i / 80)));
			canvas.startUndo();
		}
		await tick(50);
		// the open stroke's append is the one that reaches the limit
		canvas.draw(cb => cb(88, 12, 0, 79, 24));
		canvas.wipeJournal();
		await settle();
		expect(await canvas.loadJournalSnapshot()).toBeNull();
	});

	it('a clear after the journal stopped still empties the autosave', async () => {
		disk.backend = createMemoryBackend();
		try {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();

			// a failed restore stops the journal, and the reset clears it
			canvas.stopJournal();
			await canvas.wipeJournal();
			expect(await (await makeCanvas()).loadJournalSnapshot()).toBeNull();
		} finally {
			disk.backend = null;
		}
	});

	it('clearing XB data leaves its keyframe to the clear or load that follows', async () => {
		const palette = stateMock.palette;
		try {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();

			// File > New: the wipe, then the XB clear, then a font load
			// before the clear
			canvas.wipeJournal();
			canvas.clearXBData();
			await settle();
			expect(await canvas.loadJournalSnapshot()).toBeNull();
			canvas.clear();
			await settle();
			const { doc } = await canvas.loadJournalSnapshot();
			expect(v3ToU16Lossy(doc).imageData.every(word => word === 0)).toBe(true);
		} finally {
			stateMock.palette = palette;
		}
	});

	it('a keyframe on leaving a session journals the doc on screen', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 3, 2));
		canvas.startUndo();
		await settle();

		stateMock.network = { isConnected: () => true };
		try {
			// the join's load, then a stroke in the session
			canvas.setImageData(80, 25, new Uint16Array(80 * 25).fill((66 << 8) | 7), false);
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 9, 9));
			canvas.startUndo();
			await settle();
		} finally {
			stateMock.network = null;
		}
		canvas.journalKeyframe();
		await tick(50);
		const snapshot = await canvas.loadJournalSnapshot();
		expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(
			Array.from(canvas.getImageData()),
		);
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

	it('an undo or redo of a resize alone journals the size it lands on', async () => {
		const canvas = await makeCanvas();
		const cut = (219 << 8) | (1 << 4) | 14;
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 70, 22));
		canvas.startUndo();
		canvas.resize(40, 20);
		await settle();
		const reload = async () => {
			const { doc } = await canvas.loadJournalSnapshot();
			return {
				size: [doc.getColumns(), doc.getRows()],
				u16: v3ToU16Lossy(doc).imageData,
			};
		};

		canvas.undo();
		await settle();
		let journaled = await reload();
		expect(journaled.size).toEqual([80, 25]);
		expect(journaled.u16[22 * 80 + 70]).toBe(cut);

		canvas.redo();
		await settle();
		journaled = await reload();
		expect(journaled.size).toEqual([40, 20]);
		expect(Array.from(journaled.u16)).toEqual(Array.from(canvas.getImageData()));
	});

	it('undoing a resize restores its geometry and cut cells on reload', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 70, 22));
		canvas.startUndo();
		await settle();
		canvas.resize(40, 20);
		await settle();
		// a stroke appended at 40x20, then undone along with the resize
		canvas.draw(cb => cb(177, 7, 0, 39, 19));
		canvas.startUndo();
		await new Promise(resolve => setTimeout(resolve, 50));
		canvas.undo();
		canvas.undo();
		// no settle: this 80x25 stroke lands inside the keyframe window,
		// where appending it would replay against the 40x20 journal
		canvas.draw(cb => cb(88, 12, 0, 5, 24));
		canvas.startUndo();
		await settle();

		const snapshot = await canvas.loadJournalSnapshot();
		expect([snapshot.doc.getColumns(), snapshot.doc.getRows()]).toEqual([80, 25]);
		const u16 = v3ToU16Lossy(snapshot.doc).imageData;
		expect(Array.from(u16)).toEqual(Array.from(canvas.getImageData()));
		expect(u16[22 * 80 + 70]).toBe((219 << 8) | (1 << 4) | 14);
		expect(u16[24 * 80 + 5]).toBe((88 << 8) | 12);
		expect(u16[19 * 80 + 39]).toBe(0);
	});

	it('a stroke committed while a resize keyframe encodes lands right behind it', async () => {
		const canvas = await makeCanvas();
		encodes.hold = true;
		canvas.resize(40, 20);
		await tick();
		expect(encodes.held).toHaveLength(1);
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 39, 19));
		canvas.startUndo();
		encodes.held[0].release();
		await tick(50);

		// no second keyframe: the journal holds the stroke already
		expect(encodes.held).toHaveLength(1);
		const snapshot = await canvas.loadJournalSnapshot();
		expect([snapshot.doc.getColumns(), snapshot.doc.getRows()]).toEqual([40, 20]);
		expect(v3ToU16Lossy(snapshot.doc).imageData[19 * 40 + 39]).toBe(
			(219 << 8) | (1 << 4) | 14,
		);
	});

	it('a stroke committed while a compaction keyframe encodes survives the rewrite', async () => {
		const canvas = await makeCanvas();
		canvas.startUndo();
		canvas.draw(cb => cb(219, 14, 1, 0, 0));
		canvas.startUndo();
		await settle();
		for (let i = 1; i <= DEFAULT_COMPACT_STROKES; i++) {
			canvas.draw(cb => cb(65 + (i % 26), 7, 0, i % 80, Math.floor(i / 80)));
			canvas.startUndo();
		}
		encodes.hold = true;
		await settle();
		expect(encodes.held).toHaveLength(1);
		canvas.draw(cb => cb(88, 12, 0, 79, 24));
		canvas.startUndo();
		encodes.held[0].release();
		await tick(50);

		expect(encodes.held).toHaveLength(1);
		const snapshot = await canvas.loadJournalSnapshot();
		expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(
			Array.from(canvas.getImageData()),
		);
	});

	it('a stroke behind a failed keyframe never lands on the stale journal, and a fresh keyframe recovers it', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();
			encodes.hold = true;
			canvas.resize(40, 20);
			await tick();
			canvas.startUndo();
			canvas.draw(cb => cb(177, 7, 0, 39, 19));
			canvas.startUndo();
			encodes.held[0].fail();
			await tick(50);

			expect(warn).toHaveBeenCalledWith(
				'[Canvas] journal keyframe failed:',
				expect.any(Error),
			);
			// replayed on the 80x25 journal, the 40x20 stroke lands at (79, 9)
			let snapshot = await canvas.loadJournalSnapshot();
			expect([snapshot.doc.getColumns(), snapshot.doc.getRows()]).toEqual([80, 25]);
			expect(v3ToU16Lossy(snapshot.doc).imageData[19 * 40 + 39]).toBe(0);

			await settle();
			expect(encodes.held).toHaveLength(2);
			encodes.held[1].release();
			await tick(50);
			snapshot = await canvas.loadJournalSnapshot();
			expect([snapshot.doc.getColumns(), snapshot.doc.getRows()]).toEqual([40, 20]);
			expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(
				Array.from(canvas.getImageData()),
			);
		} finally {
			warn.mockRestore();
		}
	});

	it('a stroke whose append fails comes back through a keyframe', async () => {
		const memory = createMemoryBackend();
		let diskFull = false;
		disk.backend = {
			...memory,
			append: async bytes => {
				if (diskFull) {
					throw new Error('disk full');
				}
				await memory.append(bytes);
			},
		};
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();

			diskFull = true;
			canvas.draw(cb => cb(177, 7, 0, 5, 5));
			canvas.startUndo();
			await tick(50);
			diskFull = false;
			expect(warn).toHaveBeenCalledWith(
				'[Canvas] journal append failed:',
				expect.any(Error),
			);
			await settle();

			const snapshot = await canvas.loadJournalSnapshot();
			expect(Array.from(v3ToU16Lossy(snapshot.doc).imageData)).toEqual(
				Array.from(canvas.getImageData()),
			);
		} finally {
			warn.mockRestore();
			disk.backend = null;
		}
	});

	describe('idle commit', () => {
		const at = (u16, x, y) => u16[y * 80 + x];
		const journaled = async canvas =>
			v3ToU16Lossy((await canvas.loadJournalSnapshot()).doc).imageData;
		// a session keyframe holding one committed stroke, so later
		// strokes append behind it
		const keyframed = async () => {
			const canvas = await makeCanvas();
			canvas.startUndo();
			canvas.draw(cb => cb(219, 14, 1, 3, 2));
			canvas.startUndo();
			await settle();
			return canvas;
		};
		const idle = () => tick(450);
		// every canvas this file builds hears the document's events
		const keyframesOf = canvas =>
			encodes.docs.filter(doc => doc === canvas.getDoc()).length;
		const press = name => document.dispatchEvent(new CustomEvent(name));

		afterEach(() => {
			stateMock.historyLabels = undefined;
			stateMock.selectionTool = undefined;
		});

		it('the last stroke reaches the journal with no edit after it', async () => {
			const canvas = await keyframed();
			canvas.startUndo();
			canvas.draw(cb => cb(88, 12, 0, 10, 4));
			await idle();

			const u16 = await journaled(canvas);
			expect(at(u16, 10, 4)).toBe((88 << 8) | 12);
			expect(Array.from(u16)).toEqual(Array.from(canvas.getImageData()));
		});

		it('a press held still across a pause stays one undo step, journals a record at the pause, and commits once it lifts', async () => {
			const canvas = await keyframed();
			stateMock.historyLabels = {
				committed: vi.fn(),
				opened: vi.fn(),
				redoCleared: vi.fn(),
				undone: vi.fn(),
				redone: vi.fn(),
			};
			const { committed } = stateMock.historyLabels;
			const keyframes = keyframesOf(canvas);
			const appends = appendsOf(canvas);
			try {
				press('onTextCanvasDown');
				canvas.startUndo();
				canvas.draw(cb => cb(219, 14, 1, 10, 4));
				await idle();
				expect(committed).not.toHaveBeenCalled();
				expect(keyframesOf(canvas)).toBe(keyframes);
				expect(appendsOf(canvas)).toBe(appends + 1);
				expect(at(await journaled(canvas), 10, 4)).toBe(
					(219 << 8) | (1 << 4) | 14,
				);

				canvas.draw(cb => cb(219, 14, 1, 11, 4));
				await idle();
				expect(committed).not.toHaveBeenCalled();
			} finally {
				press('onTextCanvasUp');
			}
			await idle();
			expect(committed).toHaveBeenCalledTimes(1);
			expect(Array.from(await journaled(canvas))).toEqual(
				Array.from(canvas.getImageData()),
			);

			canvas.undo();
			expect(at(canvas.getImageData(), 10, 4)).toBe(0);
			expect(at(canvas.getImageData(), 11, 4)).toBe(0);
			expect(at(canvas.getImageData(), 3, 2)).not.toBe(0);
			// the pending idle commit finds nothing open and keeps the redo
			await idle();
			canvas.redo();
			expect(at(canvas.getImageData(), 11, 4)).toBe((219 << 8) | (1 << 4) | 14);
		});

		it('a page hide lands the last stroke before the idle, unless a press still holds it', async () => {
			const canvas = await keyframed();
			stateMock.historyLabels = {
				committed: vi.fn(),
				opened: vi.fn(),
				redoCleared: vi.fn(),
			};
			const { committed } = stateMock.historyLabels;
			const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
			try {
				canvas.startUndo();
				canvas.draw(cb => cb(88, 12, 0, 10, 4));
				press('onTextCanvasDown');
				window.dispatchEvent(new Event('pagehide'));
				document.dispatchEvent(new Event('visibilitychange'));
				press('onTextCanvasUp');
				expect(committed).not.toHaveBeenCalled();

				document.dispatchEvent(new Event('visibilitychange'));
				expect(committed).toHaveBeenCalledTimes(1);
				canvas.startUndo();
				canvas.draw(cb => cb(88, 12, 0, 11, 4));
				window.dispatchEvent(new Event('pagehide'));
				expect(committed).toHaveBeenCalledTimes(2);
			} finally {
				hidden.mockRestore();
			}
			await tick(50);
			const u16 = await journaled(canvas);
			expect(at(u16, 10, 4)).toBe((88 << 8) | 12);
			expect(at(u16, 11, 4)).toBe((88 << 8) | 12);
		});

		it('a floating selection move stays one undo step across pauses', async () => {
			const canvas = await keyframed();
			let moving = true;
			stateMock.selectionTool = {
				isMoveMode: () => moving,
				toggleMoveMode: () => {
					moving = false;
				},
			};
			stateMock.historyLabels = {
				committed: vi.fn(),
				opened: vi.fn(),
				redoCleared: vi.fn(),
				undone: vi.fn(),
			};
			const { committed } = stateMock.historyLabels;
			canvas.startUndo();
			canvas.draw(cb => cb(65, 7, 0, 20, 6));
			await idle();
			canvas.draw(cb => {
				cb(0, 7, 0, 20, 6);
				cb(65, 7, 0, 21, 6);
			});
			await idle();
			expect(committed).not.toHaveBeenCalled();

			// a tool switch drops move mode with no endUndo of its own
			moving = false;
			await idle();
			expect(committed).toHaveBeenCalledTimes(1);
			expect(at(await journaled(canvas), 21, 6)).toBe((65 << 8) | 7);

			canvas.undo();
			expect(at(canvas.getImageData(), 20, 6)).toBe(0);
			expect(at(canvas.getImageData(), 21, 6)).toBe(0);
		});

		it('a floating move journals one record per pause, and its commit replays over them', async () => {
			const canvas = await keyframed();
			let moving = true;
			stateMock.selectionTool = { isMoveMode: () => moving };
			stateMock.historyLabels = {
				committed: vi.fn(),
				opened: vi.fn(),
				redoCleared: vi.fn(),
				undone: vi.fn(),
			};
			const { committed } = stateMock.historyLabels;
			const block = (65 << 8) | 7;
			const step = (from, to) =>
				canvas.draw(cb => {
					cb(0, 0, 0, from, 6);
					cb(65, 7, 0, to, 6);
				});
			const live = () => Array.from(canvas.getImageData());
			const keyframes = keyframesOf(canvas);
			const appends = appendsOf(canvas);
			canvas.startUndo();
			canvas.draw(cb => cb(65, 7, 0, 20, 6));
			// the step stays open through four re-polls
			await tick(1400);
			expect(appendsOf(canvas)).toBe(appends + 1);
			let u16 = await journaled(canvas);
			expect(at(u16, 20, 6)).toBe(block);
			expect(Array.from(u16)).toEqual(live());

			step(20, 21);
			await idle();
			expect(appendsOf(canvas)).toBe(appends + 2);
			u16 = await journaled(canvas);
			expect(at(u16, 21, 6)).toBe(block);
			expect(Array.from(u16)).toEqual(live());
			expect(committed).not.toHaveBeenCalled();

			// back to the cell this step first wrote, then the move ends
			step(21, 20);
			moving = false;
			await idle();
			expect(committed).toHaveBeenCalledTimes(1);
			expect(appendsOf(canvas)).toBe(appends + 3);
			expect(keyframesOf(canvas)).toBe(keyframes);
			u16 = await journaled(canvas);
			expect(at(u16, 20, 6)).toBe(block);
			expect(Array.from(u16)).toEqual(live());

			canvas.undo();
			expect(at(canvas.getImageData(), 20, 6)).toBe(0);
		});

		it('an open step behind a doc-level change no keyframe holds yet journals as a keyframe', async () => {
			const canvas = await keyframed();
			const ink = (219 << 8) | (1 << 4) | 14;
			const keyframes = keyframesOf(canvas);
			const appends = appendsOf(canvas);
			// the delay's own keyframe waits out the debounce, past the pause
			canvas.setGlobalDelayMs(333);
			try {
				press('onTextCanvasDown');
				canvas.startUndo();
				canvas.draw(cb => cb(219, 14, 1, 10, 4));
				await tick(350);
				expect(keyframesOf(canvas)).toBe(keyframes + 1);
				expect(appendsOf(canvas)).toBe(appends);
				const { doc } = await canvas.loadJournalSnapshot();
				expect(doc.getGlobalDelayMs()).toBe(333);
				expect(at(v3ToU16Lossy(doc).imageData, 10, 4)).toBe(ink);
			} finally {
				press('onTextCanvasUp');
			}
			await idle();
		});

		it('a press held across a session leave journals what the screen shows', async () => {
			const canvas = await keyframed();
			press('onTextCanvasDown');
			try {
				stateMock.network = { isConnected: () => true };
				try {
					canvas.startUndo();
					canvas.draw(cb => cb(219, 14, 1, 10, 4));
					// a peer draws over the cell the press just wrote
					await canvas.drawRemoteExtCells([{ x: 10, y: 4, u: 0x42, a: 0, fg: 7, bg: 0 }]);
				} finally {
					stateMock.network = null;
				}
				canvas.journalKeyframe();
				await tick(50);
				canvas.draw(cb => cb(219, 14, 1, 11, 4));
			} finally {
				press('onTextCanvasUp');
			}
			await idle();
			const u16 = await journaled(canvas);
			expect(at(u16, 10, 4) >> 8).toBe(0x42);
			expect(Array.from(u16)).toEqual(Array.from(canvas.getImageData()));
		});

		it('a hide with no write since the open step last journaled adds nothing', async () => {
			const canvas = await keyframed();
			stateMock.selectionTool = { isMoveMode: () => true };
			const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
			try {
				canvas.startUndo();
				canvas.draw(cb => cb(65, 7, 0, 20, 6));
				await idle();
				const keyframes = keyframesOf(canvas);
				const appends = appendsOf(canvas);
				for (let i = 0; i < 3; i++) {
					document.dispatchEvent(new Event('visibilitychange'));
				}
				window.dispatchEvent(new Event('pagehide'));
				expect(keyframesOf(canvas)).toBe(keyframes);
				expect(appendsOf(canvas)).toBe(appends);

				canvas.draw(cb => cb(65, 7, 0, 21, 6));
				document.dispatchEvent(new Event('visibilitychange'));
				expect(appendsOf(canvas)).toBe(appends + 1);
			} finally {
				hidden.mockRestore();
			}
		});

		it('an undo followed at once by a page hide reaches the journal inside the keyframe delay', async () => {
			const canvas = await keyframed();
			canvas.startUndo();
			canvas.draw(cb => cb(88, 12, 0, 10, 4));
			canvas.startUndo();
			await tick(50);
			canvas.undo();
			const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
			try {
				document.dispatchEvent(new Event('visibilitychange'));
			} finally {
				hidden.mockRestore();
			}
			await tick(50);
			const u16 = await journaled(canvas);
			expect(at(u16, 10, 4)).toBe(0);
			expect(Array.from(u16)).toEqual(Array.from(canvas.getImageData()));
		});

		it('a delay change during a floating move followed at once by a page hide reaches the journal', async () => {
			const canvas = await keyframed();
			stateMock.selectionTool = { isMoveMode: () => true };
			canvas.startUndo();
			canvas.draw(cb => cb(65, 7, 0, 20, 6));
			await idle();
			canvas.setGlobalDelayMs(444);
			window.dispatchEvent(new Event('pagehide'));
			await tick(50);
			const { doc } = await canvas.loadJournalSnapshot();
			expect(doc.getGlobalDelayMs()).toBe(444);
			expect(at(v3ToU16Lossy(doc).imageData, 20, 6)).toBe((65 << 8) | 7);
		});

		it('a page hide mid-press journals the open stroke at once, and the press still commits as one step', async () => {
			const canvas = await keyframed();
			stateMock.historyLabels = {
				committed: vi.fn(),
				opened: vi.fn(),
				redoCleared: vi.fn(),
				undone: vi.fn(),
			};
			const { committed } = stateMock.historyLabels;
			const ink = (219 << 8) | (1 << 4) | 14;
			const keyframes = keyframesOf(canvas);
			const appends = appendsOf(canvas);
			const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
			try {
				press('onTextCanvasDown');
				canvas.startUndo();
				canvas.draw(cb => cb(219, 14, 1, 10, 4));
				// no timer between the event and the record: a hidden tab
				// throttles them
				document.dispatchEvent(new Event('visibilitychange'));
				expect(appendsOf(canvas)).toBe(appends + 1);
				await tick(50);
				canvas.draw(cb => cb(219, 14, 1, 11, 4));
				window.dispatchEvent(new Event('pagehide'));
				expect(appendsOf(canvas)).toBe(appends + 2);
				expect(keyframesOf(canvas)).toBe(keyframes);
				await tick(50);
				const u16 = await journaled(canvas);
				expect(at(u16, 10, 4)).toBe(ink);
				expect(at(u16, 11, 4)).toBe(ink);
				expect(committed).not.toHaveBeenCalled();
			} finally {
				hidden.mockRestore();
				press('onTextCanvasUp');
			}
			await idle();
			expect(committed).toHaveBeenCalledTimes(1);
			expect(Array.from(await journaled(canvas))).toEqual(
				Array.from(canvas.getImageData()),
			);
			canvas.undo();
			expect(at(canvas.getImageData(), 10, 4)).toBe(0);
			expect(at(canvas.getImageData(), 11, 4)).toBe(0);
		});
	});

	it('a keyframe scheduled during the autosave restore waits until the restore lets go', async () => {
		disk.backend = createMemoryBackend();
		try {
			const first = await makeCanvas();
			first.startUndo();
			first.draw(cb => cb(219, 14, 1, 3, 2));
			first.startUndo();
			await settle();

			// a reload over the same journal, in state.js's restore order:
			// ice goes on before the restore reads the journal
			const second = await makeCanvas();
			stateMock.loadingFromStorage = true;
			second.setIceColors(true);
			await settle();
			const restored = await second.loadJournalSnapshot();
			expect(v3ToU16Lossy(restored.doc).imageData[2 * 80 + 3]).toBe(
				(219 << 8) | (1 << 4) | 14,
			);
			second.setDocData(restored.doc);
			second.setIceColors(false);
			stateMock.loadingFromStorage = false;
			await settle();

			const journaled = await second.loadJournalSnapshot();
			expect(journaled.doc.getIceColors()).toBe(false);
			expect(Array.from(v3ToU16Lossy(journaled.doc).imageData)).toEqual(
				Array.from(second.getImageData()),
			);
		} finally {
			disk.backend = null;
			stateMock.loadingFromStorage = false;
		}
	});
});
