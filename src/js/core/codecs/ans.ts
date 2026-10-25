/**
 * ANSI (.ans/.diz/.nfo/.txt) codec, CP437 and the lenient UTF-8 reader.
 * Faithful port of the v2 loadAnsi/encodeANSi pair, quirks preserved on
 * purpose (they define compatibility):
 * - 25-row virtual screen: y caps at 25 and the screen scrolls
 *   (topOfScreen), cursor-up/down clamp inside the window.
 * - binColor swaps the ANSI<->BIN color order (1<->4, 3<->6, +bright).
 * - Cursor-forward at the right edge wraps first (v2 'C' behavior).
 * - EL ('K') clears with attribute 0 from the cursor to EOL.
 *
 * The UTF-8 read builds v3 planes natively: codepoints hit the strict
 * CP437 reverse map first and intern into the doc glyph table
 * otherwise, extended SGR (90-97/100-107, 38/48;5;n, 38/48;2;r;g;b)
 * lands as tag-bit color words, and one LF immediately after an
 * auto-wrap is swallowed (real terminals defer the wrap, so full-width
 * rows plus LF mean one row, not two). Everything the v2 reader
 * accepted still decodes (old-file leniency).
 *
 * encodeUtf8 is the v3 UTF-8 writer: one cell per column, LF endings,
 * SGR per color tier, ice-vs-blink per the artist's toggle (ice
 * default), SAUCE appended with the artist's meta verbatim (nothing
 * auto-added). encodeAns keeps the byte-compatible v2 CP437/plain-text
 * paths.
 */

import {
	MAX_DOC_CELLS,
	ATTR_BLINK,
	DocV3,
	FONT_SLOT_UNSCII,
	createCP437GlyphTable,
	createDocV3,
	glyphIdOf,
	glyphWord,
	isPaletteColor,
	paletteColor,
	paletteIndexOf,
	rgbColor,
} from '../doc.js';
import { u16ToV3, v3ToU16, v3ToU16Lossy } from '../convert.js';
import { cp437ToUnicode, unicodeToCp437 } from '../cp437.js';
import { buildSauce, parseSauce } from './sauce.js';
import { CodecError, concatBytes, utf8Encode } from './util.js';
import { DecodeResult, DocMeta } from './bin.js';

export const DEFAULT_ANSI_COLUMNS = 80;
const DEFAULT_FOREGROUND = 7;
const DEFAULT_BACKGROUND = 0;

/** ANSI color order -> BIN color order (v2 ScreenData.binColor). */
const binColor = (ansiColor: number): number => {
	switch (ansiColor) {
		case 4:
			return 1;
		case 6:
			return 3;
		case 1:
			return 4;
		case 3:
			return 6;
		case 12:
			return 9;
		case 14:
			return 11;
		case 9:
			return 12;
		case 11:
			return 14;
		default:
			return ansiColor;
	}
};

/** BIN color order -> ANSI color order (v2 encodeANSi.ansiColor). */
const ansiColor = (bin: number): number => {
	switch (bin) {
		case 1:
			return 4;
		case 3:
			return 6;
		case 4:
			return 1;
		case 6:
			return 3;
		default:
			return bin;
	}
};

const decodeUtf8At = (
	bytes: Uint8Array,
	startIndex: number,
	end = bytes.length,
): { charCode: number; bytesConsumed: number } => {
	const fail = (message: string): never => {
		throw new CodecError(`${message} at position ${startIndex}`);
	};
	const first = bytes[startIndex];
	if ((first & 0x80) === 0) {
		return { charCode: first, bytesConsumed: 1 };
	}
	const continuation = (offset: number): number => {
		if (startIndex + offset >= end) {
			fail('unexpected end of data in UTF-8 sequence');
		}
		const byte = bytes[startIndex + offset];
		if ((byte & 0xc0) !== 0x80) {
			fail('invalid UTF-8 continuation byte');
		}
		return byte & 0x3f;
	};
	if ((first & 0xe0) === 0xc0) {
		return {
			charCode: ((first & 0x1f) << 6) | continuation(1),
			bytesConsumed: 2,
		};
	}
	if ((first & 0xf0) === 0xe0) {
		return {
			charCode:
				((first & 0x0f) << 12) | (continuation(1) << 6) | continuation(2),
			bytesConsumed: 3,
		};
	}
	if ((first & 0xf8) === 0xf0) {
		return {
			charCode:
				((first & 0x07) << 18) |
				(continuation(1) << 12) |
				(continuation(2) << 6) |
				continuation(3),
			bytesConsumed: 4,
		};
	}
	return fail('invalid UTF-8 byte sequence');
};

/** Growable screen buffer, v2 ScreenData port (cells as u16 words). */
const createScreen = (width: number) => {
	let cells = new Uint16Array(width * 100);
	let maxY = 0;
	const extend = (y: number) => {
		const nextLength = width * (y + 100) + cells.length;
		if (nextLength > MAX_DOC_CELLS) {
			// content-driven growth: a hostile file can spam newlines far
			// past any sane canvas; die at the gate, not in the allocator
			throw new CodecError('ANSI content exceeds the cell ceiling');
		}
		const next = new Uint16Array(nextLength);
		next.set(cells, 0);
		cells = next;
	};
	return {
		reset: () => {
			cells = new Uint16Array(width * 100);
			maxY = 0;
		},
		set: (x: number, y: number, charCode: number, fg: number, bg: number) => {
			const pos = y * width + x;
			if (pos >= cells.length) {
				extend(y);
			}
			cells[pos] = (charCode << 8) | (binColor(bg) << 4) | binColor(fg);
			if (y > maxY) {
				maxY = y;
			}
		},
		height: () => maxY + 1,
		data: () => cells.slice(0, width * (maxY + 1)),
	};
};

/**
 * Growable v3-plane screen for the UTF-8 reader. Mirrors createScreen's
 * geometry quirks exactly (NaN cursor writes no-op, maxY tracks height)
 * but stores full glyph words and tag-bit color words.
 */
const createV3Screen = (width: number) => {
	const BLANK = paletteColor(0);
	const alloc = (cells: number) => ({
		glyph: new Uint32Array(cells),
		fg: new Uint32Array(cells).fill(BLANK),
		bg: new Uint32Array(cells).fill(BLANK),
	});
	let planes = alloc(width * 100);
	let maxY = 0;
	const extend = (y: number) => {
		const nextLength = width * (y + 100) + planes.glyph.length;
		if (nextLength > MAX_DOC_CELLS) {
			// same gate as createScreen: hostile growth dies loud
			throw new CodecError('ANSI content exceeds the cell ceiling');
		}
		const next = alloc(nextLength);
		next.glyph.set(planes.glyph, 0);
		next.fg.set(planes.fg, 0);
		next.bg.set(planes.bg, 0);
		planes = next;
	};
	return {
		reset: () => {
			planes = alloc(width * 100);
			maxY = 0;
		},
		set: (x: number, y: number, glyph: number, fg: number, bg: number) => {
			const pos = y * width + x;
			if (pos >= planes.glyph.length) {
				extend(y);
			}
			planes.glyph[pos] = glyph;
			planes.fg[pos] = fg;
			planes.bg[pos] = bg;
			if (y > maxY) {
				maxY = y;
			}
		},
		height: () => maxY + 1,
		planes: () => {
			const cells = width * (maxY + 1);
			return {
				glyph: planes.glyph.slice(0, cells),
				fg: planes.fg.slice(0, cells),
				bg: planes.bg.slice(0, cells),
			};
		},
	};
};

export interface DecodeAnsOptions {
	utf8?: boolean;
}

export const decodeAns = (
	bytes: Uint8Array,
	options: DecodeAnsOptions = {},
): DecodeResult => {
	const isUTF8 = options.utf8 ?? false;
	const sauce = parseSauce(bytes);
	// v2 getSauce is format-agnostic: a BinaryText record even on an .ans
	// derives width from FileType; zero means unspecified either way
	let columns = DEFAULT_ANSI_COLUMNS;
	if (sauce) {
		if (sauce.dataType === 5) {
			if (sauce.fileType > 0) {
				columns = sauce.fileType * 2;
			}
		} else if (sauce.tInfo1 > 0) {
			columns = sauce.tInfo1;
		}
	}
	const size = sauce ? sauce.payloadSize : bytes.length;
	// ESC[?33h/l can override the SAUCE flag mid-stream (Pablo honors
	// it; SAUCE-less ice ANSIs rendered blink here before)
	let iceColors = sauce?.iceColors ?? false;
	// ESC[?7l pins the cursor at the right edge instead of wrapping
	let autowrap = true;
	// PabloDraw 24-bit sequences (ESC[1;r;g;bt fg, ESC[0;r;g;bt bg):
	// the classic u16 screen cannot hold RGB, so live RGB channels ride
	// an overlay keyed by cell index and land on the doc planes after
	// u16ToV3; SGR 0 or a base color set clears the channel
	let rgbFg: number | null = null;
	let rgbBg: number | null = null;
	const rgbOverlay = new Map<
		number,
		{ fg: number | null; bg: number | null }
	>();
	const overlayCell = (px: number, py: number) => {
		const index = py * columns + px;
		if (rgbFg !== null || rgbBg !== null) {
			rgbOverlay.set(index, { fg: rgbFg, bg: rgbBg });
		} else {
			rgbOverlay.delete(index);
		}
	};

	const screen = createScreen(columns);
	// UTF-8 mode renders into v3 planes instead (tag-bit colors, doc
	// glyph table); the shared cursor state machine drives both sinks
	const v3screen = createV3Screen(columns);
	const glyphTable = createCP437GlyphTable();
	let x = 1;
	let y = 1;
	// v2 leaves these undefined until ESC[s; a stray ESC[u then poisons
	// the cursor through NaN arithmetic and drops glyphs until the next
	// positioner. NaN reproduces that byte-for-byte (Math.max(1, NaN) is
	// NaN, typed-array writes at NaN indices are no-ops), so wild files
	// render identically to v2 instead of painting at 1,1
	let savedX = NaN;
	let savedY = NaN;
	let topOfScreen = 0;
	let escaped = false;
	let escapeCode = '';
	let foreground = DEFAULT_FOREGROUND;
	let background = DEFAULT_BACKGROUND;
	let bold = false;
	let blink = false;
	let inverse = false;
	// UTF-8 extensions (never parsed in CP437 mode, which stays v2-exact):
	// 90-97/100-107 bright flags and 38/48 extended color words
	let fgBright = false;
	let bgBright = false;
	let fgExt: number | null = null;
	let bgExt: number | null = null;
	// one LF immediately after an auto-wrap is swallowed (UTF-8 only):
	// real terminals defer the wrap, so full-width rows + LF (the v2
	// writer's output and encodeUtf8's) mean ONE row, not two
	let wrappedPending = false;

	const resetAttributes = () => {
		foreground = DEFAULT_FOREGROUND;
		background = DEFAULT_BACKGROUND;
		bold = false;
		blink = false;
		inverse = false;
		fgBright = false;
		bgBright = false;
		fgExt = null;
		bgExt = null;
		rgbFg = null;
		rgbBg = null;
	};
	const newLine = () => {
		x = 1;
		if (y === 26 - 1) {
			topOfScreen += 1;
		} else {
			y += 1;
		}
	};
	const setPos = (newX: number, newY: number) => {
		x = Math.min(columns, Math.max(1, newX));
		// 25 is the bottom of the scroll window (newLine agrees); v2's 26
		// let ESC[26;..H escape it and a later ESC[1B snapped the cursor
		// up over painted rows. PabloDraw clamps to the canvas rect.
		y = Math.min(25, Math.max(1, newY));
	};
	const getValues = (missing = 1): number[] =>
		escapeCode
			.slice(1, -1)
			.split(';')
			.map(value => {
				const parsed = parseInt(value, 10);
				return isNaN(parsed) ? missing : parsed;
			});

	/**
	 * UTF-8 cell write. The 16c index math mirrors v2 exactly (inverse
	 * swaps BASE colors, bold/blink brighten post-swap, non-ice blink
	 * folds to the attr bit with a dim background); extended words ride
	 * over it, and unmapped codepoints intern into the glyph table.
	 */
	const putUtf8Cell = (px: number, py: number, codepoint: number) => {
		// explicit mapping or identity-if-unclaimed (space is 32, not an
		// interned U+0020); only codepoints truly outside CP437 intern.
		// Overlong encodings can smuggle lone surrogates and values past
		// U+10FFFF: those substitute, and a (hostile) file that fills the
		// 65,536-entry glyph table degrades to '?' instead of aborting
		const invalid =
			codepoint > 0x10ffff || (codepoint >= 0xd800 && codepoint <= 0xdfff);
		const mapped = invalid ? 63 : unicodeToCp437(codepoint);
		let glyphId: number;
		if (mapped !== undefined) {
			glyphId = mapped;
		} else {
			try {
				glyphId = glyphTable.idFor(FONT_SLOT_UNSCII, codepoint);
			} catch {
				glyphId = 63;
			}
		}
		const baseFg = inverse ? background : foreground;
		const baseBg = inverse ? foreground : background;
		const effFg = Math.min(
			15,
			baseFg + (bold || (fgBright && !inverse) ? 8 : 0),
		);
		const effBg = Math.min(
			15,
			baseBg + ((blink && iceColors) || (bgBright && !inverse) ? 8 : 0),
		);
		const attr = blink && !iceColors ? ATTR_BLINK : 0;
		const fgWord = (inverse ? bgExt : fgExt) ?? paletteColor(binColor(effFg));
		const bgWord = (inverse ? fgExt : bgExt) ?? paletteColor(binColor(effBg));
		v3screen.set(px, py, glyphWord(glyphId, attr), fgWord, bgWord);
	};

	/** UTF-8 SGR superset: v2's codes plus 90-107, 38/48, 39/49. */
	const applySgrUtf8 = (values: number[]) => {
		for (let i = 0; i < values.length; i++) {
			const value = values[i];
			if (value >= 30 && value <= 37) {
				foreground = value - 30;
				fgBright = false;
				fgExt = null;
			} else if (value >= 40 && value <= 47) {
				background = value - 40;
				bgBright = false;
				bgExt = null;
			} else if (value >= 90 && value <= 97) {
				foreground = value - 90;
				fgBright = true;
				fgExt = null;
			} else if (value >= 100 && value <= 107) {
				background = value - 100;
				bgBright = true;
				bgExt = null;
			} else if (value === 38 || value === 48) {
				let word: number | null = null;
				if (values[i + 1] === 5 && i + 2 < values.length) {
					const n = values[i + 2] & 0xff;
					// 0-15 are the standard colors in ANSI order; 16-255 stay
					// palette-index words, symmetric with the writer, so
					// paletteColor(n) round-trips through utf8 losslessly
					// (renderers resolve indexes beyond the doc palette via
					// the canonical xterm table)
					word = paletteColor(n < 16 ? binColor(n) : n);
					i += 2;
				} else if (values[i + 1] === 2 && i + 4 < values.length) {
					word = rgbColor(
						values[i + 2] & 0xff,
						values[i + 3] & 0xff,
						values[i + 4] & 0xff,
					);
					i += 4;
				} else {
					return; // malformed extended color: stop like a terminal
				}
				if (value === 38) {
					fgExt = word;
				} else {
					bgExt = word;
				}
			} else {
				switch (value) {
					case 0:
						resetAttributes();
						break;
					case 1:
						bold = true;
						break;
					case 5:
						blink = true;
						break;
					case 7:
						inverse = true;
						break;
					case 22:
						bold = false;
						break;
					case 25:
						blink = false;
						break;
					case 27:
						inverse = false;
						break;
					case 39:
						foreground = DEFAULT_FOREGROUND;
						fgBright = false;
						fgExt = null;
						break;
					case 49:
						background = DEFAULT_BACKGROUND;
						bgBright = false;
						bgExt = null;
						break;
				}
			}
		}
	};

	let pos = 0;
	while (pos < size) {
		let code = bytes[pos];
		let bytesConsumed = 1;
		pos += 1;
		let codepoint = code;
		if (isUTF8) {
			const decoded = decodeUtf8At(bytes, pos - 1, size);
			bytesConsumed = decoded.bytesConsumed;
			codepoint = decoded.charCode;
			// dispatch value for the state machine (controls are ASCII);
			// the cell write below uses the real codepoint instead. The
			// old strict reverse map here turned printable glyphs that
			// LIVE on cp437 control bytes (U+25D9 is 0x0A) into controls,
			// so moebiusXBIN's own UTF-8 exports corrupted on open
			code = decoded.charCode <= 0x7f ? decoded.charCode : 63;
		}

		if (escaped) {
			escapeCode += String.fromCharCode(code);
			if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
				escaped = false;
				// an empty SGR param means 0 (ESC[m resets; PabloDraw,
				// moebiusXBIN, and ANSI.SYS agree); cursor moves default 1
				const values = getValues(
					escapeCode.charAt(escapeCode.length - 1) === 'm' ? 0 : 1,
				);
				if (escapeCode.charAt(0) === '[') {
					// every CSI except SGR moves or edits, ending a deferred
					// wrap; SGR between a wrap and its LF must not
					if (escapeCode.charAt(escapeCode.length - 1) !== 'm') {
						wrappedPending = false;
					}
					switch (escapeCode.charAt(escapeCode.length - 1)) {
						case 'A':
							y = Math.max(1, y - values[0]);
							break;
						case 'B':
							y = Math.min(26 - 1, y + values[0]);
							break;
						case 'C':
							if (x === columns) {
								newLine();
							}
							x = Math.min(columns, x + values[0]);
							break;
						case 'D':
							x = Math.max(1, x - values[0]);
							break;
						case 'H':
						// HVP: ANSI.SYS and both references alias it to CUP;
						// v2 dropped it on the floor
						case 'f':
							if (values.length === 1) {
								setPos(1, values[0]);
							} else {
								setPos(values[1], values[0]);
							}
							break;
						case 'J':
							if (values[0] === 2) {
								x = 1;
								y = 1;
								screen.reset();
								v3screen.reset();
								rgbOverlay.clear();
							}
							break;
						case 'K':
							for (let j = x - 1; j < columns; j += 1) {
								if (isUTF8) {
									const blankWord = paletteColor(0);
									v3screen.set(j, y - 1 + topOfScreen, 0, blankWord, blankWord);
								} else {
									screen.set(j, y - 1 + topOfScreen, 0, 0, 0);
								}
							}
							break;
						case 'm':
							if (isUTF8) {
								applySgrUtf8(values);
								break;
							}
							for (const value of values) {
								if (value >= 30 && value <= 37) {
									foreground = value - 30;
									rgbFg = null;
								} else if (value >= 40 && value <= 47) {
									background = value - 40;
									rgbBg = null;
								} else {
									switch (value) {
										case 0:
											resetAttributes();
											break;
										case 1:
											bold = true;
											break;
										case 5:
											blink = true;
											break;
										case 7:
											inverse = true;
											break;
										case 22:
											bold = false;
											break;
										case 25:
											blink = false;
											break;
										case 27:
											inverse = false;
											break;
									}
								}
							}
							break;
						case 'h':
						case 'l': {
							// private modes Pablo honors: ?33 ice colors,
							// ?7 autowrap (moebiusXBIN ignores both)
							if (escapeCode.charAt(1) === '?') {
								const mode = parseInt(escapeCode.slice(2), 10);
								const enable = escapeCode.charAt(escapeCode.length - 1) === 'h';
								if (mode === 33) {
									iceColors = enable;
								} else if (mode === 7) {
									autowrap = enable;
								}
							}
							break;
						}
						case 't': {
							// PabloDraw 24-bit color: ESC[0;r;g;bt bg, ESC[1;r;g;bt fg
							if (values.length === 4) {
								const word = rgbColor(
									values[1] & 0xff,
									values[2] & 0xff,
									values[3] & 0xff,
								);
								if (isUTF8) {
									if (values[0] === 1) {
										fgExt = word;
									} else if (values[0] === 0) {
										bgExt = word;
									}
								} else if (values[0] === 1) {
									rgbFg = word;
								} else if (values[0] === 0) {
									rgbBg = word;
								}
							}
							break;
						}
						case 's':
							savedX = x;
							savedY = y;
							break;
						case 'u':
							x = savedX;
							y = savedY;
							break;
					}
				}
				escapeCode = '';
			}
		} else {
			switch (code) {
				case 10:
					if (wrappedPending) {
						wrappedPending = false;
					} else {
						newLine();
					}
					break;
				case 13:
					if (bytes[pos] === 0x0a) {
						pos += 1;
						if (wrappedPending) {
							wrappedPending = false;
						} else {
							newLine();
						}
					}
					break;
				case 26:
					break;
				default:
					if (code === 27 && bytes[pos] === 0x5b) {
						escaped = true;
					} else {
						wrappedPending = false;
						if (isUTF8) {
							putUtf8Cell(x - 1, y - 1 + topOfScreen, codepoint);
						} else if (!inverse) {
							screen.set(
								x - 1,
								y - 1 + topOfScreen,
								code,
								bold ? foreground + 8 : foreground,
								blink ? background + 8 : background,
							);
							overlayCell(x - 1, y - 1 + topOfScreen);
						} else {
							screen.set(
								x - 1,
								y - 1 + topOfScreen,
								code,
								bold ? background + 8 : background,
								blink ? foreground + 8 : foreground,
							);
							// inverse swaps the RGB channels with the bases
							const index = (y - 1 + topOfScreen) * columns + (x - 1);
							if (rgbFg !== null || rgbBg !== null) {
								rgbOverlay.set(index, { fg: rgbBg, bg: rgbFg });
							} else {
								rgbOverlay.delete(index);
							}
						}
						x += 1;
						if (x === columns + 1) {
							if (autowrap) {
								newLine();
								wrappedPending = isUTF8;
							} else {
								x = columns;
							}
						}
					}
			}
		}
		if (bytesConsumed > 1) {
			pos += bytesConsumed - 1;
		}
	}

	let doc: DocV3;
	if (isUTF8) {
		const planes = v3screen.planes();
		doc = createDocV3({
			columns,
			rows: v3screen.height(),
			glyphTable,
			iceColors,
			letterSpacing: sauce?.letterSpacing ?? false,
		});
		doc.frames[0].glyph.set(planes.glyph);
		doc.frames[0].fg.set(planes.fg);
		doc.frames[0].bg.set(planes.bg);
	} else {
		doc = u16ToV3({
			imageData: screen.data(),
			columns,
			rows: screen.height(),
			iceColors,
			letterSpacing: sauce?.letterSpacing ?? false,
		});
		if (rgbOverlay.size > 0) {
			const frame = doc.frames[0];
			for (const [index, colors] of rgbOverlay) {
				if (index >= frame.fg.length) {
					continue;
				}
				if (colors.fg !== null) {
					frame.fg[index] = colors.fg;
				}
				if (colors.bg !== null) {
					frame.bg[index] = colors.bg;
				}
			}
		}
	}
	return {
		doc,
		meta: sauce
			? {
					title: sauce.title,
					author: sauce.author,
					group: sauce.group,
					comments: sauce.comments.join('\n'),
					fontName: sauce.fontName,
				}
			: {},
		sauce,
	};
};

export interface EncodeAnsOptions {
	utf8?: boolean;
	/** UTF-8 only: emit SGR 5 blink codes (v2 default true). */
	blinkers?: boolean;
	/** Plain-text export: no escape codes at all. */
	stripEscapeCodes?: boolean;
	/** Which doc frame to encode (ansimation reuses the body per frame). */
	frameIndex?: number;
	/** Quantize via the lossy projection instead of the strict one. */
	lossy?: boolean;
	/** Body only: no EOF byte, no SAUCE (ansimation assembles its own). */
	bodyOnly?: boolean;
	meta?: DocMeta;
	date?: Date;
}

/**
 * v2 encodeANSi port from a v3 doc. CP437 output gets SAUCE appended
 * after a 0x1a; UTF-8/plain output gets none (v2 behavior; encodeUtf8
 * is the UTF-8 writer that carries SAUCE).
 */
export const encodeAns = (
	doc: DocV3,
	options: EncodeAnsOptions = {},
): Uint8Array => {
	const useUTF8 = options.utf8 ?? false;
	const blinkers = options.blinkers ?? true;
	const stripEscapeCodes = options.stripEscapeCodes ?? false;
	const { imageData, columns, rows, iceColors } = (
		options.lossy ? v3ToU16Lossy : v3ToU16
	)(doc, options.frameIndex ?? 0);

	const output: number[] = stripEscapeCodes ? [] : [27, 91, 48, 109];
	let currentForeground = DEFAULT_FOREGROUND;
	let currentBackground = DEFAULT_BACKGROUND;
	let currentBold = false;
	let currentBlink = false;
	// 24-bit channels ride PabloDraw t sequences (ESC[1;r;g;bt fg,
	// ESC[0;r;g;bt bg) over the quantized SGR base, so t-aware readers
	// keep the truecolor and everyone else degrades to the 16c view.
	// Only the lossy projection can reach cells with RGB plane words
	// (the strict one throws), and classic CP437 output alone carries
	// them (the UTF-8 writer already speaks 38;2).
	const planeFrame = doc.frames[options.frameIndex ?? 0];
	const emitRgb = !useUTF8 && !stripEscapeCodes && planeFrame !== undefined;
	let currentRgbFg: number | null = null;
	let currentRgbBg: number | null = null;
	const tSequence = (channel: number, word: number): number[] => {
		const seq: number[] = [27, 91, 48 + channel];
		for (const v of [(word >>> 16) & 0xff, (word >>> 8) & 0xff, word & 0xff]) {
			seq.push(59);
			for (const digit of String(v)) {
				seq.push(digit.charCodeAt(0));
			}
		}
		seq.push(116);
		return seq;
	};

	for (let row = 0; row < rows; row++) {
		let lineOutput: number[] = [];
		let lineForeground = currentForeground;
		let lineBackground = currentBackground;
		let lineBold: boolean = currentBold;
		let lineBlink: boolean = currentBlink;
		let lineRgbFg: number | null = currentRgbFg;
		let lineRgbBg: number | null = currentRgbBg;

		for (let col = 0; col < columns; col++) {
			const word = imageData[row * columns + col];
			const attribs: number[][] = [];
			let charCode = word >> 8;
			let foreground = word & 15;
			let background = (word >> 4) & 15;

			// Control characters that break terminal output map to lookalikes
			switch (charCode) {
				case 10:
					charCode = 9;
					break;
				case 13:
					charCode = 14;
					break;
				case 26:
					charCode = 16;
					break;
				case 27:
					charCode = 17;
					break;
			}

			let bold = false;
			let blink = false;
			if (foreground > 7) {
				bold = true;
				foreground -= 8;
			}
			if (background > 7) {
				blink = true;
				background -= 8;
			}

			const cellIndex = row * columns + col;
			const rawFg = emitRgb ? planeFrame.fg[cellIndex] >>> 0 : 0;
			const rawBg = emitRgb ? planeFrame.bg[cellIndex] >>> 0 : 0;
			const fgIsRgb = emitRgb && !isPaletteColor(rawFg);
			const bgIsRgb = emitRgb && !isPaletteColor(rawBg);
			if (!stripEscapeCodes) {
				if ((lineBold && !bold) || (lineBlink && !blink)) {
					attribs.push([48]); // 0: reset
					lineForeground = DEFAULT_FOREGROUND;
					lineBackground = DEFAULT_BACKGROUND;
					lineBold = false;
					lineBlink = false;
					lineRgbFg = null;
					lineRgbBg = null;
				}
				if (bold && !lineBold) {
					attribs.push([49]); // 1: bold
					lineBold = true;
				}
				if (blink && !lineBlink) {
					if (!useUTF8 || blinkers) {
						attribs.push([53]); // 5: blink
					}
					lineBlink = true;
				}
				if (foreground !== lineForeground) {
					attribs.push([51, 48 + ansiColor(foreground)]);
					lineForeground = foreground;
				} else if (lineRgbFg !== null && !fgIsRgb) {
					// leaving a 24-bit channel needs an explicit SGR even
					// when the quantized value matches the line state, or
					// t-aware readers keep painting RGB
					attribs.push([51, 48 + ansiColor(foreground)]);
				}
				if (background !== lineBackground) {
					attribs.push([52, 48 + ansiColor(background)]);
					lineBackground = background;
				} else if (lineRgbBg !== null && !bgIsRgb) {
					attribs.push([52, 48 + ansiColor(background)]);
				}
				if (attribs.length) {
					lineOutput.push(27, 91);
					attribs.forEach((attrib, index) => {
						lineOutput = lineOutput.concat(attrib);
						lineOutput.push(index === attribs.length - 1 ? 109 : 59);
					});
				}
			}

			if (fgIsRgb && rawFg !== lineRgbFg) {
				lineOutput.push(...tSequence(1, rawFg));
				lineRgbFg = rawFg;
			} else if (!fgIsRgb) {
				lineRgbFg = null;
			}
			if (bgIsRgb && rawBg !== lineRgbBg) {
				lineOutput.push(...tSequence(0, rawBg));
				lineRgbBg = rawBg;
			} else if (!bgIsRgb) {
				lineRgbBg = null;
			}

			if (useUTF8) {
				lineOutput.push(...utf8Encode(cp437ToUnicode(charCode)));
			} else {
				lineOutput.push(charCode);
			}
		}

		if (useUTF8) {
			if (!stripEscapeCodes) {
				lineOutput.push(27, 91, 48, 109);
			}
			lineOutput.push(10);
		}
		for (const byte of lineOutput) {
			output.push(byte);
		}
		currentForeground = lineForeground;
		currentBackground = lineBackground;
		currentBold = lineBold;
		currentBlink = lineBlink;
		currentRgbFg = lineRgbFg;
		currentRgbBg = lineRgbBg;
	}

	if (!stripEscapeCodes) {
		output.push(27, 91, 48, 109);
	}

	const payload = new Uint8Array(output);
	if (options.bodyOnly) {
		return payload;
	}
	if (useUTF8 || stripEscapeCodes) {
		// v2 appends a lone 0x1a ('' sauce) on UTF-8 saves; preserved
		return useUTF8 ? concatBytes([payload, Uint8Array.of(0x1a)]) : payload;
	}
	const meta = options.meta ?? {};
	const sauce = buildSauce({
		dataType: 1,
		fileType: 1,
		fileSize: payload.length,
		columns,
		rows,
		iceColors,
		letterSpacing: doc.getLetterSpacing(),
		title: meta.title,
		author: meta.author,
		group: meta.group,
		comments: meta.comments,
		fontName: meta.fontName,
		aspect: meta.aspect,
		letterSpacingMode: meta.letterSpacingMode,
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};

/**
 * Classic ansimation: clear once, then every frame homes the cursor
 * and repaints full-width; playback speed is the medium's (baud rate),
 * exactly like the scene's .ans animations. CP437 via the lossy
 * projection per frame; SAUCE marks Character/ANSiMation (dataType 1,
 * fileType 2).
 */
export const encodeAnsimation = (
	doc: DocV3,
	options: { meta?: DocMeta; date?: Date } = {},
): Uint8Array => {
	const parts: Uint8Array[] = [Uint8Array.of(27, 91, 50, 74)]; // ESC[2J
	for (let f = 0; f < doc.frames.length; f++) {
		parts.push(Uint8Array.of(27, 91, 72)); // ESC[H
		parts.push(encodeAns(doc, { frameIndex: f, lossy: true, bodyOnly: true }));
	}
	const payload = concatBytes(parts);
	const meta = options.meta ?? {};
	const sauce = buildSauce({
		dataType: 1,
		fileType: 2, // ANSiMation
		fileSize: payload.length,
		columns: doc.getColumns(),
		rows: doc.getRows(),
		iceColors: doc.getIceColors(),
		letterSpacing: doc.getLetterSpacing(),
		title: meta.title,
		author: meta.author,
		group: meta.group,
		comments: meta.comments,
		fontName: meta.fontName,
		aspect: meta.aspect,
		letterSpacingMode: meta.letterSpacingMode,
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};

export interface EncodeUtf8Options {
	/**
	 * The artist's choice for blink-attr cells: 'ice' (default)
	 * presents them as bright backgrounds with the SAUCE iCE flag set;
	 * 'blink' writes SGR 5 with the normal background. Ice semantics are
	 * 16-color-only: a blink attr over an extended background drops
	 * under 'ice' and writes SGR 5 under 'blink'.
	 */
	blinkMode?: 'ice' | 'blink';
	/** no SGR, no SAUCE: the .txt export (glyph-table codepoints ride) */
	plain?: boolean;
	meta?: DocMeta;
	date?: Date;
}

const UTF8_SGR_RESET = [27, 91, 48, 109]; // ESC[0m

/**
 * The v3 UTF-8 writer: one cell per column, full-width rows with LF
 * endings (correct in real terminals, which defer the wrap, and
 * lossless through this file's reader, which swallows the post-wrap
 * LF). SGR per color tier: 30-37/90-97 (+40-47/100-107) for palette
 * 0-15, 38/48;5;n for higher palette indexes, 38/48;2 for frozen RGB.
 * Unicode glyphs write their glyph-table codepoints. SAUCE carries the
 * artist's meta verbatim; nothing is auto-added.
 */
export const encodeUtf8 = (
	doc: DocV3,
	options: EncodeUtf8Options = {},
): Uint8Array => {
	const blinkMode = options.blinkMode ?? 'ice';
	const plain = options.plain ?? false;
	const columns = doc.getColumns();
	const rows = doc.getRows();
	const iceDoc = doc.getIceColors();
	const frame = doc.frames[0];
	const output: number[] = [];

	const pushDigits = (value: number) => {
		for (const ch of String(value)) {
			output.push(ch.charCodeAt(0));
		}
	};
	/** emit ESC[...m from numeric params */
	const pushSgr = (params: number[][]) => {
		output.push(27, 91);
		params.forEach((param, index) => {
			param.forEach((value, j) => {
				pushDigits(value);
				if (j < param.length - 1) {
					output.push(59);
				}
			});
			output.push(index === params.length - 1 ? 109 : 59);
		});
	};
	const fgParam = (word: number): number[] => {
		if (isPaletteColor(word)) {
			const index = paletteIndexOf(word);
			if (index <= 7) {
				return [30 + ansiColor(index)];
			}
			if (index <= 15) {
				return [90 + ansiColor(index - 8)];
			}
			return [38, 5, index & 0xff];
		}
		return [38, 2, (word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff];
	};
	const bgParam = (word: number): number[] => {
		const param = fgParam(word);
		param[0] += 10;
		return param;
	};
	/** present a 16c palette word as its bright (ice) counterpart */
	const brighten = (word: number): number => {
		const index = paletteIndexOf(word);
		return index <= 7 ? paletteColor(index + 8) : word;
	};

	// SGR tracked state; reset to defaults at every row's trailing ESC[0m
	const DEFAULT_FG = paletteColor(DEFAULT_FOREGROUND);
	const DEFAULT_BG = paletteColor(DEFAULT_BACKGROUND);
	let curFg = DEFAULT_FG;
	let curBg = DEFAULT_BG;
	let curBlink = false;
	// drives the SAUCE iCE flag: only blink attrs actually PRESENTED as
	// bright backgrounds count (a dropped blink over an extended bg does
	// not make the file ice). Degenerate case accepted: blink attrs
	// inside an ice doc under mode 'blink' write SGR 5 + the ice flag
	// and fold to bright on reimport.
	let anyBrightened = false;

	if (!plain) {
		output.push(...UTF8_SGR_RESET);
	}
	for (let row = 0; row < rows; row++) {
		for (let col = 0; col < columns; col++) {
			const index = row * columns + col;
			const word = frame.glyph[index];
			let glyphId = glyphIdOf(word);
			const blinkAttr = (word & (ATTR_BLINK << 16)) !== 0;
			const fg = frame.fg[index];
			let bg = frame.bg[index];
			let wantBlink = false;
			if (blinkAttr) {
				const bg16 = isPaletteColor(bg) && paletteIndexOf(bg) <= 15;
				if (blinkMode === 'blink') {
					wantBlink = true;
				} else if (bg16) {
					bg = brighten(bg); // ice presentation
					anyBrightened = true;
				}
				// ice over an extended background: blink drops
			}
			if (!plain) {
				const params: number[][] = [];
				if (wantBlink !== curBlink) {
					params.push([wantBlink ? 5 : 25]);
					curBlink = wantBlink;
				}
				if (fg !== curFg) {
					params.push(fgParam(fg));
					curFg = fg;
				}
				if (bg !== curBg) {
					params.push(bgParam(bg));
					curBg = bg;
				}
				if (params.length) {
					pushSgr(params);
				}
			}
			if (glyphId < 256) {
				// control lookalikes, exactly like the CP437 writer
				switch (glyphId) {
					case 10:
						glyphId = 9;
						break;
					case 13:
						glyphId = 14;
						break;
					case 26:
						glyphId = 16;
						break;
					case 27:
						glyphId = 17;
						break;
				}
				output.push(...utf8Encode(cp437ToUnicode(glyphId)));
			} else {
				let codepoint = doc.glyphTable.get(glyphId)?.codepoint ?? 63;
				if (
					codepoint > 0x10ffff ||
					(codepoint >= 0xd800 && codepoint <= 0xdfff)
				) {
					codepoint = 63; // never write invalid UTF-8
				}
				output.push(...utf8Encode(codepoint));
			}
		}
		if (plain) {
			output.push(10);
		} else {
			output.push(...UTF8_SGR_RESET, 10);
			curFg = DEFAULT_FG;
			curBg = DEFAULT_BG;
			curBlink = false;
		}
	}

	const payload = new Uint8Array(output);
	if (plain) {
		// .txt exports carry the v2-parity lone EOF byte and no SAUCE
		return concatBytes([payload, Uint8Array.of(0x1a)]);
	}
	const meta = options.meta ?? {};
	const sauce = buildSauce({
		dataType: 1,
		fileType: 1,
		fileSize: payload.length,
		columns,
		rows,
		iceColors: iceDoc || anyBrightened,
		letterSpacing: doc.getLetterSpacing(),
		title: meta.title,
		author: meta.author,
		group: meta.group,
		comments: meta.comments,
		fontName: meta.fontName,
		aspect: meta.aspect,
		letterSpacingMode: meta.letterSpacingMode,
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};
