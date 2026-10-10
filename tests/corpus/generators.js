/**
 * Deterministic synthetic fixture generators — corpus tier (b).
 * Pure functions, no DOM, no randomness beyond a seeded LCG: every call with
 * the same arguments yields identical bytes, so tests need no committed blobs.
 * Formats follow docs/sauce-format.md and docs/xb-format.md.
 */

// Seeded PRNG (numerical recipes LCG) returning floats in [0, 1)
export const lcg = seed => {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
};

// Latin-1/CP437 string to bytes (charCodes must be <= 255)
export const textToBytes = text => {
	const bytes = new Uint8Array(text.length);
	for (let i = 0; i < text.length; i++) {
		bytes[i] = text.charCodeAt(i) & 0xff;
	}
	return bytes;
};

export const concatBytes = chunks => {
	const total = chunks.reduce((sum, c) => sum + c.length, 0);
	const out = new Uint8Array(total);
	let offset = 0;
	chunks.forEach(chunk => {
		out.set(chunk, offset);
		offset += chunk.length;
	});
	return out;
};

/**
 * Build a 128-byte SAUCE record (plus optional COMNT block) byte-for-byte.
 * Field layout per docs/sauce-format.md.
 */
export const makeSauce = ({
	title = '',
	author = '',
	group = '',
	date = '20260101',
	fileSize = 0,
	datatype = 1,
	filetype = 1,
	tinfo1 = 0,
	tinfo2 = 0,
	comments = [],
	flags = 0,
	fontName = '',
} = {}) => {
	const sauce = new Uint8Array(128);
	const addText = (text, index, maxlength, pad = 0x20) => {
		for (let i = 0; i < maxlength; i++) {
			sauce[index + i] = i < text.length ? text.charCodeAt(i) & 0xff : pad;
		}
	};
	addText('SAUCE00', 0, 7);
	addText(title, 7, 35);
	addText(author, 42, 20);
	addText(group, 62, 20);
	addText(date, 82, 8);
	sauce[90] = fileSize & 0xff;
	sauce[91] = (fileSize >> 8) & 0xff;
	sauce[92] = (fileSize >> 16) & 0xff;
	sauce[93] = (fileSize >> 24) & 0xff;
	sauce[94] = datatype;
	sauce[95] = filetype;
	sauce[96] = tinfo1 & 0xff;
	sauce[97] = (tinfo1 >> 8) & 0xff;
	sauce[98] = tinfo2 & 0xff;
	sauce[99] = (tinfo2 >> 8) & 0xff;
	sauce[104] = comments.length;
	sauce[105] = flags;
	addText(fontName, 106, 22, 0);

	if (comments.length === 0) {
		return sauce;
	}
	const comnt = new Uint8Array(5 + comments.length * 64);
	comnt.set(textToBytes('COMNT'), 0);
	comments.forEach((line, i) => {
		const padded = line.slice(0, 64).padEnd(64, ' ');
		comnt.set(textToBytes(padded), 5 + i * 64);
	});
	return concatBytes([comnt, sauce]);
};

/**
 * Classic CP437 ANSI stream: SGR color runs + printable chars. Full-width
 * rows wrap implicitly (like the app's own exporter); pass lineBreaks: true
 * to emit partial rows terminated by CRLF instead, exercising the CR/LF
 * paths and trailing blanks. Cells are deterministic from the seed. Returns
 * bytes WITHOUT SAUCE unless a sauce option is passed (then EOF byte 0x1a +
 * record are appended).
 */
export const makeAnsi = ({
	columns = 80,
	rows = 25,
	ice = false,
	seed = 1,
	lineBreaks = false,
	sauce = null,
} = {}) => {
	const rand = lcg(seed);
	const chars = [32, 35, 46, 176, 177, 178, 219, 220, 223, 254];
	const out = [];
	const esc = text => {
		textToBytes(`\u001b[${text}`).forEach(b => out.push(b));
	};
	esc('0m');
	for (let row = 0; row < rows; row++) {
		// Partial rows need at least one cell and leave room for the CRLF
		const width = lineBreaks
			? 1 + Math.floor(rand() * (columns - 1))
			: columns;
		for (let col = 0; col < width; col++) {
			const fg = Math.floor(rand() * 16);
			const bg = Math.floor(rand() * (ice ? 16 : 8));
			const attribs = [];
			attribs.push('0');
			if (fg > 7) {
				attribs.push('1');
			}
			if (bg > 7) {
				attribs.push('5');
			}
			attribs.push(`3${fg & 7}`, `4${bg & 7}`);
			esc(`${attribs.join(';')}m`);
			out.push(chars[Math.floor(rand() * chars.length)]);
		}
		if (lineBreaks) {
			out.push(13, 10);
		}
	}
	esc('0m');
	let bytes = new Uint8Array(out);
	if (sauce) {
		bytes = concatBytes([
			bytes,
			new Uint8Array([0x1a]),
			makeSauce({ ...sauce, fileSize: bytes.length }),
		]);
	}
	return bytes;
};

/**
 * UTF-8 ANSI stream (one cell per column, LF rows) using multibyte CP437
 * block/box glyphs, mirroring the app's own UTF-8 export conventions.
 */
export const makeUtf8Ansi = ({ columns = 40, rows = 10, seed = 7 } = {}) => {
	const rand = lcg(seed);
	// Unicode equivalents of CP437 glyphs the reverse map must resolve
	const glyphs = ['░', '▒', '▓', '█', '▄', '▀', 'É', 'π', 'A', ' '];
	const encoder = new TextEncoder();
	const out = [];
	const push = bytes => bytes.forEach(b => out.push(b));
	push(encoder.encode('\u001b[0m'));
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			const fg = Math.floor(rand() * 8);
			push(encoder.encode(`\u001b[0;3${fg}m`));
			push(encoder.encode(glyphs[Math.floor(rand() * glyphs.length)]));
		}
		push(encoder.encode('\u001b[0m'));
		out.push(10);
	}
	return new Uint8Array(out);
};

/** Raw BIN image (char/attribute byte pairs), optional SAUCE for width. */
export const makeBin = ({ columns = 160, rows = 25, seed = 3, sauce = null } = {}) => {
	const rand = lcg(seed);
	const bytes = new Uint8Array(columns * rows * 2);
	for (let i = 0; i < columns * rows; i++) {
		bytes[i * 2] = Math.floor(rand() * 256);
		bytes[i * 2 + 1] = Math.floor(rand() * 256);
	}
	if (sauce) {
		return concatBytes([
			bytes,
			new Uint8Array([0x1a]),
			makeSauce({
				datatype: 5,
				filetype: columns / 2,
				fileSize: bytes.length,
				...sauce,
			}),
		]);
	}
	return bytes;
};

/** Deterministic 6-bit (0–63) XBin palette, 16 × RGB. */
export const makeXBinPalette = (seed = 5) => {
	const rand = lcg(seed);
	const palette = new Uint8Array(48);
	for (let i = 0; i < 48; i++) {
		palette[i] = Math.floor(rand() * 64);
	}
	return palette;
};

/** Deterministic 1bpp XBin font: glyphCount × fontHeight bytes. */
export const makeXBinFont = (glyphCount = 256, fontHeight = 16, seed = 9) => {
	const rand = lcg(seed);
	const font = new Uint8Array(glyphCount * fontHeight);
	for (let i = 0; i < font.length; i++) {
		font[i] = Math.floor(rand() * 256);
	}
	return font;
};

/**
 * XBin image data as RLE bytes exercising ALL FOUR run types:
 * none (0), char (1), attribute (2), both (3). Returns {cells, rle} where
 * cells is the expected Uint16Array ((char << 8) | attribute).
 */
export const makeXBinRleRuns = columns => {
	const cells = [];
	const rle = [];
	const emit = (runType, count, payload) => {
		rle.push((runType << 6) | (count - 1));
		payload.forEach(b => rle.push(b));
	};
	// Run type 3 (both repeat): 16 cells of █ attr 0x07
	emit(3, 16, [219, 0x07]);
	for (let i = 0; i < 16; i++) {
		cells.push((219 << 8) | 0x07);
	}
	// Run type 1 (char repeats, attribute varies): 16 × ░ with attrs 0..15
	{
		const payload = [176];
		for (let i = 0; i < 16; i++) {
			payload.push(i);
			cells.push((176 << 8) | i);
		}
		emit(1, 16, payload);
	}
	// Run type 2 (attribute repeats, char varies): 16 chars with attr 0x1f
	{
		const payload = [0x1f];
		for (let i = 0; i < 16; i++) {
			payload.push(65 + i);
			cells.push(((65 + i) << 8) | 0x1f);
		}
		emit(2, 16, payload);
	}
	// Run type 0 (no repeat): 16 literal char/attr pairs
	{
		const payload = [];
		for (let i = 0; i < 16; i++) {
			payload.push(128 + i, (i * 5) & 0xff);
			cells.push(((128 + i) << 8) | ((i * 5) & 0xff));
		}
		emit(0, 16, payload);
	}
	// Pad the row out with spaces (run type 3)
	const used = cells.length;
	const pad = columns - (used % columns);
	if (pad > 0 && pad < columns) {
		emit(3, pad, [32, 0x07]);
		for (let i = 0; i < pad; i++) {
			cells.push((32 << 8) | 0x07);
		}
	}
	return { cells: new Uint16Array(cells), rle: new Uint8Array(rle) };
};

/**
 * Full XBin file. Pass rawCells (Uint16Array) for uncompressed image data,
 * or rle + cells from makeXBinRleRuns for compressed data.
 */
export const makeXBin = ({
	columns = 80,
	rows = 25,
	fontHeight = 16,
	palette = null,
	font = null,
	font512 = false,
	iceColors = false,
	compressed = null,
	rawCells = null,
	sauce = null,
} = {}) => {
	let flags = 0;
	const chunks = [];
	if (palette) {
		flags |= 1;
	}
	if (font) {
		flags |= 1 << 1;
	}
	if (compressed) {
		flags |= 1 << 2;
	}
	if (iceColors) {
		flags |= 1 << 3;
	}
	if (font512) {
		flags |= 1 << 4;
	}
	chunks.push(
		new Uint8Array([
			88, 66, 73, 78, 26,
			columns & 0xff, columns >> 8,
			rows & 0xff, rows >> 8,
			fontHeight,
			flags,
		]),
	);
	if (palette) {
		chunks.push(palette);
	}
	if (font) {
		chunks.push(font);
	}
	if (compressed) {
		chunks.push(compressed);
	} else if (rawCells) {
		const raw = new Uint8Array(rawCells.length * 2);
		for (let i = 0; i < rawCells.length; i++) {
			raw[i * 2] = rawCells[i] >> 8;
			raw[i * 2 + 1] = rawCells[i] & 0xff;
		}
		chunks.push(raw);
	}
	let bytes = concatBytes(chunks);
	if (sauce) {
		bytes = concatBytes([
			bytes,
			new Uint8Array([0x1a]),
			makeSauce({ datatype: 6, filetype: 0, fileSize: bytes.length, ...sauce }),
		]);
	}
	return bytes;
};

/** Deterministic raw cell grid for uncompressed XBin fixtures. */
export const makeCells = (columns, rows, seed = 11) => {
	const rand = lcg(seed);
	const cells = new Uint16Array(columns * rows);
	for (let i = 0; i < cells.length; i++) {
		cells[i] = (Math.floor(rand() * 256) << 8) | Math.floor(rand() * 256);
	}
	return cells;
};
