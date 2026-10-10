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
	// Cache for generated glyphs, FIFO-capped to bound memory
	const MAX_GLYPH_CACHE_ENTRIES = 4096;
	const glyphCache = new Map();
	const alphaGlyphCache = new Map();

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

	// Glyphs are one pixel wider with letter spacing on (VGA 9px mode)
	const glyphWidth = letterSpacing ? fontData.width + 1 : fontData.width;
	const scaledGlyphWidth = letterSpacing
		? scaledWidth + Math.floor(1 * scaleFactor)
		: scaledWidth;

	// Canvas for glyph generation at ORIGINAL size
	const canvas = createCanvas(glyphWidth, fontData.height);
	const ctx = canvas.getContext('2d');

	/**
	 * Build a glyph's pixels at original size, including the ninth column
	 * when letter spacing is on. VGA rule: column nine is background color,
	 * except chars 0xC0-0xDF duplicate column eight.
	 * @param {CanvasRenderingContext2D} targetCtx - Context used to allocate ImageData
	 * @param {number} charCode - Character code (0-255)
	 * @param {number} foreground - Foreground color (0-15)
	 * @param {number} background - Background color (0-15)
	 * @returns {ImageData} Glyph image data at original size
	 */
	const buildGlyphImageData = (targetCtx, charCode, foreground, background) => {
		const imageData = targetCtx.createImageData(glyphWidth, fontData.height);
		const foregroundColor = palette.getRGBAColor(foreground);
		const backgroundColor = palette.getRGBAColor(background);
		const duplicateColumnEight =
			letterSpacing && charCode >= 0xc0 && charCode <= 0xdf;

		for (
			let y = 0, i = 0, j = charCode * fontData.width * fontData.height;
			y < fontData.height;
			y += 1
		) {
			let bit = 0;
			for (let x = 0; x < fontData.width; x += 1, i += 4, j += 1) {
				bit = bits[j];
				imageData.data.set(bit === 1 ? foregroundColor : backgroundColor, i);
			}
			if (letterSpacing) {
				imageData.data.set(
					duplicateColumnEight && bit === 1
						? foregroundColor
						: backgroundColor,
					i,
				);
				i += 4;
			}
		}
		return imageData;
	};

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
			// Evict the oldest entry once the cache is full
			if (glyphCache.size >= MAX_GLYPH_CACHE_ENTRIES) {
				glyphCache.delete(glyphCache.keys().next().value);
			}
			if (scaleFactor === 1) {
				// No scaling - create directly at original size
				glyphCache.set(
					key,
					buildGlyphImageData(ctx, charCode, foreground, background),
				);
			} else {
				// Scaling needed - generate at original size, then scale
				const tempCanvas = createCanvas(glyphWidth, fontData.height);
				const tempCtx = tempCanvas.getContext('2d');
				tempCtx.putImageData(
					buildGlyphImageData(tempCtx, charCode, foreground, background),
					0,
					0,
				);

				// Scale using nearest-neighbor
				const scaledCanvas = createCanvas(scaledGlyphWidth, scaledHeight);
				const scaledCtx = scaledCanvas.getContext('2d');
				scaledCtx.imageSmoothingEnabled = false;
				scaledCtx.drawImage(
					tempCanvas,
					0,
					0,
					glyphWidth,
					fontData.height,
					0,
					0,
					scaledGlyphWidth,
					scaledHeight,
				);

				const scaledImageData = scaledCtx.getImageData(
					0,
					0,
					scaledGlyphWidth,
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
	};

	// Pre-generate common glyphs when the thread next idles: on-demand
	// generation covers anything drawn before then, and keeping this off the
	// critical path makes font/zoom changes hundreds of ms cheaper
	const idle = globalThis.requestIdleCallback || (fn => setTimeout(fn, 0));
	idle(() => preGenerateCommonGlyphs());

	return {
		getData: () => fontData,
		// Return scaled dimensions
		getWidth: () =>
			letterSpacing ? scaledWidth + Math.floor(1 * scaleFactor) : scaledWidth,
		getHeight: () => scaledHeight,
		getScaleFactor: () => scaleFactor,
		getGlyph: getGlyph,
		getAlphaGlyph: getAlphaGlyph,
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
