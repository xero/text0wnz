import State from './state.js';
import { $, enforceMaxBytes } from './ui.js';
import { getUTF8, getUnicode } from './palette.js';
import magicNumbers from './magicNumbers.js';

// Load module implementation
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
				this.sauce.group = this.getS(20); // String, maximum of 20 characters
				this.sauce.date = this.getS(8); // String, maximum of 8 characters
				this.sauce.fileSize = this.get32(); // unsigned 32-bit
				this.sauce.dataType = this.get();
				this.sauce.fileType = this.get(); // unsigned 8-bit
				this.sauce.tInfo1 = this.get16(); // unsigned 16-bit
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
				const newImageData = new Uint8Array(width * (y + 100) * 3 + imageData.length);
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

		const decodeUtf8 = (bytes, startIndex) => {
			let charCode = bytes[startIndex];
			if ((charCode & 0x80) === 0) {
				// 1-byte sequence (ASCII)
				return { charCode, bytesConsumed: 1 };
			} else if ((charCode & 0xe0) === 0xc0) {
				// 2-byte sequence
				const secondByte = bytes[startIndex + 1];
				charCode = ((charCode & 0x1f) << 6) | (secondByte & 0x3f);
				return { charCode, bytesConsumed: 2 };
			} else if ((charCode & 0xf0) === 0xe0) {
				// 3-byte sequence
				const secondByte = bytes[startIndex + 1];
				const thirdByte = bytes[startIndex + 2];
				charCode = ((charCode & 0x0f) << 12) | ((secondByte & 0x3f) << 6) | (thirdByte & 0x3f);
				return { charCode, bytesConsumed: 3 };
			}
			throw new Error('Invalid UTF-8 byte sequence');
		};

		// Parse SAUCE metadata
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
			let bytesConsumed = 1;
			if (isUTF8) {
				const decoded = decodeUtf8(bytes, file.getPos() - 1);
				code = decoded.charCode;
				bytesConsumed = decoded.bytesConsumed;
				code = Object.keys(getUnicode).find(key => getUnicode(key) === code) || code;
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
											case 0: // Reset attributes
												resetAttributes();
												break;
											case 1: // Bold
												bold = true;
												break;
											case 5: // Blink
												blink = true;
												break;
											case 7: // Inverse
												inverse = true;
												break;
											case 22: // Bold off
												bold = false;
												break;
											case 25: // Blink off
												blink = false;
												break;
											case 27: // Inverse off
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

			// Advance file position for UTF-8 multi-byte sequences
			file.seek(file.getPos() + bytesConsumed - 1);
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

		// Map SAUCE font names to application font names
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
				return 'C64_PETSCII_unshifted';
			case 'C64 PETSCII shifted':
				return 'C64_PETSCII_shifted';

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

		// Map application font names to SAUCE font names
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
			case 'C64_PETSCII_unshifted':
				return 'C64 PETSCII unshifted';
			case 'C64_PETSCII_shifted':
				return 'C64 PETSCII shifted';

			// XBin embedded font
			case 'XBIN':
				return 'XBIN';

			default:
				return 'IBM VGA';
		}
	};

	const getSauce = (bytes, defaultColumnValue) => {
		let sauce, fileSize, dataType, columns, rows, flags, commentsCount, comments;

		const removeTrailingWhitespace = text => {
			return text.replace(/\s+$/, '');
		};

		const readLE16 = (data, offset) => {
			return data[offset] | (data[offset + 1] << 8);
		};

		const readLE32 = (data, offset) => {
			return data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16) | (data[offset + 3] << 24);
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
			if (bytesToString(sauce, 0, 5) === 'SAUCE' && bytesToString(sauce, 5, 2) === '00') {
				fileSize = readLE32(sauce, 90);
				dataType = sauce[94];
				commentsCount = sauce[104]; // Comments field at byte 104

				if (dataType === 5) {
					columns = sauce[95] * 2;
					rows = fileSize / columns / 2;
				} else {
					columns = readLE16(sauce, 96);
					rows = readLE16(sauce, 98);
				}
				flags = sauce[105];
				const letterSpacingBits = (flags >> 1) & 0x03; // Extract bits 1-2

				// Parse comments if present
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
								const line = removeTrailingWhitespace(bytesToString(bytes, lineOffset, 64));
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
		if (sauce.rows === undefined) {
			sauce.rows = sauce.fileSize / 160 / 2;
		}
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

	const uncompress = (bytes, dataIndex, fileSize, column, rows) => {
		const data = new Uint16Array(column * rows);
		let i, value, count, j, k, char, attribute;
		for (i = dataIndex, j = 0; i < fileSize;) {
			value = bytes[i++];
			count = value & 0x3f;
			switch (value >> 6) {
				case 1:
					char = bytes[i++];
					for (k = 0; k <= count; k++) {
						data[j++] = (char << 8) + bytes[i++];
					}
					break;
				case 2:
					attribute = bytes[i++];
					for (k = 0; k <= count; k++) {
						data[j++] = (bytes[i++] << 8) + attribute;
					}
					break;
				case 3:
					char = bytes[i++];
					attribute = bytes[i++];
					for (k = 0; k <= count; k++) {
						data[j++] = (char << 8) + attribute;
					}
					break;
				default:
					for (k = 0; k <= count; k++) {
						data[j++] = (bytes[i++] << 8) + bytes[i++];
					}
					break;
			}
		}
		return data;
	};

	const loadXBin = bytes => {
		const sauce = getSauce(bytes);
		let columns,
				rows,
				fontHeight,
				flags,
				paletteData,
				paletteFlag,
				fontFlag,
				compressFlag,
				iceColorsFlag,
				font512Flag,
				dataIndex,
				data,
				fontData,
				fontName;
		if (bytesToString(bytes, 0, 4) === 'XBIN' && bytes[4] === 0x1a) {
			columns = (bytes[6] << 8) + bytes[5];
			rows = (bytes[8] << 8) + bytes[7];
			fontHeight = bytes[9];
			flags = bytes[10];
			paletteFlag = (flags & 0x01) === 1;
			fontFlag = ((flags >> 1) & 0x01) === 1;
			compressFlag = ((flags >> 2) & 0x01) === 1;
			iceColorsFlag = ((flags >> 3) & 0x01) === 1;
			font512Flag = ((flags >> 4) & 0x01) === 1;
			dataIndex = 11;

			// Extract palette data if present
			paletteData = null;
			if (paletteFlag === true) {
				paletteData = new Uint8Array(48);
				for (let i = 0; i < 48; i++) {
					paletteData[i] = bytes[dataIndex + i];
				}
				dataIndex += 48;
			}

			// Extract font data if present
			fontData = null;
			const fontCharCount = font512Flag ? 512 : 256;
			if (fontFlag === true) {
				const fontDataSize = fontCharCount * fontHeight;
				fontData = new Uint8Array(fontDataSize);
				for (let i = 0; i < fontDataSize; i++) {
					fontData[i] = bytes[dataIndex + i];
				}
				dataIndex += fontDataSize;
			}

			if (compressFlag === true) {
				data = uncompress(bytes, dataIndex, sauce.fileSize, columns, rows);
			} else {
				data = convertUInt8ToUint16(bytes, dataIndex, columns * rows * 2);
			}

			// Always use XBIN font name for XB files as requested
			fontName = 'XBIN';
		}
		return {
			columns: columns,
			rows: rows,
			data: data,
			iceColors: iceColorsFlag,
			letterSpacing: false,
			title: sauce.title,
			author: sauce.author,
			group: sauce.group,
			comments: sauce.comments,
			fontName: fontName,
			paletteData: paletteData,
			fontData: fontData ? { bytes: fontData, width: 8, height: fontHeight } : null,
		};
	};

	const file = (file, callback) => {
		const reader = new FileReader();
		reader.addEventListener('load', _e => {
			const data = new Uint8Array(reader.result);
			let imageData;
			switch (file.name.split('.').pop().toLowerCase()) {
				case 'xb':
					imageData = loadXBin(data);
					// Update SAUCE UI fields like ANSI files do
					$('sauce-title').value = imageData.title || '';
					$('sauce-group').value = imageData.group || '';
					$('sauce-author').value = imageData.author || '';
					$('sauce-comments').value = imageData.comments || '';
					enforceMaxBytes();

					// Implement sequential waterfall loading for XB files to eliminate race conditions
					State.textArtCanvas.loadXBFileSequential(
						imageData,
						(columns, rows, data, iceColors, letterSpacing, fontName) => {
							callback(columns, rows, data, iceColors, letterSpacing, fontName);
						},
					);
					// Trigger character brush refresh for XB files
					document.dispatchEvent(new CustomEvent('onXBFontLoaded'));
					// Then ensure everything is properly rendered after font loading completes
					State.textArtCanvas.redrawEntireImage();
					break;
				case 'bin':
					// Clear any previous XB data to avoid palette persistence
					State.textArtCanvas.clearXBData(() => {
						imageData = loadBin(data);
						callback(imageData.columns, imageData.rows, imageData.data, imageData.iceColors, imageData.letterSpacing);
					});
					break;
				default:
					// Clear any previous XB data to avoid palette persistence
					State.textArtCanvas.clearXBData(() => {
						imageData = loadAnsi(data, file.name.toLowerCase().endsWith('.utf8.ans'));
						$('sauce-title').value = imageData.title;
						$('sauce-group').value = imageData.group;
						$('sauce-author').value = imageData.author;
						$('sauce-comments').value = imageData.comments || '';
						enforceMaxBytes();

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
		});
		reader.readAsArrayBuffer(file);
	};

	return {
		file: file,
		sauceToAppFont: sauceToAppFont,
		appToSauceFont: appToSauceFont,
	};
};

// Create Load module instance
const Load = loadModule();

// Save module implementation
const saveModule = () => {
	const saveFile = (bytes, sauce, filename) => {
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

		const downloadLink = document.createElement('a');
		if (navigator.userAgent.indexOf('Chrome') === -1 && navigator.userAgent.indexOf('Safari') !== -1) {
			let base64String = '';
			for (let i = 0; i < outputBytes.length; i += 1) {
				base64String += String.fromCharCode(outputBytes[i]);
			}
			downloadLink.href = 'data:application/octet-stream;base64,' + btoa(base64String);
		} else {
			const blob = new Blob([outputBytes], { type: 'application/octet-stream' });
			downloadLink.href = URL.createObjectURL(blob);
		}

		downloadLink.download = filename;
		const clickEvent = new MouseEvent('click', {
			bubbles: true,
			cancelable: true,
			view: window,
		});
		downloadLink.dispatchEvent(clickEvent);
		window.URL.revokeObjectURL(downloadLink.href);
	};

	const createSauce = (datatype, filetype, filesize, doFlagsAndTInfoS) => {
		const addText = (text, maxlength, index) => {
			let i;
			for (i = 0; i < maxlength; i += 1) {
				sauce[i + index] = i < text.length ? text.charCodeAt(i) : 0x20;
			}
		};

		const commentsText = $('sauce-comments').value.trim();
		const commentLines = commentsText ? commentsText.split('\n') : [];

		let processedComments = '';
		let commentsCount = 0;
		for (let i = 0; i < commentLines.length; i++) {
			let s = 0;
			while (commentLines[i].length > 0) {
				const line = commentLines[i].substr(s * 64, 64).trim();
				if (line.length === 0) {
					break;
				}
				s++;
				commentsCount++;
				processedComments += line.padEnd(64, ' ');
			}
		}
		commentsCount = Math.min(commentsCount, 255); // Max 255 comment lines per SAUCE spec

		let commentBlock = null;
		if (commentsCount > 0) {
			const commentBlockSize = 5 + commentsCount * 64; // "COMNT" + comment lines
			commentBlock = new Uint8Array(commentBlockSize);

			commentBlock.set(new Uint8Array([0x43, 0x4f, 0x4d, 0x4e, 0x54]), 0); // "COMNT"
			// Set processed comment data
			const commentBytes = new TextEncoder().encode(processedComments);
			commentBlock.set(commentBytes.slice(0, commentsCount * 64), 5);
		}

		// Create 128-byte SAUCE record
		const sauce = new Uint8Array(128);

		// SAUCE signature and version
		addText('SAUCE00', 7, 0);

		// Title, Author, Group (padded)
		const titleBytes = new TextEncoder().encode($('sauce-title').value);
		const authorBytes = new TextEncoder().encode($('sauce-author').value);
		const groupBytes = new TextEncoder().encode($('sauce-group').value);

		sauce.fill(0x20, 7, 42); // Clear title field
		sauce.set(titleBytes.slice(0, 35), 7);

		sauce.fill(0x20, 42, 62); // Clear author field
		sauce.set(authorBytes.slice(0, 20), 42);

		sauce.fill(0x20, 62, 82); // Clear group field
		sauce.set(groupBytes.slice(0, 20), 62);

		// Date (CCYYMMDD format)
		const date = new Date();
		const year = date.getFullYear().toString(10);
		const month = (date.getMonth() + 1).toString(10).padStart(2, '0');
		const day = date.getDate().toString(10).padStart(2, '0');
		addText(`${year}${month}${day}`, 8, 82);

		// File size (bytes 90-93)
		sauce[90] = filesize & 0xff;
		sauce[91] = (filesize >> 8) & 0xff;
		sauce[92] = (filesize >> 16) & 0xff;
		sauce[93] = filesize >> 24;

		// Data type
		sauce[94] = datatype;

		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();

		// File type and dimensions - different handling for BIN format
		if (datatype === 5) {
			// BIN format
			sauce[95] = columns / 2;
			// For BIN, columns and rows aren't stored in typical TInfo1/TInfo2 positions
		} else {
			sauce[95] = filetype;
			sauce[96] = columns & 0xff;
			sauce[97] = columns >> 8;
			sauce[98] = rows & 0xff;
			sauce[99] = rows >> 8;
		}

		// Comments count (byte 104)
		sauce[104] = commentsCount;

		// Flags and font info (only for non-XBIN formats)
		if (datatype !== 6 && doFlagsAndTInfoS) {
			// Not XBIN
			let flags = 0;
			if (State.textArtCanvas.getIceColors() === true) {
				flags += 1;
			}
			if (State.font.getLetterSpacing()) {
				flags += 1 << 2; // 9px font spacing
			} else {
				flags += 1 << 1; // 8px font spacing
			}
			flags += 1 << 4; // Set aspect ratio flag
			sauce[105] = flags;

			// Font name (bytes 106-127)
			const currentAppFontName = State.textArtCanvas.getCurrentFontName();
			const sauceFontName = Load.appToSauceFont(currentAppFontName);
			if (sauceFontName) {
				addText(sauceFontName, Math.min(sauceFontName.length, 22), 106);
			}
		}

		// Combine comment block and sauce record if comments exist
		if (commentBlock) {
			const combined = new Uint8Array(commentBlock.length + sauce.length);
			combined.set(commentBlock, 0);
			combined.set(sauce, commentBlock.length);
			return combined;
		}
		return sauce;
	};

	const encodeANSi = (useUTF8, blinkers = true) => {
		const ansiColor = binColor => {
			switch (binColor) {
				case 1:
					return 4;
				case 3:
					return 6;
				case 4:
					return 1;
				case 6:
					return 3;
				default:
					return binColor;
			}
		};

		const imageData = State.textArtCanvas.getImageData();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		let output = [27, 91, 48, 109]; // Start with a full reset (ESC[0m)
		let bold = false;
		let blink = false;
		let currentForeground = magicNumbers.DEFAULT_FOREGROUND;
		let currentBackground = magicNumbers.DEFAULT_BACKGROUND;
		let currentBold = false;
		let currentBlink = false;

		for (let row = 0; row < rows; row++) {
			let lineOutput = [];
			let lineForeground = currentForeground;
			let lineBackground = currentBackground;
			let lineBold = currentBold;
			let lineBlink = currentBlink;

			for (let col = 0; col < columns; col++) {
				const inputIndex = row * columns + col;
				const attribs = [];
				let charCode = imageData[inputIndex] >> 8;
				let foreground = imageData[inputIndex] & 15;
				let background = (imageData[inputIndex] >> 4) & 15;

				// Map special cases for control characters
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
					default:
						break;
				}

				// Handle bold and blink attributes
				if (foreground > 7) {
					bold = true;
					foreground -= 8;
				} else {
					bold = false;
				}
				if (background > 7) {
					blink = true;
					background -= 8;
				} else {
					blink = false;
				}

				// Reset attributes if necessary
				if ((lineBold && !bold) || (lineBlink && !blink)) {
					attribs.push([48]); // Reset attributes (ESC[0m)
					lineForeground = magicNumbers.DEFAULT_FOREGROUND;
					lineBackground = magicNumbers.DEFAULT_BACKGROUND;
					lineBold = false;
					lineBlink = false;
				}

				// Enable bold or blink if needed
				if (bold && !lineBold) {
					attribs.push([49]); // Bold on (ESC[1m)
					lineBold = true;
				}
				if (blink && !lineBlink) {
					if (!useUTF8 || blinkers) {
						attribs.push([53]); // Blink on (ESC[5m)
					}
					lineBlink = true;
				}

				// Change foreground or background colors if necessary
				if (foreground !== lineForeground) {
					attribs.push([51, 48 + ansiColor(foreground)]); // Set foreground color (ESC[3Xm)
					lineForeground = foreground;
				}
				if (background !== lineBackground) {
					attribs.push([52, 48 + ansiColor(background)]); // Set background color (ESC[4Xm)
					lineBackground = background;
				}

				// Apply attributes if there are changes
				if (attribs.length) {
					lineOutput.push(27, 91); // ESC[
					for (let attribIndex = 0; attribIndex < attribs.length; attribIndex++) {
						lineOutput = lineOutput.concat(attribs[attribIndex]);
						if (attribIndex !== attribs.length - 1) {
							lineOutput.push(59); // ;
						} else {
							lineOutput.push(109); // m
						}
					}
				}

				// Add character to output
				if (useUTF8) {
					getUTF8(charCode).forEach(utf8Code => {
						lineOutput.push(utf8Code);
					});
				} else {
					lineOutput.push(charCode);
				}
			}

			if (useUTF8) {
				// Fill unused columns with spaces and reset attributes
				for (let col = lineOutput.length / 2; col < columns; col++) {
					lineOutput.push(32); // Space character
					lineOutput.push(27, 91, 49, 109); // Reset background color (ESC[49m)
				}
				// Add newline and reset attributes per row
				lineOutput.push(27, 91, 48, 109); // Full reset (ESC[0m)
				lineOutput.push(10); // Newline (LF)
			}

			// Concatenate the line output to the overall output
			output = output.concat(lineOutput);

			// Update current attributes
			currentForeground = lineForeground;
			currentBackground = lineBackground;
			currentBold = lineBold;
			currentBlink = lineBlink;
		}

		// Final full reset
		output.push(27, 91, 48, 109); // ESC[0m

		const sauce = useUTF8 ? '' : createSauce(1, 1, output.length, true);
		const fname = $('artwork-title').value + (useUTF8 ? '.utf8.ans' : '.ans');
		saveFile(new Uint8Array(output), sauce, fname);
	};
	const ans = () => {
		encodeANSi(false);
	};

	const utf8 = () => {
		encodeANSi(true);
	};

	const utf8noBlink = () => {
		encodeANSi(true, false);
	};

	const convert16BitArrayTo8BitArray = Uint16s => {
		const Uint8s = new Uint8Array(Uint16s.length * 2);
		for (let i = 0, j = 0; i < Uint16s.length; i++, j += 2) {
			Uint8s[j] = Uint16s[i] >> 8;
			Uint8s[j + 1] = Uint16s[i] & 255;
		}
		return Uint8s;
	};

	const bin = () => {
		const columns = State.textArtCanvas.getColumns();
		if (columns % 2 === 0) {
			const imageData = convert16BitArrayTo8BitArray(State.textArtCanvas.getImageData());
			const sauce = createSauce(5, columns / 2, imageData.length, true);
			const fname = $('artwork-title').value;
			saveFile(imageData, sauce, fname + '.bin');
		}
	};

	const xb = () => {
		const imageData = convert16BitArrayTo8BitArray(State.textArtCanvas.getImageData());
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const iceColors = State.textArtCanvas.getIceColors();
		let flags = 0;
		if (iceColors === true) {
			flags += 1 << 3;
		}
		const output = new Uint8Array(11 + imageData.length);
		output.set(
			new Uint8Array([
				88,
				66,
				73,
				78,
				26,
				columns & 255,
				columns >> 8,
				rows & 255,
				rows >> 8,
				State.font.getHeight(),
				flags,
			]),
			0,
		);
		output.set(imageData, 11);
		const sauce = createSauce(6, 0, imageData.length, false);
		const fname = $('artwork-title').value;
		saveFile(output, sauce, fname + '.xb');
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

	const png = () => {
		const fname = $('artwork-title').value;
		saveFile(dataUrlToBytes(State.textArtCanvas.getImage().toDataURL()), undefined, fname + '.png');
	};

	return {
		ans: ans,
		utf8: utf8,
		utf8noBlink: utf8noBlink,
		bin: bin,
		xb: xb,
		png: png,
	};
};
const Save = saveModule();

export { Load, Save };
export default { Load, Save };
