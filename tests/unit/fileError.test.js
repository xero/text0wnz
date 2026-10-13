/* eslint-disable prefer-arrow-callback */
/**
 * Corrupt files must surface through opts.onError for every decode
 * family: sync parsers throw straight into the load handler's net,
 * while dur and 0wnz decode inside async clearXBData callbacks whose
 * promises are dropped, so only the guarded wrapper keeps their
 * throws from vanishing as unhandled rejections and wedging the
 * caller's in-flight open state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockState = {
	title: 'test-artwork',
	textArtCanvas: {
		getColumns: vi.fn(() => 80),
		getRows: vi.fn(() => 25),
		getImageData: vi.fn(() => new Uint16Array(80 * 25).fill(0x2007)),
		getIceColors: vi.fn(() => false),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		clearXBData: vi.fn(callback => callback()),
		getXBPaletteData: vi.fn(() => new Uint8Array(48)),
	},
	font: {
		getWidth: vi.fn(() => 8),
		getHeight: vi.fn(() => 16),
		getLetterSpacing: vi.fn(() => false),
		getData: vi.fn(() => null),
	},
};

vi.mock('../../src/js/client/state.js', () => ({ default: mockState }));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(() => ({ value: '' })),
	enforceMaxBytes: vi.fn(),
}));

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('corrupt file error reporting', () => {
	let Load;

	const loadBytes = (name, bytes, opts) => {
		const reader = {
			result: new Uint8Array(bytes).buffer,
			addEventListener: vi.fn(),
			readAsArrayBuffer: vi.fn(),
		};
		global.FileReader = vi.fn(function () {
			return reader;
		});
		const callback = vi.fn();
		Load.file({ name }, callback, opts);
		const onLoad = reader.addEventListener.mock.calls[0][1];
		onLoad({});
		return callback;
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		global.window = {};
		const fileModule = await import('../../src/js/client/file.js');
		Load = fileModule.Load;
	});

	afterEach(() => {
		delete global.FileReader;
		delete global.window;
	});

	it('routes a corrupt dur through onError without a callback', async () => {
		const onError = vi.fn();
		// too short for the durdraw gzip header: decodeDur throws async
		const callback = loadBytes('broken.dur', [1, 2, 3], { onError });
		await flush();
		await flush();
		expect(onError).toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
	});

	it('routes a corrupt 0wnz through onError without a callback', async () => {
		const onError = vi.fn();
		const callback = loadBytes('broken.0wnz', [0, 0, 0, 0], { onError });
		await flush();
		await flush();
		expect(onError).toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
	});

	it('routes a sync parser throw through onError', () => {
		const onError = vi.fn();
		// an xb too short for its own header throws inside the switch
		const callback = loadBytes('broken.xb', [1], { onError });
		expect(onError).toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
	});
});
