import State from './state.js';
import Toolbar from './toolbar.js';
import { $, createCanvas } from './ui.js';

const createFKeyShortcut = (canvas, charCode) => {
	const update = () => {
		// Set actual canvas dimensions for proper rendering
		canvas.width = State.font.getWidth();
		canvas.height = State.font.getHeight();
		// Set CSS dimensions for display
		canvas.style.width = State.font.getWidth() + 'px';
		canvas.style.height = State.font.getHeight() + 'px';
		State.font.draw(
			charCode,
			State.palette.getForegroundColor(),
			State.palette.getBackgroundColor(),
			canvas.getContext('2d'),
			0,
			0,
		);
	};
	document.addEventListener('onPaletteChange', update);
	document.addEventListener('onForegroundChange', update);
	document.addEventListener('onBackgroundChange', update);
	document.addEventListener('onFontChange', update);

	update();
};

const createFKeysShortcut = () => {
	const shortcuts = [
		176, // Light shade (░)
		177, // Medium shade (▒)
		178, // Dark shade (▓)
		219, // Full block (█)
		223, // Lower half block (▄)
		220, // Upper half block (▀)
		221, // Left half block (▌)
		222, // Right half block (▐)
		254, // Solid (■)
		249, // Middle dot (·)
		7, // Bell (BEL)
		0, // Null (NUL)
	];
	for (let i = 0; i < 12; i++) {
		createFKeyShortcut($('fkey' + i), shortcuts[i]);
	}

	const keyDown = e => {
		// Handle F1-F12 function keys (F1=112, F2=113, ..., F12=123)
		const fKeyMatch = e.code.match(/^F(\d+)$/);
		if (
			e.altKey === false &&
			e.ctrlKey === false &&
			e.metaKey === false &&
			fKeyMatch &&
			fKeyMatch[1] >= 1 &&
			fKeyMatch[1] <= 12
		) {
			e.preventDefault();
			State.textArtCanvas.startUndo();
			State.textArtCanvas.draw(callback => {
				callback(
					shortcuts[fKeyMatch[1] - 1],
					State.palette.getForegroundColor(),
					State.palette.getBackgroundColor(),
					State.cursor.getX(),
					State.cursor.getY(),
				);
			}, false);
			State.cursor.right();
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
	};

	return {
		enable: enable,
		disable: disable,
	};
};

const createCursor = canvasContainer => {
	const canvas = createCanvas(State.font.getWidth(), State.font.getHeight());
	let x = 0;
	let y = 0;
	let dx = 0;
	let dy = 0;
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
		dx = x;
		dy = y;
		hide();
	};

	const endSelection = () => {
		State.selectionCursor.hide();
		show();
	};

	const move = (newX, newY) => {
		if (State.selectionCursor.isVisible() === true) {
			endSelection();
		}
		x = Math.min(Math.max(newX, 0), State.textArtCanvas.getColumns() - 1);
		y = Math.min(Math.max(newY, 0), State.textArtCanvas.getRows() - 1);
		const canvasWidth = State.font.getWidth();
		canvas.style.left = x * canvasWidth - 1 + 'px';
		canvas.style.top = y * State.font.getHeight() - 1 + 'px';
		State.positionInfo.update(x, y);
		State.pasteTool.setSelection(x, y, 1, 1);
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

	const shiftLeft = () => {
		if (State.selectionCursor.isVisible() === false) {
			startSelection();
			if (Toolbar.getCurrentTool() === 'keyboard') {
				Toolbar.switchTool('selection');
			}
		}
		dx = Math.max(dx - 1, 0);
		State.selectionCursor.setEnd(dx, dy);
	};

	const shiftRight = () => {
		if (State.selectionCursor.isVisible() === false) {
			startSelection();
			if (Toolbar.getCurrentTool() === 'keyboard') {
				Toolbar.switchTool('selection');
			}
		}
		dx = Math.min(dx + 1, State.textArtCanvas.getColumns() - 1);
		State.selectionCursor.setEnd(dx, dy);
	};

	const shiftUp = () => {
		if (State.selectionCursor.isVisible() === false) {
			startSelection();
			if (Toolbar.getCurrentTool() === 'keyboard') {
				Toolbar.switchTool('selection');
			}
		}
		dy = Math.max(dy - 1, 0);
		State.selectionCursor.setEnd(dx, dy);
	};

	const shiftDown = () => {
		if (State.selectionCursor.isVisible() === false) {
			startSelection();
			if (Toolbar.getCurrentTool() === 'keyboard') {
				Toolbar.switchTool('selection');
			}
		}
		dy = Math.min(dy + 1, State.textArtCanvas.getRows() - 1);
		State.selectionCursor.setEnd(dx, dy);
	};

	const shiftToStartOfRow = () => {
		if (State.selectionCursor.isVisible() === false) {
			startSelection();
			if (Toolbar.getCurrentTool() === 'keyboard') {
				Toolbar.switchTool('selection');
			}
		}
		dx = 0;
		State.selectionCursor.setEnd(dx, dy);
	};

	const shiftToEndOfRow = () => {
		if (State.selectionCursor.isVisible() === false) {
			startSelection();
			if (Toolbar.getCurrentTool() === 'keyboard') {
				Toolbar.switchTool('selection');
			}
		}
		dx = State.textArtCanvas.getColumns() - 1;
		State.selectionCursor.setEnd(dx, dy);
	};

	const keyDown = e => {
		if (e.ctrlKey === false && e.altKey === false) {
			if (e.shiftKey === false && e.metaKey === false) {
				switch (e.code) {
					case 'Enter': // Enter key
						e.preventDefault();
						newLine();
						break;
					case 'End': // End key
						e.preventDefault();
						endOfCurrentRow();
						break;
					case 'Home': // Home key
						e.preventDefault();
						startOfCurrentRow();
						break;
					case 'ArrowLeft': // Left arrow
						e.preventDefault();
						left();
						break;
					case 'ArrowUp': // Up arrow
						e.preventDefault();
						up();
						break;
					case 'ArrowRight': // Right arrow
						e.preventDefault();
						right();
						break;
					case 'ArrowDown': // Down arrow
						e.preventDefault();
						down();
						break;
					default:
						break;
				}
			} else if (e.metaKey === true && e.shiftKey === false) {
				switch (e.code) {
					case 'ArrowLeft': // Cmd/Meta + Left arrow
						e.preventDefault();
						startOfCurrentRow();
						break;
					case 'ArrowRight': // Cmd/Meta + Right arrow
						e.preventDefault();
						endOfCurrentRow();
						break;
					default:
						break;
				}
			} else if (e.shiftKey === true && e.metaKey === false) {
				switch (e.code) {
					case 'ArrowLeft': // Shift + Left arrow
						e.preventDefault();
						shiftLeft();
						break;
					case 'ArrowUp': // Shift + Up arrow
						e.preventDefault();
						shiftUp();
						break;
					case 'ArrowRight': // Shift + Right arrow
						e.preventDefault();
						shiftRight();
						break;
					case 'ArrowDown': // Shift + Down arrow
						e.preventDefault();
						shiftDown();
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

	canvas.classList.add('cursor');
	hide();
	canvasContainer.insertBefore(canvas, canvasContainer.firstChild);
	document.addEventListener('onLetterSpacingChange', updateDimensions);
	document.addEventListener('onTextCanvasSizeChange', updateDimensions);
	document.addEventListener('onFontChange', updateDimensions);
	document.addEventListener('onOpenedFile', updateDimensions);
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
		shiftLeft: shiftLeft,
		shiftRight: shiftRight,
		shiftUp: shiftUp,
		shiftDown: shiftDown,
		shiftToStartOfRow: shiftToStartOfRow,
		shiftToEndOfRow: shiftToEndOfRow,
		enable: enable,
		disable: disable,
		isVisible: isVisible,
	};
};

const createSelectionCursor = divElement => {
	const cursor = createCanvas(0, 0);
	let sx, sy, dx, dy, x, y, width, height;
	let visible = false;

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

	const show = () => {
		cursor.style.display = 'block';
	};

	const hide = () => {
		cursor.style.display = 'none';
		visible = false;
		State.pasteTool.disable();
	};

	const updateCursor = () => {
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		cursor.style.left = x * fontWidth - 1 + 'px';
		cursor.style.top = y * fontHeight - 1 + 'px';
		cursor.width = width * fontWidth + 1;
		cursor.height = height * fontHeight + 1;
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
	};

	const setEnd = (endX, endY) => {
		show();
		dx = endX;
		dy = endY;
		processCoords();
		updateCursor();
		State.pasteTool.setSelection(x, y, width, height);
		visible = true;
	};

	const isVisible = () => {
		return visible;
	};

	const getSelection = () => {
		if (visible) {
			return {
				x: x,
				y: y,
				width: width,
				height: height,
			};
		}
		return null;
	};

	cursor.classList.add('selection-cursor');
	cursor.style.display = 'none';
	divElement.appendChild(cursor);

	return {
		show: show,
		hide: hide,
		setStart: setStart,
		setEnd: setEnd,
		isVisible: isVisible,
		getSelection: getSelection,
		getElement: () => cursor,
	};
};

const createKeyboardController = () => {
	const fkeys = createFKeysShortcut();
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
			callback(0, 7, 0, State.cursor.getX() - 1, State.cursor.getY());
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
				newImageData[y * currentColumns + x] = oldImageData[y * currentColumns + x];
			}
		}

		for (let x = 0; x < currentColumns; x++) {
			newImageData[cursorY * currentColumns + x] = (32 << 8) + 7; // space character with white on black
		}

		for (let y = cursorY; y < currentRows; y++) {
			for (let x = 0; x < currentColumns; x++) {
				newImageData[(y + 1) * currentColumns + x] = oldImageData[y * currentColumns + x];
			}
		}

		State.textArtCanvas.setImageData(currentColumns, currentRows + 1, newImageData, State.textArtCanvas.getIceColors());
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
				newImageData[y * currentColumns + x] = oldImageData[y * currentColumns + x];
			}
		}

		// Skip the row at cursor position (delete it)
		// Copy rows after cursor position
		for (let y = cursorY + 1; y < currentRows; y++) {
			for (let x = 0; x < currentColumns; x++) {
				newImageData[(y - 1) * currentColumns + x] = oldImageData[y * currentColumns + x];
			}
		}

		State.textArtCanvas.setImageData(currentColumns, currentRows - 1, newImageData, State.textArtCanvas.getIceColors());

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
				newImageData[y * (currentColumns + 1) + x] = oldImageData[y * currentColumns + x];
			}

			newImageData[y * (currentColumns + 1) + cursorX] = (32 << 8) + 7;

			for (let x = cursorX; x < currentColumns; x++) {
				newImageData[y * (currentColumns + 1) + x + 1] = oldImageData[y * currentColumns + x];
			}
		}

		State.textArtCanvas.setImageData(currentColumns + 1, currentRows, newImageData, State.textArtCanvas.getIceColors());
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
				newImageData[y * (currentColumns - 1) + x] = oldImageData[y * currentColumns + x];
			}

			// Skip the column at cursor position (delete it)
			for (let x = cursorX + 1; x < currentColumns; x++) {
				newImageData[y * (currentColumns - 1) + x - 1] = oldImageData[y * currentColumns + x];
			}
		}

		State.textArtCanvas.setImageData(currentColumns - 1, currentRows, newImageData, State.textArtCanvas.getIceColors());

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
				callback(32, 7, 0, x, cursorY);
			}, false);
		}
	};

	const eraseToStartOfRow = () => {
		const cursorX = State.cursor.getX();
		const cursorY = State.cursor.getY();

		State.textArtCanvas.startUndo();

		for (let x = 0; x <= cursorX; x++) {
			State.textArtCanvas.draw(callback => {
				callback(32, 7, 0, x, cursorY);
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
				callback(32, 7, 0, x, cursorY);
			}, false);
		}
	};

	const eraseColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const cursorX = State.cursor.getX();

		State.textArtCanvas.startUndo();

		for (let y = 0; y < currentRows; y++) {
			State.textArtCanvas.draw(callback => {
				callback(32, 7, 0, cursorX, y);
			}, false);
		}
	};

	const eraseToStartOfColumn = () => {
		const cursorX = State.cursor.getX();
		const cursorY = State.cursor.getY();

		State.textArtCanvas.startUndo();

		for (let y = 0; y <= cursorY; y++) {
			State.textArtCanvas.draw(callback => {
				callback(32, 7, 0, cursorX, y);
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
				callback(32, 7, 0, cursorX, y);
			}, false);
		}
	};

	const keyDown = e => {
		if (ignored === false) {
			if (e.altKey === false && e.ctrlKey === false && e.metaKey === false) {
				if (e.code === 'Tab') {
					// Tab key
					e.preventDefault();
					draw(9); // Tab character code
				} else if (e.code === 'Backspace') {
					// Backspace key
					e.preventDefault();
					if (State.cursor.getX() > 0) {
						deleteText();
					}
				}
			} else if (e.altKey === true && e.ctrlKey === false && e.metaKey === false) {
				// Alt key combinations for edit actions
				switch (e.code) {
					case 'ArrowUp': // Alt+Up Arrow - Insert Row
						e.preventDefault();
						insertRow();
						break;
					case 'ArrowDown': // Alt+Down Arrow - Delete Row
						e.preventDefault();
						deleteRow();
						break;
					case 'ArrowRight': // Alt+Right Arrow - Insert Column
						e.preventDefault();
						insertColumn();
						break;
					case 'ArrowLeft': // Alt+Left Arrow - Delete Column
						e.preventDefault();
						deleteColumn();
						break;
					case 'KeyE': // Alt+E - Erase Row (or Alt+Shift+E for Erase Column)
						e.preventDefault();
						if (e.shiftKey) {
							eraseColumn();
						} else {
							eraseRow();
						}
						break;
					case 'Home': // Alt+Home - Erase to Start of Row
						e.preventDefault();
						eraseToStartOfRow();
						break;
					case 'End': // Alt+End - Erase to End of Row
						e.preventDefault();
						eraseToEndOfRow();
						break;
					case 'PageUp': // Alt+Page Up - Erase to Start of Column
						e.preventDefault();
						eraseToStartOfColumn();
						break;
					case 'PageDown': // Alt+Page Down - Erase to End of Column
						e.preventDefault();
						eraseToEndOfColumn();
						break;
				}
			}
		}
	};

	const unicodeMapping = {
		0x2302: 127,
		0x00c7: 128,
		0x00fc: 129,
		0x00e9: 130,
		0x00e2: 131,
		0x00e4: 132,
		0x00e0: 133,
		0x00e5: 134,
		0x00e7: 135,
		0x00ea: 136,
		0x00eb: 137,
		0x00e8: 138,
		0x00ef: 139,
		0x00ee: 140,
		0x00ec: 141,
		0x00c4: 142,
		0x00c5: 143,
		0x00c9: 144,
		0x00e6: 145,
		0x00c6: 146,
		0x00f4: 147,
		0x00f6: 148,
		0x00f2: 149,
		0x00fb: 150,
		0x00f9: 151,
		0x00ff: 152,
		0x00d6: 153,
		0x00dc: 154,
		0x00a2: 155,
		0x00a3: 156,
		0x00a5: 157,
		0x20a7: 158,
		0x0192: 159,
		0x00e1: 160,
		0x00ed: 161,
		0x00f3: 162,
		0x00fa: 163,
		0x00f1: 164,
		0x00d1: 165,
		0x00aa: 166,
		0x00ba: 167,
		0x00bf: 168,
		0x2310: 169,
		0x00ac: 170,
		0x00bd: 171,
		0x00bc: 172,
		0x00a1: 173,
		0x00ab: 174,
		0x00bb: 175,
		0x2591: 176,
		0x2592: 177,
		0x2593: 178,
		0x2502: 179,
		0x2524: 180,
		0x2561: 181,
		0x2562: 182,
		0x2556: 183,
		0x2555: 184,
		0x2563: 185,
		0x2551: 186,
		0x2557: 187,
		0x255d: 188,
		0x255c: 189,
		0x255b: 190,
		0x2510: 191,
		0x2514: 192,
		0x2534: 193,
		0x252c: 194,
		0x251c: 195,
		0x2500: 196,
		0x253c: 197,
		0x255e: 198,
		0x255f: 199,
		0x255a: 200,
		0x2554: 201,
		0x2569: 202,
		0x2566: 203,
		0x2560: 204,
		0x2550: 205,
		0x256c: 206,
		0x2567: 207,
		0x2568: 208,
		0x2564: 209,
		0x2565: 210,
		0x2559: 211,
		0x2558: 212,
		0x2552: 213,
		0x2553: 214,
		0x256b: 215,
		0x256a: 216,
		0x2518: 217,
		0x250c: 218,
		0x2588: 219,
		0x2584: 220,
		0x258c: 221,
		0x2590: 222,
		0x2580: 223,
		0x03b1: 224,
		0x00df: 225,
		0x0393: 226,
		0x03c0: 227,
		0x03a3: 228,
		0x03c3: 229,
		0x00b5: 230,
		0x03c4: 231,
		0x03a6: 232,
		0x0398: 233,
		0x03a9: 234,
		0x03b4: 235,
		0x221e: 236,
		0x03c6: 237,
		0x03b5: 238,
		0x2229: 239,
		0x2261: 240,
		0x00b1: 241,
		0x2265: 242,
		0x2264: 243,
		0x2320: 244,
		0x2321: 245,
		0x00f7: 246,
		0x2248: 247,
		0x00b0: 248,
		0x2219: 249,
		0x00b7: 250,
		0x221a: 251,
		0x207f: 252,
		0x00b2: 253,
		0x25a0: 254,
		0x00a0: 255,
	};
	const convertUnicode = keyCode => unicodeMapping[keyCode] ?? keyCode;

	const keyPress = e => {
		if (ignored === false) {
			if (e.altKey === false && e.ctrlKey === false && e.metaKey === false) {
				// Check for printable characters
				if (e.key.length === 1) {
					// Single character keys (printable characters)
					e.preventDefault();
					draw(convertUnicode(e.key.charCodeAt(0)));
				} else if (e.key === 'Enter') {
					// Enter key
					e.preventDefault();
					State.cursor.newLine();
				} else if (e.key === 'Backspace') {
					// Backspace key
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
			} else if (e.ctrlKey === true) {
				// Handle Ctrl key combinations
				if (e.key === 'u' || e.key === 'U') {
					// Ctrl+U - Pick up colors from current position
					e.preventDefault();
					const block = State.textArtCanvas.getBlock(State.cursor.getX(), State.cursor.getY());
					State.palette.setForegroundColor(block.foregroundColor);
					State.palette.setBackgroundColor(block.backgroundColor);
				}
			}
		}
	};

	const textCanvasDown = e => {
		State.cursor.move(e.detail.x, e.detail.y);
		State.selectionCursor.setStart(e.detail.x, e.detail.y);
	};

	const textCanvasDrag = e => {
		State.cursor.hide();
		State.selectionCursor.setEnd(e.detail.x, e.detail.y);
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		document.addEventListener('keypress', keyPress);
		document.addEventListener('onTextCanvasDown', textCanvasDown);
		document.addEventListener('onTextCanvasDrag', textCanvasDrag);
		State.cursor.enable();
		fkeys.enable();
		State.positionInfo.update(State.cursor.getX(), State.cursor.getY());
		enabled = true;
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
		document.removeEventListener('keypress', keyPress);
		document.removeEventListener('onTextCanvasDown', textCanvasDown);
		document.removeEventListener('onTextCanvasDrag', textCanvasDrag);
		State.selectionCursor.hide();
		State.cursor.disable();
		fkeys.disable();
		enabled = false;
	};

	const ignore = () => {
		ignored = true;
		if (enabled === true) {
			State.cursor.disable();
			fkeys.disable();
		}
	};

	const unignore = () => {
		ignored = false;
		if (enabled === true) {
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
			State.textArtCanvas.deleteArea(x, y, width, height, State.palette.getBackgroundColor());
		}
	};

	const cut = () => {
		if (State.selectionCursor.isVisible() || State.cursor.isVisible()) {
			copy();
			deleteSelection();
		}
	};

	const paste = () => {
		if (buffer !== undefined && (State.selectionCursor.isVisible() || State.cursor.isVisible())) {
			State.textArtCanvas.startUndo();
			State.textArtCanvas.setArea(buffer, x, y);
		}
	};

	const systemPaste = () => {
		if (!navigator.clipboard || !navigator.clipboard.readText) {
			console.log('Clipboard API not available');
			return;
		}

		navigator.clipboard
			.readText()
			.then(text => {
				if (text && (State.selectionCursor.isVisible() || State.cursor.isVisible())) {
					const columns = State.textArtCanvas.getColumns();
					const rows = State.textArtCanvas.getRows();

					// Check for oversized content
					const lines = text.split(/\r\n|\r|\n/);

					// Check single line width
					if (lines.length === 1 && lines[0].length > columns * 3) {
						alert(
							'Paste buffer too large. Single line content exceeds ' +
							columns * 3 +
							' characters. Please copy smaller blocks.',
						);
						return;
					}

					// Check multi-line height
					if (lines.length > rows * 3) {
						alert('Paste buffer too large. Content exceeds ' + rows * 3 + ' lines. Please copy smaller blocks.');
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
								if (char === '\r' && i + 1 < text.length && text.charAt(i + 1) === '\n') {
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
								charCode = 32; // space
							}

							// Draw the character
							draw(charCode, foreground, background, currentX, currentY);

							currentX++;
						}
					}, false);
				}
			})
			.catch(err => {
				console.log('Failed to read clipboard:', err);
			});
	};

	const keyDown = e => {
		if (enabled) {
			if ((e.ctrlKey === true || e.metaKey === true) && e.altKey === false && e.shiftKey === false) {
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
				(e.ctrlKey === true || e.metaKey === true) &&
				e.shiftKey === true &&
				e.altKey === false &&
				e.code === 'KeyV'
			) {
				e.preventDefault();
				systemPaste();
			}
		}
		if ((e.ctrlKey === true || e.metaKey === true) && e.code === 'Backspace') {
			// Ctrl/Cmd+Backspace - Delete selection
			e.preventDefault();
			deleteSelection();
		}
	};

	// add listener
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

export {
	createFKeyShortcut,
	createFKeysShortcut,
	createCursor,
	createSelectionCursor,
	createKeyboardController,
	createPasteTool,
};
