// Global reference using state management
import State from './state.js';
import { $, createCanvas } from './ui.js';
import { loadFontFromImage, loadFontFromXBData } from './font.js';
import { createPalette, createDefaultPalette } from './palette.js';

const createTextArtCanvas = (canvasContainer, callback) => {
	const DEFAULT_FONT = 'CP437 8x16';
	const DEFAULT_FONT_WIDTH = 8;
	const DEFAULT_FONT_HEIGHT = 16;
	let columns = 80,
			rows = 25,
			iceColors = false,
			imageData = new Uint16Array(columns * rows),
			canvases,
			redrawing = false,
			ctxs,
			offBlinkCanvases,
			onBlinkCanvases,
			offBlinkCtxs,
			onBlinkCtxs,
			blinkOn = false,
			mouseButton = false,
			currentUndo = [],
			undoBuffer = [],
			redoBuffer = [],
			drawHistory = [],
			mirrorMode = false,
			currentFontName = DEFAULT_FONT,
			dirtyRegions = [],
			processingDirtyRegions = false,
			xbFontData = null;

	const updateBeforeBlinkFlip = (x, y) => {
		const dataIndex = y * columns + x;
		const contextIndex = Math.floor(y / 25);
		const contextY = y % 25;
		const charCode = imageData[dataIndex] >> 8;
		let background = (imageData[dataIndex] >> 4) & 15;
		const foreground = imageData[dataIndex] & 15;
		const shifted = background >= 8;
		if (shifted === true) {
			background -= 8;
		}
		if (blinkOn === true && shifted) {
			State.font.draw(charCode, background, background, ctxs[contextIndex], x, contextY);
		} else {
			State.font.draw(charCode, foreground, background, ctxs[contextIndex], x, contextY);
		}
	};

	const enqueueDirtyRegion = (x, y, w, h) => {
		// Validate and clamp region to canvas bounds
		if (x < 0) {
			w += x;
			x = 0;
		}
		if (y < 0) {
			h += y;
			y = 0;
		}
		// Invalid or empty region
		if (x >= columns || y >= rows || w <= 0 || h <= 0) {
			return;
		}
		if (x + w > columns) {
			w = columns - x;
		}
		if (y + h > rows) {
			h = rows - y;
		}
		dirtyRegions.push({ x: x, y: y, w: w, h: h });
	};

	const enqueueDirtyCell = (x, y) => {
		enqueueDirtyRegion(x, y, 1, 1);
	};

	// merge overlapping and adjacent regions
	// This is a basic implementation - could be optimized further with spatial indexing
	const coalesceRegions = regions => {
		if (regions.length <= 1) {
			return regions;
		}
		const coalesced = [];
		const sorted = regions.slice().sort((a, b) => {
			if (a.y !== b.y) {
				return a.y - b.y;
			}
			return a.x - b.x;
		});

		for (let i = 0; i < sorted.length; i++) {
			const current = sorted[i];
			let merged = false;

			// Try to merge with existing coalesced regions
			for (let j = 0; j < coalesced.length; j++) {
				const existing = coalesced[j];

				// Check if regions overlap or are adjacent
				const canMergeX = current.x <= existing.x + existing.w && existing.x <= current.x + current.w;
				const canMergeY = current.y <= existing.y + existing.h && existing.y <= current.y + current.h;

				if (canMergeX && canMergeY) {
					// Merge regions
					const newX = Math.min(existing.x, current.x);
					const newY = Math.min(existing.y, current.y);
					const newW = Math.max(existing.x + existing.w, current.x + current.w) - newX;
					const newH = Math.max(existing.y + existing.h, current.y + current.h) - newY;
					coalesced[j] = { x: newX, y: newY, w: newW, h: newH };
					merged = true;
					break;
				}
			}
			if (!merged) {
				coalesced.push(current);
			}
		}

		// If we reduced the number of regions, try coalescing again
		if (coalesced.length < regions.length && coalesced.length > 1) {
			return coalesceRegions(coalesced);
		}

		return coalesced;
	};

	const drawRegion = (x, y, w, h) => {
		// Validate and clamp region to canvas bounds
		if (x < 0) {
			w += x;
			x = 0;
		}
		if (y < 0) {
			h += y;
			y = 0;
		}
		// Invalid or empty region, no-op
		if (x >= columns || y >= rows || w <= 0 || h <= 0) {
			return;
		}
		if (x + w > columns) {
			w = columns - x;
		}
		if (y + h > rows) {
			h = rows - y;
		}

		// Redraw all cells in the region
		for (let regionY = y; regionY < y + h; regionY++) {
			for (let regionX = x; regionX < x + w; regionX++) {
				const index = regionY * columns + regionX;
				redrawGlyph(index, regionX, regionY);
			}
		}
	};

	const processDirtyRegions = () => {
		if (processingDirtyRegions || dirtyRegions.length === 0) {
			return;
		}

		processingDirtyRegions = true;

		// Coalesce regions for better performance
		const coalescedRegions = coalesceRegions(dirtyRegions);
		dirtyRegions = []; // Clear the queue

		// Draw all coalesced regions
		for (let i = 0; i < coalescedRegions.length; i++) {
			const region = coalescedRegions[i];
			drawRegion(region.x, region.y, region.w, region.h);
		}

		processingDirtyRegions = false;
	};

	const redrawGlyph = (index, x, y) => {
		const contextIndex = Math.floor(y / 25);
		const contextY = y % 25;
		const charCode = imageData[index] >> 8;
		let background = (imageData[index] >> 4) & 15;
		const foreground = imageData[index] & 15;
		if (iceColors === true) {
			State.font.draw(charCode, foreground, background, ctxs[contextIndex], x, contextY);
		} else {
			if (background >= 8) {
				background -= 8;
				State.font.draw(charCode, foreground, background, offBlinkCtxs[contextIndex], x, contextY);
				State.font.draw(charCode, background, background, onBlinkCtxs[contextIndex], x, contextY);
			} else {
				State.font.draw(charCode, foreground, background, offBlinkCtxs[contextIndex], x, contextY);
				State.font.draw(charCode, foreground, background, onBlinkCtxs[contextIndex], x, contextY);
			}
		}
	};

	const redrawEntireImage = () => {
		dirtyRegions = [];
		drawRegion(0, 0, columns, rows);
	};

	let blinkStop = false;

	const blink = () => {
		if (blinkOn === false) {
			blinkOn = true;
			for (let i = 0; i < ctxs.length; i++) {
				ctxs[i].drawImage(onBlinkCanvases[i], 0, 0);
			}
		} else {
			blinkOn = false;
			for (let i = 0; i < ctxs.length; i++) {
				ctxs[i].drawImage(offBlinkCanvases[i], 0, 0);
			}
		}
	};

	let blinkTimerRunning = false;

	const updateBlinkTimer = async () => {
		if (blinkTimerRunning) {
			return; // Prevent multiple timers from running
		}
		blinkTimerRunning = true;
		blinkStop = false;
		if (!iceColors) {
			blinkOn = false;
			try {
				while (!blinkStop) {
					blink();
					await new Promise(resolve => setTimeout(resolve, 500));
				}
			} catch (error) {
				console.error('Blink timer error:', error);
			}
		}
		blinkTimerRunning = false;
	};

	const stopBlinkTimer = () => {
		blinkStop = true;
		// Wait for timer to actually stop
		setTimeout(() => {
			blinkTimerRunning = false;
		}, 10);
	};

	const createCanvases = () => {
		redrawing = true;
		if (canvases !== undefined) {
			canvases.forEach(canvas => {
				canvasContainer.removeChild(canvas);
			});
		}
		canvases = [];
		offBlinkCanvases = [];
		offBlinkCtxs = [];
		onBlinkCanvases = [];
		onBlinkCtxs = [];
		ctxs = [];
		let fontWidth = State.font.getWidth();
		let fontHeight = State.font.getHeight();

		if (!fontWidth || fontWidth <= 0) {
			console.warn(`Invalid font width detected, falling back to ${DEFAULT_FONT_WIDTH}px`);
			fontWidth = DEFAULT_FONT_WIDTH;
		}
		if (!fontHeight || fontHeight <= 0) {
			console.warn(`Invalid font height detected, falling back to ${DEFAULT_FONT_HEIGHT}px`);
			fontHeight = DEFAULT_FONT_HEIGHT;
		}

		const canvasWidth = fontWidth * columns;
		let canvasHeight = fontHeight * 25;
		for (let i = 0; i < Math.floor(rows / 25); i++) {
			const canvas = createCanvas(canvasWidth, canvasHeight);
			canvases.push(canvas);
			ctxs.push(canvas.getContext('2d'));
			const onBlinkCanvas = createCanvas(canvasWidth, canvasHeight);
			onBlinkCanvases.push(onBlinkCanvas);
			onBlinkCtxs.push(onBlinkCanvas.getContext('2d'));
			const offBlinkCanvas = createCanvas(canvasWidth, canvasHeight);
			offBlinkCanvases.push(offBlinkCanvas);
			offBlinkCtxs.push(offBlinkCanvas.getContext('2d'));
		}
		canvasHeight = fontHeight * (rows % 25);
		if (rows % 25 !== 0) {
			const canvas = createCanvas(canvasWidth, canvasHeight);
			canvases.push(canvas);
			ctxs.push(canvas.getContext('2d'));
			const onBlinkCanvas = createCanvas(canvasWidth, canvasHeight);
			onBlinkCanvases.push(onBlinkCanvas);
			onBlinkCtxs.push(onBlinkCanvas.getContext('2d'));
			const offBlinkCanvas = createCanvas(canvasWidth, canvasHeight);
			offBlinkCanvases.push(offBlinkCanvas);
			offBlinkCtxs.push(offBlinkCanvas.getContext('2d'));
		}
		canvasContainer.style.width = canvasWidth + 'px';
		for (let i = 0; i < canvases.length; i++) {
			canvasContainer.appendChild(canvases[i]);
		}
		redrawing = false;
		stopBlinkTimer();
		redrawEntireImage();
		// Timer will be started by updateTimer() call after createCanvases()
	};

	const updateTimer = () => {
		stopBlinkTimer();
		if (iceColors === false) {
			blinkOn = false;
			updateBlinkTimer().catch(console.error);
		}
	};

	const setFont = async (fontName, callback) => {
		try {
			if (fontName === 'XBIN' && xbFontData) {
				const font = await loadFontFromXBData(
					xbFontData.bytes,
					xbFontData.width,
					xbFontData.height,
					xbFontData.letterSpacing,
					State.palette,
				);
				State.font = font;
				currentFontName = fontName;

				// Trigger updates after font is loaded
				createCanvases();
				redrawEntireImage();
				document.dispatchEvent(new CustomEvent('onFontChange', { detail: fontName }));

				// Execute callback if provided
				if (callback) {
					callback();
				}
			} else if (fontName === 'XBIN' && !xbFontData) {
				console.log(`XBIN selected but no embedded font data available, falling back to: ${DEFAULT_FONT}`);

				// Fallback to CP437 font
				const fallbackFont = DEFAULT_FONT;
				const font = await loadFontFromImage(fallbackFont, false, State.palette);
				State.font = font;
				currentFontName = fallbackFont;

				// Trigger updates after fallback font is loaded
				createCanvases();
				redrawEntireImage();
				document.dispatchEvent(new CustomEvent('onFontChange', { detail: fallbackFont }));

				// Execute callback if provided
				if (callback) {
					callback();
				}
			} else {
				const spacing = State.font ? State.font.getLetterSpacing() : false;
				const font = await loadFontFromImage(fontName, spacing, State.palette);
				State.font = font;
				currentFontName = fontName;

				// Trigger updates after font is loaded
				createCanvases();
				updateTimer();
				redrawEntireImage();
				document.dispatchEvent(new CustomEvent('onFontChange', { detail: fontName }));

				// Execute callback if provided
				if (callback) {
					callback();
				}
			}
		} catch (error) {
			console.error('Failed to load font:', error);

			// Fallback to CP437 in case of failure
			const fallbackFont = DEFAULT_FONT;
			try {
				const font = await loadFontFromImage(fallbackFont, false, State.palette);
				State.font = font;
				currentFontName = fallbackFont;

				// Trigger updates after fallback font is loaded
				createCanvases();
				redrawEntireImage();
				document.dispatchEvent(new CustomEvent('onFontChange', { detail: fallbackFont }));

				// Execute callback if provided
				if (callback) {
					callback();
				}
			} catch (fallbackError) {
				console.error('Failed to load fallback font:', fallbackError);
			}
		}
	};

	const resize = (newColumnValue, newRowValue) => {
		if ((newColumnValue !== columns || newRowValue !== rows) && newColumnValue > 0 && newRowValue > 0) {
			clearUndos();
			const maxColumn = columns > newColumnValue ? newColumnValue : columns;
			const maxRow = rows > newRowValue ? newRowValue : rows;
			const newImageData = new Uint16Array(newColumnValue * newRowValue);
			for (let y = 0; y < maxRow; y++) {
				for (let x = 0; x < maxColumn; x++) {
					newImageData[y * newColumnValue + x] = imageData[y * columns + x];
				}
			}
			imageData = newImageData;
			columns = newColumnValue;
			rows = newRowValue;
			createCanvases();
			updateTimer();
			redrawEntireImage();
			document.dispatchEvent(new CustomEvent('onTextCanvasSizeChange', { detail: { columns: columns, rows: rows } }));
		}
	};

	const getIceColors = () => {
		return iceColors;
	};

	const setIceColors = newIceColors => {
		if (iceColors !== newIceColors) {
			iceColors = newIceColors;
			updateTimer();
			redrawEntireImage();
		}
	};

	const onLetterSpacingChange = _letterSpacing => {
		if (!redrawing) {
			createCanvases();
			updateTimer();
		}
	};

	const getImage = () => {
		const completeCanvas = createCanvas(State.font.getWidth() * columns, State.font.getHeight() * rows);
		let y = 0;
		const ctx = completeCanvas.getContext('2d');
		(iceColors === true ? canvases : offBlinkCanvases).forEach(canvas => {
			ctx.drawImage(canvas, 0, y);
			y += canvas.height;
		});
		return completeCanvas;
	};

	const getImageData = () => {
		return imageData;
	};

	const setImageData = (newColumnValue, newRowValue, newImageData, newIceColors) => {
		clearUndos();
		columns = newColumnValue;
		rows = newRowValue;
		imageData = newImageData;
		createCanvases();
		if (iceColors !== newIceColors) {
			iceColors = newIceColors;
		}
		updateTimer();
		redrawEntireImage();
		document.dispatchEvent(new CustomEvent('onOpenedFile'));
	};

	const getColumns = () => {
		return columns;
	};

	const getRows = () => {
		return rows;
	};

	const clearUndos = () => {
		currentUndo = [];
		undoBuffer = [];
		redoBuffer = [];
	};

	const clear = () => {
		$('artwork-title').value = '';
		clearUndos();
		imageData = new Uint16Array(columns * rows);
		iceColors = false; // Reset ICE colors to disabled (default)
		updateTimer(); // Restart blink timer if needed
		redrawEntireImage();
	};

	const getMirrorX = x => {
		if (columns % 2 === 0) {
			// Even columns: split 50/50
			if (x < columns / 2) {
				return columns - 1 - x;
			} else {
				return columns - 1 - x;
			}
		} else {
			// Odd columns
			const center = Math.floor(columns / 2);
			if (x === center) {
				return -1; // Don't mirror center column
			} else if (x < center) {
				return columns - 1 - x;
			} else {
				return columns - 1 - x;
			}
		}
	};

	// Transform characters for horizontal mirroring
	const getMirrorCharCode = charCode => {
		switch (charCode) {
			case 221: // LEFT_HALF_BLOCK
				return 222; // RIGHT_HALF_BLOCK
			case 222: // RIGHT_HALF_BLOCK
				return 221; // LEFT_HALF_BLOCK
			// Upper and lower half blocks stay the same for horizontal mirroring
			case 223: // UPPER_HALF_BLOCK
			case 220: // LOWER_HALF_BLOCK
			default:
				return charCode;
		}
	};

	const setMirrorMode = enabled => {
		mirrorMode = enabled;
	};

	const getMirrorMode = () => {
		return mirrorMode;
	};

	const draw = (index, charCode, foreground, background, x, y) => {
		currentUndo.push([index, imageData[index], x, y]);
		imageData[index] = (charCode << 8) + (background << 4) + foreground;
		drawHistory.push((index << 16) + imageData[index]);
	};

	const patchBufferAndEnqueueDirty = (index, charCode, foreground, background, x, y, addToUndo = true) => {
		if (addToUndo) {
			currentUndo.push([index, imageData[index], x, y]);
		}
		imageData[index] = (charCode << 8) + (background << 4) + foreground;
		if (addToUndo) {
			drawHistory.push((index << 16) + imageData[index]);
		}
		enqueueDirtyCell(x, y);

		if (iceColors === false) {
			updateBeforeBlinkFlip(x, y);
		}
	};

	const getBlock = (x, y) => {
		const index = y * columns + x;
		const charCode = imageData[index] >> 8;
		const foregroundColor = imageData[index] & 15;
		const backgroundColor = (imageData[index] >> 4) & 15;
		return {
			x: x,
			y: y,
			charCode: charCode,
			foregroundColor: foregroundColor,
			backgroundColor: backgroundColor,
		};
	};

	const getHalfBlock = (x, y) => {
		const textY = Math.floor(y / 2);
		const index = textY * columns + x;
		const foreground = imageData[index] & 15;
		const background = (imageData[index] >> 4) & 15;
		let upperBlockColor = 0;
		let lowerBlockColor = 0;
		let isBlocky = false;
		let isVerticalBlocky = false;
		let leftBlockColor;
		let rightBlockColor;
		switch (imageData[index] >> 8) {
			case 0:
			case 32:
			case 255:
				upperBlockColor = background;
				lowerBlockColor = background;
				isBlocky = true;
				break;
			case 220:
				upperBlockColor = background;
				lowerBlockColor = foreground;
				isBlocky = true;
				break;
			case 221:
				isVerticalBlocky = true;
				leftBlockColor = foreground;
				rightBlockColor = background;
				break;
			case 222:
				isVerticalBlocky = true;
				leftBlockColor = background;
				rightBlockColor = foreground;
				break;
			case 223:
				upperBlockColor = foreground;
				lowerBlockColor = background;
				isBlocky = true;
				break;
			case 219:
				upperBlockColor = foreground;
				lowerBlockColor = foreground;
				isBlocky = true;
				break;
			default:
				if (foreground === background) {
					isBlocky = true;
					upperBlockColor = foreground;
					lowerBlockColor = foreground;
				} else {
					isBlocky = false;
				}
		}
		return {
			x: x,
			y: y,
			textY: textY,
			isBlocky: isBlocky,
			upperBlockColor: upperBlockColor,
			lowerBlockColor: lowerBlockColor,
			halfBlockY: y % 2,
			isVerticalBlocky: isVerticalBlocky,
			leftBlockColor: leftBlockColor,
			rightBlockColor: rightBlockColor,
		};
	};

	const drawHalfBlock = (index, foreground, x, y, textY) => {
		const halfBlockY = y % 2;
		const charCode = imageData[index] >> 8;
		const currentForeground = imageData[index] & 15;
		const currentBackground = (imageData[index] >> 4) & 15;

		let newCharCode, newForeground, newBackground;
		let shouldUpdate = false;

		if (charCode === 219) {
			if (currentForeground !== foreground) {
				if (halfBlockY === 0) {
					newCharCode = 223;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				} else {
					newCharCode = 220;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				}
			}
		} else if (charCode !== 220 && charCode !== 223) {
			if (halfBlockY === 0) {
				newCharCode = 223;
				newForeground = foreground;
				newBackground = currentBackground;
				shouldUpdate = true;
			} else {
				newCharCode = 220;
				newForeground = foreground;
				newBackground = currentBackground;
				shouldUpdate = true;
			}
		} else {
			if (halfBlockY === 0) {
				if (charCode === 223) {
					if (currentBackground === foreground) {
						newCharCode = 219;
						newForeground = foreground;
						newBackground = 0;
						shouldUpdate = true;
					} else {
						newCharCode = 223;
						newForeground = foreground;
						newBackground = currentBackground;
						shouldUpdate = true;
					}
				} else if (currentForeground === foreground) {
					newCharCode = 219;
					newForeground = foreground;
					newBackground = 0;
					shouldUpdate = true;
				} else {
					newCharCode = 223;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				}
			} else {
				if (charCode === 220) {
					if (currentBackground === foreground) {
						newCharCode = 219;
						newForeground = foreground;
						newBackground = 0;
						shouldUpdate = true;
					} else {
						newCharCode = 220;
						newForeground = foreground;
						newBackground = currentBackground;
						shouldUpdate = true;
					}
				} else if (currentForeground === foreground) {
					newCharCode = 219;
					newForeground = foreground;
					newBackground = 0;
					shouldUpdate = true;
				} else {
					newCharCode = 220;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				}
			}
		}

		if (shouldUpdate) {
			patchBufferAndEnqueueDirty(index, newCharCode, newForeground, newBackground, x, textY, false);
		}
	};

	document.addEventListener('onLetterSpacingChange', onLetterSpacingChange);

	const getXYCoords = (clientX, clientY, callback) => {
		const rect = canvasContainer.getBoundingClientRect();
		const x = Math.floor((clientX - rect.left) / State.font.getWidth());
		const y = Math.floor((clientY - rect.top) / State.font.getHeight());
		const halfBlockY = Math.floor(((clientY - rect.top) / State.font.getHeight()) * 2);
		callback(x, y, halfBlockY);
	};

	canvasContainer.addEventListener('touchstart', e => {
		if (e.touches.length === 2 && e.changedTouches.length === 2) {
			e.preventDefault();
			undo();
		} else if (e.touches.length > 2 && e.changedTouches.length > 2) {
			e.preventDefault();
			redo();
		} else {
			mouseButton = true;
			getXYCoords(e.touches[0].pageX, e.touches[0].pageY, (x, y, halfBlockY) => {
				if (e.altKey === true) {
					if (State.sampleTool && State.sampleTool.sample) {
						State.sampleTool.sample(x, halfBlockY);
					}
				} else {
					document.dispatchEvent(
						new CustomEvent('onTextCanvasDown', {
							detail: {
								x: x,
								y: y,
								halfBlockY: halfBlockY,
								leftMouseButton: e.button === 0 && e.ctrlKey !== true,
								rightMouseButton: e.button === 2 || e.ctrlKey === true,
							},
						}),
					);
				}
			});
		}
	});

	canvasContainer.addEventListener('mousedown', e => {
		mouseButton = true;
		getXYCoords(e.clientX, e.clientY, (x, y, halfBlockY) => {
			if (e.altKey === true) {
				if (State.sampleTool && State.sampleTool.sample) {
					State.sampleTool.sample(x, halfBlockY);
				}
			} else {
				document.dispatchEvent(
					new CustomEvent('onTextCanvasDown', {
						detail: {
							x: x,
							y: y,
							halfBlockY: halfBlockY,
							leftMouseButton: e.button === 0 && e.ctrlKey !== true,
							rightMouseButton: e.button === 2 || e.ctrlKey === true,
						},
					}),
				);
			}
		});
	});

	canvasContainer.addEventListener('contextmenu', e => {
		e.preventDefault();
	});

	canvasContainer.addEventListener('touchmove', e => {
		e.preventDefault();
		getXYCoords(e.touches[0].pageX, e.touches[0].pageY, (x, y, halfBlockY) => {
			document.dispatchEvent(
				new CustomEvent('onTextCanvasDrag', {
					detail: {
						x: x,
						y: y,
						halfBlockY: halfBlockY,
						leftMouseButton: e.button === 0 && e.ctrlKey !== true,
						rightMouseButton: e.button === 2 || e.ctrlKey === true,
					},
				}),
			);
		});
	});

	canvasContainer.addEventListener('mousemove', e => {
		e.preventDefault();
		if (mouseButton === true) {
			getXYCoords(e.clientX, e.clientY, (x, y, halfBlockY) => {
				document.dispatchEvent(
					new CustomEvent('onTextCanvasDrag', {
						detail: {
							x: x,
							y: y,
							halfBlockY: halfBlockY,
							leftMouseButton: e.button === 0 && e.ctrlKey !== true,
							rightMouseButton: e.button === 2 || e.ctrlKey === true,
						},
					}),
				);
			});
		}
	});

	canvasContainer.addEventListener('touchend', e => {
		e.preventDefault();
		mouseButton = false;
		document.dispatchEvent(new CustomEvent('onTextCanvasUp', {}));
	});

	canvasContainer.addEventListener('mouseup', e => {
		e.preventDefault();
		if (mouseButton === true) {
			mouseButton = false;
			document.dispatchEvent(new CustomEvent('onTextCanvasUp', {}));
		}
	});

	canvasContainer.addEventListener('touchenter', e => {
		e.preventDefault();
		document.dispatchEvent(new CustomEvent('onTextCanvasUp', {}));
	});

	canvasContainer.addEventListener('mouseenter', e => {
		e.preventDefault();
		if (mouseButton === true && (e.which === 0 || e.buttons === 0)) {
			mouseButton = false;
			document.dispatchEvent(new CustomEvent('onTextCanvasUp', {}));
		}
	});

	const sendDrawHistory = () => {
		State.network?.draw?.(drawHistory);
		drawHistory = [];
	};

	const undo = () => {
		if (currentUndo.length > 0) {
			undoBuffer.push(currentUndo);
			currentUndo = [];
		}
		if (undoBuffer.length > 0) {
			const currentRedo = [];
			const undoChunk = undoBuffer.pop();
			for (let i = undoChunk.length - 1; i >= 0; i--) {
				const undo = undoChunk.pop();
				if (undo[0] < imageData.length) {
					currentRedo.push([undo[0], imageData[undo[0]], undo[2], undo[3]]);
					imageData[undo[0]] = undo[1];
					drawHistory.push((undo[0] << 16) + undo[1]);
					if (iceColors === false) {
						updateBeforeBlinkFlip(undo[2], undo[3]);
					}
					// Use both immediate redraw AND dirty region system for undo
					redrawGlyph(undo[0], undo[2], undo[3]);
					enqueueDirtyCell(undo[2], undo[3]);
				}
			}
			redoBuffer.push(currentRedo);
			processDirtyRegions();
			sendDrawHistory();
		}
	};

	const redo = () => {
		if (redoBuffer.length > 0) {
			const redoChunk = redoBuffer.pop();
			for (let i = redoChunk.length - 1; i >= 0; i--) {
				const redo = redoChunk.pop();
				if (redo[0] < imageData.length) {
					currentUndo.push([redo[0], imageData[redo[0]], redo[2], redo[3]]);
					imageData[redo[0]] = redo[1];
					drawHistory.push((redo[0] << 16) + redo[1]);
					if (iceColors === false) {
						updateBeforeBlinkFlip(redo[2], redo[3]);
					}
					// Use both immediate redraw AND dirty region system for redo
					redrawGlyph(redo[0], redo[2], redo[3]);
					enqueueDirtyCell(redo[2], redo[3]);
				}
			}
			undoBuffer.push(currentUndo);
			currentUndo = [];
			processDirtyRegions();
			sendDrawHistory();
		}
	};

	const startUndo = () => {
		if (currentUndo.length > 0) {
			undoBuffer.push(currentUndo);
			currentUndo = [];
		}
		redoBuffer = [];
	};

	const optimiseBlocks = blocks => {
		blocks.forEach(block => {
			const index = block[0];
			const attribute = imageData[index];
			const background = (attribute >> 4) & 15;
			let foreground;
			if (background >= 8) {
				switch (attribute >> 8) {
					case 0:
					case 32:
					case 255:
						draw(index, 219, background, 0, block[1], block[2]);
						break;
					case 219:
						draw(index, 219, attribute & 15, 0, block[1], block[2]);
						break;
					case 221:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(index, 222, background, foreground, block[1], block[2]);
						}
						break;
					case 222:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(index, 221, background, foreground, block[1], block[2]);
						}
						break;
					case 223:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(index, 220, background, foreground, block[1], block[2]);
						}
						break;
					case 220:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(index, 223, background, foreground, block[1], block[2]);
						}
						break;
					default:
						break;
				}
			}
		});
	};

	const drawEntryPoint = (callback, optimise) => {
		const blocks = [];
		callback((charCode, foreground, background, x, y) => {
			const index = y * columns + x;
			blocks.push([index, x, y]);
			patchBufferAndEnqueueDirty(index, charCode, foreground, background, x, y, true);

			if (mirrorMode) {
				const mirrorX = getMirrorX(x);
				if (mirrorX >= 0 && mirrorX < columns) {
					const mirrorIndex = y * columns + mirrorX;
					const mirrorCharCode = getMirrorCharCode(charCode);
					blocks.push([mirrorIndex, mirrorX, y]);
					patchBufferAndEnqueueDirty(mirrorIndex, mirrorCharCode, foreground, background, mirrorX, y, true);
				}
			}
		});
		if (optimise) {
			optimiseBlocks(blocks);
		}

		processDirtyRegions();
		sendDrawHistory();
	};

	const drawHalfBlockEntryPoint = callback => {
		const blocks = [];
		callback((foreground, x, y) => {
			const textY = Math.floor(y / 2);
			const index = textY * columns + x;
			blocks.push([index, x, textY]);

			currentUndo.push([index, imageData[index], x, textY]);
			drawHistory.push((index << 16) + imageData[index]);

			drawHalfBlock(index, foreground, x, y, textY);

			if (mirrorMode) {
				const mirrorX = getMirrorX(x);
				if (mirrorX >= 0 && mirrorX < columns) {
					const mirrorIndex = textY * columns + mirrorX;
					blocks.push([mirrorIndex, mirrorX, textY]);

					currentUndo.push([mirrorIndex, imageData[mirrorIndex], mirrorX, textY]);
					drawHistory.push((mirrorIndex << 16) + imageData[mirrorIndex]);

					drawHalfBlock(mirrorIndex, foreground, mirrorX, y, textY);
				}
			}
		});
		optimiseBlocks(blocks);
		processDirtyRegions();
		sendDrawHistory();
	};

	const deleteArea = (x, y, width, height, background) => {
		const maxWidth = x + width;
		const maxHeight = y + height;
		drawEntryPoint(draw => {
			for (let dy = y; dy < maxHeight; dy++) {
				for (let dx = x; dx < maxWidth; dx++) {
					draw(0, 0, background, dx, dy);
				}
			}
		});
	};

	const getArea = (x, y, width, height) => {
		const data = new Uint16Array(width * height);
		for (let dy = 0, j = 0; dy < height; dy++) {
			for (let dx = 0; dx < width; dx++, j++) {
				const i = (y + dy) * columns + (x + dx);
				data[j] = imageData[i];
			}
		}
		return {
			data: data,
			width: width,
			height: height,
		};
	};

	const setArea = (area, x, y) => {
		const maxWidth = Math.min(area.width, columns - x);
		const maxHeight = Math.min(area.height, rows - y);
		drawEntryPoint(draw => {
			for (let py = 0; py < maxHeight; py++) {
				for (let px = 0; px < maxWidth; px++) {
					const attrib = area.data[py * area.width + px];
					draw(attrib >> 8, attrib & 15, (attrib >> 4) & 15, x + px, y + py);
				}
			}
		});
	};

	// Use unified buffer patching without adding to undo (network changes)
	const quickDraw = blocks => {
		blocks.forEach(block => {
			if (imageData[block[0]] !== block[1]) {
				imageData[block[0]] = block[1];
				if (iceColors === false) {
					updateBeforeBlinkFlip(block[2], block[3]);
				}
				enqueueDirtyCell(block[2], block[3]);
			}
		});
		processDirtyRegions();
	};

	const getDefaultFontName = () => DEFAULT_FONT;
	const getCurrentFontName = () => currentFontName;

	const setXBFontData = (fontBytes, fontWidth, fontHeight) => {
		if (!fontWidth || fontWidth <= 0) {
			console.warn(`Invalid XB font width: ${fontWidth} , defaulting to ${DEFAULT_FONT_WIDTH}px`);
			fontWidth = DEFAULT_FONT_WIDTH;
		}
		if (!fontHeight || fontHeight <= 0) {
			console.warn(`Invalid XB font height: ${fontHeight} , defaulting to ${DEFAULT_FONT_HEIGHT}px`);

			fontHeight = DEFAULT_FONT_HEIGHT;
		}
		if (!fontBytes || fontBytes.length === 0) {
			console.error('No XB font data provided');
			return false;
		}

		xbFontData = {
			bytes: fontBytes,
			width: fontWidth,
			height: fontHeight,
		};
		return true;
	};

	const setXBPaletteData = paletteBytes => {
		// Convert XB palette (6-bit RGB values)
		const rgb6BitPalette = [];
		for (let i = 0; i < 16; i++) {
			const offset = i * 3;
			rgb6BitPalette.push([paletteBytes[offset], paletteBytes[offset + 1], paletteBytes[offset + 2]]);
		}
		State.palette = createPalette(rgb6BitPalette);

		// Force regeneration of font glyphs with new palette
		if (State.font && State.font.setLetterSpacing) {
			State.font.setLetterSpacing(State.font.getLetterSpacing());
		}
		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);
	};

	const clearXBData = callback => {
		xbFontData = null;
		State.palette = createDefaultPalette();
		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);
		if (State.font && State.font.setLetterSpacing) {
			State.font.setLetterSpacing(State.font.getLetterSpacing());
		}
		if (callback) {
			callback();
		}
	};

	const loadXBFileSequential = (imageData, finalCallback) => {
		clearXBData(() => {
			if (imageData.paletteData) {
				setXBPaletteData(imageData.paletteData);
			}
			if (imageData.fontData) {
				const fontDataValid = setXBFontData(
					imageData.fontData.bytes,
					imageData.fontData.width,
					imageData.fontData.height,
				);
				if (fontDataValid) {
					setFont('XBIN', () => {
						finalCallback(
							imageData.columns,
							imageData.rows,
							imageData.data,
							imageData.iceColors,
							imageData.letterSpacing,
							imageData.fontName,
						);
					});
				} else {
					const fallbackFont = DEFAULT_FONT;
					setFont(fallbackFont, () => {
						finalCallback(
							imageData.columns,
							imageData.rows,
							imageData.data,
							imageData.iceColors,
							imageData.letterSpacing,
							fallbackFont,
						);
					});
				}
			} else {
				const fallbackFont = DEFAULT_FONT;
				setFont(fallbackFont, () => {
					finalCallback(
						imageData.columns,
						imageData.rows,
						imageData.data,
						imageData.iceColors,
						imageData.letterSpacing,
						fallbackFont,
					);
				});
			}
		});
	};

	State.palette = createDefaultPalette();
	setFont(currentFontName, _ => {
		callback();
	});

	return {
		resize: resize,
		redrawEntireImage: redrawEntireImage,
		setFont: setFont,
		getIceColors: getIceColors,
		setIceColors: setIceColors,
		getImage: getImage,
		getImageData: getImageData,
		setImageData: setImageData,
		getColumns: getColumns,
		getRows: getRows,
		clear: clear,
		draw: drawEntryPoint,
		getBlock: getBlock,
		getHalfBlock: getHalfBlock,
		drawHalfBlock: drawHalfBlockEntryPoint,
		startUndo: startUndo,
		undo: undo,
		redo: redo,
		deleteArea: deleteArea,
		getArea: getArea,
		setArea: setArea,
		quickDraw: quickDraw,
		setMirrorMode: setMirrorMode,
		getMirrorMode: getMirrorMode,
		getMirrorX: getMirrorX,
		getCurrentFontName: getCurrentFontName,
		getDefaultFontName: getDefaultFontName,
		setXBFontData: setXBFontData,
		setXBPaletteData: setXBPaletteData,
		clearXBData: clearXBData,
		loadXBFileSequential: loadXBFileSequential,
		drawRegion: drawRegion,
		enqueueDirtyRegion: enqueueDirtyRegion,
		enqueueDirtyCell: enqueueDirtyCell,
		processDirtyRegions: processDirtyRegions,
		patchBufferAndEnqueueDirty: patchBufferAndEnqueueDirty,
		coalesceRegions: coalesceRegions,
	};
};
export { createTextArtCanvas };
export default { createTextArtCanvas };
