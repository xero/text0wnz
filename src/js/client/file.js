import { encode as encodePng } from 'fast-png';
import State from './state.js';
import magicNumbers from './magicNumbers.js';
import { $, enforceMaxBytes } from './ui.js';
import { getUnicodeReverseMap } from './palette.js';
import {
	CodecError,
	decodeAns,
	decodeDur,
	decodeEnvelope,
	decodeTundra,
	encodeAnsimation,
	encodeDur,
	timelapseToDoc,
	encodeEnvelope,
	encodeTundra,
	encodeUtf8,
	describeIssue,
	lintDocForFormat,
	decodeXBin,
	encodeAns,
	encodeBin,
	encodeXBin,
	v3ToU16Lossy,
} from '../core/index';

// SAUCE flags round trip: the AR bits and an LS "no preference" from
// an opened file survive a resave verbatim; v2 rewrote author intent
// with a forced AR 10 and LS 01 on every save. An LS the artist
// touches after open writes the explicit bit instead. Module scope:
// the Load side stashes, the Save side reads.
let openedSauceFlags = null;
let lsTouchedSinceOpen = false;
// optional chain: test harnesses stub document with createElement only
document.addEventListener?.('onLetterSpacingChange', () => {
	lsTouchedSinceOpen = true;
});

const loadModule = () => {
	class File {
		constructor(bytes) {
			let pos, commentCount;

			const SAUCE_ID = new Uint8Array([0x53, 0x41, 0x55, 0x43, 0x45]);
			const COMNT_ID = new Uint8Array([0x43, 0x4f, 0x4d, 0x4e, 0x54]);

			this.get = () => {
				if (pos >= bytes.length) {
					throw new Error('Requested byte offset out of bounds.');
				}
				pos += 1;
				return bytes[pos - 1];
			};

			this.get16 = () => {
				const v = this.get();
				return v + (this.get() << 8);
			};

			this.get32 = () => {
				let v;
				v = this.get();
				v += this.get() << 8;
				v += this.get() << 16;
				return v + (this.get() << 24);
			};

			this.getC = () => {
				return String.fromCharCode(this.get());
			};

			this.getS = num => {
				let string;
				string = '';
				while (num > 0) {
					string += this.getC();
					num -= 1;
				}
				return string.replace(/\s+$/, '');
			};

			this.lookahead = match => {
				let i;
				for (i = 0; i < match.length; i += 1) {
					if (pos + i === bytes.length || bytes[pos + i] !== match[i]) {
						break;
					}
				}
				return i === match.length;
			};

			this.read = num => {
				const t = pos;

				num = num || this.size - pos;
				while ((pos += 1) < this.size) {
					num -= 1;
					if (num === 0) {
						break;
					}
				}
				return bytes.subarray(t, pos);
			};

			this.seek = newPos => {
				pos = newPos;
			};

			this.peek = num => {
				num = num || 0;
				return bytes[pos + num];
			};

			this.getPos = () => {
				return pos;
			};

			this.eof = () => {
				return pos === this.size;
			};

			pos = bytes.length - 128;

			if (this.lookahead(SAUCE_ID)) {
				this.sauce = {};
				this.getS(5);
				this.sauce.version = this.getS(2);
				this.sauce.title = this.getS(35);
				this.sauce.author = this.getS(20);
				this.sauce.group = this.getS(20);
				this.sauce.date = this.getS(8);
				this.sauce.fileSize = this.get32();
				this.sauce.dataType = this.get();
				this.sauce.fileType = this.get();
				this.sauce.tInfo1 = this.get16();
				this.sauce.tInfo2 = this.get16();
				this.sauce.tInfo3 = this.get16();
				this.sauce.tInfo4 = this.get16();

				this.sauce.comments = [];
				commentCount = this.get();
				this.sauce.flags = this.get();
				if (commentCount > 0) {
					pos = bytes.length - 128 - commentCount * 64 - 5;

					if (this.lookahead(COMNT_ID)) {
						this.getS(5);

						while (commentCount > 0) {
							this.sauce.comments.push(this.getS(64));
							commentCount -= 1;
						}
					}
				}
			}

			pos = 0;
			if (this.sauce) {
				if (this.sauce.fileSize > 0 && this.sauce.fileSize < bytes.length) {
					this.size = this.sauce.fileSize;
				} else {
					this.size = bytes.length - 128;
				}
			} else {
				this.size = bytes.length;
			}
		}
	}

	class ScreenData {
		constructor(width) {
			let imageData, maxY, pos;

			const binColor = ansiColor => {
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

			this.reset = () => {
				imageData = new Uint8Array(width * 100 * 3);
				maxY = 0;
				pos = 0;
			};

			this.reset();

			this.raw = bytes => {
				let i, j;
				maxY = Math.ceil(bytes.length / 2 / width);
				imageData = new Uint8Array(width * maxY * 3);
				for (i = 0, j = 0; j < bytes.length; i += 3, j += 2) {
					imageData[i] = bytes[j];
					imageData[i + 1] = bytes[j + 1] & 15;
					imageData[i + 2] = bytes[j + 1] >> 4;
				}
			};

			const extendImageData = y => {
				const newImageData = new Uint8Array(
					width * (y + 100) * 3 + imageData.length,
				);
				newImageData.set(imageData, 0);
				imageData = newImageData;
			};

			this.set = (x, y, charCode, fg, bg) => {
				pos = (y * width + x) * 3;
				if (pos >= imageData.length) {
					extendImageData(y);
				}
				imageData[pos] = charCode;
				imageData[pos + 1] = binColor(fg);
				imageData[pos + 2] = binColor(bg);
				if (y > maxY) {
					maxY = y;
				}
			};

			this.getData = () => {
				return imageData.subarray(0, width * (maxY + 1) * 3);
			};

			this.getHeight = () => {
				return maxY + 1;
			};

			this.rowLength = width * 3;

			this.stripBlinking = () => {
				let i;
				for (i = 2; i < imageData.length; i += 3) {
					if (imageData[i] >= 8) {
						imageData[i] -= 8;
					}
				}
			};
		}
	}

	const loadAnsi = (bytes, isUTF8 = false) => {
		let escaped,
				escapeCode,
				j,
				code,
				values,
				topOfScreen,
				x,
				y,
				savedX,
				savedY,
				foreground,
				background,
				bold,
				blink,
				inverse;

		const validate = (condition, message) => {
			if (!condition) {
				throw new Error(message);
			}
		};

		const decodeUtf8 = (bytes, startIndex) => {
			let charCode = bytes[startIndex];
			if ((charCode & 0x80) === 0) {
				// 1-byte sequence (ASCII)
				return { charCode, bytesConsumed: 1 };
			} else if ((charCode & 0xe0) === 0xc0) {
				// 2-byte sequence
				validate(
					startIndex + 1 < bytes.length,
					`[File] Unexpected end of data at position ${startIndex} for 2-byte UTF-8 sequence`,
				);
				const secondByte = bytes[startIndex + 1];
				validate(
					(secondByte & 0xc0) === 0x80,
					`[File] Invalid UTF-8 continuation byte at position ${startIndex + 1} for 2-byte UTF-8 sequence`,
				);
				charCode = ((charCode & 0x1f) << 6) | (secondByte & 0x3f);
				return { charCode, bytesConsumed: 2 };
			} else if ((charCode & 0xf0) === 0xe0) {
				// 3-byte sequence
				validate(
					startIndex + 2 < bytes.length,
					`[File] Unexpected end of data at position ${startIndex} for 3-byte UTF-8 sequence`,
				);
				const secondByte = bytes[startIndex + 1];
				const thirdByte = bytes[startIndex + 2];
				validate(
					(secondByte & 0xc0) === 0x80 && (thirdByte & 0xc0) === 0x80,
					`[File] Invalid UTF-8 continuation byte at position ${startIndex + 1} or ${startIndex + 2}`,
				);
				charCode =
					((charCode & 0x0f) << 12) |
					((secondByte & 0x3f) << 6) |
					(thirdByte & 0x3f);
				return { charCode, bytesConsumed: 3 };
			} else if ((charCode & 0xf8) === 0xf0) {
				// 4-byte sequence
				validate(
					startIndex + 3 < bytes.length,
					`[File] Unexpected end of data at position ${startIndex} for 4-byte UTF-8 sequence`,
				);
				const secondByte = bytes[startIndex + 1];
				const thirdByte = bytes[startIndex + 2];
				const fourthByte = bytes[startIndex + 3];
				validate(
					(secondByte & 0xc0) === 0x80 &&
					(thirdByte & 0xc0) === 0x80 &&
					(fourthByte & 0xc0) === 0x80,
					`[File] Invalid UTF-8 continuation byte at position ${startIndex + 1}, ${startIndex + 2}, or ${startIndex + 3}`,
				);
				charCode =
					((charCode & 0x07) << 18) |
					((secondByte & 0x3f) << 12) |
					((thirdByte & 0x3f) << 6) |
					(fourthByte & 0x3f);
				return { charCode, bytesConsumed: 4 };
			}
			throw new Error(
				`[File] Invalid UTF-8 byte sequence at position ${startIndex}: 0x${bytes[startIndex].toString(16).padStart(2, '0')}`,
			);
		};

		const sauceData = getSauce(bytes, 80);
		x = 1;
		y = 1;
		topOfScreen = 0;
		escapeCode = '';
		escaped = false;
		const columns = sauceData.columns;
		const imageData = new ScreenData(columns);
		const file = new File(bytes);

		const resetAttributes = () => {
			foreground = magicNumbers.DEFAULT_FOREGROUND;
			background = magicNumbers.DEFAULT_BACKGROUND;
			bold = false;
			blink = false;
			inverse = false;
		};
		resetAttributes();

		const newLine = () => {
			x = 1;
			if (y === 26 - 1) {
				topOfScreen += 1;
			} else {
				y += 1;
			}
		};

		const setPos = (newX, newY) => {
			x = Math.min(columns, Math.max(1, newX));
			y = Math.min(26, Math.max(1, newY));
		};

		const getValues = () => {
			return escapeCode
				.slice(1, -1)
				.split(';')
				.map(value => {
					const parsedValue = parseInt(value, 10);
					return isNaN(parsedValue) ? 1 : parsedValue;
				});
		};

		while (!file.eof()) {
			code = file.get();
			let bytesConsumed;
			if (isUTF8) {
				const decoded = decodeUtf8(bytes, file.getPos() - 1);
				code = decoded.charCode;
				bytesConsumed = decoded.bytesConsumed;
				code = getUnicodeReverseMap.get(code) ?? code;
				if (code > 255) {
					// Substitute '?' for codepoints outside CP437
					code = 63;
				}
			} else {
				bytesConsumed = 1;
			}

			if (escaped) {
				escapeCode += String.fromCharCode(code);
				if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
					escaped = false;
					values = getValues();
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
									imageData.reset();
								}
								break;
							case 'K':
								for (j = x - 1; j < columns; j += 1) {
									imageData.set(j, y - 1 + topOfScreen, 0, 0);
								}
								break;
							case 'm':
								for (j = 0; j < values.length; j += 1) {
									if (values[j] >= 30 && values[j] <= 37) {
										foreground = values[j] - 30;
									} else if (values[j] >= 40 && values[j] <= 47) {
										background = values[j] - 40;
									} else {
										switch (values[j]) {
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
					case 10: // Lone linefeed (LF).
						newLine();
						break;
					case 13: // Carriage Return, and Linefeed (CRLF)
						if (file.peek() === 0x0a) {
							file.read(1);
							newLine();
						}
						break;
					case 26: // Ignore eof characters until the actual end-of-file, or sauce record
						break;
					default:
						if (code === 27 && file.peek() === 0x5b) {
							escaped = true;
						} else {
							if (!inverse) {
								imageData.set(
									x - 1,
									y - 1 + topOfScreen,
									code,
									bold ? foreground + 8 : foreground,
									blink ? background + 8 : background,
								);
							} else {
								imageData.set(
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
				// file.get() already consumed the first byte
				file.seek(file.getPos() + (bytesConsumed - 1));
			}
		}

		return {
			width: columns,
			height: imageData.getHeight(),
			data: imageData.getData(),
			noblink: sauceData.iceColors,
			title: sauceData.title,
			author: sauceData.author,
			group: sauceData.group,
			comments: sauceData.comments,
			fontName: sauceData.fontName,
			letterSpacing: sauceData.letterSpacing,
			sauceFlags: sauceData.sauceFlags,
		};
	};

	const convertData = data => {
		const output = new Uint16Array(data.length / 3);
		for (let i = 0, j = 0; i < data.length; i += 1, j += 3) {
			output[i] = (data[j] << 8) + (data[j + 2] << 4) + data[j + 1];
		}
		return output;
	};

	const bytesToString = (bytes, offset, size) => {
		let text = '',
				i;
		for (i = 0; i < size; i++) {
			const charCode = bytes[offset + i];
			if (charCode === 0) {
				break;
			} // Stop at null terminator
			text += String.fromCharCode(charCode);
		}
		return text;
	};

	const sauceToAppFont = sauceFontName => {
		if (!sauceFontName) {
			return null;
		}

		switch (sauceFontName) {
			case 'IBM VGA':
				return 'CP437 8x16';
			case 'IBM VGA50':
				return 'CP437 8x8';
			case 'IBM VGA25G':
				return 'CP437 8x19';
			case 'IBM EGA':
				return 'CP437 8x14';
			case 'IBM EGA43':
				return 'CP437 8x8';

			// Code page variants
			case 'IBM VGA 437':
				return 'CP437 8x16';
			case 'IBM VGA50 437':
				return 'CP437 8x8';
			case 'IBM VGA25G 437':
				return 'CP437 8x19';
			case 'IBM EGA 437':
				return 'CP437 8x14';
			case 'IBM EGA43 437':
				return 'CP437 8x8';

			case 'IBM VGA 850':
				return 'CP850 8x16';
			case 'IBM VGA50 850':
				return 'CP850 8x8';
			case 'IBM VGA25G 850':
				return 'CP850 8x19';
			case 'IBM EGA 850':
				return 'CP850 8x14';
			case 'IBM EGA43 850':
				return 'CP850 8x8';

			case 'IBM VGA 852':
				return 'CP852 8x16';
			case 'IBM VGA50 852':
				return 'CP852 8x8';
			case 'IBM VGA25G 852':
				return 'CP852 8x19';
			case 'IBM EGA 852':
				return 'CP852 8x14';
			case 'IBM EGA43 852':
				return 'CP852 8x8';

			// Amiga fonts
			case 'Amiga Topaz 1':
				return 'Topaz 500 8x16';
			case 'Amiga Topaz 1+':
				return 'Topaz+ 500 8x16';
			case 'Amiga Topaz 2':
				return 'Topaz 1200 8x16';
			case 'Amiga Topaz 2+':
				return 'Topaz+ 1200 8x16';
			case 'Amiga MicroKnight':
				return 'MicroKnight 8x16';
			case 'Amiga MicroKnight+':
				return 'MicroKnight+ 8x16';
			case 'Amiga P0T-NOoDLE':
				return 'P0t-NOoDLE 8x16';
			case 'Amiga mOsOul':
				return 'mO\'sOul 8x16';

			// C64 fonts
			case 'C64 PETSCII unshifted':
				return 'C64 PETSCII unshifted 8x8';
			case 'C64 PETSCII shifted':
				return 'C64 PETSCII shifted 8x8';

			// Modern XBIN fonts
			case 'TOPAZ_437':
			case 'Topaz-437':
			case 'Topaz_437':
			case 'Topaz 437':
				return 'Topaz-437 8x16';
			case 'Human Fossil':
			case 'NewSchool_hf':
				return 'Human Fossil 8x16';
			case 'Structures':
				return 'Structures 8x16';
			case 'TES-SYM5':
				return 'TES-SYM5 8x16';
			case 'TES-SYM6':
				return 'TES-SYM6 8x16';
			case 'Calce':
				return 'Calce 8x32';
			case 'FrogBlock':
				return 'FrogBlock 8x8';
			case 'Blobz+':
				return 'Blobz+ 8x16';
			case 'BLOODY':
				return 'BLOODY 8x16';
			case 'C64-DiskMaster':
				return 'C64-DiskMaster 8x16';
			case 'DSS8_2x':
				return 'DSS8 8x16';
			case 'DSS8':
				return 'DSS8 8x8';
			case 'FM-TOWNS_2x':
				return 'FM-TOWNS 8x16';
			case 'FM-TOWNSx':
				return 'FM-TOWNS 8x8';
			case 'Glitch':
				return 'Glitch 8x20';
			case 'GJSCI-X':
				return 'GJSCI-X 8x16';
			case 'Hack_2x':
				return 'Hack 8x16';
			case 'Hack':
				return 'Hack 8x8';
			case 'Line_2x':
				return 'Line 8x16';
			case 'Line':
				return 'Line 8x8';
			case 'Megaball':
				return 'Megaball 8x16';
			case 'NIMBUS':
				return 'NIMBUS 8x20';
			case 'p0t-noodle_2x':
				return 'p0t-noodle 8x20';
			case 'DOS-J700C-V':
				return 'DOS-J700C-V 8x19';
			case 'Perihelion':
				return 'Perihelion 8x16';
			case 'Song_Logo_2x':
				return 'Song_Logo 8x16';
			case 'Song_Logo':
				return 'Song_Logo 8x8';
			case 'Teletext_2x':
				return 'Teletext 8x18';
			case 'Teletext':
				return 'Teletext 8x9';
			case 'TES-GIGR':
				return 'TES-GIGR 8x16';
			case 'Zoids_2x':
				return 'Zoids 8x16';
			case 'Zoids 8x8':
				return 'Zoids 8x8';

			// XBin embedded font
			case 'XBIN':
				return 'XBIN';

			default:
				return null;
		}
	};

	const appToSauceFont = appFontName => {
		if (!appFontName) {
			return 'IBM VGA';
		}

		switch (appFontName) {
			case 'CP437 8x16':
				return 'IBM VGA';
			case 'CP437 8x8':
				return 'IBM VGA50';
			case 'CP437 8x19':
				return 'IBM VGA25G';
			case 'CP437 8x14':
				return 'IBM EGA';

			case 'CP850 8x16':
				return 'IBM VGA 850';
			case 'CP850 8x8':
				return 'IBM VGA50 850';
			case 'CP850 8x19':
				return 'IBM VGA25G 850';
			case 'CP850 8x14':
				return 'IBM EGA 850';

			case 'CP852 8x16':
				return 'IBM VGA 852';
			case 'CP852 8x8':
				return 'IBM VGA50 852';
			case 'CP852 8x19':
				return 'IBM VGA25G 852';
			case 'CP852 8x14':
				return 'IBM EGA 852';

			// Amiga fonts
			case 'Topaz 500 8x16':
				return 'Amiga Topaz 1';
			case 'Topaz+ 500 8x16':
				return 'Amiga Topaz 1+';
			case 'Topaz 1200 8x16':
				return 'Amiga Topaz 2';
			case 'Topaz+ 1200 8x16':
				return 'Amiga Topaz 2+';
			case 'MicroKnight 8x16':
				return 'Amiga MicroKnight';
			case 'MicroKnight+ 8x16':
				return 'Amiga MicroKnight+';
			case 'P0t-NOoDLE 8x16':
				return 'Amiga P0T-NOoDLE';
			case 'mO\'sOul 8x16':
				return 'Amiga mOsOul';

			// C64 fonts
			case 'C64 PETSCII unshifted 8x8':
				return 'C64 PETSCII unshifted';
			case 'C64 PETSCII shifted 8x8':
				return 'C64 PETSCII shifted';

			// Modern XBIN fonts
			case 'Topaz-437 8x16':
				return 'Topaz-437';
			case 'Human Fossil 8x16':
				return 'NewSchool_hf';
			case 'Structures 8x16':
				return 'Structures';
			case 'TES-SYM5 8x16':
				return 'TES-SYM5';
			case 'TES-SYM6 8x16':
				return 'TES-SYM6';
			case 'Calce 8x32':
				return 'Calce';
			case 'FrogBlock 8x8':
				return 'FrogBlock';
			case 'Blobz+ 8x16':
				return 'Blobz+';
			case 'BLOODY 8x16':
				return 'BLOODY';
			case 'C64-DiskMaster 8x16':
				return 'C64-DiskMaster';
			case 'DSS8 8x16':
				return 'DSS8_2x';
			case 'DSS8 8x8':
				return 'DSS8';
			case 'FM-TOWNS 8x16':
				return 'FM-TOWNS_2x';
			case 'FM-TOWNS 8x8':
				return 'FM-TOWNS';
			case 'Glitch 8x20':
				return 'Glitch';
			case 'GJSCI-X 8x16':
				return 'GJSCI-X';
			case 'Hack 8x16':
				return 'Hack_2x';
			case 'Hack 8x8':
				return 'Hack';
			case 'Line 8x16':
				return 'Line_2x';
			case 'Line 8x8':
				return 'Line';
			case 'Megaball 8x16':
				return 'Megaball';
			case 'NIMBUS 8x20':
				return 'NIMBUS';
			case 'p0t-noodle 8x20':
				return 'p0t-noodle_2x';
			case 'DOS-J700C-V 8x19':
				return 'DOS-J700C-V';
			case 'Perihelion 8x16':
				return 'Perihelion';
			case 'Song_Logo 8x16':
				return 'Song_Logo_2x';
			case 'Song_Logo 8x8':
				return 'Song_Logo';
			case 'Teletext 8x18':
				return 'Teletext_2x';
			case 'Teletext 8x9':
				return 'Teletext';
			case 'TES-GIGR 8x16':
				return 'TES-GIGR';
			case 'Zoids 8x16':
				return 'Zoids_2x';
			case 'Zoids 8x8':
				return 'Zoids';

			// XBin embedded font
			case 'XBIN':
				return 'XBIN';

			default:
				return 'IBM VGA';
		}
	};

	const getSauce = (bytes, defaultColumnValue) => {
		let sauce;
		let fileSize;
		let dataType;
		let flags;
		let comments;
		let columns = 0;
		let rows = 0;
		let commentsCount = 0;

		const removeTrailingWhitespace = text => {
			return text.replace(/\s+$/, '');
		};

		const readLE16 = (data, offset) => {
			return data[offset] | (data[offset + 1] << 8);
		};

		const readLE32 = (data, offset) => {
			return (
				data[offset] |
				(data[offset + 1] << 8) |
				(data[offset + 2] << 16) |
				(data[offset + 3] << 24)
			);
		};

		if (defaultColumnValue) {
			let maxColumns = 0;
			let currentColumns = 0;
			for (let i = 0; i < bytes.length; i++) {
				const byte = bytes[i];
				if (byte === 10) {
					rows += 1;
					maxColumns = Math.max(maxColumns, currentColumns);
					currentColumns = 0;
				} else {
					currentColumns += 1;
				}
			}
			if (currentColumns > 0) {
				rows += 1;
				maxColumns = Math.max(maxColumns, currentColumns);
			}
			columns = maxColumns;
			if (defaultColumnValue > 0) {
				columns = defaultColumnValue;
			}
		}

		if (bytes.length >= 128) {
			sauce = bytes.slice(-128);
			if (
				bytesToString(sauce, 0, 5) === 'SAUCE' &&
				bytesToString(sauce, 5, 2) === '00'
			) {
				fileSize = readLE32(sauce, 90);
				dataType = sauce[94];
				commentsCount = sauce[104];

				if (dataType === 5) {
					if (sauce[95] > 0) {
						columns = sauce[95] * 2;
						rows = fileSize / columns / 2;
					}
				} else {
					// TInfo of 0 means "unspecified" in wild files: keep the
					// content-derived fallback instead of a 0-column document
					const tinfo1 = readLE16(sauce, 96);
					const tinfo2 = readLE16(sauce, 98);
					if (tinfo1 > 0) {
						columns = tinfo1;
					}
					if (tinfo2 > 0) {
						rows = tinfo2;
					}
				}
				flags = sauce[105];
				const letterSpacingBits = (flags >> 1) & 0x03;

				comments = '';
				if (commentsCount > 0) {
					const commentBlockSize = 5 + commentsCount * 64; // "COMNT" + comment lines
					const totalSauceSize = commentBlockSize + 128; // Comment block + SAUCE record

					if (bytes.length >= totalSauceSize) {
						const commentBlockStart = bytes.length - totalSauceSize;
						const commentId = bytesToString(bytes, commentBlockStart, 5);

						if (commentId === 'COMNT') {
							const commentLines = [];
							for (let i = 0; i < commentsCount; i++) {
								const lineOffset = commentBlockStart + 5 + i * 64;
								const line = removeTrailingWhitespace(
									bytesToString(bytes, lineOffset, 64),
								);
								commentLines.push(line);
							}
							comments = commentLines.join('\n');
						}
					}
				}

				return {
					title: removeTrailingWhitespace(bytesToString(sauce, 7, 35)),
					author: removeTrailingWhitespace(bytesToString(sauce, 42, 20)),
					group: removeTrailingWhitespace(bytesToString(sauce, 62, 20)),
					fileSize: fileSize,
					columns: columns,
					rows: rows,
					iceColors: (flags & 0x01) === 1,
					letterSpacing: letterSpacingBits === 2, // true for 9-pixel fonts
					fontName: removeTrailingWhitespace(bytesToString(sauce, 106, 22)),
					comments: comments,
					sauceFlags: flags,
				};
			}
		}
		return {
			title: '',
			author: '',
			group: '',
			fileSize: bytes.length,
			columns: columns,
			rows: rows,
			iceColors: false,
			letterSpacing: false,
			fontName: '',
			comments: '',
			sauceFlags: null,
		};
	};

	const convertUInt8ToUint16 = (uint8Array, start, size) => {
		let i, j;
		const uint16Array = new Uint16Array(size / 2);
		for (i = 0, j = 0; i < size; i += 2, j += 1) {
			uint16Array[j] = (uint8Array[start + i] << 8) + uint8Array[start + i + 1];
		}
		return uint16Array;
	};

	const loadBin = bytes => {
		const sauce = getSauce(bytes, 160);
		// A binary payload has no newlines, so getSauce's content-derived
		// row count is meaningless for BIN. Rows always derive from the
		// payload size and the selected width: SAUCE FileType when set,
		// else the 160-column default (FileType 0 means "unspecified",
		// like a zero TInfo).
		const payloadSize = sauce.fileSize > 0 ? sauce.fileSize : bytes.length;
		sauce.rows = Math.floor(payloadSize / sauce.columns / 2);
		const data = convertUInt8ToUint16(bytes, 0, sauce.columns * sauce.rows * 2);
		return {
			columns: sauce.columns,
			rows: sauce.rows,
			data: data,
			iceColors: sauce.iceColors,
			letterSpacing: sauce.letterSpacing,
			title: sauce.title,
			author: sauce.author,
			group: sauce.group,
			comments: sauce.comments,
		};
	};

	const checkUTF8 = file => file.endsWith('.utf8.ans') || file.endsWith('.txt');

	const updateSauceModal = (imageData, sauceFlags = null) => {
		$('sauceTitle').value = imageData.title || '';
		$('sauceGroup').value = imageData.group || '';
		$('sauceAuthor').value = imageData.author || '';
		$('sauceComments').value = imageData.comments || '';
		openedSauceFlags = sauceFlags;
		lsTouchedSinceOpen = false;
		enforceMaxBytes();
	};

	const file = (file, callback, opts = {}) => {
		const reader = new FileReader();
		// a corrupt file must surface instead of silently eating the
		// callback: the caller holds load-state that would wedge
		const fail = error => {
			console.error('[Load] failed to parse file:', error);
			opts.onError?.(error);
		};
		// clearXBData fires its callback synchronously and drops the
		// returned promise, so async decoders need their own net or a
		// throw becomes an unhandled rejection fail never sees
		const guarded = fn => async () => {
			try {
				await fn();
			} catch (error) {
				fail(error);
			}
		};
		// load registers first: test harnesses treat listener zero as
		// the load handler
		reader.addEventListener('load', _e => {
			try {
				parse(new Uint8Array(reader.result));
			} catch (error) {
				fail(error);
			}
		});
		reader.addEventListener('error', () => fail(reader.error));
		const parse = data => {
			let imageData;
			switch (file.name.split('.').pop().toLowerCase()) {
				case 'xb':
				case 'xbin': {
					// core decoder: the doc rides the plane-native callback slot
					// like tnd/dur/0wnz, and 512-glyph fonts keep their bytes
					const result = decodeXBin(data);
					updateSauceModal(result.meta, result.sauce?.flags ?? null);
					State.textArtCanvas.clearXBData(async () => {
						if (result.palette6) {
							State.textArtCanvas.setXBPaletteData(result.palette6);
						}
						if (result.fontBytes) {
							const fontValid = State.textArtCanvas.setXBFontData(
								result.fontBytes,
								8,
								result.fontHeight || 16,
							);
							if (fontValid) {
								await new Promise(resolve =>
									State.textArtCanvas.setFont('XBIN', resolve));
							}
						}
						document.dispatchEvent(new CustomEvent('onXBFontLoaded'));
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							u16.letterSpacing,
							undefined,
							result.doc,
						);
					});
					break;
				}
				case 'bin':
					// Clear any previous XB data to avoid palette persistence
					State.textArtCanvas.clearXBData(() => {
						imageData = loadBin(data);
						callback(
							imageData.columns,
							imageData.rows,
							imageData.data,
							imageData.iceColors,
							imageData.letterSpacing,
						);
					});
					break;
				case 'tnd':
					// TundraDraw: 24-bit colors ride the v3 planes; the lossy
					// u16 projection feeds legacy consumers
					State.textArtCanvas.clearXBData(() => {
						const result = decodeTundra(data);
						updateSauceModal({
							title: result.meta.title,
							group: result.meta.group,
							author: result.meta.author,
							comments: result.meta.comments,
						});
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							u16.letterSpacing,
							undefined,
							result.doc,
						);
					});
					break;
				case 'dur':
					// durdraw v7/v8 movie: frames import with the doc; frame 0
					// displays
					State.textArtCanvas.clearXBData(guarded(async () => {
						const result = await decodeDur(data);
						updateSauceModal({
							title: result.meta.title,
							author: result.meta.author,
						});
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							u16.letterSpacing,
							undefined,
							result.doc,
						);
					}));
					break;
				case '0wnz':
					// native t0wnz-doc envelope
					State.textArtCanvas.clearXBData(guarded(async () => {
						const result = await decodeEnvelope(data);
						if (result.fontBytes) {
							const fontValid = State.textArtCanvas.setXBFontData(
								result.fontBytes,
								8,
								result.fontHeight || 16,
							);
							if (fontValid) {
								await new Promise(resolve =>
									State.textArtCanvas.setFont('XBIN', resolve));
							}
						}
						updateSauceModal({
							title: result.meta.title,
							group: result.meta.group,
							author: result.meta.author,
							comments: result.meta.comments,
						});
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							u16.letterSpacing,
							undefined,
							result.doc,
						);
					}));
					break;
				case 'ans':
				case 'diz':
				case 'nfo':
				case 'txt':
				default:
					State.textArtCanvas.clearXBData(() => {
						// callers that know the bytes are scene art (the
						// asciiarena browser mirrors the site's own decode
						// rule) skip the UTF-8 reader outright
						if (checkUTF8(file.name.toLowerCase()) && !opts.preferBytes) {
							try {
								// UTF-8 opens go through the core reader, which
								// builds v3 planes natively (glyph table, extended
								// colors, LF after wrap); the doc rides the
								// plane-native callback slot like tnd/dur/0wnz
								const result = decodeAns(data, { utf8: true });
								updateSauceModal(result.meta, result.sauce?.flags ?? null);
								const u16 = v3ToU16Lossy(result.doc);
								callback(
									u16.columns,
									u16.rows,
									u16.imageData,
									u16.iceColors,
									u16.letterSpacing,
									result.meta.fontName?.trim() || undefined,
									result.doc,
								);
								return;
							} catch (error) {
								// invalid UTF-8 means raw scene bytes (amiga
								// latin-1 txt), not a broken file: fall through
								// to the byte loader instead of dying
								if (!(error instanceof CodecError)) {
									throw error;
								}
							}
						}
						imageData = loadAnsi(data, false);
						updateSauceModal(imageData, imageData.sauceFlags ?? null);
						callback(
							imageData.width,
							imageData.height,
							convertData(imageData.data),
							imageData.noblink,
							imageData.letterSpacing,
							imageData.fontName,
						);
					});
					break;
			}
		};
		reader.readAsArrayBuffer(file);
	};

	return {
		file: file,
		sauceToAppFont: sauceToAppFont,
		appToSauceFont: appToSauceFont,
	};
};

const Load = loadModule();

const saveModule = () => {
	const saveFile = async (bytes, sauce, filename) => {
		let outputBytes;
		if (sauce !== undefined) {
			outputBytes = new Uint8Array(bytes.length + 1 + sauce.length);
			outputBytes.set(bytes, 0);
			outputBytes[bytes.length] = 0x1a; // EOF marker / separator
			outputBytes.set(sauce, bytes.length + 1);
		} else {
			outputBytes = new Uint8Array(bytes.length);
			outputBytes.set(bytes, 0);
		}

		try {
			if ('showSaveFilePicker' in window) {
				const handle = await window.showSaveFilePicker({
					suggestedName: filename,
					types: [
						{
							description: 'Text Art',
							accept: {
								'application/octet-stream': [
									'.ans',
									'.bin',
									'.xb',
									'.diz',
									'.tnd',
									'.0wnz',
								],
								'text/plain': ['.txt'],
								'image/png': ['.png'],
							},
						},
					],
				});
				const writable = await handle.createWritable();
				await writable.write(outputBytes);
				await writable.close();
			} else {
				const isSafari =
					navigator.userAgent.indexOf('Chrome') === -1 &&
					navigator.userAgent.indexOf('Safari') !== -1;
				if (isSafari) {
					let base64String = '';
					for (let i = 0; i < outputBytes.length; i += 1) {
						base64String += String.fromCharCode(outputBytes[i]);
					}
					const downloadLink = document.createElement('a');
					downloadLink.href =
						'data:application/octet-stream;base64,' + btoa(base64String);
					downloadLink.download = filename;
					downloadLink.click();
				} else {
					const downloadLink = document.createElement('a');
					const blob = new Blob([outputBytes], { type: 'application/octet-stream' });
					downloadLink.href = URL.createObjectURL(blob);
					downloadLink.download = filename;
					downloadLink.click();
					setTimeout(() => URL.revokeObjectURL(downloadLink.href), 100);
				}
			}
		} catch (error) {
			if (error.name === 'AbortError') {
				// Silently ignore user cancel
			} else {
				throw error;
			}
		}
	};

	// Format-budget linter + compression toggle: lossy saves confirm
	// through the export modal when the doc holds anything the target
	// format cannot; XBin always shows it, because the RLE checkbox
	// lives there. Falls through silently when the modal infrastructure
	// is absent (unit tests, headless embeds).
	const confirmExport = (format, label, { compressToggle = false } = {}) =>
		new Promise(resolve => {
			const modal = State.modal;
			const doc = State.textArtCanvas.getDoc?.();
			const report = doc
				? lintDocForFormat(doc, format)
				: { ok: true, issues: []};
			if ((report.ok && !compressToggle) || !modal?.open) {
				resolve({ proceed: true, compress: true });
				return;
			}
			$('exportFormatLabel').textContent = label;
			const list = $('exportIssues');
			list.replaceChildren();
			for (const issue of report.issues) {
				const item = document.createElement('li');
				item.textContent = describeIssue(issue);
				list.appendChild(item);
			}
			$('exportIssuesIntro').classList.toggle('hide', report.ok);
			$('exportCompressLabel').classList.toggle('hide', !compressToggle);
			let settled = false;
			const finish = proceed => {
				if (!settled) {
					settled = true;
					resolve({ proceed, compress: !!$('exportCompress').checked });
				}
			};
			const confirmOnce = () => {
				finish(true);
				modal.close();
			};
			const cancelOnce = () => {
				modal.close();
			};
			$('exportConfirm').addEventListener('click', confirmOnce);
			$('exportCancel').addEventListener('click', cancelOnce);
			modal.open('export');
			modal.onClose(() => {
				$('exportConfirm').removeEventListener('click', confirmOnce);
				$('exportCancel').removeEventListener('click', cancelOnce);
				finish(false);
			});
		});

	const ans = async () => {
		if (!(await confirmExport('ans', 'ANSi')).proceed) {
			return;
		}
		// the core writer: lossy per the modal's warnings, and 24-bit
		// plane colors ride PabloDraw t sequences over the SGR base
		const bytes = encodeAns(State.textArtCanvas.getDoc(), {
			lossy: true,
			frameIndex: State.textArtCanvas.getCurrentFrame?.() ?? 0,
			meta: sauceMetaWithFont(),
		});
		await saveFile(bytes, undefined, State.title + '.ans');
	};

	// UTF-8 and plain-text exports go through the core v3 writer: one
	// cell per column, LF endings, unicode glyphs ride the doc glyph
	// table, ice-vs-blink per the artist's choice
	const utf8 = async () => {
		const bytes = encodeUtf8(State.textArtCanvas.getDoc(), { meta: sauceMeta() });
		await saveFile(bytes, undefined, State.title + '.utf8.ans');
	};

	const utf8Blink = async () => {
		const bytes = encodeUtf8(State.textArtCanvas.getDoc(), {
			blinkMode: 'blink',
			meta: sauceMeta(),
		});
		await saveFile(bytes, undefined, State.title + '.utf8.ans');
	};

	const plainText = async () => {
		if (!(await confirmExport('txt', 'Plain Text')).proceed) {
			return;
		}
		const bytes = encodeUtf8(State.textArtCanvas.getDoc(), { plain: true });
		await saveFile(bytes, undefined, State.title + '.txt');
	};

	const bin = async () => {
		if (!(await confirmExport('bin', 'Binary Text')).proceed) {
			return;
		}
		try {
			const bytes = encodeBin(State.textArtCanvas.getDoc(), {
				meta: sauceMetaWithFont(),
				frameIndex: State.textArtCanvas.getCurrentFrame?.() ?? 0,
			});
			await saveFile(bytes, undefined, State.title + '.bin');
		} catch (error) {
			if (error instanceof CodecError) {
				// odd column counts used to no-op silently after the confirm
				alert(`BIN export failed: ${error.message}`);
				return;
			}
			throw error;
		}
	};

	const xb = async compress => {
		// programmatic escape hatch: an explicit argument skips the
		// export modal entirely
		if (compress !== undefined) {
			await writeXb(compress);
			return;
		}
		const choice = await confirmExport('xbin', 'XBin', { compressToggle: true });
		if (choice.proceed) {
			await writeXb(choice.compress);
		}
	};

	const writeXb = async (compress = true) => {
		// Prefer the original embedded XB font bytes (full 512-glyph
		// fonts survive); the live font object only holds the 256
		// renderable glyphs
		const embeddedFont =
			State.textArtCanvas.getCurrentFontName() === 'XBIN'
				? State.textArtCanvas.getXBFontData?.()
				: null;
		const liveFontData = State.font.getData();
		const fontBytes =
			(embeddedFont && embeddedFont.bytes) ||
			(liveFontData && liveFontData.data) ||
			null;
		// Header wants the UNSCALED glyph height; getHeight() is zoom-scaled
		const fontHeight =
			(embeddedFont && embeddedFont.height) ||
			(liveFontData && liveFontData.height) ||
			State.font.getHeight();
		const bytes = encodeXBin(State.textArtCanvas.getDoc(), {
			palette6: State.textArtCanvas.getXBPaletteData(),
			fontBytes: fontBytes,
			fontHeight: fontHeight,
			compress: compress,
			frameIndex: State.textArtCanvas.getCurrentFrame?.() ?? 0,
			meta: sauceMeta(),
		});
		await saveFile(bytes, undefined, State.title + '.xb');
	};

	const dataUrlToBytes = dataURL => {
		const base64Index = dataURL.indexOf(';base64,') + 8;
		const byteChars = atob(dataURL.slice(base64Index));
		const bytes = new Uint8Array(byteChars.length);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = byteChars.charCodeAt(i);
		}
		return bytes;
	};

	const sauceMeta = () => ({
		title: $('sauceTitle').value,
		group: $('sauceGroup').value,
		author: $('sauceAuthor').value,
		comments: $('sauceComments').value.trim() || undefined,
	});

	const sauceMetaWithFont = () => {
		const lsNoPreference =
			openedSauceFlags !== null &&
			((openedSauceFlags >> 1) & 0x03) === 0 &&
			!lsTouchedSinceOpen;
		return {
			...sauceMeta(),
			fontName:
				Load.appToSauceFont(State.textArtCanvas.getCurrentFontName()) ||
				undefined,
			aspect:
				openedSauceFlags !== null ? (openedSauceFlags >> 3) & 0x03 : 0,
			letterSpacingMode: lsNoPreference ? 0 : undefined,
		};
	};

	const tnd = async () => {
		// the linter fronts the throw cases (unicode glyphs, blink) plus
		// the silent chars-1-6 blanking, so the artist decides first
		if (!(await confirmExport('tnd', 'TundraDraw')).proceed) {
			return;
		}
		// encodeTundra appends its own SAUCE; it throws on content tundra
		// cannot hold (unicode glyphs, blink attrs)
		try {
			const bytes = encodeTundra(State.textArtCanvas.getDoc(), { meta: sauceMeta() });
			await saveFile(bytes, undefined, State.title + '.tnd');
		} catch (error) {
			console.error('[Save] tundra:', error);
		}
	};

	// Animation exports: classic ansimation (clear + home-per-frame,
	// baud is the clock) and the durdraw v8 movie (256-color, utf-8)
	const ansimation = async () => {
		if (!(await confirmExport('ans', 'ANSimation')).proceed) {
			return;
		}
		const bytes = encodeAnsimation(State.textArtCanvas.getDoc(), { meta: sauceMeta() });
		await saveFile(bytes, undefined, State.title + '.ans');
	};

	const dur = async () => {
		const bytes = await encodeDur(State.textArtCanvas.getDoc(), sauceMeta());
		await saveFile(bytes, undefined, State.title + '.dur');
	};

	// Timelapse: baseline + op log from the server, replayed into a
	// capped multi-frame movie, the shareable session artifact
	const timelapse = async () => {
		if (State.network?.extCollab?.() !== true) {
			alert(
				'Session timelapse needs a live collab session on a teXt0wnz server.',
			);
			return;
		}
		const payload = await State.network.requestTimelapse();
		if (!payload) {
			alert('The server did not answer the timelapse request.');
			return;
		}
		try {
			const { doc } = timelapseToDoc(payload);
			const bytes = await encodeDur(doc, sauceMeta());
			await saveFile(
				bytes,
				undefined,
				(State.title || 'session') + '.timelapse.dur',
			);
		} catch (error) {
			console.error('[Save] timelapse:', error);
			alert('Timelapse replay failed.');
		}
	};

	const ownz = async () => {
		const xbData = State.textArtCanvas.getXBFontData();
		const bytes = await encodeEnvelope(State.textArtCanvas.getDoc(), {
			meta: sauceMeta(),
			fontBytes: xbData ? xbData.bytes : null,
			fontHeight: xbData ? xbData.height : undefined,
		});
		await saveFile(bytes, undefined, State.title + '.0wnz');
	};

	const png = async () => {
		const fname = State.title;
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		const width = State.textArtCanvas.getColumns() * fontWidth;
		const height = State.textArtCanvas.getRows() * fontHeight;
		if (width * height > magicNumbers.MAX_CANVAS_AREA) {
			// Tall documents exceed the iOS Safari canvas area cap, so encode
			// from chunk strips without compositing one full-size canvas
			const image = State.textArtCanvas.getImageRGBA();
			await saveFile(
				encodePng({
					width: image.width,
					height: image.height,
					data: image.data,
					channels: 4,
				}),
				undefined,
				fname + '.png',
			);
		} else {
			await saveFile(
				dataUrlToBytes(State.textArtCanvas.getImage().toDataURL()),
				undefined,
				fname + '.png',
			);
		}
	};

	return {
		ans: ans,
		ansimation: ansimation,
		bin: bin,
		dur: dur,
		ownz: ownz,
		plainText: plainText,
		png: png,
		timelapse: timelapse,
		tnd: tnd,
		utf8: utf8,
		utf8Blink: utf8Blink,
		xb: xb,
	};
};
const Save = saveModule();

export { Load, Save };
export default { Load, Save };
