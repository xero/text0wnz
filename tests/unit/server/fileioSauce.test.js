import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const writeFileMock = vi.fn((filename, data, callback) => callback());

vi.mock('fs', () => {
	const mocked = {
		readFile: vi.fn(),
		writeFile: (...args) => writeFileMock(...args),
		existsSync: vi.fn(() => true),
		mkdirSync: vi.fn(),
	};
	return { ...mocked, default: mocked };
});

describe('FileIO SAUCE Encoder Alignment', () => {
	let save;

	const saveSession = async imageData => {
		await new Promise(resolve => {
			save('test.bin', imageData, resolve);
		});
		return new Uint8Array(writeFileMock.mock.calls.at(-1)[1]);
	};

	const sauceText = (record, offset, length) =>
		String.fromCharCode(...record.subarray(offset, offset + length)).replace(
			/[\s\0]+$/,
			'',
		);

	beforeEach(async () => {
		vi.clearAllMocks();
		const fileio = await import('../../../src/js/server/fileio.js');
		save = fileio.save;
	});

	afterEach(() => {
		vi.resetModules();
	});

	it('should write a client-compatible SAUCE record for session saves', async () => {
		const output = await saveSession({
			columns: 80,
			rows: 25,
			data: new Uint16Array(80 * 25),
			iceColors: true,
			letterSpacing: true,
			fontName: 'CP437 8x16',
		});

		// EOF byte directly before the 128-byte record
		expect(output[output.length - 129]).toBe(0x1a);

		const record = output.subarray(output.length - 128);
		expect(sauceText(record, 0, 7)).toBe('SAUCE00');
		expect(record[94]).toBe(5); // Datatype: BIN
		expect(record[95]).toBe(40); // Filetype: columns / 2

		const flags = record[105];
		expect(flags & 0x01).toBe(1); // Ice colors
		expect((flags >> 1) & 0x03).toBe(2); // 9px letter spacing
		expect((flags >> 4) & 0x01).toBe(1); // Aspect ratio, matching the client

		expect(sauceText(record, 106, 22)).toBe('IBM VGA');
	});

	it('should map the session font name like the client encoder', async () => {
		const output = await saveSession({
			columns: 80,
			rows: 25,
			data: new Uint16Array(80 * 25),
			iceColors: false,
			letterSpacing: false,
			fontName: 'Topaz 500 8x16',
		});

		const record = output.subarray(output.length - 128);
		const flags = record[105];
		expect(flags & 0x01).toBe(0);
		expect((flags >> 1) & 0x03).toBe(1); // 8px letter spacing

		expect(sauceText(record, 106, 22)).toBe('Amiga Topaz 1');
	});

	it('should fall back to IBM VGA for unknown font names', async () => {
		const output = await saveSession({
			columns: 160,
			rows: 50,
			data: new Uint16Array(160 * 50),
			iceColors: false,
			letterSpacing: false,
			fontName: 'Unknown Font 8x16',
		});

		const record = output.subarray(output.length - 128);
		expect(record[95]).toBe(80); // Filetype: columns / 2
		expect(sauceText(record, 106, 22)).toBe('IBM VGA');
	});
});
