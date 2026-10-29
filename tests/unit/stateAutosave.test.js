// Pins the local autosave gate: a live collab session owns the canvas,
// so nothing of it may reach the local autosave, whatever the zoom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import State from '../../src/js/client/state.js';
import { Storage } from '../../src/js/client/storage.js';

vi.mock('../../src/js/client/storage.js', () => ({
	Storage: {
		saveCanvasData: vi.fn(() => Promise.resolve()),
		saveFontData: vi.fn(() => Promise.resolve()),
		saveSettings: vi.fn(),
	},
}));

const setup = ({ zoom, connected, painted }) => {
	const imageData = new Uint16Array(80 * 25);
	if (painted) {
		imageData[0] = (65 << 8) | 7;
	}
	Object.assign(State._manager.state, {
		textArtCanvas: {
			getImageData: () => imageData,
			getColumns: () => 80,
			getRows: () => 25,
			getCurrentFontName: () => 'CP437 8x16',
			getIceColors: () => false,
			getXBFontData: () => null,
		},
		font: {
			getScaleFactor: () => zoom,
			getLetterSpacing: () => false,
		},
		palette: null,
		network: { isConnected: () => connected },
	});
};

describe('local autosave gate', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => {
		Object.assign(State._manager.state, {
			textArtCanvas: null,
			font: null,
			network: null,
		});
	});

	it.each([1, 2])('a live session writes nothing at zoom %s', async zoom => {
		setup({ zoom, connected: true, painted: true });
		await State.saveToLocalStorage();
		expect(Storage.saveCanvasData).not.toHaveBeenCalled();
		expect(Storage.saveSettings).not.toHaveBeenCalled();
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
	});

	it('painted local work saves', async () => {
		setup({ zoom: 1, connected: false, painted: true });
		await State.saveToLocalStorage();
		expect(Storage.saveCanvasData).toHaveBeenCalled();
		expect(Storage.saveSettings).toHaveBeenCalled();
	});
});
