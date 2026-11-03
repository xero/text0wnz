// Pins the local autosave gate: a live collab session owns the canvas,
// so nothing of it may reach the local autosave, whatever the zoom;
// only the viewer's own zoom merges into the stored settings
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import State from '../../src/js/client/state.js';
import { Storage } from '../../src/js/client/storage.js';

// settings run for real on jsdom localStorage, so the tests read the
// stored record itself; the IndexedDB writes stay spies
vi.mock('../../src/js/client/storage.js', async importOriginal => {
	const { Storage: real } = await importOriginal();
	return {
		Storage: {
			saveCanvasData: vi.fn(() => Promise.resolve()),
			saveFontData: vi.fn(() => Promise.resolve()),
			saveSettings: vi.fn(real.saveSettings),
			loadSettings: real.loadSettings,
			mergeSettings: vi.fn(real.mergeSettings),
			loadFontData: vi.fn(() => Promise.resolve(null)),
			loadCanvasData: vi.fn(() => Promise.resolve(null)),
			loadUndoHistory: vi.fn(() => Promise.resolve(null)),
		},
	};
});

const KEY = 'text0wnz-settings';
const stored = () => JSON.parse(localStorage.getItem(KEY));

const SESSION_PALETTE = [[255, 0, 0, 255]];

const setup = ({ zoom, connected, painted, session = false }) => {
	const imageData = new Uint16Array(80 * 25);
	if (painted) {
		imageData[0] = (65 << 8) | 7;
	}
	Object.assign(State._manager.state, {
		textArtCanvas: {
			getImageData: () => imageData,
			getColumns: () => 80,
			getRows: () => 25,
			getCurrentFontName: () => (session ? 'XBIN' : 'CP437 8x16'),
			getIceColors: () => session,
			getXBFontData: () =>
				session ? { bytes: new Uint8Array(4096), width: 8, height: 16 } : null,
		},
		font: {
			getScaleFactor: () => zoom,
			getLetterSpacing: () => session,
		},
		palette: session ? { getPalette: () => SESSION_PALETTE } : null,
		network: { isConnected: () => connected },
	});
};

// a local record that shares no value with the session setup above
const LOCAL = {
	fontName: 'Topaz 8x16',
	iceColors: false,
	letterSpacing: false,
	scaleFactor: 1,
	paletteColors: [[0, 0, 42, 255]],
};

describe('local autosave gate', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
	});
	afterEach(() => {
		localStorage.clear();
		Object.assign(State._manager.state, {
			textArtCanvas: null,
			font: null,
			palette: null,
			modal: null,
			network: null,
		});
	});

	it.each([1, 2])(
		'a live session writes no canvas, font, or whole settings at zoom %s',
		async zoom => {
			setup({ zoom, connected: true, painted: true, session: true });
			await State.saveToLocalStorage();
			expect(Storage.saveCanvasData).not.toHaveBeenCalled();
			expect(Storage.saveFontData).not.toHaveBeenCalled();
			expect(Storage.saveSettings).not.toHaveBeenCalled();
		},
	);

	it('a zoom in a live session persists scaleFactor', async () => {
		setup({ zoom: 2, connected: true, painted: true });
		await State.saveToLocalStorage();
		expect(stored().scaleFactor).toBe(2);
	});

	it('a zoom in a live session writes no canvas, font, or other settings', async () => {
		setup({ zoom: 2, connected: true, painted: true, session: true });
		await State.saveToLocalStorage();
		expect(Storage.saveCanvasData).not.toHaveBeenCalled();
		expect(Storage.saveFontData).not.toHaveBeenCalled();
		expect(stored()).toEqual({ scaleFactor: 2 });
	});

	it('the stored local settings survive a session zoom untouched', async () => {
		localStorage.setItem(KEY, JSON.stringify(LOCAL));
		setup({ zoom: 3, connected: true, painted: true, session: true });
		await State.saveToLocalStorage();
		expect(stored()).toEqual({ ...LOCAL, scaleFactor: 3 });
	});

	it('a live session at the stored zoom writes nothing', async () => {
		localStorage.setItem(KEY, JSON.stringify({ ...LOCAL, scaleFactor: 2 }));
		setup({ zoom: 2, connected: true, painted: true, session: true });
		await State.saveToLocalStorage();
		expect(Storage.mergeSettings).not.toHaveBeenCalled();
		setup({ zoom: 1, connected: true, painted: true, session: true });
		localStorage.clear();
		await State.saveToLocalStorage();
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('a session zoom over an empty store restores the zoom alone', async () => {
		setup({ zoom: 2, connected: true, painted: true, session: true });
		await State.saveToLocalStorage();
		const setScaleFactor = vi.fn();
		const loading = vi.fn();
		const setIceColors = vi.fn();
		Object.assign(State._manager.state, {
			font: { setScaleFactor },
			modal: { loading, close: vi.fn(), current: () => null },
			textArtCanvas: { setIceColors, setDocData: vi.fn(), setFont: vi.fn() },
		});
		await State.restoreStateFromLocalStorage();
		expect(setScaleFactor).toHaveBeenCalledWith(2);
		expect(loading).not.toHaveBeenCalled();
		expect(setIceColors).not.toHaveBeenCalled();
		expect(State.loadingFromStorage).toBe(false);
	});

	it('a session zoom over a local record restores the local doc at that zoom', async () => {
		localStorage.setItem(KEY, JSON.stringify(LOCAL));
		setup({ zoom: 3, connected: true, painted: true, session: true });
		await State.saveToLocalStorage();
		const setFont = vi.fn((_name, done) => done());
		const loading = vi.fn();
		const setIceColors = vi.fn();
		Object.assign(State._manager.state, {
			font: { setScaleFactor: vi.fn(), setLetterSpacing: vi.fn() },
			modal: { loading, close: vi.fn(), current: () => null },
			palette: null,
			textArtCanvas: { setIceColors, setDocData: vi.fn(), setFont },
		});
		await State.restoreStateFromLocalStorage();
		expect(loading).toHaveBeenCalled();
		await vi.waitFor(() => expect(State.loadingFromStorage).toBe(false));
		expect(setFont).toHaveBeenCalledWith('Topaz 8x16', expect.any(Function), 3);
		expect(setIceColors).toHaveBeenLastCalledWith(false);
	});

	it('a zoom on a blank local canvas still saves', async () => {
		setup({ zoom: 2, connected: false, painted: false });
		await State.saveToLocalStorage();
		expect(Storage.saveSettings).toHaveBeenCalledWith(
			expect.objectContaining({ scaleFactor: 2 }),
		);
	});

	it('a blank local canvas at zoom 1 writes nothing', async () => {
		setup({ zoom: 1, connected: false, painted: false });
		await State.saveToLocalStorage();
		expect(Storage.saveSettings).not.toHaveBeenCalled();
		expect(localStorage.getItem(KEY)).toBeNull();
	});

	it('a blank local canvas zoomed back to 1 stores the 1', async () => {
		localStorage.setItem(KEY, JSON.stringify({ ...LOCAL, scaleFactor: 2 }));
		setup({ zoom: 1, connected: false, painted: false });
		await State.saveToLocalStorage();
		expect(Storage.saveCanvasData).not.toHaveBeenCalled();
		expect(stored()).toEqual(LOCAL);
	});

	it('painted local work saves', async () => {
		setup({ zoom: 1, connected: false, painted: true });
		await State.saveToLocalStorage();
		expect(Storage.saveCanvasData).toHaveBeenCalled();
		expect(Storage.saveSettings).toHaveBeenCalled();
	});
});
