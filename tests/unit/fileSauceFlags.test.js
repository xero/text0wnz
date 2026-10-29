/**
 * Runs under real jsdom so the file.js onLetterSpacingChange listener
 * is live, unlike the corpus harness whose document stub drops it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
	const ui = {
		sauceTitle: { value: '' },
		sauceAuthor: { value: '' },
		sauceGroup: { value: '' },
		sauceComments: { value: '' },
	};
	return {
		ui,
		state: {
			title: 'flagsdoc',
			textArtCanvas: {
				clearXBData: cb => cb && cb(),
				setXBFontData: () => true,
				setFont: (_name, cb) => cb && cb(),
				getDoc: () => null, // assigned per test
				getCurrentFontName: () => 'CP437 8x16',
			},
			font: {
				getWidth: () => 8,
				getHeight: () => 16,
				getLetterSpacing: vi.fn(() => false),
			},
		},
	};
});

vi.mock('../../src/js/client/state.js', () => ({ default: mocks.state }));
vi.mock('../../src/js/client/ui.js', () => ({
	$: id => mocks.ui[id] || { value: '' },
	enforceMaxBytes: () => {},
}));

import { Load, Save } from '../../src/js/client/file.js';
import { u16ToV3 } from '../../src/js/core/index';
import { parseSauce } from '../../src/js/core/codecs/sauce.js';
import { makeAnsi } from '../corpus/generators.js';

const openFile = (name, bytes) =>
	new Promise(resolve => {
		Load.file(new File([bytes], name), (...args) => resolve(args));
	});

/** open bytes AND point getDoc at the decoded content for the save */
const openAndWire = async (name, bytes) => {
	const [columns, rows, data, iceColors] = await openFile(name, bytes);
	const doc = u16ToV3({
		imageData: data,
		columns,
		rows,
		iceColors: !!iceColors,
		letterSpacing: false,
	});
	mocks.state.textArtCanvas.getDoc = () => doc;
};

/** capture the Blob Save.* hands to the download anchor; jsdom has
 * no createObjectURL, so adding one (method only, the URL constructor
 * stays real) is the capture seam */
let savedBytes = null;
URL.createObjectURL = blob => {
	blob.arrayBuffer().then(buffer => {
		savedBytes = new Uint8Array(buffer);
	});
	return 'blob:captured';
};
URL.revokeObjectURL = () => {};

beforeEach(() => {
	savedBytes = null;
	mocks.state.font.getLetterSpacing.mockReturnValue(false);
});

const saved = async () => {
	savedBytes = null;
	await Save.ans();
	// the capture lands a task after saveFile's createObjectURL
	await new Promise(r => setTimeout(r, 0));
	expect(savedBytes).not.toBeNull();
	return parseSauce(savedBytes);
};

describe('SAUCE text lifecycle', () => {
	it('CP437 text survives an open and resave byte for byte', async () => {
		const original = makeAnsi({
			columns: 80,
			rows: 5,
			seed: 2,
			sauce: {
				tinfo1: 80,
				tinfo2: 5,
				title: 'caf\x82 \x9c5',
				author: '\x8eL',
				group: 'gr\x81n',
				comments: ['na\x8bve r\x82sum\x82'],
			},
		});
		await openAndWire('cafe.ans', original);
		await saved();
		// SAUCE §Layout: COMNT, one 64-byte line, then the record, whose
		// Title, Author, and Group run from byte 7 to 82
		const trailer = bytes => bytes.subarray(bytes.length - 128 - 69);
		const text = bytes => [
			...trailer(bytes).subarray(0, 69),
			...trailer(bytes).subarray(69 + 7, 69 + 82),
		];
		expect(text(savedBytes)).toEqual(text(original));
	});
});

describe('SAUCE flags lifecycle', () => {
	it('LS no preference survives an untouched resave', async () => {
		await openAndWire(
			'nopref.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
			}),
		);
		const record = await saved();
		expect((record.flags >> 1) & 0x03).toBe(0);
	});

	it('a spacing change after open writes the explicit bit', async () => {
		await openAndWire(
			'nopref.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
			}),
		);
		document.dispatchEvent(
			new CustomEvent('onLetterSpacingChange', { detail: true }),
		);
		mocks.state.font.getLetterSpacing.mockReturnValue(true);
		const record = await saved();
		expect((record.flags >> 1) & 0x03).toBe(2);
	});

	it('reopening clears the touched flag', async () => {
		await openAndWire(
			'first.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
			}),
		);
		document.dispatchEvent(
			new CustomEvent('onLetterSpacingChange', { detail: true }),
		);
		await openAndWire(
			'second.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 3,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
			}),
		);
		mocks.state.font.getLetterSpacing.mockReturnValue(false);
		const record = await saved();
		expect((record.flags >> 1) & 0x03).toBe(0);
	});

	it('a SAUCE-less open resaves the live toggle explicitly', async () => {
		await openAndWire('bare.ans', makeAnsi({ columns: 80, rows: 5, seed: 2 }));
		mocks.state.font.getLetterSpacing.mockReturnValue(true);
		const record = await saved();
		// a null stash disables no-preference: the toggle writes explicit
		expect((record.flags >> 1) & 0x03).toBe(2);
	});

	it('an unknown SAUCE version resaves like a SAUCE-less open', async () => {
		// SAUCE §Layout note 6: the record states no flags, so its zero
		// LS bits cannot pin the resave to no preference
		const bytes = makeAnsi({
			columns: 80,
			rows: 5,
			seed: 2,
			sauce: { tinfo1: 80, tinfo2: 5, flags: 0 },
		});
		bytes.fill(0x20, bytes.length - 123, bytes.length - 121);
		await openAndWire('old.ans', bytes);
		mocks.state.font.getLetterSpacing.mockReturnValue(true);
		const record = await saved();
		expect((record.flags >> 1) & 0x03).toBe(2);
	});

	it('File New forgets the opened flags', async () => {
		await openAndWire(
			'aspect.ans',
			makeAnsi({
				columns: 80,
				rows: 5,
				seed: 2,
				sauce: { tinfo1: 80, tinfo2: 5, flags: 0b00001000 },
			}),
		);
		Load.resetSauceFlags();
		const record = await saved();
		expect((record.flags >> 3) & 0x03).toBe(0);
		expect((record.flags >> 1) & 0x03).not.toBe(0);
	});
});
