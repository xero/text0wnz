/**
 * ANSI (.ans/.diz/.nfo/.txt) codec, CP437 and the lenient UTF-8 reader.
 * Faithful port of the v2 loadAnsi/encodeANSi pair, quirks preserved on
 * purpose (they define compatibility):
 * - 25-row virtual screen: y caps at 25 and the screen scrolls
 *   (topOfScreen), cursor-up/down clamp inside the window.
 * - binColor swaps the ANSI<->BIN color order (1<->4, 3<->6, +bright).
 * - Cursor-forward at the right edge wraps first (v2 'C' behavior).
 * - EL ('K') clears with attribute 0 from the cursor to EOL.
 * - The lenient UTF-8 read maps unknown codepoints <= 255 to the raw
 *   byte and everything else to '?' (63), exactly like v2.
 * The v3 UTF-8 WRITER (D9 hard break) lands in P5; this encoder is the
 * byte-compatible v2 one for the interim.
 */

import { DocV3 } from '../doc.js';
import { u16ToV3, v3ToU16 } from '../convert.js';
import { cp437ToUnicode, unicodeToCp437Strict } from '../cp437.js';
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
): { charCode: number; bytesConsumed: number } => {
	const fail = (message: string): never => {
		throw new CodecError(`${message} at position ${startIndex}`);
	};
	const first = bytes[startIndex];
	if ((first & 0x80) === 0) {
		return { charCode: first, bytesConsumed: 1 };
	}
	const continuation = (offset: number): number => {
		if (startIndex + offset >= bytes.length) {
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
		const next = new Uint16Array(width * (y + 100) + cells.length);
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

	const screen = createScreen(columns);
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

	const resetAttributes = () => {
		foreground = DEFAULT_FOREGROUND;
		background = DEFAULT_BACKGROUND;
		bold = false;
		blink = false;
		inverse = false;
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
		y = Math.min(26, Math.max(1, newY));
	};
	const getValues = (): number[] =>
		escapeCode
			.slice(1, -1)
			.split(';')
			.map(value => {
				const parsed = parseInt(value, 10);
				return isNaN(parsed) ? 1 : parsed;
			});

	let pos = 0;
	while (pos < size) {
		let code = bytes[pos];
		let bytesConsumed = 1;
		pos += 1;
		if (isUTF8) {
			const decoded = decodeUtf8At(bytes, pos - 1);
			bytesConsumed = decoded.bytesConsumed;
			// Lenient v2 mapping: strict reverse map, else the raw value
			// when it fits a byte, else '?'
			code = unicodeToCp437Strict(decoded.charCode) ?? decoded.charCode;
			if (code > 255) {
				code = 63;
			}
		}

		if (escaped) {
			escapeCode += String.fromCharCode(code);
			if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
				escaped = false;
				const values = getValues();
				if (escapeCode.charAt(0) === '[') {
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
							}
							break;
						case 'K':
							for (let j = x - 1; j < columns; j += 1) {
								screen.set(j, y - 1 + topOfScreen, 0, 0, 0);
							}
							break;
						case 'm':
							for (const value of values) {
								if (value >= 30 && value <= 37) {
									foreground = value - 30;
								} else if (value >= 40 && value <= 47) {
									background = value - 40;
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
					newLine();
					break;
				case 13:
					if (bytes[pos] === 0x0a) {
						pos += 1;
						newLine();
					}
					break;
				case 26:
					break;
				default:
					if (code === 27 && bytes[pos] === 0x5b) {
						escaped = true;
					} else {
						if (!inverse) {
							screen.set(
								x - 1,
								y - 1 + topOfScreen,
								code,
								bold ? foreground + 8 : foreground,
								blink ? background + 8 : background,
							);
						} else {
							screen.set(
								x - 1,
								y - 1 + topOfScreen,
								code,
								bold ? background + 8 : background,
								blink ? foreground + 8 : foreground,
							);
						}
						x += 1;
						if (x === columns + 1) {
							newLine();
						}
					}
			}
		}
		if (bytesConsumed > 1) {
			pos += bytesConsumed - 1;
		}
	}

	const doc = u16ToV3({
		imageData: screen.data(),
		columns,
		rows: screen.height(),
		iceColors: sauce?.iceColors ?? false,
		letterSpacing: sauce?.letterSpacing ?? false,
	});
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
	meta?: DocMeta;
	date?: Date;
}

/**
 * v2 encodeANSi port from a v3 doc. CP437 output gets SAUCE appended
 * after a 0x1a; UTF-8/plain output gets none (v2 behavior; UTF-8 SAUCE
 * content is O1, due at P5 with the v3 writer).
 */
export const encodeAns = (
	doc: DocV3,
	options: EncodeAnsOptions = {},
): Uint8Array => {
	const useUTF8 = options.utf8 ?? false;
	const blinkers = options.blinkers ?? true;
	const stripEscapeCodes = options.stripEscapeCodes ?? false;
	const { imageData, columns, rows, iceColors } = v3ToU16(doc);

	const output: number[] = stripEscapeCodes ? [] : [27, 91, 48, 109];
	let currentForeground = DEFAULT_FOREGROUND;
	let currentBackground = DEFAULT_BACKGROUND;
	let currentBold = false;
	let currentBlink = false;

	for (let row = 0; row < rows; row++) {
		let lineOutput: number[] = [];
		let lineForeground = currentForeground;
		let lineBackground = currentBackground;
		let lineBold: boolean = currentBold;
		let lineBlink: boolean = currentBlink;

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

			if (!stripEscapeCodes) {
				if ((lineBold && !bold) || (lineBlink && !blink)) {
					attribs.push([48]); // 0: reset
					lineForeground = DEFAULT_FOREGROUND;
					lineBackground = DEFAULT_BACKGROUND;
					lineBold = false;
					lineBlink = false;
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
				}
				if (background !== lineBackground) {
					attribs.push([52, 48 + ansiColor(background)]);
					lineBackground = background;
				}
				if (attribs.length) {
					lineOutput.push(27, 91);
					attribs.forEach((attrib, index) => {
						lineOutput = lineOutput.concat(attrib);
						lineOutput.push(index === attribs.length - 1 ? 109 : 59);
					});
				}
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
	}

	if (!stripEscapeCodes) {
		output.push(27, 91, 48, 109);
	}

	const payload = new Uint8Array(output);
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
		date: options.date,
	});
	return concatBytes([payload, Uint8Array.of(0x1a), sauce]);
};
