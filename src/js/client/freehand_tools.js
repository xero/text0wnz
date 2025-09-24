import State from './state.js';
import Toolbar from './toolbar.js';
import { $, createCanvas, createToggleButton } from './ui.js';
import magicNumbers from './magicNumbers.js';

const createPanelCursor = el => {
	const cursor = createCanvas(0, 0);
	cursor.classList.add('cursor');
	el.appendChild(cursor);

	const show = () => {
		cursor.style.display = 'block';
	};

	const hide = () => {
		cursor.style.display = 'none';
	};

	const resize = (width, height) => {
		cursor.style.width = width + 'px';
		cursor.style.height = height + 'px';
	};

	const setPos = (x, y) => {
		cursor.style.left = x - 1 + 'px';
		cursor.style.top = y - 1 + 'px';
	};

	return {
		show: show,
		hide: hide,
		resize: resize,
		setPos: setPos,
	};
};

const createFloatingPanelPalette = (width, height) => {
	const canvasContainer = document.createElement('DIV');
	const cursor = createPanelCursor(canvasContainer);
	const canvas = createCanvas(width, height);
	canvasContainer.appendChild(canvas);
	const ctx = canvas.getContext('2d');
	const imageData = new Array(16);

	const generateSwatch = color => {
		imageData[color] = ctx.createImageData(width / 8, height / 2);
		const rgba = State.palette.getRGBAColor(color);
		for (let y = 0, i = 0; y < imageData[color].height; y++) {
			for (let x = 0; x < imageData[color].width; x++, i += 4) {
				imageData[color].data.set(rgba, i);
			}
		}
	};

	const generateSwatches = () => {
		for (let color = 0; color < 16; color++) {
			generateSwatch(color);
		}
	};

	const redrawSwatch = color => {
		ctx.putImageData(imageData[color], (color % 8) * (width / 8), color > 7 ? 0 : height / 2);
	};

	const redrawSwatches = () => {
		for (let color = 0; color < 16; color++) {
			redrawSwatch(color);
		}
	};

	const mouseDown = e => {
		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		const color = Math.floor(mouseX / (width / 8)) + (mouseY < height / 2 ? 8 : 0);
		if (e.ctrlKey === false && e.altKey === false) {
			State.palette.setForegroundColor(color);
		} else {
			State.palette.setBackgroundColor(color);
		}
	};

	const onPaletteChange = _ => {
		updatePalette();
	};

	const updateColor = color => {
		generateSwatch(color);
		redrawSwatch(color);
	};

	const updatePalette = () => {
		for (let color = 0; color < 16; color++) {
			updateColor(color);
		}
	};

	const getElement = () => canvasContainer;

	const updateCursor = color => {
		cursor.resize(width / 8, height / 2);
		cursor.setPos((color % 8) * (width / 8), color > 7 ? 0 : height / 2);
	};

	const onForegroundChange = e => {
		updateCursor(e.detail);
	};

	const resize = (newWidth, newHeight) => {
		width = newWidth;
		height = newHeight;
		canvas.width = width;
		canvas.height = height;
		generateSwatches();
		redrawSwatches();
		updateCursor(State.palette.getForegroundColor());
	};

	generateSwatches();
	redrawSwatches();
	updateCursor(State.palette.getForegroundColor());
	canvas.addEventListener('mousedown', mouseDown);
	canvas.addEventListener('contextmenu', e => {
		e.preventDefault();
	});
	document.addEventListener('onForegroundChange', onForegroundChange);
	document.addEventListener('onPaletteChange', onPaletteChange);
	return {
		updateColor: updateColor,
		updatePalette: updatePalette,
		getElement: getElement,
		showCursor: cursor.show,
		hideCursor: cursor.hide,
		resize: resize,
	};
};

const createFloatingPanel = (x, y) => {
	const panel = document.createElement('DIV');
	const hide = document.createElement('DIV');
	panel.classList.add('floating-panel');
	hide.classList.add('hidePanel');
	hide.innerText = 'X';
	panel.appendChild(hide);
	$('body-container').appendChild(panel);
	hide.addEventListener('click', _ => panel.classList.remove('enabled'));
	let prev;

	const setPos = (newX, newY) => {
		panel.style.left = newX + 'px';
		x = newX;
		panel.style.top = newY + 'px';
		y = newY;
	};

	const mousedown = e => {
		prev = [e.clientX, e.clientY];
	};

	const touchMove = e => {
		if (e.buttons === 1 && prev !== undefined) {
			// Left mouse button pressed
			e.preventDefault();
			e.stopPropagation();
			const rect = panel.getBoundingClientRect();
			setPos(rect.left + (e.touches[0].pageX - prev[0]), rect.top + (e.touches[0].pageY - prev[1]));
			prev = [e.touches[0].pageX, e.touches[0].pageY];
		}
	};

	const mouseMove = e => {
		if (e.buttons === 1 && prev !== undefined) {
			// Left mouse button pressed
			e.preventDefault();
			e.stopPropagation();
			const rect = panel.getBoundingClientRect();
			setPos(rect.left + (e.clientX - prev[0]), rect.top + (e.clientY - prev[1]));
			prev = [e.clientX, e.clientY];
		}
	};

	const mouseUp = () => {
		prev = undefined;
	};

	const enable = () => {
		panel.classList.add('enabled');
		document.addEventListener('touchmove', touchMove);
		document.addEventListener('mousemove', mouseMove);
		document.addEventListener('mouseup', mouseUp);
	};

	const disable = () => {
		panel.classList.remove('enabled');
		document.removeEventListener('touchmove', touchMove);
		document.removeEventListener('mousemove', mouseMove);
		document.removeEventListener('mouseup', mouseUp);
	};

	const append = element => {
		panel.appendChild(element);
	};

	setPos(x, y);
	panel.addEventListener('mousedown', mousedown);

	return {
		setPos: setPos,
		enable: enable,
		disable: disable,
		append: append,
	};
};

const createBrushController = () => {
	const panel = $('brush-toolbar');
	const enable = () => {
		panel.style.display = 'flex';
		$('halfblock').click();
	};
	const disable = () => {
		panel.style.display = 'none';
	};
	return {
		enable: enable,
		disable: disable,
	};
};

const createHalfBlockController = () => {
	let prev = {};
	const bar = $('brush-toolbar');
	const nav = $('brushes');

	const line = (x0, y0, x1, y1, callback) => {
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let err = (dx > dy ? dx : -dy) / 2;
		let e2;

		while (true) {
			callback(x0, y0);
			if (x0 === x1 && y0 === y1) {
				break;
			}
			e2 = err;
			if (e2 > -dx) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dy) {
				err += dx;
				y0 += sy;
			}
		}
	};
	const draw = coords => {
		if (prev.x !== coords.x || prev.y !== coords.y || prev.halfBlockY !== coords.halfBlockY) {
			// const color = (coords.leftMouseButton === true) ? State.palette.getForegroundColor() : State.palette.getBackgroundColor();
			const color = State.palette.getForegroundColor();
			if (Math.abs(prev.x - coords.x) > 1 || Math.abs(prev.halfBlockY - coords.halfBlockY) > 1) {
				State.textArtCanvas.drawHalfBlock(callback => {
					line(prev.x, prev.halfBlockY, coords.x, coords.halfBlockY, (x, y) => {
						callback(color, x, y);
					});
				});
			} else {
				State.textArtCanvas.drawHalfBlock(callback => {
					callback(color, coords.x, coords.halfBlockY);
				});
			}
			State.positionInfo.update(coords.x, coords.y);
			prev = coords;
		}
	};

	const canvasUp = () => {
		prev = {};
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		draw(e.detail);
	};

	const canvasDrag = e => {
		draw(e.detail);
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		bar.style.display = 'flex';
		nav.classList.add('enabled');
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		bar.style.display = 'none';
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
	};
};

const createShadingController = (panel, charMode) => {
	const bar = $('brush-toolbar');
	const nav = $('brushes');
	let prev = {};
	let drawMode;
	let reduce = false;

	const line = (x0, y0, x1, y1, callback) => {
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let err = (dx > dy ? dx : -dy) / 2;
		let e2;

		while (true) {
			callback(x0, y0);
			if (x0 === x1 && y0 === y1) {
				break;
			}
			e2 = err;
			if (e2 > -dx) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dy) {
				err += dx;
				y0 += sy;
			}
		}
	};
	const keyDown = e => {
		if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
			// Shift key pressed
			reduce = true;
		}
	};

	const keyUp = e => {
		if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
			// Shift key released
			reduce = false;
		}
	};

	const calculateShadingCharacter = (x, y) => {
		// Get current cell character
		const block = State.textArtCanvas.getBlock(x, y);
		let code = block.charCode;
		const currentFG = block.foregroundColor;
		const fg = State.palette.getForegroundColor();

		if (reduce) {
			// lighten (backwards in the cycle, or erase if already lightest)
			switch (code) {
				case 176:
					code = 32;
					break;
				case 177:
					code = 176;
					break;
				case 178:
					code = 177;
					break;
				case 219:
					code = currentFG === fg ? 178 : 176;
					break;
				default:
					code = 32;
			}
		} else {
			// darken (forwards in the cycle)
			switch (code) {
				case 219:
					code = currentFG !== fg ? 176 : 219;
					break;
				case 178:
					code = 219;
					break;
				case 177:
					code = 178;
					break;
				case 176:
					code = 177;
					break;
				default:
					code = 176;
			}
		}
		return code;
	};

	const draw = coords => {
		if (prev.x !== coords.x || prev.y !== coords.y || prev.halfBlockY !== coords.halfBlockY) {
			if (Math.abs(prev.x - coords.x) > 1 || Math.abs(prev.y - coords.y) > 1) {
				State.textArtCanvas.draw(callback => {
					line(prev.x, prev.y, coords.x, coords.y, (x, y) => {
						callback(
							charMode ? drawMode.charCode : calculateShadingCharacter(x, y),
							drawMode.foreground,
							drawMode.background,
							x,
							y,
						);
					});
				}, false);
			} else {
				State.textArtCanvas.draw(callback => {
					callback(
						charMode ? drawMode.charCode : calculateShadingCharacter(coords.x, coords.y),
						drawMode.foreground,
						drawMode.background,
						coords.x,
						coords.y,
					);
				}, false);
			}
			State.positionInfo.update(coords.x, coords.y);
			prev = coords;
		}
	};

	const canvasUp = () => {
		prev = {};
	};

	const canvasDown = e => {
		drawMode = panel.getMode();
		State.textArtCanvas.startUndo();
		draw(e.detail);
	};

	const canvasDrag = e => {
		draw(e.detail);
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('keydown', keyDown);
		document.addEventListener('keyup', keyUp);
		panel.enable();
		bar.style.display = 'flex';
		nav.classList.add('enabled');
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('keydown', keyDown);
		document.removeEventListener('keyup', keyUp);
		panel.disable();
		bar.style.display = 'none';
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
		select: panel.select,
		ignore: panel.ignore,
		unignore: panel.unignore,
		redrawGlyphs: panel.redrawGlyphs,
	};
};

const createShadingPanel = () => {
	let panelWidth = State.font.getWidth() * magicNumbers.PANEL_WIDTH_MULTIPLIER;
	const panel = createFloatingPanel(50, 50);
	const canvasContainer = document.createElement('div');
	const cursor = createPanelCursor(canvasContainer);
	const canvases = new Array(16);
	const nav = $('brushes');
	let halfBlockMode = false;
	let x = 0;
	let y = 0;
	let ignored = false;
	let currentFont;

	const updateCursor = () => {
		const width = canvases[0].width / 5;
		const height = canvases[0].height / 15;
		cursor.resize(width, height);
		cursor.setPos(x * width, y * height);
	};

	const mouseDownGenerator = color => {
		return e => {
			const rect = canvases[color].getBoundingClientRect();
			const mouseX = e.clientX - rect.left;
			const mouseY = e.clientY - rect.top;
			halfBlockMode = false;
			x = Math.floor(mouseX / (canvases[color].width / 5));
			y = Math.floor(mouseY / (canvases[color].height / 15));
			updateCursor();
			cursor.show();
		};
	};

	const generateCanvases = () => {
		currentFont = State.textArtCanvas.getCurrentFontName();
		const fontHeight = State.font.getHeight();
		for (let foreground = 0; foreground < 16; foreground++) {
			const canvas = createCanvas(panelWidth, fontHeight * 15);
			const ctx = canvas.getContext('2d');
			let y = 0;
			for (let background = 0; background < 8; background++) {
				if (foreground !== background) {
					for (let i = 0; i < 4; i++) {
						State.font.draw(219, foreground, background, ctx, i, y);
					}
					for (let i = 4; i < 8; i++) {
						State.font.draw(178, foreground, background, ctx, i, y);
					}
					for (let i = 8; i < 12; i++) {
						State.font.draw(177, foreground, background, ctx, i, y);
					}
					for (let i = 12; i < 16; i++) {
						State.font.draw(176, foreground, background, ctx, i, y);
					}
					for (let i = 16; i < 20; i++) {
						State.font.draw(0, foreground, background, ctx, i, y);
					}
					y += 1;
				}
			}
			for (let background = 8; background < 16; background++) {
				if (foreground !== background) {
					for (let i = 0; i < 4; i++) {
						State.font.draw(219, foreground, background, ctx, i, y);
					}
					for (let i = 4; i < 8; i++) {
						State.font.draw(178, foreground, background, ctx, i, y);
					}
					for (let i = 8; i < 12; i++) {
						State.font.draw(177, foreground, background, ctx, i, y);
					}
					for (let i = 12; i < 16; i++) {
						State.font.draw(176, foreground, background, ctx, i, y);
					}
					for (let i = 16; i < 20; i++) {
						State.font.draw(0, foreground, background, ctx, i, y);
					}
					y += 1;
				}
			}
			canvas.addEventListener('mousedown', mouseDownGenerator(foreground));
			canvases[foreground] = canvas;
		}
	};

	const keyDown = e => {
		if (ignored === false) {
			if (halfBlockMode === false) {
				switch (e.code) {
					case 'ArrowLeft': // Left arrow
						e.preventDefault();
						x = Math.max(x - 1, 0);
						updateCursor();
						break;
					case 'ArrowUp': // Up arrow
						e.preventDefault();
						y = Math.max(y - 1, 0);
						updateCursor();
						break;
					case 'ArrowRight': // Right arrow
						e.preventDefault();
						x = Math.min(x + 1, 4);
						updateCursor();
						break;
					case 'ArrowDown': // Down arrow
						e.preventDefault();
						y = Math.min(y + 1, 14);
						updateCursor();
						break;
					default:
						break;
				}
			} else if (e.code.startsWith('Arrow')) {
				// Any arrow key
				e.preventDefault();
				halfBlockMode = false;
				cursor.show();
			}
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		panel.enable();
		nav.classList.add('enabled');
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
		panel.disable();
		nav.classList.remove('enabled');
	};

	const ignore = () => {
		ignored = true;
	};

	const unignore = () => {
		ignored = false;
	};

	const getMode = () => {
		let charCode = 0;
		switch (x) {
			case 0:
				charCode = 219;
				break;
			case 1:
				charCode = 178;
				break;
			case 2:
				charCode = 177;
				break;
			case 3:
				charCode = 176;
				break;
			case 4:
				charCode = 0;
				break;
			default:
				break;
		}
		const foreground = State.palette.getForegroundColor();
		let background = y;
		if (y >= foreground) {
			background += 1;
		}
		return {
			halfBlockMode: halfBlockMode,
			foreground: foreground,
			background: background,
			charCode: charCode,
		};
	};

	const foregroundChange = e => {
		canvasContainer.removeChild(canvasContainer.firstChild);
		canvasContainer.insertBefore(canvases[e.detail], canvasContainer.firstChild);
		cursor.hide();
		halfBlockMode = true;
	};

	const fontChange = () => {
		if (currentFont === 'XBIN' || currentFont !== State.textArtCanvas.getCurrentFontName()) {
			panelWidth = State.font.getWidth() * magicNumbers.PANEL_WIDTH_MULTIPLIER;
			generateCanvases();
			updateCursor();
			canvasContainer.removeChild(canvasContainer.firstChild);
			canvasContainer.insertBefore(canvases[State.palette.getForegroundColor()], canvasContainer.firstChild);
		}
	};

	const onPaletteChange = e => {
		State.palette = e.detail;
		canvasContainer.removeChild(canvasContainer.firstChild);
		generateCanvases();
		updateCursor();
		canvasContainer.insertBefore(canvases[State.palette.getForegroundColor()], canvasContainer.firstChild);
	};

	const select = charCode => {
		halfBlockMode = false;
		x = 3 - (charCode - 176);
		y = State.palette.getBackgroundColor();
		if (y > State.palette.getForegroundColor()) {
			y -= 1;
		}
		updateCursor();
		cursor.show();
	};

	document.addEventListener('onPaletteChange', onPaletteChange);
	document.addEventListener('onForegroundChange', foregroundChange);
	document.addEventListener('onLetterSpacingChange', fontChange);
	document.addEventListener('onFontChange', fontChange);

	generateCanvases();
	updateCursor();
	canvasContainer.insertBefore(canvases[State.palette.getForegroundColor()], canvasContainer.firstChild);
	panel.append(canvasContainer);
	cursor.hide();

	return {
		enable: enable,
		disable: disable,
		getMode: getMode,
		select: select,
		ignore: ignore,
		unignore: unignore,
	};
};

const createCharacterBrushPanel = () => {
	let panelWidth = State.font.getWidth() * 16;
	const panel = createFloatingPanel(50, 50);
	const canvasContainer = document.createElement('div');
	const cursor = createPanelCursor(canvasContainer);
	const canvas = createCanvas(panelWidth, State.font.getHeight() * 16);
	const ctx = canvas.getContext('2d');
	let x = 0;
	let y = 0;
	let ignored = false;
	const nav = $('brushes');

	const updateCursor = () => {
		const width = canvas.width / 16;
		const height = canvas.height / 16;
		cursor.resize(width, height);
		cursor.setPos(x * width, y * height);
	};

	const redrawCanvas = () => {
		const foreground = State.palette.getForegroundColor();
		const background = State.palette.getBackgroundColor();
		for (let y = 0, charCode = 0; y < 16; y++) {
			for (let x = 0; x < 16; x++, charCode++) {
				State.font.draw(charCode, foreground, background, ctx, x, y);
			}
		}
	};

	const keyDown = e => {
		if (ignored === false) {
			switch (e.code) {
				case 'ArrowLeft': // Left arrow
					e.preventDefault();
					x = Math.max(x - 1, 0);
					updateCursor();
					break;
				case 'ArrowUp': // Up arrow
					e.preventDefault();
					y = Math.max(y - 1, 0);
					updateCursor();
					break;
				case 'ArrowRight': // Right arrow
					e.preventDefault();
					x = Math.min(x + 1, 15);
					updateCursor();
					break;
				case 'ArrowDown': // Down arrow
					e.preventDefault();
					y = Math.min(y + 1, 15);
					updateCursor();
					break;
				default:
					break;
			}
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		panel.enable();
		nav.classList.add('enabled');
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
		panel.disable();
		nav.classList.remove('enabled');
	};

	const getMode = () => {
		const charCode = y * 16 + x;
		return {
			halfBlockMode: false,
			foreground: State.palette.getForegroundColor(),
			background: State.palette.getBackgroundColor(),
			charCode: charCode,
		};
	};

	const resizeCanvas = () => {
		panelWidth = State.font.getWidth() * 16;
		canvas.width = panelWidth;
		canvas.height = State.font.getHeight() * 16;
		redrawCanvas();
		updateCursor();
	};

	const mouseUp = e => {
		const rect = canvas.getBoundingClientRect();
		const mouseX = e.clientX - rect.left;
		const mouseY = e.clientY - rect.top;
		x = Math.floor(mouseX / (canvas.width / 16));
		y = Math.floor(mouseY / (canvas.height / 16));
		updateCursor();
	};

	const select = charCode => {
		x = charCode % 16;
		y = Math.floor(charCode / 16);
		updateCursor();
	};

	const ignore = () => {
		ignored = true;
	};

	const unignore = () => {
		ignored = false;
	};

	const redrawGlyphs = () => {
		resizeCanvas();
		redrawCanvas();
	};

	document.addEventListener('onForegroundChange', redrawCanvas);
	document.addEventListener('onBackgroundChange', redrawCanvas);
	document.addEventListener('onLetterSpacingChange', resizeCanvas);
	document.addEventListener('onFontChange', redrawGlyphs);
	document.addEventListener('onPaletteChange', redrawCanvas);
	document.addEventListener('onXBFontLoaded', redrawGlyphs);
	canvas.addEventListener('mouseup', mouseUp);

	updateCursor();
	cursor.show();
	canvasContainer.appendChild(canvas);
	panel.append(canvasContainer);
	redrawCanvas();

	return {
		enable: enable,
		disable: disable,
		getMode: getMode,
		select: select,
		ignore: ignore,
		unignore: unignore,
		redrawGlyphs: redrawGlyphs,
	};
};

const createFillController = () => {
	const fillPoint = e => {
		let block = State.textArtCanvas.getHalfBlock(e.detail.x, e.detail.halfBlockY);
		if (block.isBlocky) {
			const targetColor = block.halfBlockY === 0 ? block.upperBlockColor : block.lowerBlockColor;
			const fillColor = State.palette.getForegroundColor();
			if (targetColor !== fillColor) {
				const columns = State.textArtCanvas.getColumns();
				const rows = State.textArtCanvas.getRows();
				let coord = [e.detail.x, e.detail.halfBlockY];
				const queue = [coord];

				// Handle mirror mode: if enabled and the mirrored position has the same color, add it to queue
				if (State.textArtCanvas.getMirrorMode()) {
					const mirrorX = State.textArtCanvas.getMirrorX(e.detail.x);
					if (mirrorX >= 0 && mirrorX < columns) {
						const mirrorBlock = State.textArtCanvas.getHalfBlock(mirrorX, e.detail.halfBlockY);
						if (mirrorBlock.isBlocky) {
							const mirrorTargetColor =
								mirrorBlock.halfBlockY === 0 ? mirrorBlock.upperBlockColor : mirrorBlock.lowerBlockColor;
							if (mirrorTargetColor === targetColor) {
								// Add mirror position to the queue so it gets filled too
								queue.push([mirrorX, e.detail.halfBlockY]);
							}
						}
					}
				}

				State.textArtCanvas.startUndo();
				State.textArtCanvas.drawHalfBlock(callback => {
					while (queue.length !== 0) {
						coord = queue.pop();
						block = State.textArtCanvas.getHalfBlock(coord[0], coord[1]);
						if (
							block.isBlocky &&
							((block.halfBlockY === 0 && block.upperBlockColor === targetColor) ||
							  (block.halfBlockY === 1 && block.lowerBlockColor === targetColor))
						) {
							callback(fillColor, coord[0], coord[1]);
							if (coord[0] > 0) {
								queue.push([coord[0] - 1, coord[1], 0]);
							}
							if (coord[0] < columns - 1) {
								queue.push([coord[0] + 1, coord[1], 1]);
							}
							if (coord[1] > 0) {
								queue.push([coord[0], coord[1] - 1, 2]);
							}
							if (coord[1] < rows * 2 - 1) {
								queue.push([coord[0], coord[1] + 1, 3]);
							}
						} else if (block.isVerticalBlocky) {
							if (coord[2] !== 0 && block.leftBlockColor === targetColor) {
								State.textArtCanvas.draw(callback => {
									callback(221, fillColor, block.rightBlockColor, coord[0], block.textY);
								}, true);
								if (coord[0] > 0) {
									queue.push([coord[0] - 1, coord[1], 0]);
								}
								if (coord[1] > 2) {
									if (block.halfBlockY === 1) {
										queue.push([coord[0], coord[1] - 2, 2]);
									} else {
										queue.push([coord[0], coord[1] - 1, 2]);
									}
								}
								if (coord[1] < rows * 2 - 2) {
									if (block.halfBlockY === 1) {
										queue.push([coord[0], coord[1] + 1, 3]);
									} else {
										queue.push([coord[0], coord[1] + 2, 3]);
									}
								}
							}
							if (coord[2] !== 1 && block.rightBlockColor === targetColor) {
								State.textArtCanvas.draw(callback => {
									callback(222, fillColor, block.leftBlockColor, coord[0], block.textY);
								}, true);
								if (coord[0] > 0) {
									queue.push([coord[0] - 1, coord[1], 0]);
								}
								if (coord[1] > 2) {
									if (block.halfBlockY === 1) {
										queue.push([coord[0], coord[1] - 2, 2]);
									} else {
										queue.push([coord[0], coord[1] - 1, 2]);
									}
								}
								if (coord[1] < rows * 2 - 2) {
									if (block.halfBlockY === 1) {
										queue.push([coord[0], coord[1] + 1, 3]);
									} else {
										queue.push([coord[0], coord[1] + 2, 3]);
									}
								}
							}
						}
					}
				});
			}
		}
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', fillPoint);
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', fillPoint);
	};

	return {
		enable: enable,
		disable: disable,
	};
};

const createShapesController = () => {
	const panel = $('shapes-toolbar');
	const enable = () => {
		panel.style.display = 'flex';
		$('line').click();
	};
	const disable = () => {
		panel.style.display = 'none';
	};
	return {
		enable: enable,
		disable: disable,
	};
};

const createLineController = () => {
	const panel = $('shapes-toolbar');
	const nav = $('shapes');
	let startXY;
	let endXY;

	const canvasDown = e => {
		startXY = e.detail;
	};

	const line = (x0, y0, x1, y1, callback) => {
		const dx = Math.abs(x1 - x0);
		const sx = x0 < x1 ? 1 : -1;
		const dy = Math.abs(y1 - y0);
		const sy = y0 < y1 ? 1 : -1;
		let err = (dx > dy ? dx : -dy) / 2;
		let e2;

		while (true) {
			callback(x0, y0);
			if (x0 === x1 && y0 === y1) {
				break;
			}
			e2 = err;
			if (e2 > -dx) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dy) {
				err += dx;
				y0 += sy;
			}
		}
	};

	const canvasUp = () => {
		State.toolPreview.clear();
		const foreground = State.palette.getForegroundColor();
		State.textArtCanvas.startUndo();
		State.textArtCanvas.drawHalfBlock(draw => {
			const endPoint = endXY || startXY;
			line(startXY.x, startXY.halfBlockY, endPoint.x, endPoint.halfBlockY, (lineX, lineY) => {
				draw(foreground, lineX, lineY);
			});
		});
		startXY = undefined;
		endXY = undefined;
	};

	const hasEndPointChanged = (e, endPoint = undefined) => {
		if (endPoint === undefined) {
			return true;
		}
		return e.halfBlockY !== endPoint.halfBlockY || e.x !== endPoint.x || e.y !== endPoint.y;
	};

	const canvasDrag = e => {
		if (startXY !== undefined) {
			if (hasEndPointChanged(e.detail, endXY)) {
				if (endXY !== undefined) {
					State.toolPreview.clear();
				}
				endXY = e.detail;
				const foreground = State.palette.getForegroundColor();
				line(startXY.x, startXY.halfBlockY, endXY.x, endXY.halfBlockY, (lineX, lineY) => {
					State.toolPreview.drawHalfBlock(foreground, lineX, lineY);
				});
			}
		}
	};

	const enable = () => {
		panel.style.display = 'flex';
		nav.classList.add('enabled');
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
	};

	const disable = () => {
		panel.style.display = 'none';
		nav.classList.remove('enabled');
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
	};

	return {
		enable: enable,
		disable: disable,
	};
};

const createSquareController = () => {
	const panel = $('square-toolbar');
	const bar = $('shapes-toolbar');
	const nav = $('shapes');
	let startXY;
	let endXY;
	let outlineMode = true;

	const outlineToggle = createToggleButton(
		'Outline',
		'Filled',
		() => {
			outlineMode = true;
		},
		() => {
			outlineMode = false;
		},
	);

	const canvasDown = e => {
		startXY = e.detail;
	};

	const processCoords = () => {
		// If endXY is undefined (no drag), use startXY as endpoint
		const endPoint = endXY || startXY;
		let x0, y0, x1, y1;
		if (startXY.x < endPoint.x) {
			x0 = startXY.x;
			x1 = endPoint.x;
		} else {
			x0 = endPoint.x;
			x1 = startXY.x;
		}
		if (startXY.halfBlockY < endPoint.halfBlockY) {
			y0 = startXY.halfBlockY;
			y1 = endPoint.halfBlockY;
		} else {
			y0 = endPoint.halfBlockY;
			y1 = startXY.halfBlockY;
		}
		return { x0: x0, y0: y0, x1: x1, y1: y1 };
	};

	const canvasUp = () => {
		State.toolPreview.clear();
		const coords = processCoords();
		const foreground = State.palette.getForegroundColor();
		State.textArtCanvas.startUndo();
		State.textArtCanvas.drawHalfBlock(draw => {
			if (outlineMode === true) {
				for (let px = coords.x0; px <= coords.x1; px++) {
					draw(foreground, px, coords.y0);
					draw(foreground, px, coords.y1);
				}
				for (let py = coords.y0 + 1; py < coords.y1; py++) {
					draw(foreground, coords.x0, py);
					draw(foreground, coords.x1, py);
				}
			} else {
				for (let py = coords.y0; py <= coords.y1; py++) {
					for (let px = coords.x0; px <= coords.x1; px++) {
						draw(foreground, px, py);
					}
				}
			}
		});
		startXY = undefined;
		endXY = undefined;
	};

	const hasEndPointChanged = (e, startPoint = undefined) => {
		if (startPoint === undefined) {
			return true;
		}
		return e.halfBlockY !== startPoint.halfBlockY || e.x !== startPoint.x || e.y !== startPoint.y;
	};

	const canvasDrag = e => {
		if (startXY !== undefined && hasEndPointChanged(e.detail, startXY)) {
			if (endXY !== undefined) {
				State.toolPreview.clear();
			}
			endXY = e.detail;
			const coords = processCoords();
			const foreground = State.palette.getForegroundColor();
			if (outlineMode === true) {
				for (let px = coords.x0; px <= coords.x1; px++) {
					State.toolPreview.drawHalfBlock(foreground, px, coords.y0);
					State.toolPreview.drawHalfBlock(foreground, px, coords.y1);
				}
				for (let py = coords.y0 + 1; py < coords.y1; py++) {
					State.toolPreview.drawHalfBlock(foreground, coords.x0, py);
					State.toolPreview.drawHalfBlock(foreground, coords.x1, py);
				}
			} else {
				for (let py = coords.y0; py <= coords.y1; py++) {
					for (let px = coords.x0; px <= coords.x1; px++) {
						State.toolPreview.drawHalfBlock(foreground, px, py);
					}
				}
			}
		}
	};

	const enable = () => {
		panel.classList.remove('hide');
		bar.style.display = 'flex';
		nav.classList.add('enabled');
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
	};

	const disable = () => {
		panel.classList.add('hide');
		bar.style.display = 'none';
		nav.classList.remove('enabled');
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
	};

	panel.append(outlineToggle.getElement());
	if (outlineMode === true) {
		outlineToggle.setStateOne();
	} else {
		outlineToggle.setStateTwo();
	}

	return {
		enable: enable,
		disable: disable,
	};
};

const createCircleController = () => {
	const bar = $('shapes-toolbar');
	const panel = $('circle-toolbar');
	const nav = $('shapes');
	let startXY;
	let endXY;
	let outlineMode = true;

	const outlineToggle = createToggleButton(
		'Outline',
		'Filled',
		() => {
			outlineMode = true;
		},
		() => {
			outlineMode = false;
		},
	);

	const canvasDown = e => {
		startXY = e.detail;
	};

	const processCoords = () => {
		const endPoint = endXY || startXY; // If endXY is undefined (no drag), use startXY as endpoint
		const sx = startXY.x;
		const sy = startXY.halfBlockY;
		const width = Math.abs(endPoint.x - startXY.x);
		const height = Math.abs(endPoint.halfBlockY - startXY.halfBlockY);
		return {
			sx: sx,
			sy: sy,
			width: width,
			height: height,
		};
	};

	const ellipseOutline = (sx, sy, width, height, callback) => {
		const a2 = width * width;
		const b2 = height * height;
		const fa2 = 4 * a2;
		const fb2 = 4 * b2;
		for (let px = 0, py = height, sigma = 2 * b2 + a2 * (1 - 2 * height); b2 * px <= a2 * py; px += 1) {
			callback(sx + px, sy + py);
			callback(sx - px, sy + py);
			callback(sx + px, sy - py);
			callback(sx - px, sy - py);
			if (sigma >= 0) {
				sigma += fa2 * (1 - py);
				py -= 1;
			}
			sigma += b2 * (4 * px + 6);
		}
		for (let px = width, py = 0, sigma = 2 * a2 + b2 * (1 - 2 * width); a2 * py <= b2 * px; py += 1) {
			callback(sx + px, sy + py);
			callback(sx - px, sy + py);
			callback(sx + px, sy - py);
			callback(sx - px, sy - py);
			if (sigma >= 0) {
				sigma += fb2 * (1 - px);
				px -= 1;
			}
			sigma += a2 * (4 * py + 6);
		}
	};

	const ellipseFilled = (sx, sy, width, height, callback) => {
		const a2 = width * width;
		const b2 = height * height;
		const fa2 = 4 * a2;
		const fb2 = 4 * b2;
		for (let px = 0, py = height, sigma = 2 * b2 + a2 * (1 - 2 * height); b2 * px <= a2 * py; px += 1) {
			const amount = px * 2;
			const start = sx - px;
			const y0 = sy + py;
			const y1 = sy - py;
			for (let i = 0; i < amount; i++) {
				callback(start + i, y0);
				callback(start + i, y1);
			}
			if (sigma >= 0) {
				sigma += fa2 * (1 - py);
				py -= 1;
			}
			sigma += b2 * (4 * px + 6);
		}
		for (let px = width, py = 0, sigma = 2 * a2 + b2 * (1 - 2 * width); a2 * py <= b2 * px; py += 1) {
			const amount = px * 2;
			const start = sx - px;
			const y0 = sy + py;
			const y1 = sy - py;
			for (let i = 0; i < amount; i++) {
				callback(start + i, y0);
				callback(start + i, y1);
			}
			if (sigma >= 0) {
				sigma += fb2 * (1 - px);
				px -= 1;
			}
			sigma += a2 * (4 * py + 6);
		}
	};

	const canvasUp = () => {
		State.toolPreview.clear();
		const coords = processCoords();
		const foreground = State.palette.getForegroundColor();
		State.textArtCanvas.startUndo();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const doubleRows = rows * 2;
		State.textArtCanvas.drawHalfBlock(draw => {
			if (outlineMode === true) {
				ellipseOutline(coords.sx, coords.sy, coords.width, coords.height, (px, py) => {
					if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
						draw(foreground, px, py);
					}
				});
			} else {
				ellipseFilled(coords.sx, coords.sy, coords.width, coords.height, (px, py) => {
					if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
						draw(foreground, px, py);
					}
				});
			}
		});
		startXY = undefined;
		endXY = undefined;
	};

	const hasEndPointChanged = (e, startPoint = undefined) => {
		if (startPoint === undefined) {
			return true;
		}
		return e.halfBlockY !== startPoint.halfBlockY || e.x !== startPoint.x || e.y !== startPoint.y;
	};

	const canvasDrag = e => {
		if (startXY !== undefined && hasEndPointChanged(e.detail, startXY)) {
			if (endXY !== undefined) {
				State.toolPreview.clear();
			}
			endXY = e.detail;
			const coords = processCoords();
			const foreground = State.palette.getForegroundColor();
			const columns = State.textArtCanvas.getColumns();
			const rows = State.textArtCanvas.getRows();
			const doubleRows = rows * 2;
			if (outlineMode === true) {
				ellipseOutline(coords.sx, coords.sy, coords.width, coords.height, (px, py) => {
					if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
						State.toolPreview.drawHalfBlock(foreground, px, py);
					}
				});
			} else {
				ellipseFilled(coords.sx, coords.sy, coords.width, coords.height, (px, py) => {
					if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
						State.toolPreview.drawHalfBlock(foreground, px, py);
					}
				});
			}
		}
	};

	const enable = () => {
		panel.classList.remove('hide');
		bar.style.display = 'flex';
		nav.classList.add('enabled');
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
	};

	const disable = () => {
		panel.classList.add('hide');
		bar.style.display = 'none';
		nav.classList.remove('enabled');
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
	};

	panel.append(outlineToggle.getElement());
	if (outlineMode === true) {
		outlineToggle.setStateOne();
	} else {
		outlineToggle.setStateTwo();
	}

	return {
		enable: enable,
		disable: disable,
	};
};

const createSampleTool = (shadeBrush, shadeElement, characterBrush, characterElement) => {
	const sample = (x, halfBlockY) => {
		let block = State.textArtCanvas.getHalfBlock(x, halfBlockY);
		if (block.isBlocky) {
			if (block.halfBlockY === 0) {
				State.palette.setForegroundColor(block.upperBlockColor);
			} else {
				State.palette.setForegroundColor(block.lowerBlockColor);
			}
		} else {
			block = State.textArtCanvas.getBlock(block.x, Math.floor(block.y / 2));
			State.palette.setForegroundColor(block.foregroundColor);
			State.palette.setBackgroundColor(block.backgroundColor);
			if (block.charCode >= 176 && block.charCode <= 178) {
				shadeBrush.select(block.charCode);
				shadeElement.click();
			} else {
				characterBrush.select(block.charCode);
				characterElement.click();
			}
		}
	};

	const canvasDown = e => {
		sample(e.detail.x, e.detail.halfBlockY);
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', canvasDown);
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
	};

	return {
		enable: enable,
		disable: disable,
		sample: sample,
	};
};

const createSelectionTool = () => {
	const panel = $('selection-toolbar');
	const flipHButton = $('flip-horizontal');
	const flipVButton = $('flip-vertical');
	const moveButton = $('move-blocks');
	let moveMode = false;
	let selectionData = null;
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;
	let originalPosition = null; // Original position when move mode started
	let underlyingData = null; // Content currently underneath the moving blocks

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
				blocks.push(State.textArtCanvas.getBlock(selection.x + x, selection.y + y));
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
					callback(charCode, sourceBlock.foregroundColor, sourceBlock.backgroundColor, targetX, selection.y + y);
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
				blocks.push(State.textArtCanvas.getBlock(selection.x + x, selection.y + y));
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
					callback(charCode, sourceBlock.foregroundColor, sourceBlock.backgroundColor, selection.x + x, targetY);
				}
			}, false);
		}
	};

	const setAreaSelective = (area, targetArea, x, y) => {
		// Apply selection data to target position, but only overwrite non-blank characters
		// Blank characters (char code 0, foreground 0, background 0) are treated as transparent
		const maxWidth = Math.min(area.width, State.textArtCanvas.getColumns() - x);
		const maxHeight = Math.min(area.height, State.textArtCanvas.getRows() - y);

		State.textArtCanvas.draw(draw => {
			for (let py = 0; py < maxHeight; py++) {
				for (let px = 0; px < maxWidth; px++) {
					const sourceAttrib = area.data[py * area.width + px];

					// Only apply the source character if it's not a truly blank character
					// Truly blank = char code 0, foreground 0, background 0 (attrib === 0)
					if (sourceAttrib !== 0) {
						draw(sourceAttrib >> 8, sourceAttrib & 15, (sourceAttrib >> 4) & 15, x + px, y + py);
					} else if (targetArea) {
						// Keep the original target character for blank spaces
						const targetAttrib = targetArea.data[py * targetArea.width + px];
						draw(targetAttrib >> 8, targetAttrib & 15, (targetAttrib >> 4) & 15, x + px, y + py);
					}
					// If no targetArea and source is blank, do nothing
				}
			}
		});
	};

	const moveSelection = (deltaX, deltaY) => {
		const selection = State.selectionCursor.getSelection();
		if (!selection) {
			return;
		}

		const newX = Math.max(0, Math.min(selection.x + deltaX, State.textArtCanvas.getColumns() - selection.width));
		const newY = Math.max(0, Math.min(selection.y + deltaY, State.textArtCanvas.getRows() - selection.height));

		// Don't process if we haven't actually moved
		if (newX === selection.x && newY === selection.y) {
			return;
		}

		State.textArtCanvas.startUndo();

		// Get the current selection data if we don't have it
		if (!selectionData) {
			selectionData = State.textArtCanvas.getArea(selection.x, selection.y, selection.width, selection.height);
		}

		// Restore what was underneath the current position (if any)
		if (underlyingData) {
			State.textArtCanvas.setArea(underlyingData, selection.x, selection.y);
		}

		// Store what's underneath the new position
		underlyingData = State.textArtCanvas.getArea(newX, newY, selection.width, selection.height);

		// Apply the selection at the new position, but only non-blank characters
		setAreaSelective(selectionData, underlyingData, newX, newY);

		// Update the selection cursor to the new position
		State.selectionCursor.setStart(newX, newY);
		State.selectionCursor.setEnd(newX + selection.width - 1, newY + selection.height - 1);
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
			State.selectionCursor.getElement().classList.add('move-mode');

			// Store selection data and original position when entering move mode
			const selection = State.selectionCursor.getSelection();
			if (selection) {
				selectionData = State.textArtCanvas.getArea(selection.x, selection.y, selection.width, selection.height);
				originalPosition = { x: selection.x, y: selection.y, width: selection.width, height: selection.height };
				// What's underneath initially is empty space (what should be left when the selection moves away)
				underlyingData = createEmptyArea(selection.width, selection.height);
			}
		} else {
			// Disable move mode - finalize the move by clearing original position if different
			const currentSelection = State.selectionCursor.getSelection();
			if (
				originalPosition &&
				currentSelection &&
				(currentSelection.x !== originalPosition.x || currentSelection.y !== originalPosition.y)
			) {
				// Only clear original position if we actually moved
				State.textArtCanvas.startUndo();
				State.textArtCanvas.deleteArea(
					originalPosition.x,
					originalPosition.y,
					originalPosition.width,
					originalPosition.height,
					0,
				);
			}

			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('move-mode');
			selectionData = null;
			originalPosition = null;
			underlyingData = null;
		}
	};

	const keyDown = e => {
		if (e.ctrlKey === false && e.altKey === false && e.shiftKey === false && e.metaKey === false) {
			if (e.code === 'Escape') {
				// Escape key - return to previous tool
				e.preventDefault();
				if (typeof Toolbar !== 'undefined') {
					Toolbar.returnToPreviousTool();
				}
			} else if (e.key === '[') {
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
			} else if (moveMode && State.selectionCursor.getSelection()) {
				// Arrow key movement in move mode
				if (e.code === 'ArrowLeft') {
					// Left arrow
					e.preventDefault();
					moveSelection(-1, 0);
				} else if (e.code === 'ArrowUp') {
					// Up arrow
					e.preventDefault();
					moveSelection(0, -1);
				} else if (e.code === 'ArrowRight') {
					// Right arrow
					e.preventDefault();
					moveSelection(1, 0);
				} else if (e.code === 'ArrowDown') {
					// Down arrow
					e.preventDefault();
					moveSelection(0, 1);
				}
			} else {
				// Handle cursor movement when not in move mode
				switch (e.code) {
					case 'Enter': // Enter key - new line
						e.preventDefault();
						State.cursor.newLine();
						break;
					case 'End': // End key
						e.preventDefault();
						State.cursor.endOfCurrentRow();
						break;
					case 'Home': // Home key
						e.preventDefault();
						State.cursor.startOfCurrentRow();
						break;
					case 'ArrowLeft': // Left arrow
						e.preventDefault();
						State.cursor.left();
						break;
					case 'ArrowUp': // Up arrow
						e.preventDefault();
						State.cursor.up();
						break;
					case 'ArrowRight': // Right arrow
						e.preventDefault();
						State.cursor.right();
						break;
					case 'ArrowDown': // Down arrow
						e.preventDefault();
						State.cursor.down();
						break;
					default:
						break;
				}
			}
		} else if (e.metaKey === true && e.shiftKey === false) {
			// Handle Meta key combinations
			switch (e.code) {
				case 'ArrowLeft': // Meta+Left - expand selection to start of current row
					e.preventDefault();
					State.cursor.shiftToStartOfRow();
					break;
				case 'ArrowRight': // Meta+Right - expand selection to end of current row
					e.preventDefault();
					State.cursor.shiftToEndOfRow();
					break;
				default:
					break;
			}
		} else if (e.shiftKey === true && e.metaKey === false) {
			// Handle Shift key combinations for selection
			switch (e.code) {
				case 'ArrowLeft': // Shift+Left
					e.preventDefault();
					State.cursor.shiftLeft();
					break;
				case 'ArrowUp': // Shift+Up
					e.preventDefault();
					State.cursor.shiftUp();
					break;
				case 'ArrowRight': // Shift+Right
					e.preventDefault();
					State.cursor.shiftRight();
					break;
				case 'ArrowDown': // Shift+Down
					e.preventDefault();
					State.cursor.shiftDown();
					break;
				default:
					break;
			}
		}
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('keydown', keyDown);
		panel.style.display = 'flex';

		// Add click handlers for the buttons
		flipHButton.addEventListener('click', flipHorizontal);
		flipVButton.addEventListener('click', flipVertical);
		moveButton.addEventListener('click', toggleMoveMode);
	};

	const disable = () => {
		State.selectionCursor.hide();
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('keydown', keyDown);
		panel.style.display = 'none';

		// Reset move mode if it was active and finalize any pending move
		if (moveMode) {
			// Finalize the move by clearing original position if different
			const currentSelection = State.selectionCursor.getSelection();
			if (
				originalPosition &&
				currentSelection &&
				(currentSelection.x !== originalPosition.x || currentSelection.y !== originalPosition.y)
			) {
				State.textArtCanvas.startUndo();
				State.textArtCanvas.deleteArea(
					originalPosition.x,
					originalPosition.y,
					originalPosition.width,
					originalPosition.height,
					0,
				);
			}

			moveMode = false;
			moveButton.classList.remove('enabled');
			State.selectionCursor.getElement().classList.remove('move-mode');
			selectionData = null;
			originalPosition = null;
			underlyingData = null;
		}

		// Remove click handlers
		flipHButton.removeEventListener('click', flipHorizontal);
		flipVButton.removeEventListener('click', flipVertical);
		moveButton.removeEventListener('click', toggleMoveMode);
		State.pasteTool.disable();
	};

	return {
		enable: enable,
		disable: disable,
		flipHorizontal: flipHorizontal,
		flipVertical: flipVertical,
	};
};

const createAttributeBrushController = () => {
	let isActive = false;
	let lastCoord = null;
	const bar = $('brush-toolbar');

	const paintAttribute = (x, y, altKey) => {
		const block = State.textArtCanvas.getBlock(x, y);
		const currentForeground = State.palette.getForegroundColor();
		const currentBackground = State.palette.getBackgroundColor();
		let newForeground, newBackground;

		if (altKey) {
			// Alt+click modifies background color only
			newForeground = block.foregroundColor;
			newBackground = currentForeground > 7 ? currentForeground - 8 : currentForeground;
		} else {
			// Normal click modifies both foreground and background colors
			newForeground = currentForeground;
			newBackground = currentBackground;
		}

		// Only update if something changes
		if (block.foregroundColor !== newForeground || block.backgroundColor !== newBackground) {
			State.textArtCanvas.draw(callback => {
				callback(block.charCode, newForeground, newBackground, x, y);
			}, true);
		}
	};

	const paintLine = (fromX, fromY, toX, toY, altKey) => {
		// Use Bresenham's line algorithm to paint attributes along a line
		const dx = Math.abs(toX - fromX);
		const dy = Math.abs(toY - fromY);
		const sx = fromX < toX ? 1 : -1;
		const sy = fromY < toY ? 1 : -1;
		let err = dx - dy;
		let x = fromX;
		let y = fromY;

		while (true) {
			paintAttribute(x, y, altKey);

			if (x === toX && y === toY) {
				break;
			}

			const e2 = 2 * err;
			if (e2 > -dy) {
				err -= dy;
				x += sx;
			}
			if (e2 < dx) {
				err += dx;
				y += sy;
			}
		}
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		isActive = true;

		if (e.detail.shiftKey && lastCoord) {
			// Shift+click draws a line from last point
			paintLine(lastCoord.x, lastCoord.y, e.detail.x, e.detail.y, e.detail.altKey);
		} else {
			// Normal click paints single point
			paintAttribute(e.detail.x, e.detail.y, e.detail.altKey);
		}

		lastCoord = { x: e.detail.x, y: e.detail.y };
	};

	const canvasDrag = e => {
		if (isActive && lastCoord) {
			paintLine(lastCoord.x, lastCoord.y, e.detail.x, e.detail.y, e.detail.altKey);
			lastCoord = { x: e.detail.x, y: e.detail.y };
		}
	};

	const canvasUp = _ => {
		isActive = false;
	};

	const enable = () => {
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
		bar.style.display = 'flex';
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		bar.style.display = 'none';
		isActive = false;
		lastCoord = null;
	};

	return {
		enable: enable,
		disable: disable,
	};
};

export {
	createPanelCursor,
	createFloatingPanelPalette,
	createFloatingPanel,
	createBrushController,
	createHalfBlockController,
	createShadingController,
	createShadingPanel,
	createCharacterBrushPanel,
	createFillController,
	createLineController,
	createShapesController,
	createSquareController,
	createCircleController,
	createAttributeBrushController,
	createSelectionTool,
	createSampleTool,
};
