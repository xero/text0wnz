/**
 * Lazy Font Loader - Only generates glyphs on demand
 * This module provides a memory-efficient font loading system that generates
 * character glyphs only when they are first needed, rather than pre-generating
 * all 65,536 possible combinations (16 foregrounds × 16 backgrounds × 256 characters).
 */
import { createCanvas } from './ui.js';
import magicNumbers from './magicNumbers.js';

/**
 * Creates a lazy font loader that generates glyphs on demand
 * @param {Object} fontData - Font data with width, height, and bitmap data
 * @param {Object} palette - Palette object with getRGBAColor method
 * @param {boolean} letterSpacing - Whether to use letter spacing
 * @param {number} scaleFactor - Scale factor for zoom (0.5x - 4x, default 1)
 * @returns {Object} Lazy font object with methods for drawing and glyph access
 */
export const createLazyFont = (
	fontData,
	palette,
	letterSpacing = false,
	scaleFactor = 1,
) => {
	// Cache for generated glyphs
	const glyphCache = new Map();
	const alphaGlyphCache = new Map();
	const letterSpacingCache = new Map();

	// Pre-generate bitmap data once
	const bits = new Uint8Array(fontData.width * fontData.height * 256);
	for (
		let i = 0, k = 0;
		i < (fontData.width * fontData.height * 256) / 8;
		i += 1
	) {
		for (let j = 7; j >= 0; j -= 1, k += 1) {
			bits[k] = (fontData.data[i] >> j) & 1;
		}
	}

	// Calculate scaled dimensions
	const scaledWidth = Math.floor(fontData.width * scaleFactor);
	const scaledHeight = Math.floor(fontData.height * scaleFactor);

	// Canvas for glyph generation at ORIGINAL size
	const canvas = createCanvas(fontData.width, fontData.height);
	const ctx = canvas.getContext('2d');

	/**
	 * Generate a single glyph on demand with scaling
	 * @param {number} charCode - Character code (0-255)
	 * @param {number} foreground - Foreground color (0-15)
	 * @param {number} background - Background color (0-15)
	 * @returns {ImageData} Generated glyph image data at scaled size
	 */
	const getGlyph = (charCode, foreground, background) => {
		// Include scaleFactor in cache key
		const key = `${charCode}-${foreground}-${background}-${scaleFactor}`;

		if (!glyphCache.has(key)) {
			if (scaleFactor === 1) {
				// No scaling - create directly at original size
				const imageData = ctx.createImageData(fontData.width, fontData.height);

				for (
					let i = 0, j = charCode * fontData.width * fontData.height;
					i < fontData.width * fontData.height;
					i += 1, j += 1
				) {
					const color = palette.getRGBAColor(
						bits[j] === 1 ? foreground : background,
					);
					imageData.data.set(color, i * 4);
				}

				glyphCache.set(key, imageData);
			} else {
				// Scaling needed - generate at original size, then scale
				const tempCanvas = createCanvas(fontData.width, fontData.height);
				const tempCtx = tempCanvas.getContext('2d');
				const imageData = tempCtx.createImageData(
					fontData.width,
					fontData.height,
				);

				for (
					let i = 0, j = charCode * fontData.width * fontData.height;
					i < fontData.width * fontData.height;
					i += 1, j += 1
				) {
					const color = palette.getRGBAColor(
						bits[j] === 1 ? foreground : background,
					);
					imageData.data.set(color, i * 4);
				}

				tempCtx.putImageData(imageData, 0, 0);

				// Scale using nearest-neighbor
				const scaledCanvas = createCanvas(scaledWidth, scaledHeight);
				const scaledCtx = scaledCanvas.getContext('2d');
				scaledCtx.imageSmoothingEnabled = false;
				scaledCtx.drawImage(
					tempCanvas,
					0,
					0,
					fontData.width,
					fontData.height,
					0,
					0,
					scaledWidth,
					scaledHeight,
				);

				const scaledImageData = scaledCtx.getImageData(
					0,
					0,
					scaledWidth,
					scaledHeight,
				);
				glyphCache.set(key, scaledImageData);
			}
		}

		return glyphCache.get(key);
	};

	/**
	 * Generate an alpha glyph (transparent background) with scaling
	 * @param {number} charCode - Character code
	 * @param {number} foreground - Foreground color (0-15)
	 * @returns {HTMLCanvasElement} Canvas with alpha glyph at scaled size
	 */
	const getAlphaGlyph = (charCode, foreground) => {
		const key = `${charCode}-${foreground}-${scaleFactor}`;

		if (!alphaGlyphCache.has(key)) {
			// Only generate alpha glyphs for specific characters
			if (
				charCode === magicNumbers.LOWER_HALFBLOCK ||
				charCode === magicNumbers.UPPER_HALFBLOCK ||
				charCode === magicNumbers.CHAR_SLASH ||
				charCode === magicNumbers.CHAR_PIPE ||
				charCode === magicNumbers.CHAR_CAPITAL_X
			) {
				const imageData = ctx.createImageData(fontData.width, fontData.height);

				for (
					let i = 0, j = charCode * fontData.width * fontData.height;
					i < fontData.width * fontData.height;
					i += 1, j += 1
				) {
					if (bits[j] === 1) {
						imageData.data.set(palette.getRGBAColor(foreground), i * 4);
					}
				}

				const tempCanvas = createCanvas(fontData.width, fontData.height);
				tempCanvas.getContext('2d').putImageData(imageData, 0, 0);

				// Scale if needed
				if (scaleFactor === 1) {
					alphaGlyphCache.set(key, tempCanvas);
				} else {
					const scaledCanvas = createCanvas(scaledWidth, scaledHeight);
					const scaledCtx = scaledCanvas.getContext('2d');
					scaledCtx.imageSmoothingEnabled = false;
					scaledCtx.drawImage(
						tempCanvas,
						0,
						0,
						fontData.width,
						fontData.height,
						0,
						0,
						scaledWidth,
						scaledHeight,
					);
					alphaGlyphCache.set(key, scaledCanvas);
				}
			}
		}

		return alphaGlyphCache.get(key);
	};

	/**
	 * Get letter spacing image data for a specific color with scaling
	 * @param {number} colorIndex - Color index (0-15)
	 * @returns {ImageData} Letter spacing image data at scaled size
	 */
	const getLetterSpacingData = colorIndex => {
		const key = `${colorIndex}-${scaleFactor}`;

		if (!letterSpacingCache.has(key)) {
			const spacingCanvas = createCanvas(1, scaledHeight);
			const spacingCtx = spacingCanvas.getContext('2d');
			const imageData = spacingCtx.getImageData(0, 0, 1, scaledHeight);
			const color = palette.getRGBAColor(colorIndex);

			for (let j = 0; j < scaledHeight; j++) {
				imageData.data.set(color, j * 4);
			}

			letterSpacingCache.set(key, imageData);
		}

		return letterSpacingCache.get(key);
	};

	/**
	 * Pre-generate commonly used glyphs for instant access
	 * Common characters: space (32) and block characters (176, 177, 178, 219)
	 */
	const preGenerateCommonGlyphs = () => {
		const commonChars = [
			32, // Space
			176, // Light block ░
			177, // Medium block ▒
			178, // Dark block ▓
			219, // Full block █
		];

		for (let fg = 0; fg < 16; fg++) {
			for (let bg = 0; bg < 16; bg++) {
				commonChars.forEach(charCode => {
					getGlyph(charCode, fg, bg);
				});
			}
		}

		// Also pre-generate alpha glyphs for special drawing characters
		const alphaChars = [
			magicNumbers.LOWER_HALFBLOCK,
			magicNumbers.UPPER_HALFBLOCK,
			magicNumbers.CHAR_SLASH,
			magicNumbers.CHAR_PIPE,
			magicNumbers.CHAR_CAPITAL_X,
		];

		for (let fg = 0; fg < 16; fg++) {
			alphaChars.forEach(charCode => {
				getAlphaGlyph(charCode, fg);
			});
		}

		// Pre-generate all letter spacing data
		if (letterSpacing) {
			for (let i = 0; i < 16; i++) {
				getLetterSpacingData(i);
			}
		}
	};

	// Pre-generate common glyphs on initialization
	preGenerateCommonGlyphs();

	return {
		getData: () => fontData,
		// Return scaled dimensions
		getWidth: () =>
			letterSpacing ? scaledWidth + Math.floor(1 * scaleFactor) : scaledWidth,
		getHeight: () => scaledHeight,
		getScaleFactor: () => scaleFactor,
		getGlyph: getGlyph,
		getAlphaGlyph: getAlphaGlyph,
		getLetterSpacingData: getLetterSpacingData,
		getCacheSize: () => glyphCache.size,
		getAlphaCacheSize: () => alphaGlyphCache.size,

		/**
		 * Draw a character at specified position (scaling handled internally)
		 * @param {number} charCode - Character code
		 * @param {number} foreground - Foreground color
		 * @param {number} background - Background color
		 * @param {CanvasRenderingContext2D} drawCtx - Canvas context to draw on
		 * @param {number} x - X coordinate in character grid
		 * @param {number} y - Y coordinate in character grid
		 */
		draw: (charCode, foreground, background, drawCtx, x, y) => {
			const glyph = getGlyph(charCode, foreground, background);

			if (letterSpacing) {
				drawCtx.putImageData(
					glyph,
					x * (scaledWidth + Math.floor(1 * scaleFactor)),
					y * scaledHeight,
				);
			} else {
				drawCtx.putImageData(glyph, x * scaledWidth, y * scaledHeight);
			}
		},

		/**
		 * Draw a character with alpha transparency (scaling handled internally)
		 * @param {number} charCode - Character code
		 * @param {number} foreground - Foreground color
		 * @param {CanvasRenderingContext2D} drawCtx - Canvas context to draw on
		 * @param {number} x - X coordinate in character grid
		 * @param {number} y - Y coordinate in character grid
		 */
		drawWithAlpha: (charCode, foreground, drawCtx, x, y) => {
			// Use fallback character (X) if requested character has no alpha glyph
			const effectiveCharCode = getAlphaGlyph(charCode, foreground)
				? charCode
				: magicNumbers.CHAR_CAPITAL_X;

			const canvasToUse = getAlphaGlyph(effectiveCharCode, foreground);

			if (letterSpacing) {
				const effectiveWidth = scaledWidth + Math.floor(1 * scaleFactor);
				drawCtx.drawImage(canvasToUse, x * effectiveWidth, y * scaledHeight);

				// Handle special line drawing characters
				if (effectiveCharCode >= 192 && effectiveCharCode <= 223) {
					drawCtx.drawImage(
						canvasToUse,
						scaledWidth - 1,
						0,
						1,
						scaledHeight,
						x * effectiveWidth + scaledWidth,
						y * scaledHeight,
						1,
						scaledHeight,
					);
				}
			} else {
				drawCtx.drawImage(canvasToUse, x * scaledWidth, y * scaledHeight);
			}
		},
	};
};
