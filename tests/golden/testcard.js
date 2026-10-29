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

/** each cell is [charCode, attribute] */
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

/** all 256 glyphs over 4 rows, bg held <= maxBg */
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
 * Gates loading through the real codec (flag bit 4, 512*fontHeight font
 * bytes, custom palette) and, on GL, upper-page rendering: upper-page
 * bitmaps are the bitwise inverse of their lower-page counterparts, so
 * any paging bug flips pixels and the goldens catch it.
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
		// a cell holds only the low 8 glyph bits; in 512-glyph mode fg
		// 8-15 selects the upper page instead of a bright color
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

/** mixed-charset UTF-8 ANSI testcard for the GL unicode golden */
export const testcardUtf8 = () => {
	const esc = text => `\u001b[${text}`;
	const lines = [
		// classic glyphs through the reverse map, 16c colors
		`${esc('0;37;40m')}░▒▓█ ┌─┬─┐ ╔═╦═╗ ${esc('1;33m')}★? ${esc('0;36m')}AaZz09`,
		// sextants + eighth blocks (unscii/unifont hex glyphs)
		`${esc('0;32m')}🬀🬁🬂🬃🬄🬅🬆🬇 ${esc('35m')}🭨🭩🭪🭫🭬🭭🭮🭯 ▂▄▆`,
		// rounded corners, diagonals, braille
		`${esc('0;31m')}╭─╮ ╱╲ ╳ ${esc('34m')}⠁⠃⠇⠏⠟⠿ ${esc('37m')}end`,
		// 256-color tier
		`${esc('0;38;5;196m')}XTERM196 ${esc('48;5;27m')}ON27${esc('0m')} ${esc('38;5;244m')}gray244`,
		// truecolor tier
		`${esc('0;38;2;255;128;0m')}RGB-ORANGE ${esc('48;2;0;64;128m')}ON-NAVY${esc('0m')}`,
		// v1 single-width policy: wide CJK + emoji render the substitute
		`${esc('0;37m')}wide:中 emoji:😀 done`,
	];
	const text = `${lines.join(`${esc('0m')}\n`)}${esc('0m')}\n`;
	return new TextEncoder().encode(text);
};
