import State from './state.js';
import { createCanvas } from './ui.js';
import magicNumbers from './magicNumbers.js';
import { createLazyFont } from './lazyFont.js';
import { FontCache } from './fontCache.js';

const loadImageAndGetImageData = url => {
	return new Promise((resolve, reject) => {
		// Extract font name from URL
		const fontName = url.substring(
			url.lastIndexOf('/') + 1,
			url.lastIndexOf('.'),
		);

		// Try to get from cache first
		FontCache.getFont(fontName)
			.then(response => {
				if (response) {
					return response.blob().then(blob => {
						const imgElement = new Image();
						const blobUrl = URL.createObjectURL(blob);

						imgElement.addEventListener('load', () => {
							const canvas = createCanvas(imgElement.width, imgElement.height);
							const ctx = canvas.getContext('2d');
							ctx.drawImage(imgElement, 0, 0);
							const imageData = ctx.getImageData(
								0,
								0,
								canvas.width,
								canvas.height,
							);
							URL.revokeObjectURL(blobUrl);
							resolve(imageData);
						});

						imgElement.addEventListener('error', () => {
							URL.revokeObjectURL(blobUrl);
							reject(new Error(`Failed to load cached image: ${fontName}`));
						});

						imgElement.src = blobUrl;
					});
				} else {
					// Fall back to direct loading
					const imgElement = new Image();
					imgElement.addEventListener('load', () => {
						const canvas = createCanvas(imgElement.width, imgElement.height);
						const ctx = canvas.getContext('2d');
						ctx.drawImage(imgElement, 0, 0);
						const imageData = ctx.getImageData(
							0,
							0,
							canvas.width,
							canvas.height,
						);
						resolve(imageData);
					});

					imgElement.addEventListener('error', () => {
						reject(new Error(`Failed to load image: ${url}`));
					});

					imgElement.src = url;
				}
			})
			.catch(error => {
				reject(error);
			});
	});
};

const loadFontFromXBData = (
	fontBytes,
	fontWidth,
	fontHeight,
	letterSpacing,
	palette,
) => {
	return new Promise((resolve, reject) => {
		let fontData = {};
		let lazyFont = null;

		const parseXBFontData = (fontBytes, fontWidth, fontHeight) => {
			if (!fontBytes || fontBytes.length === 0) {
				console.error(
					`[Font] Invalid fontBytes provided to parseXBFontData. Expected: a non-empty Uint8Array; Received: type ${typeof fontBytes}, value: ${String(fontBytes)}, length: ${fontBytes && fontBytes.length}`,
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
				console.error(
					'[Font] XB font data too small. Expected:',
					expectedDataSize,
					' Received:',
					fontBytes.length,
				);
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

		const createLazyFontInstance = () => {
			lazyFont = createLazyFont(fontData, palette, letterSpacing);
		};

		fontData = parseXBFontData(fontBytes, fontWidth, fontHeight);
		if (
			!fontData ||
			!fontData.width ||
			fontData.width <= 0 ||
			!fontData.height ||
			fontData.height <= 0
		) {
			console.error('[Font] Invalid XB font data:', fontData);
			reject(new Error('Failed to load XB font data'));
			return;
		}

		createLazyFontInstance();

		resolve({
			getData: () => fontData,
			getWidth: () => fontData.width,
			getHeight: () => fontData.height,
			setLetterSpacing: newLetterSpacing => {
				if (newLetterSpacing !== letterSpacing) {
					letterSpacing = newLetterSpacing;
					createLazyFontInstance();
					document.dispatchEvent(
						new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }),
					);
				}
			},
			getLetterSpacing: () => letterSpacing,
			draw: (charCode, foreground, background, ctx, x, y) => {
				if (!lazyFont) {
					console.warn('[Font] XB Lazy font not initialized');
					return;
				}
				lazyFont.draw(charCode, foreground, background, ctx, x, y);
			},
			drawWithAlpha: (charCode, foreground, ctx, x, y) => {
				if (!lazyFont) {
					console.warn('[Font] XB Lazy font not initialized');
					return;
				}
				lazyFont.drawWithAlpha(charCode, foreground, ctx, x, y);
			},
			redraw: () => createLazyFontInstance(),
		});
	});
};

const loadFontFromImage = (fontName, letterSpacing, palette) => {
	return new Promise((resolve, reject) => {
		let fontData = {};
		let lazyFont = null;

		const parseFontData = imageData => {
			const fontWidth = imageData.width / 16;
			const fontHeight = imageData.height / 16;

			if (
				fontWidth >= 1 &&
				fontWidth <= 16 &&
				imageData.height % 16 === 0 &&
				fontHeight >= 1 &&
				fontHeight <= 32
			) {
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
						if (i % 8 === 0) {
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

		const createLazyFontInstance = () => {
			lazyFont = createLazyFont(fontData, palette, letterSpacing);
		};

		loadImageAndGetImageData(`${State.fontDir}${fontName}.png`)
			.then(imageData => {
				const newFontData = parseFontData(imageData);

				if (!newFontData) {
					reject(new Error(`Failed to parse font data for ${fontName}`));
				} else {
					fontData = newFontData;
					createLazyFontInstance();

					resolve({
						getData: () => fontData,
						getWidth: () =>
							letterSpacing ? fontData.width + 1 : fontData.width,
						getHeight: () => fontData.height,
						setLetterSpacing: newLetterSpacing => {
							if (newLetterSpacing !== letterSpacing) {
								letterSpacing = newLetterSpacing;
								createLazyFontInstance();
								document.dispatchEvent(
									new CustomEvent('onLetterSpacingChange', { detail: letterSpacing }),
								);
							}
						},
						getLetterSpacing: () => letterSpacing,
						draw: (charCode, foreground, background, ctx, x, y) => {
							if (!lazyFont) {
								console.warn('[Font] Lazy font not initialized');
								return;
							}
							lazyFont.draw(charCode, foreground, background, ctx, x, y);
						},
						drawWithAlpha: (charCode, foreground, ctx, x, y) => {
							if (!lazyFont) {
								console.warn('[Font] Lazy font not initialized');
								return;
							}
							lazyFont.drawWithAlpha(charCode, foreground, ctx, x, y);
						},
						redraw: () => createLazyFontInstance(),
					});
				}
			})
			.catch(err => {
				reject(err);
			});
	});
};

export { loadFontFromXBData, loadFontFromImage };
