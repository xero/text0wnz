import State from './state.js';
import Toolbar from './toolbar.js';
import { $, createCanvas } from './ui.js';
import magicNumbers from './magicNumbers.js';

const createFKeys = () => {
	// Stolen "savagely" from Moebius, who stole it "mercilessly" from PabloDraw, thanks Curtis! lol
	const predefinedSets = [
		[218, 191, 192, 217, 196, 179, 195, 180, 193, 194, 32, 32],
		[201, 187, 200, 188, 205, 186, 204, 185, 202, 203, 32, 32],
		[213, 184, 212, 190, 205, 179, 198, 181, 207, 209, 32, 32],
		[214, 183, 211, 189, 196, 186, 199, 182, 208, 210, 32, 32],
		[197, 206, 216, 215, 232, 232, 155, 156, 153, 239, 32, 32],
		[176, 177, 178, 219, 223, 220, 221, 222, 254, 250, 7, 32],
		[1, 2, 3, 4, 5, 6, 240, 14, 15, 32, 32, 32],
		[24, 25, 30, 31, 16, 17, 18, 29, 20, 21, 32, 32],
		[174, 175, 242, 243, 169, 170, 253, 246, 171, 172, 32, 32],
		[227, 241, 244, 245, 234, 157, 228, 248, 251, 252, 32, 32],
		[224, 225, 226, 229, 230, 231, 235, 236, 237, 238, 32, 32],
		[128, 135, 165, 164, 152, 159, 247, 249, 173, 168, 32, 32],
		[131, 132, 133, 160, 166, 134, 142, 143, 145, 146, 32, 32],
		[136, 137, 138, 130, 144, 140, 139, 141, 161, 158, 32, 32],
		[147, 148, 149, 162, 167, 150, 129, 151, 163, 154, 32, 32],
		[47, 92, 40, 41, 123, 125, 91, 93, 96, 39, 32, 32],
	];

	// Generate additional sets to cover all 256 characters
	const generateCharSets = () => {
		const charSets = [...predefinedSets];
		const usedChars = new Set();
		predefinedSets.forEach(set => {
			set.forEach(char => usedChars.add(char));
		});
		// Generate sets for remaining characters
		let currentSet = [];
		for (let i = 0; i < 256; i++) {
			if (!usedChars.has(i)) {
				currentSet.push(i);
				if (currentSet.length === 12) {
					charSets.push([...currentSet]);
					currentSet = [];
				}
			}
		}
		// Add any remaining characters as a final set
		if (currentSet.length > 0) {
			while (currentSet.length < 12) {
				currentSet.push(32); // Pad with spaces
			}
			charSets.push(currentSet);
		}
		return charSets;
	};

	const fkeySets = generateCharSets();
	let currentSetIndex = 5; // Default to set 5 (blocks, half-blocks, etc.)

	// Update all fkey canvases with current set
	const updateFKeyDisplays = () => {
		const currentSet = fkeySets[currentSetIndex];
		for (let i = 0; i < 12; i++) {
			const canvas = $('fkey' + i);
			if (canvas) {
				// Set canvas internal dimensions
				canvas.width = State.font.getWidth();
				canvas.height = State.font.getHeight();

				// Keep CSS display size fixed at 1.5x of BASE font size
				// This maintains the original UI appearance regardless of zoom
				const baseWidth = 8; // Base font width
				const baseHeight = 16; // Base font height
				const fixedScale = 1.5;

				canvas.style.width = baseWidth * fixedScale + 'px';
				canvas.style.height = baseHeight * fixedScale + 'px';

				State.font.draw(
					currentSet[i],
					State.palette.getForegroundColor(),
					State.palette.getBackgroundColor(),
					canvas.getContext('2d'),
					0,
					0,
				);
			}
		}
	};

	// Initialize fkey canvases
	for (let i = 0; i < 12; i++) {
		const canvas = $('fkey' + i);
		const wrap = $('fkey' + i + 'w');
		if (canvas && wrap) {
			const insert = () => {
				State.textArtCanvas.startUndo();
				State.textArtCanvas.draw(callback => {
					callback(
						fkeySets[currentSetIndex][i],
						State.palette.getForegroundColor(),
						State.palette.getBackgroundColor(),
						State.cursor.getX(),
						State.cursor.getY(),
					);
				}, false);
				State.cursor.right();
			};
			wrap.addEventListener('click', insert);
		}
	}

	// Set up navigation
	const prevButton = $('fkeySetPrev');
	const nextButton = $('fkeySetNext');

	const previousCharacterSet = () => {
		currentSetIndex =
			currentSetIndex <= 0 ? fkeySets.length - 1 : currentSetIndex - 1;
		updateFKeyDisplays();
	};

	const nextCharacterSet = () => {
		currentSetIndex =
			currentSetIndex >= fkeySets.length - 1 ? 0 : currentSetIndex + 1;
		updateFKeyDisplays();
	};

	if (prevButton) {
		prevButton.addEventListener('click', previousCharacterSet);
	}

	if (nextButton) {
		nextButton.addEventListener('click', nextCharacterSet);
	}

	const keyDown = e => {
		// Handle F1-F12 function keys
		const fKeyMatch = e.code.match(/^F(\d+)$/);
		if (
			!e.altKey &&
			!e.ctrlKey &&
			!e.metaKey &&
			fKeyMatch &&
			fKeyMatch[1] >= 1 &&
			fKeyMatch[1] <= 12
		) {
			e.preventDefault();
			State.textArtCanvas.startUndo();
			State.textArtCanvas.draw(callback => {
				callback(
					fkeySets[currentSetIndex][fKeyMatch[1] - 1],
					State.palette.getForegroundColor(),
					State.palette.getBackgroundColor(),
					State.cursor.getX(),
					State.cursor.getY(),
				);
			}, false);
			State.cursor.right();
		}
		// 'Ctrl+[' - previous character set
		else if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'BracketLeft') {
			e.preventDefault();
			previousCharacterSet();
		}
		// 'Ctrl+]' - next character set
		else if (
			e.ctrlKey &&
			!e.altKey &&
			!e.metaKey &&
			e.code === 'BracketRight'
		) {
			e.preventDefault();
			nextCharacterSet();
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		updateFKeyDisplays();
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
	};

	// Update displays when palette/font changes
	document.addEventListener('onPaletteChange', updateFKeyDisplays);
	document.addEventListener('onForegroundChange', updateFKeyDisplays);
	document.addEventListener('onBackgroundChange', updateFKeyDisplays);
	document.addEventListener('onFontChange', updateFKeyDisplays);

	return {
		enable: enable,
		disable: disable,
	};
};

const calculateRowsPerScreen = (viewport, fontHeight) => {
	if (!viewport) {
		return 0;
	}
	return Math.floor(viewport.clientHeight / fontHeight);
};

const createCursor = canvasContainer => {
	const canvas = createCanvas(State.font.getWidth(), State.font.getHeight());
	const viewport = $('viewport');
	if (!viewport) {
		console.error('viewport element missing, focus scroll disabled');
	}
	let x = 0;
	let y = 0;
	let visible = false;

	const show = () => {
		canvas.style.display = 'block';
		visible = true;
	};

	const hide = () => {
		canvas.style.display = 'none';
		visible = false;
	};

	const startSelection = () => {
		State.selectionCursor.setStart(x, y);
		hide();
	};

	const endSelection = () => {
		State.selectionCursor.hide();
		show();
	};

	const move = (newX, newY) => {
		if (State.selectionCursor.isVisible()) {
			endSelection();
		}
		x = Math.min(Math.max(newX, 0), State.textArtCanvas.getColumns() - 1);
		y = Math.min(Math.max(newY, 0), State.textArtCanvas.getRows() - 1);
		const canvasWidth = State.font.getWidth();
		canvas.style.left = x * canvasWidth - 1 + 'px';
		canvas.style.top = y * State.font.getHeight() - 1 + 'px';
		State.positionInfo.update(x, y);
		State.pasteTool.setSelection(x, y, 1, 1);

		// Auto-scroll viewport to keep cursor visible
		scrollViewportToCursor();
	};

	const scrollViewportToCursor = () => {
		if (!viewport) {
			return;
		}
		const fontHeight = State.font.getHeight();
		const fontWidth = State.font.getWidth();
		const bufferRows = 5; // Number of rows as buffer

		const cursorPixelY = y * fontHeight;
		const cursorPixelX = x * fontWidth;
		const bufferPixels = bufferRows * fontHeight;

		const viewportHeight = viewport.clientHeight;
		const viewportWidth = viewport.clientWidth;
		const scrollTop = viewport.scrollTop;
		const scrollLeft = viewport.scrollLeft;

		// Check vertical scrolling
		const cursorTop = cursorPixelY - bufferPixels;
		const cursorBottom = cursorPixelY + fontHeight + bufferPixels;

		if (cursorTop < scrollTop) {
			// Cursor is above viewport, scroll up
			viewport.scrollTop = Math.max(0, cursorTop);
		} else if (cursorBottom > scrollTop + viewportHeight) {
			// Cursor is below viewport, scroll down
			viewport.scrollTop = Math.max(0, cursorBottom - viewportHeight);
		}

		// Check horizontal scrolling
		const cursorLeft = cursorPixelX - bufferRows * fontWidth;
		const cursorRight = cursorPixelX + fontWidth + bufferRows * fontWidth;

		if (cursorLeft < scrollLeft) {
			// Cursor is left of viewport, scroll left
			viewport.scrollLeft = Math.max(0, cursorLeft);
		} else if (cursorRight > scrollLeft + viewportWidth) {
			// Cursor is right of viewport, scroll right
			viewport.scrollLeft = Math.max(0, cursorRight - viewportWidth);
		}
	};

	const updateDimensions = () => {
		canvas.width = State.font.getWidth() + 1;
		canvas.height = State.font.getHeight() + 1;
		move(x, y);
	};

	const getX = () => {
		return x;
	};

	const getY = () => {
		return y;
	};

	const left = () => {
		move(x - 1, y);
	};

	const right = () => {
		move(x + 1, y);
	};

	const up = () => {
		move(x, y - 1);
	};

	const down = () => {
		move(x, y + 1);
	};

	const newLine = () => {
		move(0, y + 1);
	};

	const startOfCurrentRow = () => {
		move(0, y);
	};

	const endOfCurrentRow = () => {
		move(State.textArtCanvas.getColumns() - 1, y);
	};

	const pageUp = () => {
		const rowsPerScreen = calculateRowsPerScreen(
			viewport,
			State.font.getHeight(),
		);
		const newY = Math.max(0, y - rowsPerScreen);
		move(x, newY);
	};

	const pageDown = () => {
		const rowsPerScreen = calculateRowsPerScreen(
			viewport,
			State.font.getHeight(),
		);
		const maxY = State.textArtCanvas.getRows() - 1;
		const newY = Math.min(maxY, y + rowsPerScreen);
		move(x, newY);
	};

	const keyDown = e => {
		if (!e.ctrlKey && !e.altKey) {
			if (!e.shiftKey && !e.metaKey) {
				switch (e.code) {
					case 'Enter': // Enter key
						e.preventDefault();
						newLine();
						break;
					case 'End':
						e.preventDefault();
						endOfCurrentRow();
						break;
					case 'Home':
						e.preventDefault();
						startOfCurrentRow();
						break;
					case 'PageUp':
						e.preventDefault();
						pageUp();
						break;
					case 'PageDown':
						e.preventDefault();
						pageDown();
						break;
					case 'ArrowLeft':
						e.preventDefault();
						left();
						break;
					case 'ArrowUp':
						e.preventDefault();
						up();
						break;
					case 'ArrowRight':
						e.preventDefault();
						right();
						break;
					case 'ArrowDown':
						e.preventDefault();
						down();
						break;
					default:
						break;
				}
			} else if (e.metaKey && !e.shiftKey) {
				switch (e.code) {
					// Cmd/Meta + Left arrow
					case 'ArrowLeft':
						e.preventDefault();
						startOfCurrentRow();
						break;
					// Cmd/Meta + Right arrow
					case 'ArrowRight':
						e.preventDefault();
						endOfCurrentRow();
						break;
					default:
						break;
				}
			} else if (e.shiftKey && !e.metaKey) {
				// Shift + arrow keys trigger selection - switch to selection tool
				switch (e.code) {
					case 'ArrowLeft':
					case 'ArrowUp':
					case 'ArrowRight':
					case 'ArrowDown':
						e.preventDefault();
						// Set pending action so selection tool can apply it immediately
						State.selectionTool.setPendingAction(e.code);
						State.cursor.startSelection();
						Toolbar.switchTool('selection');
						break;
					default:
						break;
				}
			}
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		show();
		State.pasteTool.setSelection(x, y, 1, 1);
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
		hide();
		State.pasteTool.disable();
	};

	const isVisible = () => {
		return visible;
	};

	// init
	canvas.classList.add('cursor');
	hide();
	canvasContainer.insertBefore(canvas, canvasContainer.firstChild);
	document.addEventListener('onLetterSpacingChange', updateDimensions);
	document.addEventListener('onTextCanvasSizeChange', updateDimensions);
	document.addEventListener('onFontChange', updateDimensions);
	document.addEventListener('onOpenedFile', updateDimensions);
	document.addEventListener('onScaleFactorChange', updateDimensions);
	move(x, y);

	return {
		show: show,
		hide: hide,
		move: move,
		getX: getX,
		getY: getY,
		left: left,
		right: right,
		up: up,
		down: down,
		newLine: newLine,
		startOfCurrentRow: startOfCurrentRow,
		endOfCurrentRow: endOfCurrentRow,
		enable: enable,
		disable: disable,
		isVisible: isVisible,
		startSelection: startSelection,
	};
};

const createSelectionCursor = element => {
	const cursor = createCanvas(0, 0);
	let sx, sy, dx, dy, x, y, width, height;
	let visible = false;
	// Marching ants animation state
	let dashOffset = 0;
	let animationId = null;
	const dashPattern = [4, 4]; // dash, gap length
	const dashSpeed = 0.1; // px per frame
	x = y = 0;

	const processCoords = () => {
		x = Math.min(sx, dx);
		y = Math.min(sy, dy);
		x = Math.max(x, 0);
		y = Math.max(y, 0);
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		width = Math.abs(dx - sx) + 1;
		height = Math.abs(dy - sy) + 1;
		width = Math.min(width, columns - x);
		height = Math.min(height, rows - y);
	};

	const drawBorder = () => {
		const ctx = cursor.getContext('2d');
		ctx.clearRect(0, 0, cursor.width, cursor.height);
		const antsColor = cursor.classList.contains('moveMode')
			? '#ff7518'
			: '#fff';
		ctx.save();
		ctx.strokeStyle = antsColor;
		ctx.lineWidth = 1;
		ctx.setLineDash(dashPattern);
		ctx.lineDashOffset = -dashOffset;
		ctx.strokeRect(1, 1, cursor.width - 2, cursor.height - 2);
		ctx.restore();
	};

	const animateBorder = () => {
		dashOffset = (dashOffset + dashSpeed) % (dashPattern[0] + dashPattern[1]);
		drawBorder();
		animationId = requestAnimationFrame(animateBorder);
	};

	const show = () => {
		cursor.style.display = 'block';
		if (!animationId) {
			animateBorder();
		}
	};

	const hide = () => {
		cursor.style.display = 'none';
		visible = false;
		State.pasteTool.disable();
		if (animationId) {
			cancelAnimationFrame(animationId);
			animationId = null;
		}
	};

	const updateCursor = () => {
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		cursor.style.left = x * fontWidth - 1 + 'px';
		cursor.style.top = y * fontHeight - 1 + 'px';
		cursor.width = width * fontWidth + 1;
		cursor.height = height * fontHeight + 1;
		drawBorder();
	};

	const setStart = (startX, startY) => {
		sx = startX;
		sy = startY;
		processCoords();
		x = startX;
		y = startY;
		width = 1;
		height = 1;
		updateCursor();
		State.pasteTool.setSelection(x, y, width, height);
	};

	const setEnd = (endX, endY) => {
		show();
		dx = endX;
		dy = endY;
		processCoords();
		updateCursor();
		State.pasteTool.setSelection(x, y, width, height);
		visible = true;
		State.positionInfo.update(x, y);
	};

	const isVisible = () => visible;

	const getSelection = () => {
		if (visible) {
			return { x, y, width, height };
		}
		return null;
	};

	const getPos = () => {
		return { x, y };
	};

	cursor.classList.add('selectionCursor');
	cursor.style.display = 'none';
	element.appendChild(cursor);

	return {
		show,
		hide,
		setStart,
		setEnd,
		isVisible,
		getPos,
		getSelection,
		getElement: () => cursor,
	};
};

const createKeyboardController = () => {
	const fkeys = createFKeys();
	let enabled = false;
	let ignored = false;

	const draw = charCode => {
		State.textArtCanvas.startUndo();
		State.textArtCanvas.draw(callback => {
			callback(
				charCode,
				State.palette.getForegroundColor(),
				State.palette.getBackgroundColor(),
				State.cursor.getX(),
				State.cursor.getY(),
			);
		}, false);
		State.cursor.right();
	};

	const deleteText = () => {
		State.textArtCanvas.startUndo();
		State.textArtCanvas.draw(callback => {
			callback(
				magicNumbers.CHAR_NULL,
				magicNumbers.COLOR_WHITE,
				magicNumbers.COLOR_BLACK,
				State.cursor.getX() - 1,
				State.cursor.getY(),
			);
		}, false);
		State.cursor.left();
	};

	// Edit actions for insert, delete, and erase operations
	const insertRow = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorY = State.cursor.getY();
		State.textArtCanvas.startUndo();
		const newImageData = new Uint16Array(currentColumns * (currentRows + 1));
		const oldImageData = State.textArtCanvas.getImageData();

		for (let y = 0; y < cursorY; y++) {
			for (let x = 0; x < currentColumns; x++) {
				newImageData[y * currentColumns + x] =
					oldImageData[y * currentColumns + x];
			}
		}
		for (let x = 0; x < currentColumns; x++) {
			newImageData[cursorY * currentColumns + x] = magicNumbers.BLANK_CELL;
		}
		for (let y = cursorY; y < currentRows; y++) {
			for (let x = 0; x < currentColumns; x++) {
				newImageData[(y + 1) * currentColumns + x] =
					oldImageData[y * currentColumns + x];
			}
		}

		State.textArtCanvas.setImageData(
			currentColumns,
			currentRows + 1,
			newImageData,
			State.textArtCanvas.getIceColors(),
		);
	};

	const deleteRow = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorY = State.cursor.getY();
		if (currentRows <= 1) {
			return;
		} // Don't delete if only one row
		State.textArtCanvas.startUndo();
		const newImageData = new Uint16Array(currentColumns * (currentRows - 1));
		const oldImageData = State.textArtCanvas.getImageData();

		for (let y = 0; y < cursorY; y++) {
			for (let x = 0; x < currentColumns; x++) {
				newImageData[y * currentColumns + x] =
					oldImageData[y * currentColumns + x];
			}
		}
		// Skip the row at cursor position (delete it)
		// Copy rows after cursor position
		for (let y = cursorY + 1; y < currentRows; y++) {
			for (let x = 0; x < currentColumns; x++) {
				newImageData[(y - 1) * currentColumns + x] =
					oldImageData[y * currentColumns + x];
			}
		}
		State.textArtCanvas.setImageData(
			currentColumns,
			currentRows - 1,
			newImageData,
			State.textArtCanvas.getIceColors(),
		);
		if (State.cursor.getY() >= currentRows - 1) {
			State.cursor.move(State.cursor.getX(), currentRows - 2);
		}
	};

	const insertColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorX = State.cursor.getX();
		State.textArtCanvas.startUndo();
		const newImageData = new Uint16Array((currentColumns + 1) * currentRows);
		const oldImageData = State.textArtCanvas.getImageData();

		for (let y = 0; y < currentRows; y++) {
			for (let x = 0; x < cursorX; x++) {
				newImageData[y * (currentColumns + 1) + x] =
					oldImageData[y * currentColumns + x];
			}
			newImageData[y * (currentColumns + 1) + cursorX] =
				magicNumbers.BLANK_CELL;

			for (let x = cursorX; x < currentColumns; x++) {
				newImageData[y * (currentColumns + 1) + x + 1] =
					oldImageData[y * currentColumns + x];
			}
		}
		State.textArtCanvas.setImageData(
			currentColumns + 1,
			currentRows,
			newImageData,
			State.textArtCanvas.getIceColors(),
		);
	};

	const deleteColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorX = State.cursor.getX();
		if (currentColumns <= 1) {
			return;
		} // Don't delete if only one column
		State.textArtCanvas.startUndo();
		const newImageData = new Uint16Array((currentColumns - 1) * currentRows);
		const oldImageData = State.textArtCanvas.getImageData();

		for (let y = 0; y < currentRows; y++) {
			for (let x = 0; x < cursorX; x++) {
				newImageData[y * (currentColumns - 1) + x] =
					oldImageData[y * currentColumns + x];
			}
			// Skip the column at cursor position (delete it)
			for (let x = cursorX + 1; x < currentColumns; x++) {
				newImageData[y * (currentColumns - 1) + x - 1] =
					oldImageData[y * currentColumns + x];
			}
		}

		State.textArtCanvas.setImageData(
			currentColumns - 1,
			currentRows,
			newImageData,
			State.textArtCanvas.getIceColors(),
		);

		if (State.cursor.getX() >= currentColumns - 1) {
			State.cursor.move(currentColumns - 2, State.cursor.getY());
		}
	};

	const eraseRow = () => {
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorY = State.cursor.getY();
		State.textArtCanvas.startUndo();
		for (let x = 0; x < currentColumns; x++) {
			State.textArtCanvas.draw(callback => {
				callback(
					magicNumbers.CHAR_SPACE,
					magicNumbers.COLOR_WHITE,
					magicNumbers.COLOR_BLACK,
					x,
					cursorY,
				);
			}, false);
		}
	};

	const eraseToStartOfRow = () => {
		const cursorX = State.cursor.getX();
		const cursorY = State.cursor.getY();

		State.textArtCanvas.startUndo();

		for (let x = 0; x <= cursorX; x++) {
			State.textArtCanvas.draw(callback => {
				callback(
					magicNumbers.CHAR_SPACE,
					magicNumbers.COLOR_WHITE,
					magicNumbers.COLOR_BLACK,
					x,
					cursorY,
				);
			}, false);
		}
	};

	const eraseToEndOfRow = () => {
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorX = State.cursor.getX();
		const cursorY = State.cursor.getY();
		State.textArtCanvas.startUndo();
		for (let x = cursorX; x < currentColumns; x++) {
			State.textArtCanvas.draw(callback => {
				callback(
					magicNumbers.CHAR_SPACE,
					magicNumbers.COLOR_WHITE,
					magicNumbers.COLOR_BLACK,
					x,
					cursorY,
				);
			}, false);
		}
	};

	const eraseColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const cursorX = State.cursor.getX();

		State.textArtCanvas.startUndo();

		for (let y = 0; y < currentRows; y++) {
			State.textArtCanvas.draw(callback => {
				callback(
					magicNumbers.CHAR_SPACE,
					magicNumbers.COLOR_WHITE,
					magicNumbers.COLOR_BLACK,
					cursorX,
					y,
				);
			}, false);
		}
	};

	const eraseToStartOfColumn = () => {
		const cursorX = State.cursor.getX();
		const cursorY = State.cursor.getY();
		State.textArtCanvas.startUndo();
		for (let y = 0; y <= cursorY; y++) {
			State.textArtCanvas.draw(callback => {
				callback(
					magicNumbers.CHAR_SPACE,
					magicNumbers.COLOR_WHITE,
					magicNumbers.COLOR_BLACK,
					cursorX,
					y,
				);
			}, false);
		}
	};

	const eraseToEndOfColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const cursorX = State.cursor.getX();
		const cursorY = State.cursor.getY();

		State.textArtCanvas.startUndo();

		for (let y = cursorY; y < currentRows; y++) {
			State.textArtCanvas.draw(callback => {
				callback(
					magicNumbers.CHAR_SPACE,
					magicNumbers.COLOR_WHITE,
					magicNumbers.COLOR_BLACK,
					cursorX,
					y,
				);
			}, false);
		}
	};

	const keyDown = e => {
		if (!ignored) {
			if (!e.altKey && !e.ctrlKey && !e.metaKey) {
				// Tab key - insert tab character
				if (e.code === 'Tab') {
					e.preventDefault();
					draw(9); // Tab character code
				} else if (e.code === 'Backspace') {
					e.preventDefault();
					if (State.cursor.getX() > 0) {
						deleteText();
					}
				}
			} else if (e.altKey && !e.ctrlKey && !e.metaKey) {
				switch (e.code) {
					// Alt+Up Arrow - Insert Row
					case 'ArrowUp':
						e.preventDefault();
						insertRow();
						break;
					// Alt+Down Arrow - Delete Row
					case 'ArrowDown':
						e.preventDefault();
						deleteRow();
						break;
					// Alt+Right Arrow - Insert Column
					case 'ArrowRight':
						e.preventDefault();
						insertColumn();
						break;
					// Alt+Left Arrow - Delete Column
					case 'ArrowLeft':
						e.preventDefault();
						deleteColumn();
						break;
					// Alt+E - Erase Row (or Alt+Shift+E for Erase Column)
					case 'KeyE':
						e.preventDefault();
						if (e.shiftKey) {
							eraseColumn();
						} else {
							eraseRow();
						}
						break;
					// Alt+Home - Erase to Start of Row
					case 'Home':
						e.preventDefault();
						eraseToStartOfRow();
						break;
					// Alt+End - Erase to End of Row
					case 'End':
						e.preventDefault();
						eraseToEndOfRow();
						break;
					// Alt+Page Up - Erase to Start of Column
					case 'PageUp':
						e.preventDefault();
						eraseToStartOfColumn();
						break;
					// Alt+Page Down - Erase to End of Column
					case 'PageDown':
						e.preventDefault();
						eraseToEndOfColumn();
						break;
				}
			}
		}
	};

	const unicodeMapping = new Map([
		[0x2302, 127], // HOUSE (⌂)
		[0x00c7, 128], // CAPITAL LETTER C WITH CEDILLA (Ç)
		[0x00fc, 129], // SMALL LETTER U WITH DIAERESIS (ü)
		[0x00e9, 130], // SMALL LETTER E WITH ACUTE (é)
		[0x00e2, 131], // SMALL LETTER A WITH CIRCUMFLEX (â)
		[0x00e4, 132], // SMALL LETTER A WITH DIAERESIS (ä)
		[0x00e0, 133], // SMALL LETTER A WITH GRAVE (à)
		[0x00e5, 134], // SMALL LETTER A WITH RING ABOVE (å)
		[0x00e7, 135], // SMALL LETTER C WITH CEDILLA (ç)
		[0x00ea, 136], // SMALL LETTER E WITH CIRCUMFLEX (ê)
		[0x00eb, 137], // SMALL LETTER E WITH DIAERESIS (ë)
		[0x00e8, 138], // SMALL LETTER E WITH GRAVE (è)
		[0x00ef, 139], // SMALL LETTER I WITH DIAERESIS (ï)
		[0x00ee, 140], // SMALL LETTER I WITH CIRCUMFLEX (î)
		[0x00ec, 141], // SMALL LETTER I WITH GRAVE (ì)
		[0x00c4, 142], // CAPITAL LETTER A WITH DIAERESIS (Ä)
		[0x00c5, 143], // CAPITAL LETTER A WITH RING ABOVE (Å)
		[0x00c9, 144], // CAPITAL LETTER E WITH ACUTE (É)
		[0x00e6, 145], // SMALL LETTER AE (æ)
		[0x00c6, 146], // CAPITAL LETTER AE (Æ)
		[0x00f4, 147], // SMALL LETTER O WITH CIRCUMFLEX (ô)
		[0x00f6, 148], // SMALL LETTER O WITH DIAERESIS (ö)
		[0x00f2, 149], // SMALL LETTER O WITH GRAVE (ò)
		[0x00fb, 150], // SMALL LETTER U WITH CIRCUMFLEX (û)
		[0x00f9, 151], // SMALL LETTER U WITH GRAVE (ù)
		[0x00ff, 152], // SMALL LETTER Y WITH DIAERESIS (ÿ)
		[0x00d6, 153], // CAPITAL LETTER O WITH DIAERESIS (Ö)
		[0x00dc, 154], // CAPITAL LETTER U WITH DIAERESIS (Ü)
		[0x00a2, 155], // CENT SIGN (¢)
		[0x00a3, 156], // POUND SIGN (£)
		[0x00a5, 157], // YEN SIGN (¥)
		[0x20a7, 158], // PESETA SIGN (₧)
		[0x0192, 159], // SMALL LETTER F WITH HOOK (ƒ)
		[0x00e1, 160], // SMALL LETTER A WITH ACUTE (á)
		[0x00ed, 161], // SMALL LETTER I WITH ACUTE (í)
		[0x00f3, 162], // SMALL LETTER O WITH ACUTE (ó)
		[0x00fa, 163], // SMALL LETTER U WITH ACUTE (ú)
		[0x00f1, 164], // SMALL LETTER N WITH TILDE (ñ)
		[0x00d1, 165], // CAPITAL LETTER N WITH TILDE (Ñ)
		[0x00aa, 166], // FEMININE ORDINAL INDICATOR (ª)
		[0x00ba, 167], // MASCULINE ORDINAL INDICATOR (º)
		[0x00bf, 168], // INVERTED QUESTION MARK (¿)
		[0x2310, 169], // REVERSED NOT SIGN (⌐)
		[0x00ac, 170], // NOT SIGN (¬)
		[0x00bd, 171], // VULGAR FRACTION ONE HALF (½)
		[0x00bc, 172], // VULGAR FRACTION ONE QUARTER (¼)
		[0x00a1, 173], // INVERTED EXCLAMATION MARK (¡)
		[0x00ab, 174], // LEFT-POINTING DOUBLE ANGLE QUOTATION MARK («)
		[0x00bb, 175], // RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK (»)
		[0x2591, 176], // LIGHT SHADE (░)
		[0x2592, 177], // MEDIUM SHADE (▒)
		[0x2593, 178], // DARK SHADE (▓)
		[0x2502, 179], // BOX DRAWINGS LIGHT VERTICAL (│)
		[0x2524, 180], // BOX DRAWINGS LIGHT VERTICAL AND LEFT (┤)
		[0x2561, 181], // BOX DRAWINGS VERTICAL SINGLE AND LEFT DOUBLE (╡)
		[0x2562, 182], // BOX DRAWINGS VERTICAL DOUBLE AND LEFT SINGLE (╢)
		[0x2556, 183], // BOX DRAWINGS DOWN DOUBLE AND LEFT SINGLE (╖)
		[0x2555, 184], // BOX DRAWINGS DOWN SINGLE AND LEFT DOUBLE (╕)
		[0x2563, 185], // BOX DRAWINGS DOUBLE VERTICAL AND LEFT (╣)
		[0x2551, 186], // BOX DRAWINGS DOUBLE VERTICAL (║)
		[0x2557, 187], // BOX DRAWINGS DOUBLE DOWN AND LEFT (╗)
		[0x255d, 188], // BOX DRAWINGS DOUBLE UP AND LEFT (╝)
		[0x255c, 189], // BOX DRAWINGS UP DOUBLE AND LEFT SINGLE (╜)
		[0x255b, 190], // BOX DRAWINGS UP SINGLE AND LEFT DOUBLE (╛)
		[0x2510, 191], // BOX DRAWINGS LIGHT DOWN AND LEFT (┐)
		[0x2514, 192], // BOX DRAWINGS LIGHT UP AND RIGHT (└)
		[0x2534, 193], // BOX DRAWINGS LIGHT UP AND HORIZONTAL (┴)
		[0x252c, 194], // BOX DRAWINGS LIGHT DOWN AND HORIZONTAL (┬)
		[0x251c, 195], // BOX DRAWINGS LIGHT VERTICAL AND RIGHT (├)
		[0x2500, 196], // BOX DRAWINGS LIGHT HORIZONTAL (─)
		[0x253c, 197], // BOX DRAWINGS LIGHT VERTICAL AND HORIZONTAL (┼)
		[0x255e, 198], // BOX DRAWINGS VERTICAL SINGLE AND RIGHT DOUBLE (╞)
		[0x255f, 199], // BOX DRAWINGS VERTICAL DOUBLE AND RIGHT SINGLE (╟)
		[0x255a, 200], // BOX DRAWINGS DOUBLE UP AND RIGHT (╚)
		[0x2554, 201], // BOX DRAWINGS DOUBLE DOWN AND RIGHT (╔)
		[0x2569, 202], // BOX DRAWINGS DOUBLE UP AND HORIZONTAL (╩)
		[0x2566, 203], // BOX DRAWINGS DOUBLE DOWN AND HORIZONTAL (╦)
		[0x2560, 204], // BOX DRAWINGS DOUBLE VERTICAL AND RIGHT (╠)
		[0x2550, 205], // BOX DRAWINGS DOUBLE HORIZONTAL (═)
		[0x256c, 206], // BOX DRAWINGS DOUBLE VERTICAL AND HORIZONTAL (╬)
		[0x2567, 207], // BOX DRAWINGS UP SINGLE AND HORIZONTAL DOUBLE (╧)
		[0x2568, 208], // BOX DRAWINGS UP DOUBLE AND HORIZONTAL SINGLE (╨)
		[0x2564, 209], // BOX DRAWINGS DOWN SINGLE AND HORIZONTAL DOUBLE (╤)
		[0x2565, 210], // BOX DRAWINGS DOWN DOUBLE AND HORIZONTAL SINGLE (╥)
		[0x2559, 211], // BOX DRAWINGS UP DOUBLE AND RIGHT SINGLE (╙)
		[0x2558, 212], // BOX DRAWINGS UP SINGLE AND RIGHT DOUBLE (╘)
		[0x2552, 213], // BOX DRAWINGS DOWN SINGLE AND RIGHT DOUBLE (╒)
		[0x2553, 214], // BOX DRAWINGS DOWN DOUBLE AND RIGHT SINGLE (╓)
		[0x256b, 215], // BOX DRAWINGS VERTICAL DOUBLE AND HORIZONTAL SINGLE (╫)
		[0x256a, 216], // BOX DRAWINGS VERTICAL SINGLE AND HORIZONTAL DOUBLE (╪)
		[0x2518, 217], // BOX DRAWINGS LIGHT UP AND LEFT (┘)
		[0x250c, 218], // BOX DRAWINGS LIGHT DOWN AND RIGHT (┌)
		[0x2588, 219], // FULL BLOCK (█)
		[0x2584, 220], // LOWER HALF BLOCK (▄)
		[0x258c, 221], // LEFT HALF BLOCK (▌)
		[0x2590, 222], // RIGHT HALF BLOCK (▐)
		[0x2580, 223], // UPPER HALF BLOCK (▀)
		[0x03b1, 224], // GREEK SMALL LETTER ALPHA (α)
		[0x00df, 225], // SMALL LETTER SHARP S (ß)
		[0x0393, 226], // GREEK CAPITAL LETTER GAMMA (Γ)
		[0x03c0, 227], // GREEK SMALL LETTER PI (π)
		[0x03a3, 228], // GREEK CAPITAL LETTER SIGMA (Σ)
		[0x03c3, 229], // GREEK SMALL LETTER SIGMA (σ)
		[0x00b5, 230], // MICRO SIGN (µ)
		[0x03c4, 231], // GREEK SMALL LETTER TAU (τ)
		[0x03a6, 232], // GREEK CAPITAL LETTER PHI (Φ)
		[0x0398, 233], // GREEK CAPITAL LETTER THETA (Θ)
		[0x03a9, 234], // GREEK CAPITAL LETTER OMEGA (Ω)
		[0x03b4, 235], // GREEK SMALL LETTER DELTA (δ)
		[0x221e, 236], // INFINITY (∞)
		[0x03c6, 237], // GREEK SMALL LETTER PHI (φ)
		[0x03b5, 238], // GREEK SMALL LETTER EPSILON (ε)
		[0x2229, 239], // INTERSECTION (∩)
		[0x2261, 240], // IDENTICAL TO (≡)
		[0x00b1, 241], // PLUS-MINUS SIGN (±)
		[0x2265, 242], // GREATER-THAN OR EQUAL TO (≥)
		[0x2264, 243], // LESS-THAN OR EQUAL TO (≤)
		[0x2320, 244], // TOP HALF INTEGRAL (⌠)
		[0x2321, 245], // BOTTOM HALF INTEGRAL (⌡)
		[0x00f7, 246], // DIVISION SIGN (÷)
		[0x2248, 247], // ALMOST EQUAL TO (≈)
		[0x00b0, 248], // DEGREE SIGN (°)
		[0x2219, 249], // BULLET OPERATOR (∙)
		[0x00b7, 250], // MIDDLE DOT (·)
		[0x221a, 251], // SQUARE ROOT (√)
		[0x207f, 252], // SUPERSCRIPT SMALL LETTER N (ⁿ)
		[0x00b2, 253], // SUPERSCRIPT TWO (²)
		[0x25a0, 254], // BLACK SQUARE (■)
		[0x00a0, 255], // NO-BREAK SPACE ( )
	]);

	/**
	 * Converts a Unicode code point to the corresponding code in the custom code page.
	 * If the code point exists in the unicodeMapping Map, returns the mapped value.
	 * Otherwise, returns the original code point.
	 *
	 * @param {number} keyCode - The Unicode code point to convert.
	 * @returns {number} The mapped code page value or the original code point.
	 */
	const convertUnicode = keyCode => unicodeMapping.get(keyCode) ?? keyCode;

	const keyPress = e => {
		if (!ignored) {
			if (!e.altKey && !e.ctrlKey && !e.metaKey) {
				// Check for printable characters
				if (e.key.length === 1) {
					// Single character keys (printable characters)
					e.preventDefault();
					draw(convertUnicode(e.key.charCodeAt(0)));
				} else if (e.key === 'Enter') {
					// Enter key - cursor to new line
					e.preventDefault();
					State.cursor.newLine();
				} else if (e.key === 'Backspace') {
					// Backspace key - delete text
					e.preventDefault();
					if (State.cursor.getX() > 0) {
						deleteText();
					}
				}

				// Special case for section sign
				if (e.key === '§') {
					e.preventDefault();
					draw(21);
				}
			} else if (e.ctrlKey) {
				// Handle Ctrl key combinations
				if (e.key === 'u' || e.key === 'U') {
					// Ctrl+U - Pick up colors from current position
					e.preventDefault();
					const block = State.textArtCanvas.getBlock(
						State.cursor.getX(),
						State.cursor.getY(),
					);
					State.palette.setForegroundColor(block.foregroundColor);
					State.palette.setBackgroundColor(block.backgroundColor);
				}
			}
		}
	};

	let selectionStartX = 0;
	let selectionStartY = 0;
	const textCanvasDown = e => {
		State.cursor.move(e.detail.x, e.detail.y);
		// Store start position but don't create selection yet
		selectionStartX = e.detail.x;
		selectionStartY = e.detail.y;
	};

	const textCanvasDrag = e => {
		// Only switch to selection if we've dragged to a different cell
		if (e.detail.x !== selectionStartX || e.detail.y !== selectionStartY) {
			State.cursor.hide();
			Toolbar.switchTool('selection');
			State.selectionCursor.setStart(selectionStartX, selectionStartY);
			State.selectionCursor.setEnd(e.detail.x, e.detail.y);
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		document.addEventListener('keypress', keyPress);
		document.addEventListener('onTextCanvasDown', textCanvasDown);
		document.addEventListener('onTextCanvasDrag', textCanvasDrag);
		State.cursor.enable();
		fkeys.enable();
		State.positionInfo.update(State.cursor.getX(), State.cursor.getY());
		// Check if there's an active selection and inherit its position
		const selection = State.selectionCursor.getPos();
		if (selection) {
			State.cursor.move(selection.x, selection.y);
		}
		enabled = true;
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
		document.removeEventListener('keypress', keyPress);
		document.removeEventListener('onTextCanvasDown', textCanvasDown);
		document.removeEventListener('onTextCanvasDrag', textCanvasDrag);
		const selection = State.selectionCursor.getPos();
		if (selection) {
			State.cursor.move(selection.x, selection.y);
		}
		State.selectionCursor.hide();
		State.cursor.disable();
		fkeys.disable();
		enabled = false;
	};

	const ignore = () => {
		ignored = true;
		if (enabled) {
			State.cursor.disable();
			fkeys.disable();
		}
	};

	const unignore = () => {
		ignored = false;
		if (enabled) {
			State.cursor.enable();
			fkeys.enable();
		}
	};

	return {
		enable: enable,
		disable: disable,
		ignore: ignore,
		unignore: unignore,
		insertRow: insertRow,
		deleteRow: deleteRow,
		insertColumn: insertColumn,
		deleteColumn: deleteColumn,
		eraseRow: eraseRow,
		eraseToStartOfRow: eraseToStartOfRow,
		eraseToEndOfRow: eraseToEndOfRow,
		eraseColumn: eraseColumn,
		eraseToStartOfColumn: eraseToStartOfColumn,
		eraseToEndOfColumn: eraseToEndOfColumn,
	};
};

const createPasteTool = (cutItem, copyItem, pasteItem, deleteItem) => {
	let buffer;
	let x = 0;
	let y = 0;
	let width = 0;
	let height = 0;
	let enabled = false;

	const setSelection = (newX, newY, newWidth, newHeight) => {
		x = newX;
		y = newY;
		width = newWidth;
		height = newHeight;
		if (buffer !== undefined) {
			pasteItem.classList.remove('disabled');
		}
		cutItem.classList.remove('disabled');
		copyItem.classList.remove('disabled');
		deleteItem.classList.remove('disabled');
		enabled = true;
	};

	const disable = () => {
		pasteItem.classList.add('disabled');
		cutItem.classList.add('disabled');
		copyItem.classList.add('disabled');
		deleteItem.classList.add('disabled');
		enabled = false;
	};

	const copy = () => {
		buffer = State.textArtCanvas.getArea(x, y, width, height);
		pasteItem.classList.remove('disabled');
	};

	const deleteSelection = () => {
		if (State.selectionCursor.isVisible() || State.cursor.isVisible()) {
			State.textArtCanvas.startUndo();
			State.textArtCanvas.deleteArea(
				x,
				y,
				width,
				height,
				State.palette.getBackgroundColor(),
			);
		}
	};

	const cut = () => {
		if (State.selectionCursor.isVisible() || State.cursor.isVisible()) {
			copy();
			deleteSelection();
		}
	};

	const paste = () => {
		if (
			buffer !== undefined &&
			(State.selectionCursor.isVisible() || State.cursor.isVisible())
		) {
			State.textArtCanvas.startUndo();
			State.textArtCanvas.setArea(buffer, x, y);
		}
	};

	const systemPaste = () => {
		if (!navigator.clipboard || !navigator.clipboard.readText) {
			console.warn('[Keyboard] Clipboard API not available');
			return;
		}
		navigator.clipboard
			.readText()
			.then(text => {
				if (
					text &&
					(State.selectionCursor.isVisible() || State.cursor.isVisible())
				) {
					const columns = State.textArtCanvas.getColumns();
					const rows = State.textArtCanvas.getRows();
					// Check for oversized content
					const lines = text.split(/\r\n|\r|\n/);
					// Check single line width
					if (
						lines.length === 1 &&
						lines[0].length > columns * magicNumbers.MAX_COPY_LINES
					) {
						alert(
							`Paste buffer too large. Single line content exceeds ${columns * magicNumbers.MAX_COPY_LINES} characters. Please copy smaller blocks.`,
						);
						return;
					}
					// Check multi-line height
					if (lines.length > rows * magicNumbers.MAX_COPY_LINES) {
						alert(
							`Paste buffer too large. Content exceeds ${rows * magicNumbers.MAX_COPY_LINES} lines. Please copy smaller blocks.`,
						);
						return;
					}
					State.textArtCanvas.startUndo();
					let currentX = x;
					let currentY = y;
					const startX = x; // Remember starting column for line breaks
					const foreground = State.palette.getForegroundColor();
					const background = State.palette.getBackgroundColor();

					State.textArtCanvas.draw(draw => {
						for (let i = 0; i < text.length; i++) {
							const char = text.charAt(i);
							// Handle newline characters
							if (char === '\n' || char === '\r') {
								currentY++;
								currentX = startX;
								// Skip \r\n combination
								if (
									char === '\r' &&
									i + 1 < text.length &&
									text.charAt(i + 1) === '\n'
								) {
									i++;
								}
								continue;
							}
							// Check bounds - stop if we're beyond canvas vertically
							if (currentY >= rows) {
								break;
							}
							// Handle edge truncation - skip characters that exceed the right edge
							if (currentX >= columns) {
								// Skip this character and continue until we hit a newline
								continue;
							}
							// Handle non-printable characters
							let charCode = char.charCodeAt(0);
							// Convert tabs and other whitespace/non-printable characters to space
							if (char === '\t' || charCode < 32 || charCode === 127) {
								charCode = magicNumbers.CHAR_SPACE;
							}
							// Draw the character
							draw(charCode, foreground, background, currentX, currentY);

							currentX++;
						}
					}, false);
				}
			})
			.catch(err => {
				console.error('[Keyboard] Failed to read clipboard:', err);
			});
	};

	const keyDown = e => {
		if (enabled) {
			if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
				switch (e.code) {
					case 'KeyX': // Ctrl/Cmd+X - Cut
						e.preventDefault();
						cut();
						break;
					case 'KeyC': // Ctrl/Cmd+C - Copy
						e.preventDefault();
						copy();
						break;
					case 'KeyV': // Ctrl/Cmd+V - Paste
						e.preventDefault();
						paste();
						break;
					default:
						break;
				}
			}
			// System paste with Ctrl+Shift+V
			if (
				(e.ctrlKey || e.metaKey) &&
				e.shiftKey &&
				!e.altKey &&
				e.code === 'KeyV'
			) {
				e.preventDefault();
				systemPaste();
			}
		}
		if ((e.ctrlKey || e.metaKey) && e.code === 'Backspace') {
			// Ctrl/Cmd+Backspace - Delete selection
			e.preventDefault();
			deleteSelection();
		}
	};
	document.addEventListener('keydown', keyDown);

	return {
		setSelection: setSelection,
		cut: cut,
		copy: copy,
		paste: paste,
		systemPaste: systemPaste,
		deleteSelection: deleteSelection,
		disable: disable,
	};
};

const createSelectionTool = () => {
	const viewport = $('viewport');
	const panel = $('selectionToolbar');
	const flipHButton = $('flipHorizontal');
	const flipVButton = $('flipVertical');
	const moveButton = $('moveBlocks');
	let moveMode = false;
	let selectionData = null;
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let originalPosition = null; // Original position when move mode started
	let underlyingData = null; // Content currently underneath the moving blocks
	// Selection expansion state
	let selectionStartX = 0;
	let selectionStartY = 0;
	let selectionEndX = 0;
	let selectionEndY = 0;
	// Pending initial action when switching from keyboard mode
	let pendingInitialAction = null;

	const canvasDown = e => {
		if (moveMode) {
			const selection = State.selectionCursor.getSelection();
			if (
				selection &&
				e.detail.x >= selection.x &&
				e.detail.x < selection.x + selection.width &&
				e.detail.y >= selection.y &&
				e.detail.y < selection.y + selection.height
			) {
				isDragging = true;
				dragStartX = e.detail.x;
				dragStartY = e.detail.y;
			}
		} else {
			State.selectionCursor.setStart(e.detail.x, e.detail.y);
			State.selectionCursor.setEnd(e.detail.x, e.detail.y);
		}
	};

	const canvasDrag = e => {
		if (moveMode && isDragging) {
			const deltaX = e.detail.x - dragStartX;
			const deltaY = e.detail.y - dragStartY;
			moveSelection(deltaX, deltaY);
			dragStartX = e.detail.x;
			dragStartY = e.detail.y;
		} else if (!moveMode) {
			State.selectionCursor.setEnd(e.detail.x, e.detail.y);
		}
	};

	const canvasUp = _ => {
		if (moveMode && isDragging) {
			isDragging = false;
		} else {
			// Sync selection expansion state after mouse selection
			const selection = State.selectionCursor.getSelection();
			if (selection) {
				selectionStartX = selection.x;
				selectionStartY = selection.y;
				selectionEndX = selection.x + selection.width - 1;
				selectionEndY = selection.y + selection.height - 1;
			}
		}
	};

	const flipHorizontal = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		State.textArtCanvas.startUndo();
		// Get all blocks in the selection
		for (let y = 0; y < selection.height; y++) {
			const blocks = [];
			for (let x = 0; x < selection.width; x++) {
				blocks.push(
					State.textArtCanvas.getBlock(selection.x + x, selection.y + y),
				);
			}
			// Flip the row horizontally
			State.textArtCanvas.draw(callback => {
				for (let x = 0; x < selection.width; x++) {
					const sourceBlock = blocks[x];
					const targetX = selection.x + (selection.width - 1 - x);
					let charCode = sourceBlock.charCode;
					// Transform left/right half blocks
					switch (charCode) {
						case 221: // LEFT_HALF_BLOCK
							charCode = 222; // RIGHT_HALF_BLOCK
							break;
						case 222: // RIGHT_HALF_BLOCK
							charCode = 221; // LEFT_HALF_BLOCK
							break;
						default:
							break;
					}
					callback(
						charCode,
						sourceBlock.foregroundColor,
						sourceBlock.backgroundColor,
						targetX,
						selection.y + y,
					);
				}
			}, false);
		}
	};

	const flipVertical = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		State.textArtCanvas.startUndo();
		// Get all blocks in the selection
		for (let x = 0; x < selection.width; x++) {
			const blocks = [];
			for (let y = 0; y < selection.height; y++) {
				blocks.push(
					State.textArtCanvas.getBlock(selection.x + x, selection.y + y),
				);
			}
			// Flip the column vertically
			State.textArtCanvas.draw(callback => {
				for (let y = 0; y < selection.height; y++) {
					const sourceBlock = blocks[y];
					const targetY = selection.y + (selection.height - 1 - y);
					let charCode = sourceBlock.charCode;
					// Transform upper/lower half blocks
					switch (charCode) {
						case 223: // UPPER_HALF_BLOCK
							charCode = 220; // LOWER_HALF_BLOCK
							break;
						case 220: // LOWER_HALF_BLOCK
							charCode = 223; // UPPER_HALF_BLOCK
							break;
						default:
							break;
					}
					callback(
						charCode,
						sourceBlock.foregroundColor,
						sourceBlock.backgroundColor,
						selection.x + x,
						targetY,
					);
				}
			}, false);
		}
	};

	const setAreaSelective = (area, targetArea, x, y) => {
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const maxWidth = Math.min(area.width, columns - x);
		const maxHeight = Math.min(area.height, rows - y);

		State.textArtCanvas.draw(draw => {
			for (let py = 0; py < maxHeight; py++) {
				for (let px = 0; px < maxWidth; px++) {
					const srcIndex = py * area.width + px;
					const sourceAttrib = area.data[srcIndex] || 0;

					if (sourceAttrib !== 0) {
						const charCode = sourceAttrib >> 8;
						const fg = sourceAttrib & 15;
						const bg = (sourceAttrib >> 4) & 15;
						draw(charCode, fg, bg, x + px, y + py);
					} else if (
						targetArea &&
						px < targetArea.width &&
						py < targetArea.height
					) {
						const tgtIndex = py * targetArea.width + px;
						const targetAttrib = targetArea.data[tgtIndex] || 0;
						const charCode = targetAttrib >> 8;
						const fg = targetAttrib & 15;
						const bg = (targetAttrib >> 4) & 15;
						draw(charCode, fg, bg, x + px, y + py);
					}
					// else: leave existing canvas pixel alone
				}
			}
		}, false); // batch the whole operation for consistent commit/undo
	};

	const moveSelection = (deltaX, deltaY) => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		const newX = Math.max(
			0,
			Math.min(
				selection.x + deltaX,
				State.textArtCanvas.getColumns() - selection.width,
			),
		);
		const newY = Math.max(
			0,
			Math.min(
				selection.y + deltaY,
				State.textArtCanvas.getRows() - selection.height,
			),
		);
		// Don't process if we haven't actually moved
		if (newX === selection.x && newY === selection.y) {
			return;
		}
		State.textArtCanvas.startUndo();
		// Always refetch current selection data
		selectionData = State.textArtCanvas.getArea(
			selection.x,
			selection.y,
			selection.width,
			selection.height,
		);
		// Restore what was underneath the current position (if any)
		if (underlyingData) {
			State.textArtCanvas.setArea(underlyingData, selection.x, selection.y);
		}
		// Store what's underneath the new position
		underlyingData = State.textArtCanvas.getArea(
			newX,
			newY,
			selection.width,
			selection.height,
		);
		// Apply the selection at the new position, but only non-blank characters
		setAreaSelective(selectionData, underlyingData, newX, newY);
		// Update the selection cursor to the new position
		State.selectionCursor.setStart(newX, newY);
		State.selectionCursor.setEnd(
			newX + selection.width - 1,
			newY + selection.height - 1,
		);
	};

	const createEmptyArea = (width, height) => {
		// Create an area filled with empty/blank characters (char code 0, colors 0)
		const data = new Uint16Array(width * height);
		for (let i = 0; i < data.length; i++) {
			data[i] = 0; // char code 0, foreground 0, background 0
		}
		return {
			data: data,
			width: width,
			height: height,
		};
	};

	const toggleMoveMode = () => {
		moveMode = !moveMode;
		if (moveMode) {
			// Enable move mode
			moveButton.classList.add('enabled');
			State.selectionCursor.getElement().classList.add('moveMode');
			// Store selection data and original position when entering move mode
			const selection = State.selectionCursor.getSelection();
			if (selection) {
				selectionData = State.textArtCanvas.getArea(
					selection.x,
					selection.y,
					selection.width,
					selection.height,
				);
				originalPosition = {
					x: selection.x,
					y: selection.y,
					width: selection.width,
					height: selection.height,
				};
				// For a move operation, the old position should be cleared (empty)
				// We'll restore empty space as we move away
				underlyingData = createEmptyArea(selection.width, selection.height);
			}
		} else {
			// Disable move mode - finalize the move by clearing original position if different
			const currentSelection = State.selectionCursor.getSelection();
			if (
				originalPosition &&
				currentSelection &&
				(currentSelection.x !== originalPosition.x ||
				  currentSelection.y !== originalPosition.y)
			) {
				// Check if the original and current positions overlap
				const xOverlap =
					originalPosition.x < currentSelection.x + currentSelection.width &&
					originalPosition.x + originalPosition.width > currentSelection.x;
				const yOverlap =
					originalPosition.y < currentSelection.y + currentSelection.height &&
					originalPosition.y + originalPosition.height > currentSelection.y;
				const hasOverlap = xOverlap && yOverlap;

				State.textArtCanvas.startUndo();
				if (hasOverlap) {
					// If there's overlap, selectively clear only the non-overlapping parts
					const emptyData = createEmptyArea(
						originalPosition.width,
						originalPosition.height,
					);
					// Get what's currently at the original position (which includes part of the moved selection)
					const currentAtOriginal = State.textArtCanvas.getArea(
						originalPosition.x,
						originalPosition.y,
						originalPosition.width,
						originalPosition.height,
					);
					// Apply empty data, but preserve anything from the current selection
					setAreaSelective(
						emptyData,
						currentAtOriginal,
						originalPosition.x,
						originalPosition.y,
					);
				} else {
					// No overlap
					State.textArtCanvas.deleteArea(
						originalPosition.x,
						originalPosition.y,
						originalPosition.width,
						originalPosition.height,
						State.palette.getBackgroundColor(),
					);
				}
			}
			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('moveMode');
			selectionData = null;
			originalPosition = null;
			underlyingData = null;
		}
	};
	const isMoveMode = () => moveMode;

	// Selection expansion methods - delegated from cursor
	const startSelectionExpansion = () => {
		if (!State.selectionCursor.isVisible()) {
			// Start selection from current cursor position
			selectionStartX = State.cursor.getX();
			selectionStartY = State.cursor.getY();
			selectionEndX = selectionStartX;
			selectionEndY = selectionStartY;
			State.selectionCursor.setStart(selectionStartX, selectionStartY);
			State.selectionCursor.setEnd(selectionEndX, selectionEndY);
			State.cursor.hide();
		}
		// If selection already exists, keep using the current anchor (selectionStartX/Y)
		// and end (selectionEndX/Y) coordinates. Don't reinitialize from bounds.
	};

	const moveSelectionLeft = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		const newX = Math.max(0, selection.x - 1);
		const newY = selection.y;
		selectionStartX = newX;
		selectionStartY = newY;
		selectionEndX = newX + selection.width - 1;
		selectionEndY = newY + selection.height - 1;
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const moveSelectionRight = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		const newX = Math.min(
			State.textArtCanvas.getColumns() - selection.width,
			selection.x + 1,
		);
		const newY = selection.y;
		selectionStartX = newX;
		selectionStartY = newY;
		selectionEndX = newX + selection.width - 1;
		selectionEndY = newY + selection.height - 1;
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const moveSelectionUp = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		const newX = selection.x;
		const newY = Math.max(0, selection.y - 1);
		selectionStartX = newX;
		selectionStartY = newY;
		selectionEndX = newX + selection.width - 1;
		selectionEndY = newY + selection.height - 1;
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const moveSelectionDown = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		const newX = selection.x;
		const newY = Math.min(
			State.textArtCanvas.getRows() - selection.height,
			selection.y + 1,
		);
		selectionStartX = newX;
		selectionStartY = newY;
		selectionEndX = newX + selection.width - 1;
		selectionEndY = newY + selection.height - 1;
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const shiftLeft = () => {
		startSelectionExpansion();
		selectionEndX = Math.max(selectionEndX - 1, 0);
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const shiftRight = () => {
		startSelectionExpansion();
		selectionEndX = Math.min(
			selectionEndX + 1,
			State.textArtCanvas.getColumns() - 1,
		);
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const shiftUp = () => {
		startSelectionExpansion();
		selectionEndY = Math.max(selectionEndY - 1, 0);
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const shiftDown = () => {
		startSelectionExpansion();
		selectionEndY = Math.min(
			selectionEndY + 1,
			State.textArtCanvas.getRows() - 1,
		);
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const shiftToStartOfRow = () => {
		startSelectionExpansion();
		selectionEndX = 0;
		// Ensure coordinates are ordered (start <= end)
		if (selectionStartX > selectionEndX) {
			[selectionStartX, selectionEndX] = [selectionEndX, selectionStartX];
		}
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const shiftToEndOfRow = () => {
		startSelectionExpansion();
		selectionEndX = State.textArtCanvas.getColumns() - 1;
		// Ensure coordinates are ordered (start <= end)
		if (selectionStartX > selectionEndX) {
			[selectionStartX, selectionEndX] = [selectionEndX, selectionStartX];
		}
		State.selectionCursor.setStart(selectionStartX, selectionStartY);
		State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		scrollViewportToSelection();
	};

	const scrollViewportToSelection = () => {
		if (!viewport) {
			return;
		}

		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}

		const fontHeight = State.font.getHeight();
		const fontWidth = State.font.getWidth();
		const bufferRows = 5; // Same buffer as cursor

		// Use the end position of the selection for focus
		const selectionPixelY = selection.y * fontHeight;
		const selectionPixelX = selection.x * fontWidth;
		const bufferPixels = bufferRows * fontHeight;

		const viewportHeight = viewport.clientHeight;
		const viewportWidth = viewport.clientWidth;
		const scrollTop = viewport.scrollTop;
		const scrollLeft = viewport.scrollLeft;

		// Check vertical scrolling
		const selectionTop = selectionPixelY - bufferPixels;
		const selectionBottom =
			selectionPixelY + selection.height * fontHeight + bufferPixels;

		if (selectionTop < scrollTop) {
			viewport.scrollTop = Math.max(0, selectionTop);
		} else if (selectionBottom > scrollTop + viewportHeight) {
			viewport.scrollTop = Math.max(0, selectionBottom - viewportHeight);
		}

		// Check horizontal scrolling
		const selectionLeft = selectionPixelX - bufferRows * fontWidth;
		const selectionRight =
			selectionPixelX + selection.width * fontWidth + bufferRows * fontWidth;

		if (selectionLeft < scrollLeft) {
			viewport.scrollLeft = Math.max(0, selectionLeft);
		} else if (selectionRight > scrollLeft + viewportWidth) {
			viewport.scrollLeft = Math.max(0, selectionRight - viewportWidth);
		}
	};

	const pageScroll = (direction = 'down') => {
		if (!viewport) {
			return;
		}

		const rowsPerScreen = calculateRowsPerScreen(
			viewport,
			State.font.getHeight(),
		);
		const maxY = State.textArtCanvas.getRows() - 1;
		const delta = direction === 'up' ? -rowsPerScreen : rowsPerScreen;

		if (moveMode && State.selectionCursor.getSelection()) {
			moveSelection(0, delta);
		} else {
			startSelectionExpansion();
			const selection = State.selectionCursor.getSelection();
			const selectionHeight = selection ? selection.height : 1;

			// Calculate new position
			let newStartY = selectionStartY + delta;
			let newEndY = selectionEndY + delta;

			// Clamp to canvas bounds while preserving selection height
			if (newEndY > maxY) {
				newEndY = maxY;
				newStartY = Math.max(0, maxY - selectionHeight + 1);
			} else if (newStartY < 0) {
				newStartY = 0;
				newEndY = Math.min(maxY, selectionHeight - 1);
			}

			selectionStartY = newStartY;
			selectionEndY = newEndY;
			State.selectionCursor.setStart(selectionStartX, selectionStartY);
			State.selectionCursor.setEnd(selectionEndX, selectionEndY);
		}
		scrollViewportToSelection();
	};

	const keyDown = e => {
		// These keys work with or without modifiers
		if (e.code === 'Enter') {
			// Enter - exit selection and use default cursor behavior
			e.preventDefault();
			Toolbar.switchTool('keyboard');
			State.cursor.newLine();
		} else if (e.code === 'End') {
			// End key - expand selection to end of current row
			e.preventDefault();
			shiftToEndOfRow();
		} else if (e.code === 'Home') {
			// Home key - expand selection to start of current row
			e.preventDefault();
			shiftToStartOfRow();
		}
		if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
			if (e.key === '[') {
				// '[' key - flip horizontal
				e.preventDefault();
				flipHorizontal();
			} else if (e.key === ']') {
				// ']' key - flip vertical
				e.preventDefault();
				flipVertical();
			} else if (e.key === 'M' || e.key === 'm') {
				// 'M' key - toggle move mode
				e.preventDefault();
				toggleMoveMode();
			} else if (e.code === 'PageUp') {
				e.preventDefault();
				pageScroll('up');
			} else if (e.code === 'PageDown') {
				e.preventDefault();
				pageScroll('down');
			} else if (moveMode && State.selectionCursor.getSelection()) {
				// Arrow key shift selection contents in move mode
				if (e.code === 'ArrowLeft') {
					e.preventDefault();
					moveSelection(-1, 0);
				} else if (e.code === 'ArrowUp') {
					e.preventDefault();
					moveSelection(0, -1);
				} else if (e.code === 'ArrowRight') {
					e.preventDefault();
					moveSelection(1, 0);
				} else if (e.code === 'ArrowDown') {
					e.preventDefault();
					moveSelection(0, 1);
				}
			} else {
				switch (e.code) {
					// arrow keys move selection area
					case 'ArrowLeft':
						e.preventDefault();
						moveSelectionLeft();
						break;
					case 'ArrowUp':
						e.preventDefault();
						moveSelectionUp();
						break;
					case 'ArrowRight':
						e.preventDefault();
						moveSelectionRight();
						break;
					case 'ArrowDown':
						e.preventDefault();
						moveSelectionDown();
						break;
					default:
						break;
				}
			}
		} else if (e.shiftKey && !e.metaKey) {
			// Arrows + Shift key combinations expand selection
			switch (e.code) {
				case 'ArrowLeft':
					e.preventDefault();
					shiftLeft();
					break;
				case 'ArrowUp':
					e.preventDefault();
					shiftUp();
					break;
				case 'ArrowRight':
					e.preventDefault();
					shiftRight();
					break;
				case 'ArrowDown':
					e.preventDefault();
					shiftDown();
					break;
				default:
					break;
			}
		}
	};

	const enable = () => {
		State.selectionCursor.show();
		panel.style.display = 'flex';
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('keydown', keyDown);
		flipHButton.addEventListener('click', flipHorizontal);
		flipVButton.addEventListener('click', flipVertical);
		moveButton.addEventListener('click', toggleMoveMode);

		// If there's already a selection visible (switched from keyboard mode),
		// initialize our selection expansion state
		if (State.selectionCursor.isVisible()) {
			const selection = State.selectionCursor.getSelection();
			if (selection) {
				selectionStartX = selection.x;
				selectionStartY = selection.y;
				selectionEndX = selection.x + selection.width - 1;
				selectionEndY = selection.y + selection.height - 1;
			}
		} else {
			startSelectionExpansion();
		}

		// Execute pending initial action if one was set from keyboard mode
		if (pendingInitialAction) {
			const action = pendingInitialAction;
			pendingInitialAction = null; // Clear it immediately
			switch (action) {
				case 'ArrowLeft':
					shiftLeft();
					break;
				case 'ArrowRight':
					shiftRight();
					break;
				case 'ArrowUp':
					shiftUp();
					break;
				case 'ArrowDown':
					shiftDown();
					break;
			}
		}
	};

	const disable = () => {
		State.selectionCursor.hide();
		panel.style.display = 'none';
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('keydown', keyDown);

		// Reset move mode if it was active and finalize any pending move
		if (moveMode) {
			// Finalize the move by clearing original position if different
			const currentSelection = State.selectionCursor.getSelection();
			if (
				originalPosition &&
				currentSelection &&
				(currentSelection.x !== originalPosition.x ||
				  currentSelection.y !== originalPosition.y)
			) {
				// Check if the original and current positions overlap
				const xOverlap =
					originalPosition.x < currentSelection.x + currentSelection.width &&
					originalPosition.x + originalPosition.width > currentSelection.x;
				const yOverlap =
					originalPosition.y < currentSelection.y + currentSelection.height &&
					originalPosition.y + originalPosition.height > currentSelection.y;
				const hasOverlap = xOverlap && yOverlap;

				State.textArtCanvas.startUndo();
				if (hasOverlap) {
					// If there's overlap, we need to selectively clear only the non-overlapping parts
					// For now, use setAreaSelective with empty data to preserve the moved selection
					const emptyData = createEmptyArea(
						originalPosition.width,
						originalPosition.height,
					);
					// Get what's currently at the original position (which includes part of the moved selection)
					const currentAtOriginal = State.textArtCanvas.getArea(
						originalPosition.x,
						originalPosition.y,
						originalPosition.width,
						originalPosition.height,
					);
					// Apply empty data, but preserve anything from the current selection
					setAreaSelective(
						emptyData,
						currentAtOriginal,
						originalPosition.x,
						originalPosition.y,
					);
				} else {
					// No overlap - safe to delete the entire original area
					State.textArtCanvas.deleteArea(
						originalPosition.x,
						originalPosition.y,
						originalPosition.width,
						originalPosition.height,
						State.palette.getBackgroundColor(),
					);
				}
			}
			moveMode = false;
			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('moveMode');
			selectionData = null;
			originalPosition = null;
			underlyingData = null;
		}
		flipHButton.removeEventListener('click', flipHorizontal);
		flipVButton.removeEventListener('click', flipVertical);
		moveButton.removeEventListener('click', toggleMoveMode);
		State.pasteTool.disable();
	};

	// Method to set pending initial action when switching from keyboard mode
	const setPendingAction = keyCode => {
		pendingInitialAction = keyCode;
	};

	return {
		enable: enable,
		disable: disable,
		scrollViewportToSelection: scrollViewportToSelection,
		flipHorizontal: flipHorizontal,
		flipVertical: flipVertical,
		setPendingAction: setPendingAction,
		toggleMoveMode: toggleMoveMode,
		isMoveMode: isMoveMode,
	};
};
export {
	createFKeys,
	createCursor,
	createSelectionCursor,
	createKeyboardController,
	createPasteTool,
	createSelectionTool,
};
