/**
 * Deterministic test-card fixtures for the golden screenshot suite.
 * Built as BIN/XBin (raw cell formats) so every CP437 glyph 0-255 is
 * expressible without ANSI control-character substitution.
 *
 * Two ANSI-semantics variants exist because blink makes pixels
 * time-dependent: the plain card keeps every background <= 7 (nothing can
 * blink, safe for ice-off shots) and the ice card uses bright backgrounds
 * with the SAUCE ice flag set (static bright bg, safe for ice-on shots).
 */
import {
	concatBytes,
	makeSauce,
	makeXBin,
	makeXBinPalette,
} from '../corpus/generators.js';

const COLUMNS = 80;

/** Rows of cells -> BIN bytes. Each cell is [charCode, attribute]. */
const cellsToBin = rows => {
	const bytes = new Uint8Array(rows.length * COLUMNS * 2);
	rows.forEach((row, y) => {
		for (let x = 0; x < COLUMNS; x++) {
			const [charCode, attribute] = row[x] || [32, 0x07];
			bytes[(y * COLUMNS + x) * 2] = charCode;
			bytes[(y * COLUMNS + x) * 2 + 1] = attribute;
		}
	});
	return bytes;
};

const attr = (fg, bg) => ((bg & 15) << 4) | (fg & 15);

/** All 256 glyphs over 4 rows, fg cycling 1-15, bg held <= 7. */
const glyphRows = maxBg => {
	const rows = [];
	for (let chunk = 0; chunk < 4; chunk++) {
		const row = [];
		for (let x = 0; x < 64; x++) {
			const charCode = chunk * 64 + x;
			const fg = 1 + ((charCode * 7) % 15);
			const bg = (charCode >> 4) % (maxBg + 1);
			row.push([charCode, attr(fg, bg)]);
		}
		for (let x = 64; x < COLUMNS; x++) {
			row.push([254, attr(x % 16, 0)]);
		}
		rows.push(row);
	}
	return rows;
};

/** fg color bars (full blocks) and bg color bars (spaces). */
const colorBarRows = maxBg => {
	const fgRow = [];
	const bgRow = [];
	for (let x = 0; x < COLUMNS; x++) {
		fgRow.push([219, attr(Math.floor(x / 5) % 16, 0)]);
		bgRow.push([32, attr(7, Math.floor(x / 10) % (maxBg + 1))]);
	}
	// Half blocks + shading to exercise glyph edges and letter-spacing col 9
	const mixRow = [];
	const mixChars = [176, 177, 178, 219, 220, 221, 222, 223, 196, 205];
	for (let x = 0; x < COLUMNS; x++) {
		mixRow.push([mixChars[x % mixChars.length], attr(15 - (x % 16), x % (maxBg + 1))]);
	}
	return [fgRow, bgRow, mixRow];
};

const buildRows = maxBg => [...glyphRows(maxBg), ...colorBarRows(maxBg)];

/** 80x7 CP437 test card, backgrounds <= 7 (blink-free; for ice-off shots). */
export const testcardBin = () => {
	const image = cellsToBin(buildRows(7));
	return concatBytes([
		image,
		new Uint8Array([0x1a]),
		makeSauce({
			title: 'golden testcard',
			datatype: 5,
			filetype: COLUMNS / 2,
			fileSize: image.length,
			flags: 0, // ice off
		}),
	]);
};

/** Same card with bright backgrounds and the SAUCE ice flag set. */
export const testcardIceBin = () => {
	const image = cellsToBin(buildRows(15));
	return concatBytes([
		image,
		new Uint8Array([0x1a]),
		makeSauce({
			title: 'golden testcard ice',
			datatype: 5,
			filetype: COLUMNS / 2,
			fileSize: image.length,
			flags: 1, // ice on
		}),
	]);
};

/**
 * 512-glyph XBin test card with a custom palette and a procedural font.
 * What it gates TODAY: loading a 512-glyph XB through the real codec
 * (flag bit 4, 512*fontHeight font bytes, custom palette) and rendering
 * the lower page. It cannot exercise upper-page RENDERING, because the
 * u16 doc model holds 8 bits of charCode, so no cell can address glyphs
 * 256-511 anywhere in the editor until the P2 doc model + glyph table.
 * The upper-page bitmaps are the bitwise inverse of their lower-page
 * counterparts, so the moment upper-page addressing exists, any paging
 * bug flips pixels and the goldens catch it. Ice flag set, bright
 * backgrounds used.
 */
export const testcard512Xb = () => {
	const fontHeight = 16;
	const glyphCount = 512;
	const font = new Uint8Array(glyphCount * fontHeight);
	for (let glyph = 0; glyph < glyphCount; glyph++) {
		for (let y = 0; y < fontHeight; y++) {
			// Recognizable, glyph-dependent stripes with a solid border;
			// inverted stripes on the upper page keep every glyph's bitmap
			// distinct from its page-one counterpart
			const stripes = (glyph ^ (y * 37)) & 0xff;
			if (y === 0 || y === fontHeight - 1) {
				font[glyph * fontHeight + y] = 0xff;
			} else {
				font[glyph * fontHeight + y] =
					glyph & 0x100 ? ~stripes & 0xff : stripes;
			}
		}
	}

	const rows = 8;
	const cells = new Uint16Array(COLUMNS * rows);
	for (let i = 0; i < cells.length; i++) {
		// Walk the glyph space with varied colors incl. bright backgrounds;
		// the & 0xff below is the doc model's own ceiling (see the doc
		// comment above), so rendered cells repeat the lower page
		const glyph = i % glyphCount;
		const fg = 1 + (i % 15);
		const bg = (i >> 2) % 16;
		cells[i] = ((glyph & 0xff) << 8) | attr(fg, bg);
	}

	return makeXBin({
		columns: COLUMNS,
		rows,
		fontHeight,
		palette: makeXBinPalette(0xbeef),
		font,
		font512: true,
		iceColors: true,
		rawCells: cells,
		sauce: { title: 'golden testcard 512' },
	});
};
