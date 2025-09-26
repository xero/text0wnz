import { createCanvas } from './ui.js';

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
				fontWidth = 8;
			}
			if (!fontHeight || fontHeight <= 0) {
				fontHeight = 16;
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
					if (charCode === 220 || charCode === 223 || charCode === 47 || charCode === 124 || charCode === 88) {
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

		fontData = parseXBFontData(fontBytes, fontWidth, fontHeight);
		if (!fontData || !fontData.width || fontData.width <= 0 || !fontData.height || fontData.height <= 0) {
			console.error('[Font] Invalid XB font data:', fontData);
			reject(new Error('Failed to load XB font data'));
			return;
		}
		generateNewFontGlyphs();
		resolve({
			getData: () => fontData,
			getWidth: () => fontData.width,
			getHeight: () => fontData.height,
			setLetterSpacing: newLetterSpacing => {
				if (newLetterSpacing !== letterSpacing) {
					generateNewFontGlyphs();
					letterSpacing = newLetterSpacing;
					document.dispatchEvent(new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }));
				}
			},
			getLetterSpacing: () => letterSpacing,
			draw: (charCode, foreground, background, ctx, x, y) => {
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
				if (letterSpacing === true) {
					ctx.putImageData(fontGlyphs[foreground][background][charCode], x * (fontData.width + 1), y * fontData.height);
				} else {
					ctx.putImageData(fontGlyphs[foreground][background][charCode], x * fontData.width, y * fontData.height);
				}
			},
			drawWithAlpha: (charCode, foreground, ctx, x, y) => {
				const fallbackCharCode = 88;
				if (!alphaGlyphs[foreground] || !alphaGlyphs[foreground][charCode]) {
					charCode = fallbackCharCode;
				}
				if (letterSpacing === true) {
					ctx.drawImage(alphaGlyphs[foreground][charCode], x * (fontData.width + 1), y * fontData.height);
					if (charCode >= 192 && charCode <= 223) {
						ctx.drawImage(
							alphaGlyphs[foreground][charCode],
							fontData.width - 1,
							0,
							1,
							fontData.height,
							x * (fontData.width + 1) + fontData.width,
							y * fontData.height,
							1,
							fontData.height,
						);
					}
				} else {
					ctx.drawImage(alphaGlyphs[foreground][charCode], x * fontData.width, y * fontData.height);
				}
			},
			redraw: () => generateNewFontGlyphs,
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
					if (charCode === 220 || charCode === 223 || charCode === 47 || charCode === 124 || charCode === 88) {
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

		loadImageAndGetImageData(`${import.meta.env.BASE_URL}${import.meta.env.VITE_FONT_DIR}${fontName}.png`)
			.then(imageData => {
				const newFontData = parseFontData(imageData);

				if (!newFontData) {
					reject(new Error(`Failed to parse font data for ${fontName}`));
				} else {
					fontData = newFontData;
					generateNewFontGlyphs();

					resolve({
						getData: () => fontData,
						getWidth: () => (letterSpacing ? fontData.width + 1 : fontData.width),
						getHeight: () => fontData.height,
						setLetterSpacing: newLetterSpacing => {
							generateNewFontGlyphs();
							letterSpacing = newLetterSpacing;
							document.dispatchEvent(new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }));
						},
						getLetterSpacing: () => letterSpacing,
						draw: (charCode, foreground, background, ctx, x, y) => {
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
									x * (fontData.width + 1),
									y * fontData.height,
								);
							} else {
								ctx.putImageData(fontGlyphs[foreground][background][charCode], x * fontData.width, y * fontData.height);
							}
						},
						drawWithAlpha: (charCode, foreground, ctx, x, y) => {
							const fallbackCharCode = 88;
							if (!alphaGlyphs[foreground] || !alphaGlyphs[foreground][charCode]) {
								charCode = fallbackCharCode;
							}
							if (letterSpacing === true) {
								ctx.drawImage(alphaGlyphs[foreground][charCode], x * (fontData.width + 1), y * fontData.height);
								if (charCode >= 192 && charCode <= 223) {
									ctx.drawImage(
										alphaGlyphs[foreground][charCode],
										fontData.width - 1,
										0,
										1,
										fontData.height,
										x * (fontData.width + 1) + fontData.width,
										y * fontData.height,
										1,
										fontData.height,
									);
								}
							} else {
								ctx.drawImage(alphaGlyphs[foreground][charCode], x * fontData.width, y * fontData.height);
							}
						},
						redraw: () => generateNewFontGlyphs,
					});
				}
			})
			.catch(err => {
				reject(err);
			});
	});
};

export { loadFontFromXBData, loadFontFromImage };
