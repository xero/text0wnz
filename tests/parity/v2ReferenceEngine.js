/**
 * FROZEN v2 reference engine for the P2 scripted-stroke identity gate.
 *
 * This is the doc-mutation subset of v2 canvas.js (pre-engine-swap),
 * extracted VERBATIM minus rendering, collab, and font concerns: the
 * u16 imageData buffer, draw entry points, half-block painting, mirror
 * tables, the bright-bg optimize pass, chunked undo/redo, areas, and
 * network quickDraw. It exists so the v3 editor core is forever pinned
 * against real v2 behavior even after canvas.js itself runs on v3.
 * engineParity.test.js proved the triangle (live v2 === this reference
 * === v3 core) in the same tree before the swap landed.
 *
 * DO NOT "improve" this file; it preserves v2 quirks on purpose,
 * including the swapped half-block constant names from magicNumbers.
 */

// v2 magicNumbers subset (names preserved, swapped meaning and all)
const FULL_BLOCK = 219;
const UPPER_HALFBLOCK = 220; // CP437 ▄; v2 names it "upper"
const LOWER_HALFBLOCK = 223; // CP437 ▀; v2 names it "lower"
const LEFT_HALFBLOCK = 221;
const RIGHT_HALFBLOCK = 222;
const CHAR_NULL = 0;
const CHAR_SPACE = 32;
const CHAR_NBSP = 255;
const MAX_UNDO_CELLS = 1048576;

export const createV2ReferenceEngine = (initialColumns, initialRows) => {
	let columns = initialColumns;
	let rows = initialRows;
	let iceColors = false;
	let imageData = new Uint16Array(columns * rows);
	let currentUndo = [];
	let undoBuffer = [];
	let redoBuffer = [];
	let mirrorMode = false;
	let undoBufferCells = 0;

	const clearUndos = () => {
		currentUndo = [];
		undoBuffer = [];
		redoBuffer = [];
		undoBufferCells = 0;
	};

	const pushUndoChunk = chunk => {
		undoBuffer.push(chunk);
		undoBufferCells += chunk.length;
		while (undoBufferCells > MAX_UNDO_CELLS && undoBuffer.length > 1) {
			undoBufferCells -= undoBuffer.shift().length;
		}
	};

	const getMirrorX = x => {
		if (columns % 2 !== 0 && x === Math.floor(columns / 2)) {
			return -1;
		}
		return columns - 1 - x;
	};

	const getMirrorCharCode = charCode => {
		switch (charCode) {
			case LEFT_HALFBLOCK:
				return RIGHT_HALFBLOCK;
			case RIGHT_HALFBLOCK:
				return LEFT_HALFBLOCK;
			case UPPER_HALFBLOCK:
			case LOWER_HALFBLOCK:
				return charCode;
			case 40:
				return 41;
			case 41:
				return 40;
			case 91:
				return 93;
			case 93:
				return 91;
			case 123:
				return 125;
			case 125:
				return 123;
			case 47:
				return 92;
			case 92:
				return 47;
			case 96:
				return 39;
			case 39:
				return 96;
			case 60:
				return 62;
			case 62:
				return 60;
			case 57:
				return 80;
			case 80:
				return 57;
			default:
				return charCode;
		}
	};

	const draw = (index, charCode, foreground, background, x, y) => {
		currentUndo.push([index, imageData[index], x, y]);
		imageData[index] = (charCode << 8) + (background << 4) + foreground;
	};

	const patchBuffer = (
		index,
		charCode,
		foreground,
		background,
		x,
		y,
		addToUndo = true,
	) => {
		if (addToUndo) {
			currentUndo.push([index, imageData[index], x, y]);
		}
		imageData[index] = (charCode << 8) + (background << 4) + foreground;
	};

	const getBlock = (x, y) => {
		const index = y * columns + x;
		return {
			x,
			y,
			charCode: imageData[index] >> 8,
			foregroundColor: imageData[index] & 15,
			backgroundColor: (imageData[index] >> 4) & 15,
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
			x,
			y,
			textY,
			isBlocky,
			upperBlockColor,
			lowerBlockColor,
			halfBlockY: y % 2,
			isVerticalBlocky,
			leftBlockColor,
			rightBlockColor,
		};
	};

	const drawHalfBlock = (index, foreground, x, y, textY) => {
		const halfBlockY = y % 2;
		const charCode = imageData[index] >> 8;
		const currentForeground = imageData[index] & 15;
		const currentBackground = (imageData[index] >> 4) & 15;

		let newCharCode, newForeground, newBackground;
		let shouldUpdate = false;

		if (charCode === FULL_BLOCK) {
			if (currentForeground !== foreground) {
				if (halfBlockY === 0) {
					newCharCode = LOWER_HALFBLOCK;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				} else {
					newCharCode = UPPER_HALFBLOCK;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				}
			}
		} else if (
			charCode !== UPPER_HALFBLOCK &&
			charCode !== LOWER_HALFBLOCK
		) {
			if (halfBlockY === 0) {
				newCharCode = LOWER_HALFBLOCK;
				newForeground = foreground;
				newBackground = currentBackground;
				shouldUpdate = true;
			} else {
				newCharCode = UPPER_HALFBLOCK;
				newForeground = foreground;
				newBackground = currentBackground;
				shouldUpdate = true;
			}
		} else {
			if (halfBlockY === 0) {
				if (charCode === LOWER_HALFBLOCK) {
					if (currentBackground === foreground) {
						newCharCode = FULL_BLOCK;
						newForeground = foreground;
						newBackground = 0;
						shouldUpdate = true;
					} else {
						newCharCode = LOWER_HALFBLOCK;
						newForeground = foreground;
						newBackground = currentBackground;
						shouldUpdate = true;
					}
				} else if (currentForeground === foreground) {
					newCharCode = FULL_BLOCK;
					newForeground = foreground;
					newBackground = 0;
					shouldUpdate = true;
				} else {
					newCharCode = LOWER_HALFBLOCK;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				}
			} else {
				if (charCode === UPPER_HALFBLOCK) {
					if (currentBackground === foreground) {
						newCharCode = FULL_BLOCK;
						newForeground = foreground;
						newBackground = 0;
						shouldUpdate = true;
					} else {
						newCharCode = UPPER_HALFBLOCK;
						newForeground = foreground;
						newBackground = currentBackground;
						shouldUpdate = true;
					}
				} else if (currentForeground === foreground) {
					newCharCode = FULL_BLOCK;
					newForeground = foreground;
					newBackground = 0;
					shouldUpdate = true;
				} else {
					newCharCode = UPPER_HALFBLOCK;
					newForeground = foreground;
					newBackground = currentForeground;
					shouldUpdate = true;
				}
			}
		}

		if (shouldUpdate) {
			patchBuffer(index, newCharCode, newForeground, newBackground, x, textY, false);
		}
	};

	const optimizeBlocks = blocks => {
		blocks.forEach(block => {
			const index = block[0];
			const attribute = imageData[index];
			const background = (attribute >> 4) & 15;
			let foreground;
			if (background >= 8) {
				switch (attribute >> 8) {
					case CHAR_NULL:
					case CHAR_SPACE:
					case CHAR_NBSP:
						draw(index, FULL_BLOCK, background, 0, block[1], block[2]);
						break;
					case FULL_BLOCK:
						draw(index, FULL_BLOCK, attribute & 15, 0, block[1], block[2]);
						break;
					case LEFT_HALFBLOCK:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(
								index,
								RIGHT_HALFBLOCK,
								background,
								foreground,
								block[1],
								block[2],
							);
						}
						break;
					case RIGHT_HALFBLOCK:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(
								index,
								LEFT_HALFBLOCK,
								background,
								foreground,
								block[1],
								block[2],
							);
						}
						break;
					case LOWER_HALFBLOCK:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(
								index,
								UPPER_HALFBLOCK,
								background,
								foreground,
								block[1],
								block[2],
							);
						}
						break;
					case UPPER_HALFBLOCK:
						foreground = attribute & 15;
						if (foreground < 8) {
							draw(
								index,
								LOWER_HALFBLOCK,
								background,
								foreground,
								block[1],
								block[2],
							);
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
			patchBuffer(index, charCode, foreground, background, x, y, true);
			if (mirrorMode) {
				const mirrorX = getMirrorX(x);
				if (mirrorX >= 0 && mirrorX < columns) {
					const mirrorIndex = y * columns + mirrorX;
					const mirrorCharCode = getMirrorCharCode(charCode);
					blocks.push([mirrorIndex, mirrorX, y]);
					patchBuffer(
						mirrorIndex,
						mirrorCharCode,
						foreground,
						background,
						mirrorX,
						y,
						true,
					);
				}
			}
		});
		if (optimise) {
			optimizeBlocks(blocks);
		}
	};

	const drawWithUndo = (index, foreground, x, y, textY) => {
		currentUndo.push([index, imageData[index], x, textY]);
		drawHalfBlock(index, foreground, x, y, textY);
	};

	const drawHalfBlockEntryPoint = callback => {
		const blocks = [];
		callback((foreground, x, y) => {
			const textY = Math.floor(y / 2);
			const index = textY * columns + x;
			blocks.push([index, x, textY]);
			drawWithUndo(index, foreground, x, y, textY);
			if (mirrorMode) {
				const mirrorX = getMirrorX(x);
				if (mirrorX >= 0 && mirrorX < columns) {
					const mirrorIndex = textY * columns + mirrorX;
					blocks.push([mirrorIndex, mirrorX, textY]);
					drawWithUndo(mirrorIndex, foreground, mirrorX, y, textY);
				}
			}
		});
		optimizeBlocks(blocks);
	};

	return {
		resize: (newColumnValue, newRowValue) => {
			if (
				(newColumnValue !== columns || newRowValue !== rows) &&
				newColumnValue > 0 &&
				newRowValue > 0
			) {
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
			}
		},
		getImageData: () => imageData,
		setImageData: (newColumns, newRows, newImageData, newIceColors) => {
			clearUndos();
			columns = newColumns;
			rows = newRows;
			imageData = newImageData;
			iceColors = newIceColors;
		},
		getColumns: () => columns,
		getRows: () => rows,
		getIceColors: () => iceColors,
		setIceColors: newIceColors => {
			iceColors = newIceColors;
		},
		clear: () => {
			clearUndos();
			imageData = new Uint16Array(columns * rows);
			iceColors = false;
		},
		draw: drawEntryPoint,
		getBlock,
		getHalfBlock,
		drawHalfBlock: drawHalfBlockEntryPoint,
		startUndo: () => {
			if (currentUndo.length > 0) {
				pushUndoChunk(currentUndo);
				currentUndo = [];
			}
			redoBuffer = [];
		},
		undo: () => {
			if (currentUndo.length > 0) {
				pushUndoChunk(currentUndo);
				currentUndo = [];
			}
			if (undoBuffer.length > 0) {
				const currentRedo = [];
				const undoChunk = undoBuffer.pop();
				undoBufferCells -= undoChunk.length;
				for (let i = undoChunk.length - 1; i >= 0; i--) {
					const undo = undoChunk.pop();
					if (undo[0] < imageData.length) {
						currentRedo.push([undo[0], imageData[undo[0]], undo[2], undo[3]]);
						imageData[undo[0]] = undo[1];
					}
				}
				redoBuffer.push(currentRedo);
			}
		},
		redo: () => {
			if (redoBuffer.length > 0) {
				const redoChunk = redoBuffer.pop();
				for (let i = redoChunk.length - 1; i >= 0; i--) {
					const redo = redoChunk.pop();
					if (redo[0] < imageData.length) {
						currentUndo.push([redo[0], imageData[redo[0]], redo[2], redo[3]]);
						imageData[redo[0]] = redo[1];
					}
				}
				pushUndoChunk(currentUndo);
				currentUndo = [];
			}
		},
		deleteArea: (x, y, width, height, background) => {
			const maxWidth = x + width;
			const maxHeight = y + height;
			drawEntryPoint(cb => {
				for (let dy = y; dy < maxHeight; dy++) {
					for (let dx = x; dx < maxWidth; dx++) {
						cb(0, 0, background, dx, dy);
					}
				}
			});
		},
		getArea: (x, y, width, height) => {
			const data = new Uint16Array(width * height);
			for (let dy = 0, j = 0; dy < height; dy++) {
				for (let dx = 0; dx < width; dx++, j++) {
					const i = (y + dy) * columns + (x + dx);
					data[j] = imageData[i];
				}
			}
			return { data, width, height };
		},
		setArea: (area, x, y) => {
			const maxWidth = Math.min(area.width, columns - x);
			const maxHeight = Math.min(area.height, rows - y);
			drawEntryPoint(cb => {
				for (let py = 0; py < maxHeight; py++) {
					for (let px = 0; px < maxWidth; px++) {
						const attrib = area.data[py * area.width + px];
						cb(attrib >> 8, attrib & 15, (attrib >> 4) & 15, x + px, y + py);
					}
				}
			});
		},
		quickDraw: blocks => {
			blocks.forEach(block => {
				if (imageData[block[0]] !== block[1]) {
					imageData[block[0]] = block[1];
				}
			});
		},
		setMirrorMode: enabled => {
			mirrorMode = enabled;
		},
		getMirrorMode: () => mirrorMode,
		getMirrorX,
	};
};
