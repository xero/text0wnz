import State from './state.js';
import { createCanvas } from './ui.js';
import magicNumbers from './magicNumbers.js';

const loadImageAndGetImageData = url => {
	return new Promise((resolve, reject) => {
		const imgElement = new Image();
		imgElement.addEventListener('load', () => {
			const canvas = createCanvas(imgElement.width, imgElement.height);
			const ctx = canvas.getContext('2d');
			ctx.drawImage(imgElement, 0, 0);
			const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
			resolve(imageData);
		});
		imgElement.addEventListener('error', () => {
			reject(new Error(`Failed to load image: ${url}`));
		});
		imgElement.src = url;
	});
};

const loadFontFromXBData = (fontBytes, fontWidth, fontHeight, letterSpacing, palette) => {
	return new Promise((resolve, reject) => {
		let fontData = {};
		let fontGlyphs;
		let alphaGlyphs;
		let letterSpacingImageData;

		const parseXBFontData = (fontBytes, fontWidth, fontHeight) => {
			if (!fontBytes) {
				console.error(
					`[Font] Invalid fontBytes provided to parseXBFontData. ` +
					`Expected: a non-empty Uint8Array or Buffer; Received: ${String(fontBytes)}`,
				);
				throw new Error('Failed to load XB font data');
			}
			if (fontBytes.length === 0) {
				console.error(
					`[Font] Invalid fontBytes provided to parseXBFontData. ` +
					`Expected: a non-empty Uint8Array or Buffer; Received: ` +
					`type ${typeof fontBytes}, length ${fontBytes.length}`,
				);
				throw new Error('Failed to load XB font data');
			}
			if (!fontWidth || fontWidth <= 0) {
				fontWidth = magicNumbers.DEFAULT_FONT_WIDTH;
			}
			if (!fontHeight || fontHeight <= 0) {
				fontHeight = magicNumbers.DEFAULT_FONT_HEIGHT;
			}
			const expectedDataSize = fontHeight * 256;
			if (fontBytes.length < expectedDataSize) {
				console.error('[Font] XB font data too small. Expected:', expectedDataSize, ' Received:', fontBytes.length);
				return null;
			}
			const internalDataSize = (fontWidth * fontHeight * 256) / 8;
			const data = new Uint8Array(internalDataSize);
			for (let i = 0; i < internalDataSize && i < fontBytes.length; i++) {
				data[i] = fontBytes[i];
			}

			return {
				width: fontWidth,
				height: fontHeight,
				data: data,
			};
		};

		const generateNewFontGlyphs = () => {
			const zoom = State.zoom || 1;
			const scaledWidth = Math.round(fontData.width * zoom);
			const scaledHeight = Math.round(fontData.height * zoom);

			const canvas = createCanvas(fontData.width, fontData.height);
			const ctx = canvas.getContext('2d');
			const bits = new Uint8Array(fontData.width * fontData.height * 256);
			for (let i = 0, k = 0; i < (fontData.width * fontData.height * 256) / 8; i += 1) {
				for (let j = 7; j >= 0; j -= 1, k += 1) {
					bits[k] = (fontData.data[i] >> j) & 1;
				}
			}
			fontGlyphs = new Array(16);
			for (let foreground = 0; foreground < 16; foreground++) {
				fontGlyphs[foreground] = new Array(16);
				for (let background = 0; background < 16; background++) {
					fontGlyphs[foreground][background] = new Array(256);
					for (let charCode = 0; charCode < 256; charCode++) {
						// Create glyph at native size first
						const nativeGlyph = ctx.createImageData(fontData.width, fontData.height);
						for (
							let i = 0, j = charCode * fontData.width * fontData.height;
							i < fontData.width * fontData.height;
							i += 1, j += 1
						) {
							const color = palette.getRGBAColor(bits[j] === 1 ? foreground : background);
							nativeGlyph.data.set(color, i * 4);
						}

						// If zoom is not 1, scale the glyph
						if (zoom !== 1) {
							const tempCanvas = createCanvas(fontData.width, fontData.height);
							const tempCtx = tempCanvas.getContext('2d');
							tempCtx.putImageData(nativeGlyph, 0, 0);

							const scaledCanvas = createCanvas(scaledWidth, scaledHeight);
							const scaledCtx = scaledCanvas.getContext('2d');
							scaledCtx.imageSmoothingEnabled = false;
							scaledCtx.drawImage(tempCanvas, 0, 0, fontData.width, fontData.height, 0, 0, scaledWidth, scaledHeight);

							fontGlyphs[foreground][background][charCode] = scaledCtx.getImageData(0, 0, scaledWidth, scaledHeight);
						} else {
							fontGlyphs[foreground][background][charCode] = nativeGlyph;
						}
					}
				}
			}
			alphaGlyphs = new Array(16);
			for (let foreground = 0; foreground < 16; foreground++) {
				alphaGlyphs[foreground] = new Array(256);
				for (let charCode = 0; charCode < 256; charCode++) {
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
						const alphaCanvas = createCanvas(imageData.width, imageData.height);
						alphaCanvas.getContext('2d').putImageData(imageData, 0, 0);

						// If zoom is not 1, scale the alpha glyph
						if (zoom !== 1) {
							const scaledAlphaCanvas = createCanvas(scaledWidth, scaledHeight);
							const scaledAlphaCtx = scaledAlphaCanvas.getContext('2d');
							scaledAlphaCtx.imageSmoothingEnabled = false;
							scaledAlphaCtx.drawImage(alphaCanvas, 0, 0, fontData.width, fontData.height, 0, 0, scaledWidth, scaledHeight);
							alphaGlyphs[foreground][charCode] = scaledAlphaCanvas;
						} else {
							alphaGlyphs[foreground][charCode] = alphaCanvas;
						}
					}
				}
			}
			letterSpacingImageData = new Array(16);
			for (let i = 0; i < 16; i++) {
				const canvas = createCanvas(1, scaledHeight);
				const ctx = canvas.getContext('2d');
				const imageData = ctx.getImageData(0, 0, 1, scaledHeight);
				const color = palette.getRGBAColor(i);
				for (let j = 0; j < scaledHeight; j++) {
					imageData.data.set(color, j * 4);
				}
				letterSpacingImageData[i] = imageData;
			}
		};

		fontData = parseXBFontData(fontBytes, fontWidth, fontHeight);
		if (!fontData || !fontData.width || fontData.width <= 0 || !fontData.height || fontData.height <= 0) {
			console.error('[Font] Invalid XB font data:', fontData);
			reject(new Error('Failed to load XB font data'));
			return;
		}
		generateNewFontGlyphs();
		resolve({
			getData: () => fontData,
			getWidth: () => {
				const zoom = State.zoom || 1;
				return Math.round(fontData.width * zoom);
			},
			getHeight: () => {
				const zoom = State.zoom || 1;
				return Math.round(fontData.height * zoom);
			},
			setLetterSpacing: newLetterSpacing => {
				if (newLetterSpacing !== letterSpacing) {
					letterSpacing = newLetterSpacing;
					generateNewFontGlyphs();
					document.dispatchEvent(new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }));
				}
			},
			getLetterSpacing: () => letterSpacing,
			draw: (charCode, foreground, background, ctx, x, y) => {
				const zoom = State.zoom || 1;
				const scaledWidth = Math.round(fontData.width * zoom);
				const scaledHeight = Math.round(fontData.height * zoom);

				if (
					!fontGlyphs ||
					!fontGlyphs[foreground] ||
					!fontGlyphs[foreground][background] ||
					!fontGlyphs[foreground][background][charCode]
				) {
					console.warn('[Font] XB Font glyph not available:', {
						foreground,
						background,
						charCode,
						fontGlyphsExists: !!fontGlyphs,
					});
					return;
				}
				if (letterSpacing) {
					ctx.putImageData(fontGlyphs[foreground][background][charCode], x * (scaledWidth + Math.round(zoom)), y * scaledHeight);
				} else {
					ctx.putImageData(fontGlyphs[foreground][background][charCode], x * scaledWidth, y * scaledHeight);
				}
			},
			drawWithAlpha: (charCode, foreground, ctx, x, y) => {
				const zoom = State.zoom || 1;
				const scaledWidth = Math.round(fontData.width * zoom);
				const scaledHeight = Math.round(fontData.height * zoom);

				const fallbackCharCode = magicNumbers.CHAR_CAPITAL_X;
				if (!alphaGlyphs[foreground] || !alphaGlyphs[foreground][charCode]) {
					charCode = fallbackCharCode;
				}
				if (letterSpacing) {
					ctx.drawImage(alphaGlyphs[foreground][charCode], x * (scaledWidth + Math.round(zoom)), y * scaledHeight);
					if (charCode >= 192 && charCode <= 223) {
						ctx.drawImage(
							alphaGlyphs[foreground][charCode],
							scaledWidth - Math.round(zoom),
							0,
							Math.round(zoom),
							scaledHeight,
							x * (scaledWidth + Math.round(zoom)) + scaledWidth,
							y * scaledHeight,
							Math.round(zoom),
							scaledHeight,
						);
					}
				} else {
					ctx.drawImage(alphaGlyphs[foreground][charCode], x * scaledWidth, y * scaledHeight);
				}
			},
			redraw: () => generateNewFontGlyphs(),
		});
	});
};

const loadFontFromImage = (fontName, letterSpacing, palette) => {
	return new Promise((resolve, reject) => {
		let fontData = {};
		let fontGlyphs;
		let alphaGlyphs;
		let letterSpacingImageData;

		const parseFontData = imageData => {
			const fontWidth = imageData.width / 16;
			const fontHeight = imageData.height / 16;

			if (fontWidth >= 1 && fontWidth <= 16 && imageData.height % 16 === 0 && fontHeight >= 1 && fontHeight <= 32) {
				const data = new Uint8Array((fontWidth * fontHeight * 256) / 8);
				let k = 0;

				for (let value = 0; value < 256; value += 1) {
					const x = (value % 16) * fontWidth;
					const y = Math.floor(value / 16) * fontHeight;
					let pos = (y * imageData.width + x) * 4;
					let i = 0;

					while (i < fontWidth * fontHeight) {
						data[k] = data[k] << 1;

						if (imageData.data[pos] > 127) {
							data[k] += 1;
						}

						if ((i += 1) % fontWidth === 0) {
							pos += (imageData.width - fontWidth) * 4;
						}
						if (i % fontWidth === 0) {
							k += 1;
						}
						pos += 4;
					}
				}
				return {
					width: fontWidth,
					height: fontHeight,
					data,
				};
			}
			return undefined;
		};

		const generateNewFontGlyphs = () => {
			const zoom = State.zoom || 1;
			const scaledWidth = Math.round(fontData.width * zoom);
			const scaledHeight = Math.round(fontData.height * zoom);

			const canvas = createCanvas(fontData.width, fontData.height);
			const ctx = canvas.getContext('2d');
			const bits = new Uint8Array(fontData.width * fontData.height * 256);

			for (let i = 0, k = 0; i < (fontData.width * fontData.height * 256) / 8; i += 1) {
				for (let j = 7; j >= 0; j -= 1, k += 1) {
					bits[k] = (fontData.data[i] >> j) & 1;
				}
			}

			fontGlyphs = new Array(16);
			for (let foreground = 0; foreground < 16; foreground++) {
				fontGlyphs[foreground] = new Array(16);

				for (let background = 0; background < 16; background++) {
					fontGlyphs[foreground][background] = new Array(256);

					for (let charCode = 0; charCode < 256; charCode++) {
						// Create glyph at native size first
						const nativeGlyph = ctx.createImageData(fontData.width, fontData.height);

						for (
							let i = 0, j = charCode * fontData.width * fontData.height;
							i < fontData.width * fontData.height;
							i += 1, j += 1
						) {
							const color = palette.getRGBAColor(bits[j] === 1 ? foreground : background);
							nativeGlyph.data.set(color, i * 4);
						}

						// If zoom is not 1, scale the glyph
						if (zoom !== 1) {
							const tempCanvas = createCanvas(fontData.width, fontData.height);
							const tempCtx = tempCanvas.getContext('2d');
							tempCtx.putImageData(nativeGlyph, 0, 0);

							const scaledCanvas = createCanvas(scaledWidth, scaledHeight);
							const scaledCtx = scaledCanvas.getContext('2d');
							scaledCtx.imageSmoothingEnabled = false;
							scaledCtx.drawImage(tempCanvas, 0, 0, fontData.width, fontData.height, 0, 0, scaledWidth, scaledHeight);

							fontGlyphs[foreground][background][charCode] = scaledCtx.getImageData(0, 0, scaledWidth, scaledHeight);
						} else {
							fontGlyphs[foreground][background][charCode] = nativeGlyph;
						}
					}
				}
			}

			alphaGlyphs = new Array(16);
			for (let foreground = 0; foreground < 16; foreground++) {
				alphaGlyphs[foreground] = new Array(256);
				for (let charCode = 0; charCode < 256; charCode++) {
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
						const alphaCanvas = createCanvas(imageData.width, imageData.height);
						alphaCanvas.getContext('2d').putImageData(imageData, 0, 0);

						// If zoom is not 1, scale the alpha glyph
						if (zoom !== 1) {
							const scaledAlphaCanvas = createCanvas(scaledWidth, scaledHeight);
							const scaledAlphaCtx = scaledAlphaCanvas.getContext('2d');
							scaledAlphaCtx.imageSmoothingEnabled = false;
							scaledAlphaCtx.drawImage(alphaCanvas, 0, 0, fontData.width, fontData.height, 0, 0, scaledWidth, scaledHeight);
							alphaGlyphs[foreground][charCode] = scaledAlphaCanvas;
						} else {
							alphaGlyphs[foreground][charCode] = alphaCanvas;
						}
					}
				}
			}

			letterSpacingImageData = new Array(16);
			for (let i = 0; i < 16; i++) {
				const canvas = createCanvas(1, scaledHeight);
				const ctx = canvas.getContext('2d');
				const imageData = ctx.getImageData(0, 0, 1, scaledHeight);
				const color = palette.getRGBAColor(i);

				for (let j = 0; j < scaledHeight; j++) {
					imageData.data.set(color, j * 4);
				}
				letterSpacingImageData[i] = imageData;
			}
		};

		loadImageAndGetImageData(`${State.fontDir}${fontName}.png`)
			.then(imageData => {
				const newFontData = parseFontData(imageData);

				if (!newFontData) {
					reject(new Error(`Failed to parse font data for ${fontName}`));
				} else {
					fontData = newFontData;
					generateNewFontGlyphs();

					resolve({
						getData: () => fontData,
						getWidth: () => {
							const zoom = State.zoom || 1;
							const baseWidth = letterSpacing ? fontData.width + 1 : fontData.width;
							return Math.round(baseWidth * zoom);
						},
						getHeight: () => {
							const zoom = State.zoom || 1;
							return Math.round(fontData.height * zoom);
						},
						setLetterSpacing: newLetterSpacing => {
							if (newLetterSpacing !== letterSpacing) {
								letterSpacing = newLetterSpacing;
								generateNewFontGlyphs();
								document.dispatchEvent(new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }));
							}
						},
						getLetterSpacing: () => letterSpacing,
						draw: (charCode, foreground, background, ctx, x, y) => {
							const zoom = State.zoom || 1;
							const scaledWidth = Math.round(fontData.width * zoom);
							const scaledHeight = Math.round(fontData.height * zoom);

							if (
								!fontGlyphs ||
								!fontGlyphs[foreground] ||
								!fontGlyphs[foreground][background] ||
								!fontGlyphs[foreground][background][charCode]
							) {
								console.warn('[Font] Font glyph not available:', {
									foreground,
									background,
									charCode,
									fontGlyphsExists: !!fontGlyphs,
								});
								return;
							}

							if (letterSpacing) {
								ctx.putImageData(
									fontGlyphs[foreground][background][charCode],
									x * (scaledWidth + Math.round(zoom)),
									y * scaledHeight,
								);
							} else {
								ctx.putImageData(fontGlyphs[foreground][background][charCode], x * scaledWidth, y * scaledHeight);
							}
						},
						drawWithAlpha: (charCode, foreground, ctx, x, y) => {
							const zoom = State.zoom || 1;
							const scaledWidth = Math.round(fontData.width * zoom);
							const scaledHeight = Math.round(fontData.height * zoom);

							const fallbackCharCode = magicNumbers.CHAR_CAPITAL_X;
							if (!alphaGlyphs[foreground] || !alphaGlyphs[foreground][charCode]) {
								charCode = fallbackCharCode;
							}
							if (letterSpacing) {
								ctx.drawImage(alphaGlyphs[foreground][charCode], x * (scaledWidth + Math.round(zoom)), y * scaledHeight);
								if (charCode >= 192 && charCode <= 223) {
									ctx.drawImage(
										alphaGlyphs[foreground][charCode],
										scaledWidth - Math.round(zoom),
										0,
										Math.round(zoom),
										scaledHeight,
										x * (scaledWidth + Math.round(zoom)) + scaledWidth,
										y * scaledHeight,
										Math.round(zoom),
										scaledHeight,
									);
								}
							} else {
								ctx.drawImage(alphaGlyphs[foreground][charCode], x * scaledWidth, y * scaledHeight);
							}
						},
						redraw: () => generateNewFontGlyphs(),
					});
				}
			})
			.catch(err => {
				reject(err);
			});
	});
};

export { loadFontFromXBData, loadFontFromImage };
