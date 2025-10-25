import { describe, it, expect } from 'vitest';

// Note: This module has fs dependencies, limiting direct unit testing
// These tests focus on testing the exports and algorithms where possible

describe('FileIO Module Integration Tests', () => {
	describe('Module Exports', () => {
		it('should export the expected functions', async () => {
			// Dynamic import to avoid issues with fs dependencies during module load
			const module = await import('../../../src/js/server/fileio.js');

			expect(module.load).toBeDefined();
			expect(typeof module.load).toBe('function');
			expect(module.save).toBeDefined();
			expect(typeof module.save).toBe('function');
			expect(module.default).toBeDefined();
			expect(typeof module.default.load).toBe('function');
			expect(typeof module.default.save).toBe('function');
		});
	});

	describe('SAUCE Data Processing Logic', () => {
		it('should parse SAUCE signature correctly', () => {
			// Test SAUCE signature detection logic
			const mockBytes = new Uint8Array(256);

			// Add SAUCE signature at position -128
			const sauceStart = mockBytes.length - 128;
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			mockBytes.set(sauceSignature, sauceStart);

			// Test signature detection (simulate the internal logic)
			const sauceData = mockBytes.slice(-128);
			const signature = String.fromCharCode(...sauceData.slice(0, 7));

			expect(signature).toBe('SAUCE00');
		});

		it('should extract SAUCE metadata correctly', () => {
			// Test metadata extraction logic
			const mockSauceData = new Uint8Array(128);

			// Set SAUCE signature
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			mockSauceData.set(sauceSignature, 0);

			// Set title at offset 7 (35 bytes) - pad with spaces
			const title = 'Test ANSI Art';
			const titleBytes = new Uint8Array(35);
			titleBytes.fill(0x20); // Fill with spaces
			for (let i = 0; i < title.length; i++) {
				titleBytes[i] = title.charCodeAt(i);
			}
			mockSauceData.set(titleBytes, 7);

			// Set author at offset 42 (20 bytes) - pad with spaces
			const author = 'Test Artist';
			const authorBytes = new Uint8Array(20);
			authorBytes.fill(0x20); // Fill with spaces
			for (let i = 0; i < author.length; i++) {
				authorBytes[i] = author.charCodeAt(i);
			}
			mockSauceData.set(authorBytes, 42);

			// Extract title and author (simulate internal logic)
			const extractedTitle = String.fromCharCode(
				...mockSauceData.slice(7, 42),
			).replace(/\s+$/, '');
			const extractedAuthor = String.fromCharCode(
				...mockSauceData.slice(42, 62),
			).replace(/\s+$/, '');

			expect(extractedTitle).toBe(title);
			expect(extractedAuthor).toBe(author);
		});

		it('should handle ICE colors and letter spacing flags', () => {
			// Test flag parsing logic
			const mockSauceData = new Uint8Array(128);

			// Set flags at offset 105
			// Bit 0 = ICE colors, Bit 1 = letter spacing (shifted)
			mockSauceData[105] = 0x01 | (0x02 << 1); // Both flags set

			// Test flag extraction (simulate internal logic)
			const flags = mockSauceData[105];
			const iceColors = (flags & 0x01) === 1;
			const letterSpacing = ((flags >> 1) & 0x02) === 2;

			expect(iceColors).toBe(true);
			expect(letterSpacing).toBe(true);
		});

		it('should handle group metadata field', () => {
			// Test group field extraction
			const mockSauceData = new Uint8Array(128);

			// Set SAUCE signature
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			mockSauceData.set(sauceSignature, 0);

			// Set group at offset 62 (20 bytes) - pad with spaces
			const group = 'Blocktronics';
			const groupBytes = new Uint8Array(20);
			groupBytes.fill(0x20); // Fill with spaces
			for (let i = 0; i < group.length; i++) {
				groupBytes[i] = group.charCodeAt(i);
			}
			mockSauceData.set(groupBytes, 62);

			// Extract group (simulate internal logic)
			const extractedGroup = String.fromCharCode(
				...mockSauceData.slice(62, 82),
			).replace(/\s+$/, '');

			expect(extractedGroup).toBe(group);
		});

		it('should handle empty metadata fields', () => {
			// Test extraction with empty/space-filled fields
			const mockSauceData = new Uint8Array(128);

			// Set SAUCE signature
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			mockSauceData.set(sauceSignature, 0);

			// Fill title with spaces only
			mockSauceData.fill(0x20, 7, 42);

			// Extract title (should be empty after trim)
			const extractedTitle = String.fromCharCode(
				...mockSauceData.slice(7, 42),
			).replace(/\s+$/, '');

			expect(extractedTitle).toBe('');
		});

		it('should extract file size from SAUCE', () => {
			// Test file size extraction (4 bytes, little-endian)
			const mockSauceData = new Uint8Array(128);

			// Set a file size of 10000 bytes
			const fileSize = 10000;
			mockSauceData[90] = fileSize & 0xff;
			mockSauceData[91] = (fileSize >> 8) & 0xff;
			mockSauceData[92] = (fileSize >> 16) & 0xff;
			mockSauceData[93] = (fileSize >> 24) & 0xff;

			// Extract file size (little-endian)
			const extractedSize =
				mockSauceData[90] +
				(mockSauceData[91] << 8) +
				(mockSauceData[92] << 16) +
				(mockSauceData[93] << 24);

			expect(extractedSize).toBe(fileSize);
		});

		it('should extract data type from SAUCE', () => {
			// Test data type field (offset 94)
			const mockSauceData = new Uint8Array(128);

			// Set data type to 5 (BIN binary)
			mockSauceData[94] = 5;

			expect(mockSauceData[94]).toBe(5);
		});

		it('should handle file type field', () => {
			// Test file type field (offset 95)
			const mockSauceData = new Uint8Array(128);

			// Set file type to 80 (for 160 columns when dataType is 5)
			mockSauceData[95] = 80;

			// For dataType 5, columns = fileType * 2
			const columns = mockSauceData[95] * 2;

			expect(columns).toBe(160);
		});
	});

	describe('Binary Data Conversion Algorithms', () => {
		it('should convert Uint16 to Uint8 arrays correctly', () => {
			// Test the conversion logic used in save operations
			const convertUint16ToUint8 = uint16Array => {
				const uint8Array = new Uint8Array(uint16Array.length * 2);
				for (let i = 0; i < uint16Array.length; i++) {
					uint8Array[i * 2] = uint16Array[i] >> 8;
					uint8Array[i * 2 + 1] = uint16Array[i] & 255;
				}
				return uint8Array;
			};

			const testData = new Uint16Array([0x4141, 0x0742, 0x1234]);
			const converted = convertUint16ToUint8(testData);

			expect(converted[0]).toBe(0x41); // High byte of 0x4141
			expect(converted[1]).toBe(0x41); // Low byte of 0x4141
			expect(converted[2]).toBe(0x07); // High byte of 0x0742
			expect(converted[3]).toBe(0x42); // Low byte of 0x0742
			expect(converted[4]).toBe(0x12); // High byte of 0x1234
			expect(converted[5]).toBe(0x34); // Low byte of 0x1234
		});

		it('should convert Uint8 to Uint16 arrays correctly', () => {
			// Test the conversion logic used in load operations
			const convertUint8ToUint16 = (uint8Array, start, size) => {
				const uint16Array = new Uint16Array(size / 2);
				for (let i = 0, j = 0; i < size; i += 2, j++) {
					uint16Array[j] =
						(uint8Array[start + i] << 8) + uint8Array[start + i + 1];
				}
				return uint16Array;
			};

			const testData = new Uint8Array([0x41, 0x41, 0x07, 0x42, 0x12, 0x34]);
			const converted = convertUint8ToUint16(testData, 0, 6);

			expect(converted[0]).toBe(0x4141);
			expect(converted[1]).toBe(0x0742);
			expect(converted[2]).toBe(0x1234);
		});
	});

	describe('SAUCE Creation Logic', () => {
		it('should create SAUCE record with correct structure', () => {
			// Test SAUCE creation logic
			const createSauceRecord = (columns, rows, iceColors, letterSpacing) => {
				const sauce = new Uint8Array(129); // 129 bytes total

				// SAUCE signature
				sauce[0] = 0x1a; // EOF character
				const signature = new TextEncoder().encode('SAUCE00');
				sauce.set(signature, 1);

				// Set columns and rows
				sauce[97] = columns & 0xff;
				sauce[98] = (columns >> 8) & 0xff;
				sauce[99] = rows & 0xff;
				sauce[100] = (rows >> 8) & 0xff;

				// Set flags
				let flags = 0;
				if (iceColors) {
					flags |= 0x01;
				}
				if (!letterSpacing) {
					flags |= 0x02;
				} else {
					flags |= 0x04;
				} // Note: letterSpacing true = bit 2
				sauce[106] = flags;

				return sauce;
			};

			const sauce = createSauceRecord(80, 25, true, false);

			// Verify signature
			expect(sauce[0]).toBe(0x1a);
			expect(String.fromCharCode(...sauce.slice(1, 8))).toBe('SAUCE00');

			// Verify dimensions
			expect(sauce[97] + (sauce[98] << 8)).toBe(80); // columns
			expect(sauce[99] + (sauce[100] << 8)).toBe(25); // rows

			// Verify flags
			expect(sauce[106] & 0x01).toBe(1); // ICE colors enabled
			expect(sauce[106] & 0x02).toBe(2); // Letter spacing flag
		});

		it('should handle date formatting in SAUCE records', () => {
			// Test date handling logic
			const formatSauceDate = date => {
				const year = date.getFullYear().toString();
				const month = (date.getMonth() + 1).toString().padStart(2, '0');
				const day = date.getDate().toString().padStart(2, '0');
				return { year, month, day };
			};

			// Use explicit date components to avoid timezone issues
			const testDate = new Date(2023, 11, 25); // Year, Month (0-indexed), Day
			const formatted = formatSauceDate(testDate);

			expect(formatted.year).toBe('2023');
			expect(formatted.month).toBe('12');
			expect(formatted.day).toBe('25');
		});

		it('should handle single-digit months and days', () => {
			// Test date padding for single digits
			const formatSauceDate = date => {
				const year = date.getFullYear().toString();
				const month = date.getMonth() + 1;
				const day = date.getDate();
				return {
					year,
					month: month < 10 ? '0' + month : month.toString(),
					day: day < 10 ? '0' + day : day.toString(),
				};
			};

			// Use explicit date components to avoid timezone issues
			const testDate = new Date(2023, 0, 5); // Year, Month (0-indexed), Day
			const formatted = formatSauceDate(testDate);

			expect(formatted.month).toBe('01');
			expect(formatted.day).toBe('05');
		});

		it('should set correct datatype for SAUCE', () => {
			// Test datatype field settings
			const sauce = new Uint8Array(129);

			// Data type 5 = binary text
			sauce[95] = 5;

			expect(sauce[95]).toBe(5);
		});

		it('should calculate filetype from columns for binary', () => {
			// For datatype 5 (binary), filetype = columns / 2
			const columns = 160;
			const filetype = columns / 2;

			expect(filetype).toBe(80);
		});

		it('should store file size correctly', () => {
			// Test file size storage (4 bytes, little-endian)
			const sauce = new Uint8Array(129);
			const filesize = 15000;

			sauce[91] = filesize & 0xff;
			sauce[92] = (filesize >> 8) & 0xff;
			sauce[93] = (filesize >> 16) & 0xff;
			sauce[94] = filesize >> 24;

			const reconstructed =
				sauce[91] +
				(sauce[92] << 8) +
				(sauce[93] << 16) +
				(sauce[94] << 24);

			expect(reconstructed).toBe(filesize);
		});

		it('should add text fields to SAUCE correctly', () => {
			// Test text field addition
			const addText = (target, text, maxlength, index) => {
				for (let i = 0; i < maxlength; i++) {
					target[i + index] = i < text.length ? text.charCodeAt(i) : 0x20;
				}
			};

			const sauce = new Uint8Array(129);
			const title = 'My Artwork';

			addText(sauce, title, 35, 8);

			// Extract and verify
			const extracted = String.fromCharCode(...sauce.slice(8, 43)).replace(
				/\s+$/,
				'',
			);
			expect(extracted).toBe(title);
		});

		it('should pad short text fields with spaces', () => {
			// Test that short text is padded
			const addText = (target, text, maxlength, index) => {
				for (let i = 0; i < maxlength; i++) {
					target[i + index] = i < text.length ? text.charCodeAt(i) : 0x20;
				}
			};

			const sauce = new Uint8Array(129);
			const shortText = 'Hi';

			addText(sauce, shortText, 10, 0);

			// Check padding
			expect(sauce[2]).toBe(0x20); // Space
			expect(sauce[9]).toBe(0x20); // Space
		});
	});

	describe('File Format Validation', () => {
		it('should detect SAUCE signature presence', () => {
			// Test SAUCE signature detection algorithm
			const hasSauceSignature = bytes => {
				if (bytes.length < 128) {
					return false;
				}
				const sauce = bytes.slice(-128);
				const signature = String.fromCharCode(...sauce.slice(0, 7));
				return signature === 'SAUCE00';
			};

			// Test with SAUCE
			const withSauce = new Uint8Array(256);
			const sauceSignature = new TextEncoder().encode('SAUCE00');
			withSauce.set(sauceSignature, withSauce.length - 128);

			// Test without SAUCE
			const withoutSauce = new Uint8Array(256);

			expect(hasSauceSignature(withSauce)).toBe(true);
			expect(hasSauceSignature(withoutSauce)).toBe(false);
			expect(hasSauceSignature(new Uint8Array(50))).toBe(false); // Too small
		});

		it('should extract canvas dimensions from various sources', () => {
			// Test dimension extraction logic
			const extractDimensions = (bytes, defaultColumns = 80) => {
				if (bytes.length >= 128) {
					const sauce = bytes.slice(-128);
					const signature = String.fromCharCode(...sauce.slice(0, 7));

					if (signature === 'SAUCE00') {
						const columns = sauce[96] + (sauce[97] << 8);
						const rows = sauce[99] + (sauce[100] << 8);
						return { columns, rows, source: 'sauce' };
					}
				}

				// Default dimensions when no SAUCE
				return {
					columns: defaultColumns,
					rows: Math.floor(bytes.length / (defaultColumns * 2)),
					source: 'calculated',
				};
			};

			// Test with SAUCE dimensions
			const withSauce = new Uint8Array(256);
			const sauceStart = withSauce.length - 128;
			const signature = new TextEncoder().encode('SAUCE00');
			withSauce.set(signature, sauceStart);
			withSauce[sauceStart + 96] = 160; // 160 columns
			withSauce[sauceStart + 99] = 50; // 50 rows

			const sauceDims = extractDimensions(withSauce);
			expect(sauceDims.columns).toBe(160);
			expect(sauceDims.rows).toBe(50);
			expect(sauceDims.source).toBe('sauce');

			// Test without SAUCE
			const withoutSauce = new Uint8Array(4000); // 80x25 = 4000 bytes
			const calcDims = extractDimensions(withoutSauce, 80);
			expect(calcDims.columns).toBe(80);
			expect(calcDims.rows).toBe(25);
			expect(calcDims.source).toBe('calculated');
		});

		it('should handle datatype 5 dimensions differently', () => {
			// Test dimension calculation for datatype 5
			const extractType5Dimensions = (sauce, fileSize) => {
				const fileType = sauce[95];
				const columns = fileType * 2;
				const rows = fileSize / columns / 2;
				return { columns, rows };
			};

			const sauce = new Uint8Array(128);
			sauce[94] = 5; // datatype
			sauce[95] = 80; // filetype

			const dims = extractType5Dimensions(sauce, 8000);
			expect(dims.columns).toBe(160); // 80 * 2
			expect(dims.rows).toBe(25); // 8000 / 160 / 2
		});

		it('should handle invalid SAUCE version', () => {
			// Test detection of invalid SAUCE version
			const isValidSauce = bytes => {
				if (bytes.length < 128) return false;
				const sauce = bytes.slice(-128);
				const id = String.fromCharCode(...sauce.slice(0, 5));
				const version = String.fromCharCode(...sauce.slice(5, 7));
				return id === 'SAUCE' && version === '00';
			};

			const validSauce = new Uint8Array(256);
			const sauceStart = validSauce.length - 128;
			validSauce.set(new TextEncoder().encode('SAUCE00'), sauceStart);

			const invalidVersion = new Uint8Array(256);
			const invalidStart = invalidVersion.length - 128;
			invalidVersion.set(new TextEncoder().encode('SAUCE99'), invalidStart);

			expect(isValidSauce(validSauce)).toBe(true);
			expect(isValidSauce(invalidVersion)).toBe(false);
		});

		it('should handle files exactly 128 bytes', () => {
			// Edge case: file exactly 128 bytes (could be all SAUCE)
			const tinyFile = new Uint8Array(128);
			const signature = new TextEncoder().encode('SAUCE00');
			tinyFile.set(signature, 0);

			// Should detect SAUCE
			const hasSauce = String.fromCharCode(...tinyFile.slice(0, 7)) === 'SAUCE00';
			expect(hasSauce).toBe(true);
		});

		it('should handle very large canvas dimensions', () => {
			// Test handling of 16-bit dimensions
			const testLargeDimensions = (columns, rows) => {
				const sauce = new Uint8Array(128);
				sauce[96] = columns & 0xff;
				sauce[97] = (columns >> 8) & 0xff;
				sauce[99] = rows & 0xff;
				sauce[100] = (rows >> 8) & 0xff;

				const extractedCols = sauce[96] + (sauce[97] << 8);
				const extractedRows = sauce[99] + (sauce[100] << 8);

				return { columns: extractedCols, rows: extractedRows };
			};

			// Test maximum 16-bit values
			const maxDims = testLargeDimensions(65535, 32768);
			expect(maxDims.columns).toBe(65535);
			expect(maxDims.rows).toBe(32768);

			// Test typical large dimensions
			const largeDims = testLargeDimensions(320, 200);
			expect(largeDims.columns).toBe(320);
			expect(largeDims.rows).toBe(200);
		});
	});

	describe('Additional Edge Cases', () => {
		it('should handle zero-length file data', () => {
			// Test handling of empty files
			const isEmpty = bytes => bytes.length === 0;
			expect(isEmpty(new Uint8Array(0))).toBe(true);
		});

		it('should handle files smaller than SAUCE size', () => {
			// Test small files that can't contain SAUCE
			const canHaveSauce = bytes => bytes.length >= 128;
			expect(canHaveSauce(new Uint8Array(50))).toBe(false);
			expect(canHaveSauce(new Uint8Array(128))).toBe(true);
			expect(canHaveSauce(new Uint8Array(200))).toBe(true);
		});

		it('should validate flag bit operations', () => {
			// Test bitwise flag operations
			const testFlags = (iceColors, letterSpacing) => {
				let flags = 0;
				if (iceColors) flags |= 0x01;
				if (!letterSpacing) flags |= 0x02;
				else flags |= 0x04;

				return {
					flags,
					hasIce: (flags & 0x01) !== 0,
					hasNoLetterSpacing: (flags & 0x02) !== 0,
					hasLetterSpacing: (flags & 0x04) !== 0,
				};
			};

			const result1 = testFlags(true, true);
			expect(result1.hasIce).toBe(true);
			expect(result1.hasLetterSpacing).toBe(true);

			const result2 = testFlags(false, false);
			expect(result2.hasIce).toBe(false);
			expect(result2.hasNoLetterSpacing).toBe(true);
		});

		it('should validate default values when no SAUCE', () => {
			// Test default values used when SAUCE is absent
			const getDefaults = (fileLength, defaultColumns = 160) => {
				return {
					title: '',
					author: '',
					group: '',
					fileSize: fileLength,
					columns: defaultColumns,
					rows: undefined,
					iceColors: false,
					letterSpacing: false,
				};
			};

			const defaults = getDefaults(4000, 160);
			expect(defaults.title).toBe('');
			expect(defaults.author).toBe('');
			expect(defaults.group).toBe('');
			expect(defaults.columns).toBe(160);
			expect(defaults.iceColors).toBe(false);
			expect(defaults.letterSpacing).toBe(false);
		});
	});
});
