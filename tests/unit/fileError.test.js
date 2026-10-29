/* eslint-disable prefer-arrow-callback */
/**
 * Corrupt and oversized files must surface through opts.onError for
 * every decode family: sync parsers throw straight into the load
 * handler's net, while dur and 0wnz decode inside async clearXBData
 * callbacks whose promises are dropped, so only the guarded wrapper
 * keeps their throws from vanishing as unhandled rejections and
 * wedging the caller's in-flight open state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { concatBytes, makeSauce } from '../corpus/generators.js';

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

// async decoders reject on their own schedule: poll instead of
// counting flush turns (ci shards lag)
const settle = async (done, tries = 400) => {
	for (let i = 0; i < tries && !done(); i++) {
		await flush();
	}
};

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
		await settle(() => onError.mock.calls.length > 0);
		expect(onError).toHaveBeenCalled();
		expect(callback).not.toHaveBeenCalled();
	});

	it('routes a corrupt 0wnz through onError without a callback', async () => {
		const onError = vi.fn();
		const callback = loadBytes('broken.0wnz', [0, 0, 0, 0], { onError });
		await settle(() => onError.mock.calls.length > 0);
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

describe('allocation ceilings on open', () => {
	let Load;

	const loadBytes = (name, bytes) => {
		const reader = {
			result: bytes.buffer,
			addEventListener: vi.fn(),
			readAsArrayBuffer: vi.fn(),
		};
		global.FileReader = vi.fn(function () {
			return reader;
		});
		const callback = vi.fn();
		const onError = vi.fn();
		Load.file({ name }, callback, { onError });
		reader.addEventListener.mock.calls[0][1]({});
		return { callback, onError };
	};

	const withSauce = (payload, sauce) =>
		concatBytes([payload, Uint8Array.of(0x1a), makeSauce(sauce)]);

	beforeEach(async () => {
		vi.clearAllMocks();
		global.window = {};
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const fileModule = await import('../../src/js/client/file.js');
		Load = fileModule.Load;
	});

	afterEach(() => {
		delete global.FileReader;
		delete global.window;
		vi.restoreAllMocks();
	});

	it('refuses an .ans whose rows pass the cell ceiling', () => {
		// LF spam under a 65535-column SAUCE width: 200 rows is 13.1M cells
		const spam = new Uint8Array(400);
		for (let i = 0; i < spam.length; i += 2) {
			spam[i] = 88;
			spam[i + 1] = 10;
		}
		const { callback, onError } = loadBytes(
			'spam.ans',
			withSauce(spam, { tinfo1: 65535, fileSize: spam.length }),
		);
		expect(onError.mock.calls[0][0].message).toMatch(/cell ceiling/);
		expect(callback).not.toHaveBeenCalled();
	});

	it('refuses a headerless .bin whose size implies too many cells', () => {
		// 21MB at the 160-column default is 11M cells
		const { callback, onError } = loadBytes(
			'huge.bin',
			new Uint8Array(21 * 1024 * 1024),
		);
		expect(onError.mock.calls[0][0].message).toMatch(/cell ceiling/);
		expect(callback).not.toHaveBeenCalled();
	});

	it('sizes a .bin from its bytes when SAUCE FileSize claims more', () => {
		// a FileSize near 2^31 on a small file must not size a 2GB buffer
		const { callback, onError } = loadBytes(
			'liar.bin',
			withSauce(new Uint8Array(640).fill(0x44), {
				datatype: 5,
				filetype: 80,
				fileSize: 0x7ffffff0,
			}),
		);
		expect(onError).not.toHaveBeenCalled();
		const [columns, rows, cells] = callback.mock.calls[0];
		expect([columns, rows]).toEqual([160, 2]);
		expect(cells.every(cell => cell === 0x4444)).toBe(true);
	});
});
