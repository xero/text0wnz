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
		let scaledGlyphsCache = {};
		let scaledAlphaGlyphsCache = {};

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
						fontGlyphs[foreground][background][charCode] = ctx.createImageData(fontData.width, fontData.height);
						for (
							let i = 0, j = charCode * fontData.width * fontData.height;
							i < fontData.width * fontData.height;
							i += 1, j += 1
						) {
							const color = palette.getRGBAColor(bits[j] === 1 ? foreground : background);
							fontGlyphs[foreground][background][charCode].data.set(color, i * 4);
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
						alphaGlyphs[foreground][charCode] = alphaCanvas;
					}
				}
			}
			letterSpacingImageData = new Array(16);
			for (let i = 0; i < 16; i++) {
				const canvas = createCanvas(1, fontData.height);
				const ctx = canvas.getContext('2d');
				const imageData = ctx.getImageData(0, 0, 1, fontData.height);
				const color = palette.getRGBAColor(i);
				for (let j = 0; j < fontData.height; j++) {
					imageData.data.set(color, j * 4);
				}
				letterSpacingImageData[i] = imageData;
			}
		};

		const generateScaledGlyphs = zoom => {
			scaledGlyphsCache = {};
			scaledAlphaGlyphsCache = {};

			// Regular glyphs
			for (let fg = 0; fg < 16; fg++) {
				scaledGlyphsCache[fg] = [];
				for (let bg = 0; bg < 16; bg++) {
					scaledGlyphsCache[fg][bg] = [];
					for (let cc = 0; cc < 256; cc++) {
						const imageData = fontGlyphs[fg][bg][cc];
						const srcW = imageData.width;
						const srcH = imageData.height;
						const dstW = Math.round(srcW * zoom);
						const dstH = Math.round(srcH * zoom);
						const glyphCanvas = createCanvas(dstW, dstH);
						const ctx = glyphCanvas.getContext('2d');
						const tempCanvas = createCanvas(srcW, srcH);
						tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
						ctx.imageSmoothingEnabled = false;
						ctx.drawImage(tempCanvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
						scaledGlyphsCache[fg][bg][cc] = glyphCanvas;
					}
				}
			}

			// Alpha glyphs
			for (let fg = 0; fg < 16; fg++) {
				scaledAlphaGlyphsCache[fg] = [];
				for (let cc = 0; cc < 256; cc++) {
					const alphaCanvas = alphaGlyphs[fg][cc];
					if (!alphaCanvas) {continue;}
					const srcW = alphaCanvas.width;
					const srcH = alphaCanvas.height;
					const dstW = Math.round(srcW * zoom);
					const dstH = Math.round(srcH * zoom);
					const scaledCanvas = createCanvas(dstW, dstH);
					const ctx = scaledCanvas.getContext('2d');
					ctx.imageSmoothingEnabled = false;
					ctx.drawImage(alphaCanvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
					scaledAlphaGlyphsCache[fg][cc] = scaledCanvas;
				}
			}
		};

		fontData = parseXBFontData(fontBytes, fontWidth, fontHeight);
		if (!fontData || !fontData.width || fontData.width <= 0 || !fontData.height || fontData.height <= 0) {
			console.error('[Font] Invalid XB font data:', fontData);
			reject(new Error('Failed to load XB font data'));
			return;
		}
		generateNewFontGlyphs();
		generateScaledGlyphs(State.zoom || 1);
		resolve({
			getData: () => fontData,
			getWidth: () => fontData.width * (State.zoom || 1),
			getHeight: () => fontData.height * (State.zoom || 1),
			setLetterSpacing: newLetterSpacing => {
				if (newLetterSpacing !== letterSpacing) {
					letterSpacing = newLetterSpacing;
					generateNewFontGlyphs();
					generateScaledGlyphs(State.zoom || 1);
					document.dispatchEvent(new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }));
				}
			},
			getLetterSpacing: () => letterSpacing,
			draw: (charCode, foreground, background, ctx, x, y) => {
				const glyphCanvas = scaledGlyphsCache[foreground]?.[background]?.[charCode];
				if (!glyphCanvas) {
					console.warn('[Font] XB Font glyph not available:', {
						foreground,
						background,
						charCode,
					});
					return;
				}
				const zoom = State.zoom || 1;
				const glyphW = Math.round(fontData.width * zoom);
				const glyphH = Math.round(fontData.height * zoom);
				const xPos = letterSpacing ? x * (glyphW + zoom) : x * glyphW;
				const yPos = y * glyphH;
				ctx.drawImage(glyphCanvas, xPos, yPos);
			},
			drawWithAlpha: (charCode, foreground, ctx, x, y) => {
				const fallbackCharCode = magicNumbers.CHAR_CAPITAL_X;
				if (!scaledAlphaGlyphsCache[foreground] || !scaledAlphaGlyphsCache[foreground][charCode]) {
					charCode = fallbackCharCode;
				}
				const glyphCanvas = scaledAlphaGlyphsCache[foreground]?.[charCode];
				if (!glyphCanvas) {return;}
				const zoom = State.zoom || 1;
				const glyphW = Math.round(fontData.width * zoom);
				const glyphH = Math.round(fontData.height * zoom);
				const xPos = letterSpacing ? x * (glyphW + zoom) : x * glyphW;
				const yPos = y * glyphH;
				ctx.drawImage(glyphCanvas, xPos, yPos);
				if (letterSpacing && charCode >= 192 && charCode <= 223) {
					ctx.drawImage(
						glyphCanvas,
						Math.round((fontData.width - 1) * zoom),
						0,
						zoom,
						glyphH,
						xPos + glyphW,
						yPos,
						zoom,
						glyphH,
					);
				}
			},
			redraw: () => {
				generateNewFontGlyphs();
				generateScaledGlyphs(State.zoom || 1);
			},
			setZoom: newZoom => {
				generateScaledGlyphs(newZoom);
			},
		});
	});
};

const loadFontFromImage = (fontName, letterSpacing, palette) => {
	return new Promise((resolve, reject) => {
		let fontData = {};
		let fontGlyphs;
		let alphaGlyphs;
		let letterSpacingImageData;
		let scaledGlyphsCache = {};
		let scaledAlphaGlyphsCache = {};

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
						fontGlyphs[foreground][background][charCode] = ctx.createImageData(fontData.width, fontData.height);

						for (
							let i = 0, j = charCode * fontData.width * fontData.height;
							i < fontData.width * fontData.height;
							i += 1, j += 1
						) {
							const color = palette.getRGBAColor(bits[j] === 1 ? foreground : background);
							fontGlyphs[foreground][background][charCode].data.set(color, i * 4);
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
						alphaGlyphs[foreground][charCode] = alphaCanvas;
					}
				}
			}

			letterSpacingImageData = new Array(16);
			for (let i = 0; i < 16; i++) {
				const canvas = createCanvas(1, fontData.height);
				const ctx = canvas.getContext('2d');
				const imageData = ctx.getImageData(0, 0, 1, fontData.height);
				const color = palette.getRGBAColor(i);

				for (let j = 0; j < fontData.height; j++) {
					imageData.data.set(color, j * 4);
				}
				letterSpacingImageData[i] = imageData;
			}
		};

		const generateScaledGlyphs = zoom => {
			scaledGlyphsCache = {};
			scaledAlphaGlyphsCache = {};

			// Regular glyphs
			for (let fg = 0; fg < 16; fg++) {
				scaledGlyphsCache[fg] = [];
				for (let bg = 0; bg < 16; bg++) {
					scaledGlyphsCache[fg][bg] = [];
					for (let cc = 0; cc < 256; cc++) {
						const imageData = fontGlyphs[fg][bg][cc];
						const srcW = imageData.width;
						const srcH = imageData.height;
						const dstW = Math.round(srcW * zoom);
						const dstH = Math.round(srcH * zoom);
						const glyphCanvas = createCanvas(dstW, dstH);
						const ctx = glyphCanvas.getContext('2d');
						const tempCanvas = createCanvas(srcW, srcH);
						tempCanvas.getContext('2d').putImageData(imageData, 0, 0);
						ctx.imageSmoothingEnabled = false;
						ctx.drawImage(tempCanvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
						scaledGlyphsCache[fg][bg][cc] = glyphCanvas;
					}
				}
			}

			// Alpha glyphs
			for (let fg = 0; fg < 16; fg++) {
				scaledAlphaGlyphsCache[fg] = [];
				for (let cc = 0; cc < 256; cc++) {
					const alphaCanvas = alphaGlyphs[fg][cc];
					if (!alphaCanvas) {continue;}
					const srcW = alphaCanvas.width;
					const srcH = alphaCanvas.height;
					const dstW = Math.round(srcW * zoom);
					const dstH = Math.round(srcH * zoom);
					const scaledCanvas = createCanvas(dstW, dstH);
					const ctx = scaledCanvas.getContext('2d');
					ctx.imageSmoothingEnabled = false;
					ctx.drawImage(alphaCanvas, 0, 0, srcW, srcH, 0, 0, dstW, dstH);
					scaledAlphaGlyphsCache[fg][cc] = scaledCanvas;
				}
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
					generateScaledGlyphs(State.zoom || 1);

					resolve({
						getData: () => fontData,
						getWidth: () => (letterSpacing ? fontData.width + 1 : fontData.width) * (State.zoom || 1),
						getHeight: () => fontData.height * (State.zoom || 1),
						setLetterSpacing: newLetterSpacing => {
							if (newLetterSpacing !== letterSpacing) {
								letterSpacing = newLetterSpacing;
								generateNewFontGlyphs();
								generateScaledGlyphs(State.zoom || 1);
								document.dispatchEvent(new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }));
							}
						},
						getLetterSpacing: () => letterSpacing,
						draw: (charCode, foreground, background, ctx, x, y) => {
							const glyphCanvas = scaledGlyphsCache[foreground]?.[background]?.[charCode];
							if (!glyphCanvas) {
								console.warn('[Font] Font glyph not available:', {
									foreground,
									background,
									charCode,
								});
								return;
							}

							const zoom = State.zoom || 1;
							const baseWidth = letterSpacing ? fontData.width + 1 : fontData.width;
							const glyphW = Math.round(baseWidth * zoom);
							const glyphH = Math.round(fontData.height * zoom);
							const xPos = x * glyphW;
							const yPos = y * glyphH;
							ctx.drawImage(glyphCanvas, xPos, yPos);
						},
						drawWithAlpha: (charCode, foreground, ctx, x, y) => {
							const fallbackCharCode = magicNumbers.CHAR_CAPITAL_X;
							if (!scaledAlphaGlyphsCache[foreground] || !scaledAlphaGlyphsCache[foreground][charCode]) {
								charCode = fallbackCharCode;
							}
							const glyphCanvas = scaledAlphaGlyphsCache[foreground]?.[charCode];
							if (!glyphCanvas) {return;}

							const zoom = State.zoom || 1;
							const baseWidth = letterSpacing ? fontData.width + 1 : fontData.width;
							const glyphW = Math.round(baseWidth * zoom);
							const glyphH = Math.round(fontData.height * zoom);
							const xPos = x * glyphW;
							const yPos = y * glyphH;
							ctx.drawImage(glyphCanvas, xPos, yPos);

							if (letterSpacing && charCode >= 192 && charCode <= 223) {
								ctx.drawImage(
									glyphCanvas,
									Math.round((fontData.width - 1) * zoom),
									0,
									zoom,
									glyphH,
									xPos + Math.round(fontData.width * zoom),
									yPos,
									zoom,
									glyphH,
								);
							}
						},
						redraw: () => {
							generateNewFontGlyphs();
							generateScaledGlyphs(State.zoom || 1);
						},
						setZoom: newZoom => {
							generateScaledGlyphs(newZoom);
						},
					});
				}
			})
			.catch(err => {
				reject(err);
			});
	});
};

export { loadFontFromXBData, loadFontFromImage };
