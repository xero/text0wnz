import State from './state.js';
import { $, createCanvas, createToggleButton } from './ui.js';
import Toolbar from './toolbar.js';
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

const createFloatingPanel = (x, y) => {
	const panel = document.createElement('DIV');
	const hide = document.createElement('DIV');
	panel.classList.add('floatingPanel');
	hide.classList.add('hidePanel');
	hide.innerText = 'X';
	panel.appendChild(hide);
	$('bodyContainer').appendChild(panel);
	hide.addEventListener('click', _ => panel.classList.remove('enabled'));

	let dragStartPointer = null; // [x, y]
	let dragStartPanel = null; // [x, y]

	const mousedown = e => {
		dragStartPointer = [e.clientX, e.clientY];
		const rect = panel.getBoundingClientRect();
		dragStartPanel = [rect.left, rect.top];
		document.addEventListener('mousemove', mouseMove);
		document.addEventListener('mouseup', mouseUp);
	};

	const mouseMove = e => {
		if (dragStartPointer && dragStartPanel) {
			e.preventDefault();
			e.stopPropagation();
			const dx = e.clientX - dragStartPointer[0];
			const dy = e.clientY - dragStartPointer[1];
			setPos(dragStartPanel[0] + dx, dragStartPanel[1] + dy);
		}
	};

	const mouseUp = () => {
		dragStartPointer = null;
		dragStartPanel = null;
		document.removeEventListener('mousemove', mouseMove);
		document.removeEventListener('mouseup', mouseUp);
	};

	const touchstart = e => {
		dragStartPointer = [e.touches[0].pageX, e.touches[0].pageY];
		const rect = panel.getBoundingClientRect();
		dragStartPanel = [rect.left, rect.top];
		document.addEventListener('touchmove', touchMove, { passive: false });
		document.addEventListener('touchend', touchEnd, { passive: false });
	};

	const touchMove = e => {
		if (dragStartPointer && dragStartPanel) {
			e.preventDefault();
			e.stopPropagation();
			const dx = e.touches[0].pageX - dragStartPointer[0];
			const dy = e.touches[0].pageY - dragStartPointer[1];
			setPos(dragStartPanel[0] + dx, dragStartPanel[1] + dy);
		}
	};

	const touchEnd = () => {
		dragStartPointer = null;
		dragStartPanel = null;
		document.removeEventListener('touchmove', touchMove, { passive: false });
		document.removeEventListener('touchend', touchEnd, { passive: false });
	};

	const setPos = (newX, newY) => {
		panel.style.left = newX + 'px';
		x = newX;
		panel.style.top = newY + 'px';
		y = newY;
	};

	const enable = () => {
		panel.classList.add('enabled');
		document.addEventListener('touchmove', touchMove, { passive: false });
		document.addEventListener('mousemove', mouseMove);
		document.addEventListener('mouseup', mouseUp);
		document.addEventListener('touchend', mouseUp, { passive: false });
	};

	const disable = () => {
		panel.classList.remove('enabled');
		document.removeEventListener('touchmove', touchMove, { passive: false });
		document.removeEventListener('mousemove', mouseMove);
		document.removeEventListener('mouseup', mouseUp);
		document.removeEventListener('touchend', mouseUp, { passive: false });
	};

	const append = element => {
		panel.appendChild(element);
	};

	setPos(x, y);
	panel.addEventListener('touchstart', touchstart, { passive: false });
	panel.addEventListener('mousedown', mousedown);

	return {
		setPos: setPos,
		enable: enable,
		disable: disable,
		append: append,
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
		ctx.putImageData(
			imageData[color],
			(color % 8) * (width / 8),
			color > 7 ? 0 : height / 2,
		);
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
		const color =
			Math.floor(mouseX / (width / 8)) + (mouseY < height / 2 ? 8 : 0);
		if (!e.ctrlKey && !e.altKey) {
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

const createBrushController = () => {
	const panel = $('brushToolbar');
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
	const bar = $('brushToolbar');
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
		if (
			prev.x !== coords.x ||
			prev.y !== coords.y ||
			prev.halfBlockY !== coords.halfBlockY
		) {
			const color = State.palette.getForegroundColor();
			if (
				Math.abs(prev.x - coords.x) > 1 ||
				Math.abs(prev.halfBlockY - coords.halfBlockY) > 1
			) {
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
	const bar = $('brushToolbar');
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
		if (
			prev.x !== coords.x ||
			prev.y !== coords.y ||
			prev.halfBlockY !== coords.halfBlockY
		) {
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
						charMode
							? drawMode.charCode
							: calculateShadingCharacter(coords.x, coords.y),
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

const createShadingPanel = async () => {
	let panelFont = null;
	let ignored = false;
	const panel = createFloatingPanel(150, 150);
	const canvasContainer = document.createElement('div');

	const cursor = createPanelCursor(canvasContainer);
	let canvases = new Array(16);
	const nav = $('brushes');
	let halfBlockMode = false;
	let x = 0;
	let y = 0;

	const get1xFont = async () => {
		if (!State.font || !State.font.getData) {
			return null;
		}
		const { createLazyFont } = await import('./lazyFont.js');
		const fontData = State.font.getData();
		const palette = State.palette;
		const letterSpacing = State.font.getLetterSpacing?.() ?? false;
		return createLazyFont(fontData, palette, letterSpacing, 1);
	};

	const updateCursor = () => {
		const i = canvases.length - 1;
		const width = canvases[i].width / 5;
		const height = canvases[i].height / 15;
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

	const generateCanvases = async () => {
		canvases.forEach(c => {
			if (canvasContainer.contains(c)) {
				canvasContainer.removeChild(c);
			}
		});

		panelFont = await get1xFont();
		if (!panelFont) {
			return;
		}
		canvases = new Array(16);

		for (let foreground = 0; foreground < 16; foreground++) {
			const canvas = createCanvas(
				State.fontWidth * magicNumbers.PANEL_WIDTH_MULTIPLIER,
				State.fontHeight * 15,
			);
			const ctx = canvas.getContext('2d');
			let y = 0;
			for (let background = 0; background < 8; background++) {
				if (foreground !== background) {
					for (let i = 0; i < 4; i++) {
						panelFont.draw(219, foreground, background, ctx, i, y);
					}
					for (let i = 4; i < 8; i++) {
						panelFont.draw(178, foreground, background, ctx, i, y);
					}
					for (let i = 8; i < 12; i++) {
						panelFont.draw(177, foreground, background, ctx, i, y);
					}
					for (let i = 12; i < 16; i++) {
						panelFont.draw(176, foreground, background, ctx, i, y);
					}
					for (let i = 16; i < 20; i++) {
						panelFont.draw(0, foreground, background, ctx, i, y);
					}
					y += 1;
				}
			}
			for (let background = 8; background < 16; background++) {
				if (foreground !== background) {
					for (let i = 0; i < 4; i++) {
						panelFont.draw(219, foreground, background, ctx, i, y);
					}
					for (let i = 4; i < 8; i++) {
						panelFont.draw(178, foreground, background, ctx, i, y);
					}
					for (let i = 8; i < 12; i++) {
						panelFont.draw(177, foreground, background, ctx, i, y);
					}
					for (let i = 12; i < 16; i++) {
						panelFont.draw(176, foreground, background, ctx, i, y);
					}
					for (let i = 16; i < 20; i++) {
						panelFont.draw(0, foreground, background, ctx, i, y);
					}
					y += 1;
				}
			}
			canvas.addEventListener('mousedown', mouseDownGenerator(foreground));
			canvases[foreground] = canvas;
		}
	};

	const keyDown = e => {
		if (!ignored) {
			if (!halfBlockMode) {
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
		canvasContainer.insertBefore(
			canvases[e.detail],
			canvasContainer.firstChild,
		);
		cursor.show();
		halfBlockMode = true;
	};

	const onChange = async () => {
		await generateCanvases().then(() => {
			if (canvasContainer.childElementCount > 1) {
				canvasContainer.removeChild(canvasContainer.firstChild);
			}
			canvasContainer.insertBefore(
				canvases[State.palette.getForegroundColor()],
				canvasContainer.firstChild,
			);
			updateCursor();
			cursor.show();
		});
	};

	const select = async charCode => {
		halfBlockMode = false;
		x = 3 - (charCode - 176);
		y = State.palette.getBackgroundColor();
		if (y > State.palette.getForegroundColor()) {
			y -= 1;
		}
		updateCursor();
		cursor.show();
	};

	document.addEventListener('onForegroundChange', foregroundChange);
	document.addEventListener('onPaletteChange', onChange);
	document.addEventListener('onLetterSpacingChange', onChange);
	document.addEventListener('onFontChange', onChange);
	document.addEventListener('onXBFontLoaded', onChange);
	document.addEventListener('onOpenedFile', onChange);

	await generateCanvases();
	updateCursor();
	canvasContainer.insertBefore(
		canvases[State.palette.getForegroundColor()],
		canvasContainer.firstChild,
	);
	panel.append(canvasContainer);
	cursor.show();

	return {
		enable: enable,
		disable: disable,
		getMode: getMode,
		select: select,
		ignore: ignore,
		unignore: unignore,
	};
};

const createCharacterBrushPanel = async () => {
	let ignored = false;
	const panel = createFloatingPanel(100, 100);
	const canvasContainer = document.createElement('div');
	const cursor = createPanelCursor(canvasContainer);
	let canvas = createCanvas(
		State.fontWidth * magicNumbers.PANEL_WIDTH_MULTIPLIER,
		State.fontHeight * magicNumbers.PANEL_WIDTH_MULTIPLIER,
	);
	let x = 0;
	let y = 0;
	const nav = $('brushes');

	// Create a 1x scale font for rendering the panel (unaffected by zoom)
	const get1xFont = async () => {
		if (!State.font || !State.font.getData) {
			return null;
		}
		const { createLazyFont } = await import('./lazyFont.js');
		const fontData = State.font.getData();
		const palette = State.palette;
		const letterSpacing = State.font.getLetterSpacing?.() ?? false;
		return createLazyFont(fontData, palette, letterSpacing, 1);
	};

	const updateCursor = () => {
		const width = canvas.width / 16;
		const height = canvas.height / 16;
		cursor.resize(width, height);
		cursor.setPos(x * width, y * height);
	};

	const redrawCanvas = async () => {
		const panelFont = await get1xFont();
		if (!panelFont) {
			return;
		}

		const fontWidth = panelFont.getWidth();
		const fontHeight = panelFont.getHeight();
		const foreground = State.palette.getForegroundColor();
		const background = State.palette.getBackgroundColor();

		canvasContainer.removeChild(canvas);

		canvas = createCanvas(
			panelFont.getWidth() * 16,
			panelFont.getHeight() * 16,
		);

		const ctx = canvas.getContext('2d');

		for (let y = 0; y < 16; y++) {
			for (let x = 0; x < 16; x++) {
				const charCode = y * 16 + x;
				panelFont.draw(charCode, foreground, background, ctx, x, y);
			}
		}

		canvas.addEventListener('click', e => {
			const rect = canvas.getBoundingClientRect();
			const x = Math.floor((e.clientX - rect.left) / fontWidth);
			const y = Math.floor((e.clientY - rect.top) / fontHeight);
			const charCode = y * 16 + x;
			if (charCode < 256) {
				select(charCode);
			}
		});

		canvasContainer.appendChild(canvas);
	};

	const keyDown = e => {
		if (!ignored) {
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
		redrawCanvas();
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
		canvas.width = State.fontWidth * 16;
		canvas.height = State.fontHeight * 16;
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

	const select = async charCode => {
		await redrawCanvas().then(() => {
			x = charCode % 16;
			y = Math.floor(charCode / 16);
			updateCursor();
			cursor.show();
		});
	};

	const ignore = () => {
		ignored = true;
	};

	const unignore = () => {
		ignored = false;
	};

	const redrawGlyphs = () => {
		setTimeout(() => {
			resizeCanvas();
			redrawCanvas();
		}, 500);
	};

	document.addEventListener('onForegroundChange', redrawCanvas);
	document.addEventListener('onBackgroundChange', redrawCanvas);
	document.addEventListener('onLetterSpacingChange', resizeCanvas);
	document.addEventListener('onFontChange', redrawGlyphs);
	document.addEventListener('onPaletteChange', redrawCanvas);
	document.addEventListener('onXBFontLoaded', redrawGlyphs);
	document.addEventListener('onOpenedFile', redrawGlyphs);
	canvas.addEventListener('mouseup', mouseUp);

	canvasContainer.appendChild(canvas);
	panel.append(canvasContainer);
	await redrawCanvas();
	updateCursor();
	cursor.show();

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
		let block = State.textArtCanvas.getHalfBlock(
			e.detail.x,
			e.detail.halfBlockY,
		);
		if (block.isBlocky) {
			const targetColor =
				block.halfBlockY === 0 ? block.upperBlockColor : block.lowerBlockColor;
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
						const mirrorBlock = State.textArtCanvas.getHalfBlock(
							mirrorX,
							e.detail.halfBlockY,
						);
						if (mirrorBlock.isBlocky) {
							const mirrorTargetColor =
								mirrorBlock.halfBlockY === 0
									? mirrorBlock.upperBlockColor
									: mirrorBlock.lowerBlockColor;
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
							((block.halfBlockY === 0 &&
							  block.upperBlockColor === targetColor) ||
							  (block.halfBlockY === 1 &&
							    block.lowerBlockColor === targetColor))
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
									callback(
										221,
										fillColor,
										block.rightBlockColor,
										coord[0],
										block.textY,
									);
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
									callback(
										222,
										fillColor,
										block.leftBlockColor,
										coord[0],
										block.textY,
									);
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
	const panel = $('shapesToolbar');
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
	const panel = $('shapesToolbar');
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
		if (startXY) {
			State.toolPreview.clear();
			const foreground = State.palette.getForegroundColor();
			State.textArtCanvas.startUndo();
			State.textArtCanvas.drawHalfBlock(draw => {
				const endPoint = endXY || startXY;
				line(
					startXY.x,
					startXY.halfBlockY,
					endPoint.x,
					endPoint.halfBlockY,
					(lineX, lineY) => {
						draw(foreground, lineX, lineY);
					},
				);
			});
			startXY = undefined;
			endXY = undefined;
		}
	};

	const hasEndPointChanged = (e, endPoint = undefined) => {
		if (endPoint === undefined) {
			return true;
		}
		return (
			e.halfBlockY !== endPoint.halfBlockY ||
			e.x !== endPoint.x ||
			e.y !== endPoint.y
		);
	};

	const canvasDrag = e => {
		if (startXY !== undefined) {
			if (hasEndPointChanged(e.detail, endXY)) {
				if (endXY !== undefined) {
					State.toolPreview.clear();
				}
				endXY = e.detail;
				const foreground = State.palette.getForegroundColor();
				line(
					startXY.x,
					startXY.halfBlockY,
					endXY.x,
					endXY.halfBlockY,
					(lineX, lineY) => {
						State.toolPreview.drawHalfBlock(foreground, lineX, lineY);
					},
				);
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
	const panel = $('squareToolbar');
	const bar = $('shapesToolbar');
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
			if (outlineMode) {
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
		return (
			e.halfBlockY !== startPoint.halfBlockY ||
			e.x !== startPoint.x ||
			e.y !== startPoint.y
		);
	};

	const canvasDrag = e => {
		if (startXY !== undefined && hasEndPointChanged(e.detail, startXY)) {
			if (endXY !== undefined) {
				State.toolPreview.clear();
			}
			endXY = e.detail;
			const coords = processCoords();
			const foreground = State.palette.getForegroundColor();
			if (outlineMode) {
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
	if (outlineMode) {
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
	const bar = $('shapesToolbar');
	const panel = $('circleToolbar');
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
		for (
			let px = 0, py = height, sigma = 2 * b2 + a2 * (1 - 2 * height);
			b2 * px <= a2 * py;
			px += 1
		) {
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
		for (
			let px = width, py = 0, sigma = 2 * a2 + b2 * (1 - 2 * width);
			a2 * py <= b2 * px;
			py += 1
		) {
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
		for (
			let px = 0, py = height, sigma = 2 * b2 + a2 * (1 - 2 * height);
			b2 * px <= a2 * py;
			px += 1
		) {
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
		for (
			let px = width, py = 0, sigma = 2 * a2 + b2 * (1 - 2 * width);
			a2 * py <= b2 * px;
			py += 1
		) {
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
			if (outlineMode) {
				ellipseOutline(
					coords.sx,
					coords.sy,
					coords.width,
					coords.height,
					(px, py) => {
						if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
							draw(foreground, px, py);
						}
					},
				);
			} else {
				ellipseFilled(
					coords.sx,
					coords.sy,
					coords.width,
					coords.height,
					(px, py) => {
						if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
							draw(foreground, px, py);
						}
					},
				);
			}
		});
		startXY = undefined;
		endXY = undefined;
	};

	const hasEndPointChanged = (e, startPoint = undefined) => {
		if (startPoint === undefined) {
			return true;
		}
		return (
			e.halfBlockY !== startPoint.halfBlockY ||
			e.x !== startPoint.x ||
			e.y !== startPoint.y
		);
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
			if (outlineMode) {
				ellipseOutline(
					coords.sx,
					coords.sy,
					coords.width,
					coords.height,
					(px, py) => {
						if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
							State.toolPreview.drawHalfBlock(foreground, px, py);
						}
					},
				);
			} else {
				ellipseFilled(
					coords.sx,
					coords.sy,
					coords.width,
					coords.height,
					(px, py) => {
						if (px >= 0 && px < columns && py >= 0 && py < doubleRows) {
							State.toolPreview.drawHalfBlock(foreground, px, py);
						}
					},
				);
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
	if (outlineMode) {
		outlineToggle.setStateOne();
	} else {
		outlineToggle.setStateTwo();
	}

	return {
		enable: enable,
		disable: disable,
	};
};

const createSampleTool = async (
	shadeBrush,
	shadeElement,
	characterBrush,
	characterElement,
) => {
	const sample = async (x, halfBlockY) => {
		let block = State.textArtCanvas.getHalfBlock(x, halfBlockY);
		if (block.isBlocky) {
			if (block.halfBlockY === 0) {
				State.palette.setForegroundColor(block.upperBlockColor);
			} else {
				State.palette.setForegroundColor(block.lowerBlockColor);
			}
			Toolbar.returnToPreviousTool();
		} else {
			block = State.textArtCanvas.getBlock(block.x, Math.floor(block.y / 2));
			State.palette.setForegroundColor(block.foregroundColor);
			State.palette.setBackgroundColor(block.backgroundColor);
			if (block.charCode >= 176 && block.charCode <= 178) {
				shadeElement.click();
				await shadeBrush.select(block.charCode);
			} else {
				characterElement.click();
				await characterBrush.select(block.charCode);
			}
		}
	};

	const canvasDown = async e => {
		await sample(e.detail.x, e.detail.halfBlockY);
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

const createAttributeBrushController = () => {
	let isActive = false;
	let lastCoord = null;
	const bar = $('brushToolbar');
	const menu = $('aSize');
	let brushSize = 1;
	let previewCursor = null;
	let lastPreviewX = -1;
	let lastPreviewY = -1;

	const createPreviewCursor = () => {
		const cursor = createCanvas(0, 0);
		cursor.classList.add('cursor');
		cursor.style.pointerEvents = 'none';
		cursor.style.zIndex = '1000';
		$('canvasContainer').appendChild(cursor);
		return cursor;
	};

	const updatePreviewCursor = (x, y) => {
		if (!previewCursor) {
			return;
		}

		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		const size = Math.sqrt(brushSize);

		// Center the brush area around the cursor position
		const offsetCells = Math.floor(size / 2);
		const startX = x - offsetCells;
		const startY = y - offsetCells;

		previewCursor.width = size * fontWidth + 1;
		previewCursor.height = size * fontHeight + 1;
		previewCursor.style.left = startX * fontWidth - 1 + 'px';
		previewCursor.style.top = startY * fontHeight - 1 + 'px';

		// Draw border
		const ctx = previewCursor.getContext('2d');
		ctx.clearRect(0, 0, previewCursor.width, previewCursor.height);
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 1;
		ctx.strokeRect(0.5, 0.5, previewCursor.width - 1, previewCursor.height - 1);

		lastPreviewX = x;
		lastPreviewY = y;
	};

	const showPreview = () => {
		if (previewCursor) {
			previewCursor.style.display = 'block';
		}
	};

	const hidePreview = () => {
		if (previewCursor) {
			previewCursor.style.display = 'none';
		}
	};

	const paintAttribute = (x, y, altKey) => {
		const block = State.textArtCanvas.getBlock(x, y);
		const currentForeground = State.palette.getForegroundColor();
		const currentBackground = State.palette.getBackgroundColor();
		let newForeground, newBackground;

		if (altKey) {
			// Alt+click modifies background color only
			newForeground = block.foregroundColor;
			newBackground =
				currentForeground > 7 ? currentForeground - 8 : currentForeground;
		} else {
			// Normal click modifies both foreground and background colors
			newForeground = currentForeground;
			newBackground = currentBackground;
		}

		// Only update if something changes
		if (
			block.foregroundColor !== newForeground ||
			block.backgroundColor !== newBackground
		) {
			State.textArtCanvas.draw(callback => {
				callback(block.charCode, newForeground, newBackground, x, y);
			}, true);
		}
	};

	const paintArea = (centerX, centerY, altKey) => {
		const size = Math.sqrt(brushSize);
		const offsetCells = Math.floor(size / 2);
		const startX = centerX - offsetCells;
		const startY = centerY - offsetCells;
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();

		for (let dy = 0; dy < size; dy++) {
			for (let dx = 0; dx < size; dx++) {
				const targetX = startX + dx;
				const targetY = startY + dy;

				// Check bounds
				if (
					targetX >= 0 &&
					targetX < columns &&
					targetY >= 0 &&
					targetY < rows
				) {
					paintAttribute(targetX, targetY, altKey);
				}
			}
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
			paintArea(x, y, altKey);

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

	const canvasMove = e => {
		// Update preview position when mouse moves (not dragging)
		if (lastPreviewX !== e.detail.x || lastPreviewY !== e.detail.y) {
			updatePreviewCursor(e.detail.x, e.detail.y);
		}
	};

	const canvasDown = e => {
		State.textArtCanvas.startUndo();
		isActive = true;
		showPreview();
		updatePreviewCursor(e.detail.x, e.detail.y);

		if (e.detail.shiftKey && lastCoord) {
			// Shift+click draws a line from last point
			paintLine(
				lastCoord.x,
				lastCoord.y,
				e.detail.x,
				e.detail.y,
				e.detail.altKey,
			);
		} else {
			// Normal click paints area
			paintArea(e.detail.x, e.detail.y, e.detail.altKey);
		}

		lastCoord = { x: e.detail.x, y: e.detail.y };
	};

	const canvasDrag = e => {
		// Update preview during drag
		if (lastPreviewX !== e.detail.x || lastPreviewY !== e.detail.y) {
			updatePreviewCursor(e.detail.x, e.detail.y);
		}

		if (isActive && lastCoord) {
			paintLine(
				lastCoord.x,
				lastCoord.y,
				e.detail.x,
				e.detail.y,
				e.detail.altKey,
			);
			lastCoord = { x: e.detail.x, y: e.detail.y };
		}
	};

	const canvasUp = _ => {
		isActive = false;
	};

	const setBrushSize = size => {
		// Validate that size is a perfect square
		const sqrtSize = Math.sqrt(size);
		if (sqrtSize === Math.floor(sqrtSize)) {
			brushSize = size;
			if (lastPreviewX >= 0 && lastPreviewY >= 0) {
				updatePreviewCursor(lastPreviewX, lastPreviewY);
			}
		}
	};

	const getBrushSize = () => brushSize;

	const enable = () => {
		if (!previewCursor) {
			previewCursor = createPreviewCursor();
		}
		document.addEventListener('onTextCanvasMove', canvasMove);
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
		bar.style.display = 'flex';
		menu.style.display = 'flex';
		showPreview();
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasMove', canvasMove);
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		bar.style.display = 'none';
		menu.style.display = 'none';
		isActive = false;
		lastCoord = null;
		lastPreviewX = -1;
		lastPreviewY = -1;
		hidePreview();
		if (previewCursor) {
			previewCursor.remove();
			previewCursor = null;
		}
	};

	return {
		enable: enable,
		disable: disable,
		setBrushSize: setBrushSize,
		getBrushSize: getBrushSize,
	};
};

export {
	createPanelCursor,
	createFloatingPanel,
	createFloatingPanelPalette,
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
	createSampleTool,
};
