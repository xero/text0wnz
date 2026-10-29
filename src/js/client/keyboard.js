import State from './state.js';
import Toolbar from './toolbar.js';
import { $, createCanvas, isTextEntry } from './ui.js';
import magicNumbers from './magicNumbers.js';
import {
	PASTE_NEWLINE,
	PASTE_SUBSTITUTE,
	tokenizePasteText,
} from '../core/paste.js';
import { createFKeys } from './fkeys.js';

const calculateRowsPerScreen = (viewport, fontHeight) => {
	if (!viewport) {
		return 0;
	}
	return Math.floor(viewport.clientHeight / fontHeight);
};

// user scrolls re-home whatever carries keyboard focus (the cursor, or
// the selection rect in selection mode); both land at buffer depth so
// the next keypress cannot trigger a follow-scroll snap
const SCROLL_BUFFER_ROWS = 5;

/** first and last fully visible cells plus the re-home cell, computed
 * in scroll-content space (the canvas sits below a container margin) */
const visibleCellFrame = () => {
	const vp = $('viewport');
	const container = document.getElementById('canvasContainer');
	if (!vp || !container || !State.font) {
		return null;
	}
	const fw = State.font.getWidth();
	const fh = State.font.getHeight();
	const vr = vp.getBoundingClientRect();
	const cr = container.getBoundingClientRect();
	const offX = cr.left - vr.left + vp.scrollLeft;
	const offY = cr.top - vr.top + vp.scrollTop;
	const first = {
		x: Math.ceil((vp.scrollLeft - offX) / fw),
		y: Math.ceil((vp.scrollTop - offY) / fh),
	};
	return {
		first,
		last: {
			x: Math.floor((vp.scrollLeft - offX + vp.clientWidth) / fw) - 1,
			y: Math.floor((vp.scrollTop - offY + vp.clientHeight) / fh) - 1,
		},
		// at the doc edge the scroll clamps, so no buffer is needed there
		home: {
			x: first.x > 0 ? first.x + SCROLL_BUFFER_ROWS : 0,
			y: first.y > 0 ? first.y + SCROLL_BUFFER_ROWS : 0,
		},
	};
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

	const move = (newX, newY, follow = true) => {
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
		// peers render our cursor natively; network throttles sends
		document.dispatchEvent(
			new CustomEvent('onTextCursorMove', { detail: { x, y } }),
		);

		if (follow) {
			scrollViewportToCursor();
		}
	};

	// stamped whenever the follow-scroll mutates the viewport, so the
	// scroll listener can tell navigation scrolls from user scrolls
	let followedAt = 0;
	const bufferRows = SCROLL_BUFFER_ROWS;

	// the canvas does not start at the scroll content's top (the
	// container carries a margin); cell math must work in content space
	// or every scroll position is off by that gap
	const contentOffset = () => {
		if (!viewport) {
			return { x: 0, y: 0 };
		}
		const vr = viewport.getBoundingClientRect();
		const cr = canvasContainer.getBoundingClientRect();
		return {
			x: cr.left - vr.left + viewport.scrollLeft,
			y: cr.top - vr.top + viewport.scrollTop,
		};
	};

	const scrollViewportToCursor = () => {
		if (!viewport) {
			return;
		}
		followedAt = performance.now();
		const fontHeight = State.font.getHeight();
		const fontWidth = State.font.getWidth();
		const off = contentOffset();

		const cursorPixelY = off.y + y * fontHeight;
		const cursorPixelX = off.x + x * fontWidth;
		const bufferPixels = bufferRows * fontHeight;

		const viewportHeight = viewport.clientHeight;
		const viewportWidth = viewport.clientWidth;
		const scrollTop = viewport.scrollTop;
		const scrollLeft = viewport.scrollLeft;

		const cursorTop = cursorPixelY - bufferPixels;
		const cursorBottom = cursorPixelY + fontHeight + bufferPixels;

		if (cursorTop < scrollTop) {
			viewport.scrollTop = Math.max(0, cursorTop);
		} else if (cursorBottom > scrollTop + viewportHeight) {
			viewport.scrollTop = Math.max(0, cursorBottom - viewportHeight);
		}

		const cursorLeft = cursorPixelX - bufferRows * fontWidth;
		const cursorRight = cursorPixelX + fontWidth + bufferRows * fontWidth;

		if (cursorLeft < scrollLeft) {
			viewport.scrollLeft = Math.max(0, cursorLeft);
		} else if (cursorRight > scrollLeft + viewportWidth) {
			viewport.scrollLeft = Math.max(0, cursorRight - viewportWidth);
		}
	};

	// scrolling away from the cursor strands it: the next arrow key
	// snaps the view back to wherever it was left. Once a user scroll
	// settles with the cursor fully off screen, re-home it to the
	// visibleCellFrame home cell, WITHOUT follow (following would tug
	// the view back by the edge buffer and fight the scroll that just
	// happened)
	let settleTimer = 0;
	const onViewportScroll = () => {
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			if (!visible || State.selectionCursor.isVisible()) {
				return;
			}
			if (performance.now() - followedAt < 250) {
				return;
			}
			const frame = visibleCellFrame();
			if (!frame) {
				return;
			}
			const { first, last, home } = frame;
			if (x < first.x || x > last.x || y < first.y || y > last.y) {
				move(home.x, home.y, false);
			}
		}, 120);
	};
	viewport?.addEventListener('scroll', onViewportScroll, { passive: true });

	// metric/buffer refreshes arrive from PERMANENT listeners: while
	// the cursor is hidden (another tool active, or a live shift
	// selection) they must only reposition the box, never end the
	// selection, send cursor frames, or scroll the viewport, all of
	// which move() does
	const reclamp = () => {
		x = Math.min(Math.max(x, 0), State.textArtCanvas.getColumns() - 1);
		y = Math.min(Math.max(y, 0), State.textArtCanvas.getRows() - 1);
		canvas.style.left = x * State.font.getWidth() - 1 + 'px';
		canvas.style.top = y * State.font.getHeight() - 1 + 'px';
	};

	const updateDimensions = () => {
		canvas.width = State.font.getWidth() + 1;
		canvas.height = State.font.getHeight() + 1;
		if (visible) {
			// no follow: a metric refresh must not tug the view either
			move(x, y, false);
		} else {
			reclamp();
		}
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
					case 'Enter':
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
					case 'ArrowLeft':
						e.preventDefault();
						startOfCurrentRow();
						break;
					case 'ArrowRight':
						e.preventDefault();
						endOfCurrentRow();
						break;
					default:
						break;
				}
			} else if (e.shiftKey && !e.metaKey) {
				switch (e.code) {
					case 'ArrowLeft':
					case 'ArrowUp':
					case 'ArrowRight':
					case 'ArrowDown':
						e.preventDefault();
						// set before the switch: the selection tool's enable
						// consumes it
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

	canvas.classList.add('cursor');
	hide();
	canvasContainer.insertBefore(canvas, canvasContainer.firstChild);
	document.addEventListener('onLetterSpacingChange', updateDimensions);
	document.addEventListener('onTextCanvasSizeChange', updateDimensions);
	document.addEventListener('onFontChange', updateDimensions);
	document.addEventListener('onOpenedFile', updateDimensions);
	document.addEventListener('onScaleFactorChange', updateDimensions);
	// a fresh document starts at its own origin; the follow scroll
	// riding this move is what pins the viewport back to the top.
	// onNewDocument, never onOpenedFile: the latter fires on ANY u16
	// buffer swap (row/column ops, collab resyncs), which must not
	// teleport the artist mid-edit
	document.addEventListener('onNewDocument', () => move(0, 0));
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
	let everSelected = false;
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
		// the selection action bar follows the rect's life
		document.dispatchEvent(new CustomEvent('onSelectionChange'));
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
		document.dispatchEvent(new CustomEvent('onSelectionChange'));
	};

	const setEnd = (endX, endY) => {
		show();
		dx = endX;
		dy = endY;
		processCoords();
		updateCursor();
		State.pasteTool.setSelection(x, y, width, height);
		visible = true;
		everSelected = true;
		State.positionInfo.update(x, y);
		document.dispatchEvent(new CustomEvent('onSelectionChange'));
	};

	const isVisible = () => visible;

	const getSelection = () => {
		if (visible) {
			return { x, y, width, height };
		}
		return null;
	};

	// the rect's geometry survives a hide, so the selection tool can
	// bring the last completed selection back after a round trip
	// through another tool
	const getLastSelection = () => {
		if (everSelected) {
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

	// an open selection must track metric changes or it drifts off its cells
	const refreshMetrics = () => {
		if (visible) {
			processCoords();
			updateCursor();
		}
	};
	document.addEventListener('onScaleFactorChange', refreshMetrics);
	document.addEventListener('onLetterSpacingChange', refreshMetrics);
	document.addEventListener('onFontChange', refreshMetrics);

	// the restore memory is per-document: geometry from the old file
	// must not reappear inside whatever gets loaded next. Buffer swaps
	// (onOpenedFile) keep the memory; only real loads clear it
	const forget = () => {
		hide();
		everSelected = false;
	};
	document.addEventListener('onNewDocument', forget);

	return {
		show,
		hide,
		setStart,
		setEnd,
		isVisible,
		getPos,
		getSelection,
		getLastSelection,
		forget,
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

	// Row and column ops are classic fixed-canvas shifts (moebius and
	// pablodraw lineage): content moves, the canvas never resizes.
	// Each op is ONE undoable stroke of plane-native cell writes, so
	// undo works, collab broadcasts it like any draw, animations keep
	// their other frames, and truecolor/unicode cells survive (a
	// buffer rebuild would ride the lossy u16 mirror and wipe history).
	// Mirror mode suspends around the shift or every write would
	// double against its reflection.
	const shiftCells = writer => {
		const mirrored = State.textArtCanvas.getMirrorMode();
		if (mirrored) {
			State.textArtCanvas.setMirrorMode(false);
		}
		// finally, or an allocation failure mid-stroke on a huge doc
		// leaves mirror off while the toolbar toggle says otherwise
		try {
			State.textArtCanvas.startUndo();
			State.textArtCanvas.draw(writer, false);
		} finally {
			if (mirrored) {
				State.textArtCanvas.setMirrorMode(true);
			}
		}
	};

	const blankCell = (callback, x, y) => {
		callback(
			magicNumbers.CHAR_SPACE,
			magicNumbers.COLOR_WHITE,
			magicNumbers.COLOR_BLACK,
			x,
			y,
		);
	};

	const copyCell = (callback, fromX, fromY, toX, toY) => {
		const cell = State.textArtCanvas.getBlock(fromX, fromY);
		callback(cell.charCode, cell.foregroundColor, cell.backgroundColor, toX, toY);
	};

	const insertRow = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorY = State.cursor.getY();
		shiftCells(callback => {
			// bottom-up: every row reads before anything overwrites it
			for (let y = currentRows - 1; y > cursorY; y--) {
				for (let x = 0; x < currentColumns; x++) {
					copyCell(callback, x, y - 1, x, y);
				}
			}
			for (let x = 0; x < currentColumns; x++) {
				blankCell(callback, x, cursorY);
			}
		});
	};

	const deleteRow = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorY = State.cursor.getY();
		shiftCells(callback => {
			// top-down: every row reads before anything overwrites it
			for (let y = cursorY; y < currentRows - 1; y++) {
				for (let x = 0; x < currentColumns; x++) {
					copyCell(callback, x, y + 1, x, y);
				}
			}
			for (let x = 0; x < currentColumns; x++) {
				blankCell(callback, x, currentRows - 1);
			}
		});
	};

	const insertColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorX = State.cursor.getX();
		shiftCells(callback => {
			for (let y = 0; y < currentRows; y++) {
				// right-to-left: every cell reads before its overwrite
				for (let x = currentColumns - 1; x > cursorX; x--) {
					copyCell(callback, x - 1, y, x, y);
				}
				blankCell(callback, cursorX, y);
			}
		});
	};

	const deleteColumn = () => {
		const currentRows = State.textArtCanvas.getRows();
		const currentColumns = State.textArtCanvas.getColumns();
		const cursorX = State.cursor.getX();
		shiftCells(callback => {
			for (let y = 0; y < currentRows; y++) {
				// left-to-right: every cell reads before its overwrite
				for (let x = cursorX; x < currentColumns - 1; x++) {
					copyCell(callback, x + 1, y, x, y);
				}
				blankCell(callback, currentColumns - 1, y);
			}
		});
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

	// Enter on a real control outside the canvas scope is activation,
	// not canvas input: its keypress default must survive so the
	// browser clicks the focused button, or the tab stops the focus
	// walk reaches would not be operable. Text entries never get here
	// (they ride the ignored flag), and inside the canvas scope Enter
	// stays a newline
	const activationTarget = () => {
		const active = document.activeElement;
		if (
			!active ||
			active === document.body ||
			active === document.documentElement ||
			active.closest?.('#canvasContainer')
		) {
			return false;
		}
		return (
			typeof active.matches === 'function' &&
			active.matches('button, a[href], summary, [tabindex]')
		);
	};

	const keyDown = e => {
		if (!ignored) {
			if (!e.altKey && !e.ctrlKey && !e.metaKey) {
				if (e.code === 'Tab') {
					// Tab is canvas input only while the canvas scope holds
					// focus (body after a plain click, or the container's own
					// tab stop); from any real control it stays the browser's
					// focus walk, and shift always walks so the keyboard can
					// back out of the canvas instead of being trapped
					const active = document.activeElement;
					const canvasOwns =
						!active ||
						active === document.body ||
						active === document.documentElement ||
						(typeof active.closest === 'function' &&
						  active.closest('#canvasContainer'));
					if (canvasOwns && !e.shiftKey) {
						e.preventDefault();
						draw(9); // Tab character code
					}
				} else if (e.code === 'Backspace') {
					e.preventDefault();
					if (State.cursor.getX() > 0) {
						deleteText();
					}
				}
			} else if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'KeyU') {
				// keydown, not keypress: keypress never fires for ctrl
				// combos in modern browsers
				e.preventDefault();
				const block = State.textArtCanvas.getBlock(
					State.cursor.getX(),
					State.cursor.getY(),
				);
				State.palette.setForegroundColor(block.foregroundColor);
				State.palette.setBackgroundColor(block.backgroundColor);
			} else if (e.altKey && !e.ctrlKey && !e.metaKey) {
				switch (e.code) {
					case 'ArrowUp':
						e.preventDefault();
						insertRow();
						break;
					case 'ArrowDown':
						e.preventDefault();
						deleteRow();
						break;
					case 'ArrowRight':
						e.preventDefault();
						insertColumn();
						break;
					case 'ArrowLeft':
						e.preventDefault();
						deleteColumn();
						break;
					case 'KeyE':
						e.preventDefault();
						if (e.shiftKey) {
							eraseColumn();
						} else {
							eraseRow();
						}
						break;
					case 'Home':
						e.preventDefault();
						eraseToStartOfRow();
						break;
					case 'End':
						e.preventDefault();
						eraseToEndOfRow();
						break;
					case 'PageUp':
						e.preventDefault();
						eraseToStartOfColumn();
						break;
					case 'PageDown':
						e.preventDefault();
						eraseToEndOfColumn();
						break;
				}
			}
		}
	};

	const unicodeMapping = new Map([
		[0x00a7, 21], // SECTION SIGN (§)
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
	 * @param {number} keyCode unicode code point
	 * @returns {number} its CP437 code, or keyCode unchanged
	 */
	const convertUnicode = keyCode => unicodeMapping.get(keyCode) ?? keyCode;

	// typed input resolves in order even when glyph table interning
	// awaits: a later keystroke must never land before an earlier one
	let typeQueue = Promise.resolve();

	// every link catches its own failure or one rejection strands the
	// chain and unicode typing dies until reload; the keystroke drops,
	// logged like systemPaste's clipboard catch
	const enqueueTyped = step => {
		typeQueue = typeQueue.then(step).catch(err => {
			console.error('[Keyboard] typed input dropped:', err);
		});
	};

	const drawTyped = key => {
		// astral chars are two UTF-16 units; charCodeAt(0) would be a
		// lone surrogate half
		const codepoint = key.codePointAt(0);
		const mapped = convertUnicode(codepoint);
		if (codepoint < 0x80 || mapped !== codepoint) {
			// ASCII or native CP437 still rides the queue: a sync draw would
			// overtake unicode awaiting resolveUnicode and transpose mixed
			// typing. An idle queue runs it in this task's microtasks,
			// before paint
			enqueueTyped(() => draw(mapped));
			return;
		}
		// outside CP437: intern through the doc glyph table like paste
		// and the F-keys; the raw codepoint as a glyph id would alias
		// interned glyphs (256+ collides with the interning sequence) and
		// degrade to '?' on the wire and in exports
		enqueueTyped(async () => {
			const resolved = await State.textArtCanvas.resolveUnicode(
				new Set([codepoint]),
			);
			draw(resolved.get(codepoint) ?? PASTE_SUBSTITUTE);
		});
	};

	const keyPress = e => {
		if (!ignored) {
			if (!e.altKey && !e.ctrlKey && !e.metaKey) {
				if (e.key.length <= 2 && [...e.key].length === 1) {
					e.preventDefault();
					drawTyped(e.key);
				} else if (e.key === 'Enter') {
					if (activationTarget()) {
						return;
					}
					e.preventDefault();
					// queued: a sync newline ahead of a pending glyph would
					// drop the glyph onto the next row
					enqueueTyped(() => State.cursor.newLine());
				} else if (e.key === 'Backspace') {
					e.preventDefault();
					// the edge guard runs inside the link: it must judge the
					// cursor the preceding link left behind
					enqueueTyped(() => {
						if (State.cursor.getX() > 0) {
							deleteText();
						}
					});
				}
			}
		}
	};

	let selectionStartX = 0;
	let selectionStartY = 0;
	const textCanvasDown = e => {
		State.cursor.move(e.detail.x, e.detail.y);
		selectionStartX = e.detail.x;
		selectionStartY = e.detail.y;
	};

	const textCanvasDrag = e => {
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
		// no getPos inherit here: every tool switch runs this
		// controller's disable, which already parks the cursor at a live
		// selection, and getPos hands stale or default (0,0) coords that
		// would yank the view on EVERY entry
		enabled = true;
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
		document.removeEventListener('keypress', keyPress);
		document.removeEventListener('onTextCanvasDown', textCanvasDown);
		document.removeEventListener('onTextCanvasDrag', textCanvasDrag);
		// park the cursor at a LIVE shift-selection only, and never
		// scroll: hiding a cursor must not move the view
		if (State.selectionCursor.isVisible()) {
			const selection = State.selectionCursor.getPos();
			State.cursor.move(selection.x, selection.y, false);
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

// paste modes and move mode share one blank rule (an empty glyph on
// black), or blanks leak through one path and stamp through another
const isBlankCell = (charCode, background) =>
	(charCode === 0 || charCode === 32 || charCode === 255) &&
	background === 0;

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
		// plane-native cells: the u16 area would quantize truecolor and
		// turn unicode into '?' on every copy/paste round trip
		buffer = State.textArtCanvas.getAreaCells(x, y, width, height);
		pasteItem.classList.remove('disabled');
	};

	const deleteSelection = () => {
		if (State.selectionCursor.isVisible() || State.cursor.isVisible()) {
			State.historyLabels?.pend('Delete');
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
			State.historyLabels?.pend('Paste');
			State.textArtCanvas.startUndo();
			State.textArtCanvas.setAreaCells(buffer, x, y);
		}
	};

	/**
	 * PabloDraw-style paste modes:
	 * - 'transparent': blank cells in the CLIPBOARD don't overwrite
	 * - 'under': cells land only where the TARGET is blank
	 */
	const pasteSpecial = mode => {
		if (
			buffer === undefined ||
			!(State.selectionCursor.isVisible() || State.cursor.isVisible())
		) {
			return;
		}
		State.historyLabels?.pend(
			mode === 'transparent' ? 'Paste transparent' : 'Paste under',
		);
		State.textArtCanvas.startUndo();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		State.textArtCanvas.draw(draw => {
			for (let py = 0; py < buffer.height; py++) {
				for (let px = 0; px < buffer.width; px++) {
					const targetX = x + px;
					const targetY = y + py;
					if (targetX >= columns || targetY >= rows) {
						continue;
					}
					const cell = buffer.cells[py * buffer.width + px];
					if (mode === 'transparent' && isBlankCell(cell.charCode, cell.bg)) {
						continue;
					}
					if (mode === 'under') {
						// raw backgroundColor: an extended color WORD is never
						// 0, so colored cells always count as occupied
						const target = State.textArtCanvas.getBlock(targetX, targetY);
						if (!isBlankCell(target.charCode, target.backgroundColor)) {
							continue;
						}
					}
					draw(cell.charCode, cell.fg, cell.bg, targetX, targetY);
				}
			}
		}, false);
	};

	const pasteTransparent = () => pasteSpecial('transparent');
	const pasteUnder = () => pasteSpecial('under');

	const systemPaste = () => {
		if (!navigator.clipboard || !navigator.clipboard.readText) {
			console.warn('[Keyboard] Clipboard API not available');
			return;
		}
		navigator.clipboard
			.readText()
			.then(async text => {
				if (
					text &&
					(State.selectionCursor.isVisible() || State.cursor.isVisible())
				) {
					const columns = State.textArtCanvas.getColumns();
					const rows = State.textArtCanvas.getRows();
					const lines = text.split(/\r\n|\r|\n/);
					if (
						lines.length === 1 &&
						lines[0].length > columns * magicNumbers.PASTE_LIMIT_MULTIPLIER
					) {
						alert(
							`Paste buffer too large. Single line content exceeds ${columns * magicNumbers.PASTE_LIMIT_MULTIPLIER} characters. Please copy smaller blocks.`,
						);
						return;
					}
					if (lines.length > rows * magicNumbers.PASTE_LIMIT_MULTIPLIER) {
						alert(
							`Paste buffer too large. Content exceeds ${rows * magicNumbers.PASTE_LIMIT_MULTIPLIER} lines. Please copy smaller blocks.`,
						);
						return;
					}
					// core/paste.ts owns the token rules; negative tokens are
					// ~codepoint and resolve through the doc glyph table
					const { tokens, unmapped } = tokenizePasteText(text);
					const resolved =
						unmapped.size > 0
							? await State.textArtCanvas.resolveUnicode(unmapped)
							: new Map();

					State.historyLabels?.pend('System paste');
					State.textArtCanvas.startUndo();
					// re-read bounds: the resolve above awaits network block
					// fetches, and the doc may have been resized meanwhile
					const drawColumns = State.textArtCanvas.getColumns();
					const drawRows = State.textArtCanvas.getRows();
					let currentX = Math.min(x, drawColumns - 1);
					let currentY = y;
					const startX = Math.min(x, drawColumns - 1);
					const foreground = State.palette.getForegroundColor();
					const background = State.palette.getBackgroundColor();

					State.textArtCanvas.draw(draw => {
						for (const token of tokens) {
							if (token === PASTE_NEWLINE) {
								currentY++;
								currentX = startX;
								continue;
							}
							if (currentY >= drawRows) {
								break;
							}
							if (currentX >= drawColumns) {
								continue;
							}
							const charCode =
								token >= 0
									? token
									: (resolved.get(~token) ?? PASTE_SUBSTITUTE);
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
		if (isTextEntry(e.target)) {
			// this handler is PERMANENT: without the bail, Cmd+V in the
			// SAUCE title field stamps the buffer onto the canvas and
			// Ctrl+Backspace in chat deletes the selection
			return;
		}
		if (enabled) {
			if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
				switch (e.code) {
					case 'KeyX':
						e.preventDefault();
						cut();
						break;
					case 'KeyC':
						e.preventDefault();
						copy();
						break;
					case 'KeyV':
						e.preventDefault();
						paste();
						break;
					default:
						break;
				}
			}
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
		pasteTransparent: pasteTransparent,
		pasteUnder: pasteUnder,
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
	let underlyingData = null; // under the moving blocks
	// every step of one move joins a single stroke, so undo takes the
	// whole move back at once
	let moveStroke = false;
	let selectionStartX = 0;
	let selectionStartY = 0;
	let selectionEndX = 0;
	let selectionEndY = 0;
	// keyboard mode's shift+arrow, replayed on enable
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
			// the next keyboard expansion grows the rect the mouse drew
			const selection = State.selectionCursor.getSelection();
			if (selection) {
				selectionStartX = selection.x;
				selectionStartY = selection.y;
				selectionEndX = selection.x + selection.width - 1;
				selectionEndY = selection.y + selection.height - 1;
			}
		}
	};

	// same re-home rule as the keyboard cursor: a user scroll that
	// settles with the selection fully off screen collapses it to the
	// buffer-depth home cell, so the next keypress acts where you look
	// instead of snapping the view back. Never during move mode or a
	// drag: the rect then anchors real content
	let settleTimer = 0;
	const onViewportScroll = () => {
		clearTimeout(settleTimer);
		settleTimer = setTimeout(() => {
			if (moveMode || isDragging) {
				return;
			}
			const selection = State.selectionCursor.getSelection();
			const frame = visibleCellFrame();
			if (!selection || !frame) {
				return;
			}
			const offscreen =
				selection.x + selection.width - 1 < frame.first.x ||
				selection.x > frame.last.x ||
				selection.y + selection.height - 1 < frame.first.y ||
				selection.y > frame.last.y;
			if (!offscreen) {
				return;
			}
			State.selectionCursor.setStart(frame.home.x, frame.home.y);
			State.selectionCursor.setEnd(frame.home.x, frame.home.y);
			selectionStartX = frame.home.x;
			selectionStartY = frame.home.y;
			selectionEndX = frame.home.x;
			selectionEndY = frame.home.y;
		}, 120);
	};

	const flipHorizontal = () => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}
		State.historyLabels?.pend('Flip horizontal');
		State.textArtCanvas.startUndo();
		for (let y = 0; y < selection.height; y++) {
			const blocks = [];
			for (let x = 0; x < selection.width; x++) {
				blocks.push(
					State.textArtCanvas.getBlock(selection.x + x, selection.y + y),
				);
			}
			State.textArtCanvas.draw(callback => {
				for (let x = 0; x < selection.width; x++) {
					const sourceBlock = blocks[x];
					const targetX = selection.x + (selection.width - 1 - x);
					let charCode = sourceBlock.charCode;
					// a mirrored half block swaps sides
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
		State.historyLabels?.pend('Flip vertical');
		State.textArtCanvas.startUndo();
		for (let x = 0; x < selection.width; x++) {
			const blocks = [];
			for (let y = 0; y < selection.height; y++) {
				blocks.push(
					State.textArtCanvas.getBlock(selection.x + x, selection.y + y),
				);
			}
			State.textArtCanvas.draw(callback => {
				for (let y = 0; y < selection.height; y++) {
					const sourceBlock = blocks[y];
					const targetY = selection.y + (selection.height - 1 - y);
					let charCode = sourceBlock.charCode;
					// a flipped half block swaps top and bottom
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
					const cell = area.cells[py * area.width + px];

					// blanks move transparently, like paste transparent:
					// a space is as blank as char 0
					if (cell && !isBlankCell(cell.charCode, cell.bg)) {
						draw(cell.charCode, cell.fg, cell.bg, x + px, y + py);
					} else if (
						targetArea &&
						px < targetArea.width &&
						py < targetArea.height
					) {
						const t = targetArea.cells[py * targetArea.width + px];
						if (t) {
							draw(t.charCode, t.fg, t.bg, x + px, y + py);
						}
					}
					// else: leave the existing canvas cell alone
				}
			}
		}, false);
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
		if (newX === selection.x && newY === selection.y) {
			return;
		}
		if (!moveStroke) {
			State.textArtCanvas.startUndo();
			moveStroke = true;
		}
		if (!selectionData) {
			selectionData = State.textArtCanvas.getAreaCells(
				selection.x,
				selection.y,
				selection.width,
				selection.height,
			);
		}
		if (underlyingData) {
			State.textArtCanvas.setAreaCells(underlyingData, selection.x, selection.y);
		}
		underlyingData = State.textArtCanvas.getAreaCells(
			newX,
			newY,
			selection.width,
			selection.height,
		);
		setAreaSelective(selectionData, underlyingData, newX, newY);
		State.selectionCursor.setStart(newX, newY);
		State.selectionCursor.setEnd(
			newX + selection.width - 1,
			newY + selection.height - 1,
		);
	};

	const createEmptyArea = (width, height) => ({
		cells: Array.from({ length: width * height }, () => ({
			charCode: 0,
			fg: 0,
			bg: 0,
		})),
		width: width,
		height: height,
	});

	const toggleMoveMode = () => {
		moveMode = !moveMode;
		if (moveMode) {
			moveButton.classList.add('enabled');
			State.selectionCursor.getElement().classList.add('moveMode');
			const selection = State.selectionCursor.getSelection();
			if (selection) {
				selectionData = State.textArtCanvas.getAreaCells(
					selection.x,
					selection.y,
					selection.width,
					selection.height,
				);
				// a move empties the old position as the selection drags
				// away, blank on black whatever the current background, as
				// Moebius doc.js, TextModeDoc.erase() and PabloDraw
				// Block/Paste.cs, Paste.Do() leave it
				underlyingData = createEmptyArea(selection.width, selection.height);
			}
		} else {
			// the first step already emptied the origin, so finishing
			// writes nothing; committing here hands the journal and the
			// history flyout the finished move
			if (moveStroke) {
				State.textArtCanvas.endUndo();
			}
			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('moveMode');
			selectionData = null;
			underlyingData = null;
			moveStroke = false;
		}
	};
	const isMoveMode = () => moveMode;

	const startSelectionExpansion = () => {
		if (!State.selectionCursor.isVisible()) {
			selectionStartX = State.cursor.getX();
			selectionStartY = State.cursor.getY();
			selectionEndX = selectionStartX;
			selectionEndY = selectionStartY;
			State.selectionCursor.setStart(selectionStartX, selectionStartY);
			State.selectionCursor.setEnd(selectionEndX, selectionEndY);
			State.cursor.hide();
		}
		// an existing selection keeps its anchor and end: rebuilding them
		// from the bounds would lose which corner the expansion grows from
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
		const bufferRows = SCROLL_BUFFER_ROWS;

		const selectionPixelY = selection.y * fontHeight;
		const selectionPixelX = selection.x * fontWidth;
		const bufferPixels = bufferRows * fontHeight;

		const viewportHeight = viewport.clientHeight;
		const viewportWidth = viewport.clientWidth;
		const scrollTop = viewport.scrollTop;
		const scrollLeft = viewport.scrollLeft;

		const selectionTop = selectionPixelY - bufferPixels;
		const selectionBottom =
			selectionPixelY + selection.height * fontHeight + bufferPixels;

		if (selectionTop < scrollTop) {
			viewport.scrollTop = Math.max(0, selectionTop);
		} else if (selectionBottom > scrollTop + viewportHeight) {
			viewport.scrollTop = Math.max(0, selectionBottom - viewportHeight);
		}

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

			let newStartY = selectionStartY + delta;
			let newEndY = selectionEndY + delta;

			// clamp both ends together so the selection keeps its height
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
		if (isTextEntry(e.target)) {
			// without the bail, typing in chat toggles move mode, flips
			// the selected art, and switches tools
			return;
		}
		if (e.code === 'Enter') {
			e.preventDefault();
			Toolbar.switchTool('keyboard');
			State.cursor.newLine();
		} else if (e.code === 'End') {
			e.preventDefault();
			shiftToEndOfRow();
		} else if (e.code === 'Home') {
			e.preventDefault();
			shiftToStartOfRow();
		}
		if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
			if (e.key === '[') {
				e.preventDefault();
				flipHorizontal();
			} else if (e.key === ']') {
				e.preventDefault();
				flipVertical();
			} else if (e.key === 'M' || e.key === 'm') {
				e.preventDefault();
				toggleMoveMode();
			} else if (e.code === 'PageUp') {
				e.preventDefault();
				pageScroll('up');
			} else if (e.code === 'PageDown') {
				e.preventDefault();
				pageScroll('down');
			} else if (moveMode && State.selectionCursor.getSelection()) {
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
		// the bar belongs to this tool alone: keyboard mode keeps its
		// shift-arrow selections bare, or the bar would squat over the
		// canvas and swallow the next click
		panel.style.display = 'flex';
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('keydown', keyDown);
		viewport?.addEventListener('scroll', onViewportScroll, { passive: true });
		flipHButton.addEventListener('click', flipHorizontal);
		flipVButton.addEventListener('click', flipVertical);
		moveButton.addEventListener('click', toggleMoveMode);

		// every tool switch hides the rect, but its geometry survives:
		// bring the last selection back so leaving the tool does not
		// cost it, clamped in case the canvas shrank in between
		if (!State.selectionCursor.isVisible()) {
			const last = State.selectionCursor.getLastSelection();
			if (last) {
				const maxX = State.textArtCanvas.getColumns() - 1;
				const maxY = State.textArtCanvas.getRows() - 1;
				State.selectionCursor.setStart(
					Math.min(last.x, maxX),
					Math.min(last.y, maxY),
				);
				State.selectionCursor.setEnd(
					Math.min(last.x + last.width - 1, maxX),
					Math.min(last.y + last.height - 1, maxY),
				);
			}
		}

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

		if (pendingInitialAction) {
			const action = pendingInitialAction;
			pendingInitialAction = null;
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
		// a tool switch runs every disable in registration order, and the
		// keyboard controller registers before this tool: its disable has
		// already parked the cursor at a live rect and hidden it, so this
		// one only cleans up
		State.selectionCursor.hide();
		panel.style.display = 'none';
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('keydown', keyDown);
		viewport?.removeEventListener('scroll', onViewportScroll);
		clearTimeout(settleTimer);

		if (moveMode) {
			// no canvas writes on abort: moveSelection restores the
			// underlying area at the old spot on every step, so the origin
			// is already clear, and a finalize here would erase never-moved
			// art whenever an event like a font change hid the rect mid-move
			moveMode = false;
			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('moveMode');
			selectionData = null;
			underlyingData = null;
			moveStroke = false;
		}
		flipHButton.removeEventListener('click', flipHorizontal);
		flipVButton.removeEventListener('click', flipVertical);
		moveButton.removeEventListener('click', toggleMoveMode);
		State.pasteTool.disable();
	};

	const setPendingAction = keyCode => {
		pendingInitialAction = keyCode;
	};

	// a new document invalidates every piece of cross-file tool state:
	// stale move-mode data would stamp the OLD file's cells into the
	// new one on the next drag, and a stale stroke flag would fold the
	// next move into whatever stroke is open
	document.addEventListener('onNewDocument', () => {
		if (moveMode) {
			moveMode = false;
			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('moveMode');
		}
		selectionData = null;
		underlyingData = null;
		moveStroke = false;
		isDragging = false;
		pendingInitialAction = null;
		selectionStartX = 0;
		selectionStartY = 0;
		selectionEndX = 0;
		selectionEndY = 0;
	});

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
	createCursor,
	createSelectionCursor,
	createKeyboardController,
	createPasteTool,
	createSelectionTool,
};
