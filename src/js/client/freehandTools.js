import State from './state.js';
import { $, createCanvas, createSegmentedControl, iconHref } from './ui.js';
import Toolbar from './toolbar.js';
import { fitGlyphCanvas } from './glyphScale.js';
import {
	nuskoolCircleCells,
	nuskoolCircleFilledCells,
	oldskoolCircleCells,
	cellInRange,
	createAsciiStampEngine,
	isJunctionGlyph,
	junctionForTip,
} from '../core/index';
import { createAsciiStrokePainter } from './asciiBrush.js';

const createHalfBlockController = () => {
	let prev = {};
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
		nav.classList.add('enabled');
		State.toolSettings.hide();
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
	};
};

const createShadingController = (panel, charMode) => {
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
			reduce = true;
		}
	};

	const keyUp = e => {
		if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
			reduce = false;
		}
	};

	const calculateShadingCharacter = (x, y) => {
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

	// A pen picks its shade from pressure directly ("pen draws
	// with pressure"); finger and mouse keep the classic darken/lighten
	// cycle. Quartiles map onto the CP437 shade ramp.
	const shadeFromPressure = pressure => {
		if (pressure < 0.25) {
			return 176;
		}
		if (pressure < 0.5) {
			return 177;
		}
		if (pressure < 0.75) {
			return 178;
		}
		return 219;
	};

	const draw = coords => {
		const penPressure =
			!charMode &&
			coords.pointerType === 'pen' &&
			typeof coords.pressure === 'number' &&
			coords.pressure > 0
				? coords.pressure
				: null;
		const shadeAt = (x, y) =>
			penPressure !== null
				? shadeFromPressure(penPressure)
				: calculateShadingCharacter(x, y);
		if (
			prev.x !== coords.x ||
			prev.y !== coords.y ||
			prev.halfBlockY !== coords.halfBlockY
		) {
			if (Math.abs(prev.x - coords.x) > 1 || Math.abs(prev.y - coords.y) > 1) {
				State.textArtCanvas.draw(callback => {
					line(prev.x, prev.y, coords.x, coords.y, (x, y) => {
						callback(
							charMode ? drawMode.charCode : shadeAt(x, y),
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
						charMode ? drawMode.charCode : shadeAt(coords.x, coords.y),
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
		nav.classList.add('enabled');
		State.toolSettings.show(charMode ? 'character' : 'shading');
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('keydown', keyDown);
		document.removeEventListener('keyup', keyUp);
		panel.disable();
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

// the shade ramp the picker, the sampler, and the brush cycle share,
// lightest to solid
const SHADE_RAMP = [176, 177, 178, 219];

const createShadingPanel = async () => {
	let ignored = false;
	// 4 shade bands by 16 colors; the picked color IS the palette
	// foreground, so the panel keeps only the band
	let band = 0;
	const grid = document.createElement('DIV');
	grid.className = 'shadeGrid';
	const hint = document.createElement('SPAN');
	hint.className = 'settingHint';
	hint.innerText = 'hold shift to reduce';
	// chip references live here, never read back off the DOM
	const chips = [];

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

	const highlight = () => {
		const fg = State.palette.getForegroundColor();
		chips.forEach((chip, i) => {
			chip.btn.classList.toggle('enabled', i >> 4 === band && i % 16 === fg);
		});
	};

	const paintChips = async () => {
		const panelFont = await get1xFont();
		if (!panelFont) {
			return;
		}
		chips.forEach((chip, i) => {
			chip.canvas.width = panelFont.getWidth();
			chip.canvas.height = panelFont.getHeight();
			fitGlyphCanvas(chip.canvas);
			panelFont.draw(
				SHADE_RAMP[i >> 4],
				i % 16,
				0,
				chip.canvas.getContext('2d'),
				0,
				0,
			);
		});
		highlight();
	};

	for (let i = 0; i < 64; i++) {
		const btn = document.createElement('BUTTON');
		btn.type = 'button';
		btn.className = 'shadeChip';
		btn.setAttribute(
			'aria-label',
			`Shade ${SHADE_RAMP[i >> 4]} color ${i % 16}`,
		);
		const canvas = createCanvas(State.fontWidth, State.fontHeight);
		canvas.className = 'gc';
		btn.appendChild(canvas);
		btn.addEventListener('click', () => {
			band = i >> 4;
			State.palette.setForegroundColor(i % 16);
			highlight();
		});
		chips.push({ btn: btn, canvas: canvas });
		grid.appendChild(btn);
	}

	const keyDown = e => {
		if (ignored) {
			return;
		}
		const fg = State.palette.getForegroundColor();
		switch (e.code) {
			case 'ArrowLeft':
				e.preventDefault();
				if (fg > 0 && fg <= 15) {
					State.palette.setForegroundColor(fg - 1);
				}
				break;
			case 'ArrowRight':
				e.preventDefault();
				if (fg < 15) {
					State.palette.setForegroundColor(fg + 1);
				}
				break;
			case 'ArrowUp':
				e.preventDefault();
				band = Math.max(band - 1, 0);
				highlight();
				break;
			case 'ArrowDown':
				e.preventDefault();
				band = Math.min(band + 1, SHADE_RAMP.length - 1);
				highlight();
				break;
			default:
				break;
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
	};

	const ignore = () => {
		ignored = true;
	};

	const unignore = () => {
		ignored = false;
	};

	// fg and bg both ride the palette now; the band only steers what a
	// sample re-selects and what the picker highlights
	const getMode = () => ({
		halfBlockMode: false,
		foreground: State.palette.getForegroundColor(),
		background: State.palette.getBackgroundColor(),
		charCode: SHADE_RAMP[band],
	});

	/** the sample tool hands back a shade char to re-highlight */
	const select = async charCode => {
		const i = SHADE_RAMP.indexOf(charCode);
		if (i !== -1) {
			band = i;
		}
		highlight();
	};

	document.addEventListener('onForegroundChange', highlight);
	document.addEventListener('onPaletteChange', paintChips);
	document.addEventListener('onLetterSpacingChange', paintChips);
	document.addEventListener('onFontChange', paintChips);
	document.addEventListener('onXBFontLoaded', paintChips);
	document.addEventListener('onOpenedFile', paintChips);

	await paintChips();
	State.toolSettings.mount('shading', grid);
	State.toolSettings.mount('shading', hint);

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
	let selected = 219;
	const clampZoom = z => Math.min(Math.max(Math.round(z) || 1, 1), 4);
	let cellZoom = clampZoom(State.toolSettings.get('charCellSize', 1));
	let maxFloatH = State.toolSettings.get('charMapMaxH', 320);
	let cols = 16;
	let glyphW = State.fontWidth || 8;
	let glyphH = State.fontHeight || 16;

	const panelEl = $('toolSettings');
	const isFloating = () => panelEl?.classList.contains('fl') === true;

	const mapPanel = document.createElement('DIV');
	mapPanel.className = 'charMapPanel';
	const mapWrap = document.createElement('DIV');
	mapWrap.className = 'charMapWrap';
	const mapCanvas = createCanvas(0, 0);
	mapCanvas.className = 'charMap';
	mapWrap.appendChild(mapCanvas);
	const grip = document.createElement('I');
	grip.className = 'mapGrip';
	grip.title = 'Drag to resize';
	mapPanel.appendChild(mapWrap);
	mapPanel.appendChild(grip);

	const meta = document.createElement('DIV');
	meta.className = 'charMeta';
	const previewBox = document.createElement('DIV');
	previewBox.className = 'charPreview';
	const previewCanvas = createCanvas(glyphW, glyphH);
	previewCanvas.className = 'gc';
	const previewLabel = document.createElement('SPAN');
	previewBox.appendChild(previewCanvas);
	previewBox.appendChild(previewLabel);
	const sizeBox = document.createElement('DIV');
	sizeBox.className = 'cellSize';
	const makeZoomButton = (label, cls) => {
		const btn = document.createElement('BUTTON');
		btn.type = 'button';
		btn.className = cls;
		btn.title = label;
		btn.setAttribute('aria-label', label);
		return btn;
	};
	const smaller = makeZoomButton('Smaller cells', 'zoomGlyph');
	const bigger = makeZoomButton('Bigger cells', 'zoomGlyph plus');
	const eye = document.createElement('SPAN');
	{
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('aria-hidden', 'true');
		const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
		use.setAttribute('href', iconHref('eye'));
		svg.appendChild(use);
		eye.appendChild(svg);
	}
	eye.title = `Cell size ${cellZoom}x`;
	sizeBox.appendChild(smaller);
	sizeBox.appendChild(eye);
	sizeBox.appendChild(bigger);
	meta.appendChild(previewBox);
	meta.appendChild(sizeBox);

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

	const drawPreview = async () => {
		const panelFont = await get1xFont();
		if (!panelFont) {
			return;
		}
		previewCanvas.width = panelFont.getWidth();
		previewCanvas.height = panelFont.getHeight();
		fitGlyphCanvas(previewCanvas);
		panelFont.draw(
			selected,
			State.palette.getForegroundColor(),
			State.palette.getBackgroundColor(),
			previewCanvas.getContext('2d'),
			0,
			0,
		);
		previewLabel.innerText = `#${selected}`;
	};

	const sizeWindow = () => {
		if (isFloating()) {
			// the window follows the zoomed map up to the user's maximum
			mapWrap.style.height = `${Math.min(
				mapCanvas.height * cellZoom,
				maxFloatH,
			)}px`;
		} else {
			// docked: the 1x height of the full set at this width, so 1x
			// always fits exactly and zooming scrolls inside
			const width = mapWrap.clientWidth || 200;
			const cols1x = Math.min(Math.max(Math.floor(width / glyphW), 1), 256);
			mapWrap.style.height = `${Math.ceil(256 / cols1x) * glyphH}px`;
		}
	};

	// the map is 1x in the backing store, cells packed edge to edge; CSS
	// scales it by the cell zoom so glyph pixels stay whole multiples
	const drawMap = async () => {
		const panelFont = await get1xFont();
		if (!panelFont) {
			return;
		}
		glyphW = panelFont.getWidth();
		glyphH = panelFont.getHeight();
		const width = mapWrap.clientWidth || 200;
		const z = cellZoom;
		cols = Math.min(Math.max(Math.floor(width / (glyphW * z)), 1), 256);
		const rows = Math.ceil(256 / cols);
		mapCanvas.width = cols * glyphW;
		mapCanvas.height = rows * glyphH;
		mapCanvas.style.width = `${mapCanvas.width * z}px`;
		mapCanvas.style.height = `${mapCanvas.height * z}px`;
		const ctx = mapCanvas.getContext('2d');
		const fg = State.palette.getForegroundColor();
		const bg = State.palette.getBackgroundColor();
		for (let i = 0; i < 256; i++) {
			ctx.putImageData(
				panelFont.getGlyph(i, fg, bg),
				(i % cols) * glyphW,
				Math.floor(i / cols) * glyphH,
			);
		}
		// cells pack edge to edge, so the ring draws inside its cell
		ctx.strokeStyle = '#22d3ee';
		ctx.lineWidth = 1;
		ctx.strokeRect(
			(selected % cols) * glyphW + 0.5,
			Math.floor(selected / cols) * glyphH + 0.5,
			glyphW - 1,
			glyphH - 1,
		);
		sizeWindow();
	};

	const select = async charCode => {
		selected = Math.min(Math.max(charCode, 0), 255);
		await drawMap();
		await drawPreview();
	};

	mapCanvas.addEventListener('click', e => {
		const rect = mapCanvas.getBoundingClientRect();
		if (!rect.width || !rect.height) {
			return;
		}
		const px = ((e.clientX - rect.left) / rect.width) * mapCanvas.width;
		const py = ((e.clientY - rect.top) / rect.height) * mapCanvas.height;
		const x = Math.floor(px / glyphW);
		const y = Math.floor(py / glyphH);
		const charCode = y * cols + x;
		if (x < cols && charCode < 256) {
			select(charCode);
		}
	});

	const setZoom = z => {
		cellZoom = clampZoom(z);
		State.toolSettings.set('charCellSize', cellZoom);
		eye.title = `Cell size ${cellZoom}x`;
		drawMap();
	};
	smaller.addEventListener('click', () => setZoom(cellZoom - 1));
	bigger.addEventListener('click', () => setZoom(cellZoom + 1));

	// floating only (CSS hides it docked): width rides the panel
	// manager, the height cap stays with the map
	let gripDrag = null;
	grip.addEventListener('pointerdown', e => {
		e.preventDefault();
		e.stopPropagation();
		gripDrag = {
			x: e.clientX,
			y: e.clientY,
			h: mapWrap.offsetHeight,
			w: panelEl?.offsetWidth || 300,
		};
		try {
			grip.setPointerCapture(e.pointerId);
		} catch {
			// no capture: moves that still bubble here keep resizing
		}
	});
	grip.addEventListener('pointermove', e => {
		if (!gripDrag) {
			return;
		}
		maxFloatH = Math.min(
			Math.max(Math.round(gripDrag.h + e.clientY - gripDrag.y), 48),
			Math.max(48, window.innerHeight - 140),
		);
		State.panels?.setFloatWidth('tool', gripDrag.w + e.clientX - gripDrag.x);
		drawMap();
	});
	const gripEnd = () => {
		if (gripDrag) {
			gripDrag = null;
			State.toolSettings.set('charMapMaxH', maxFloatH);
		}
	};
	grip.addEventListener('pointerup', gripEnd);
	grip.addEventListener('pointercancel', gripEnd);

	const keyDown = e => {
		if (ignored) {
			return;
		}
		let next = selected;
		switch (e.code) {
			case 'ArrowLeft':
				next = Math.max(selected - 1, 0);
				break;
			case 'ArrowRight':
				next = Math.min(selected + 1, 255);
				break;
			case 'ArrowUp':
				next = selected - cols;
				break;
			case 'ArrowDown':
				next = selected + cols;
				break;
			default:
				return;
		}
		e.preventDefault();
		if (next >= 0 && next <= 255) {
			select(next);
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		refresh();
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
	};

	const getMode = () => ({
		halfBlockMode: false,
		foreground: State.palette.getForegroundColor(),
		background: State.palette.getBackgroundColor(),
		charCode: selected,
	});

	const ignore = () => {
		ignored = true;
	};

	const unignore = () => {
		ignored = false;
	};

	const refresh = () => {
		drawMap();
		drawPreview();
	};

	const redrawGlyphs = () => {
		// a font swap streams glyph data in; measure after it settles
		setTimeout(refresh, 500);
	};

	document.addEventListener('onForegroundChange', refresh);
	document.addEventListener('onBackgroundChange', refresh);
	document.addEventListener('onLetterSpacingChange', refresh);
	document.addEventListener('onFontChange', redrawGlyphs);
	document.addEventListener('onPaletteChange', refresh);
	document.addEventListener('onXBFontLoaded', redrawGlyphs);
	document.addEventListener('onOpenedFile', redrawGlyphs);
	// float vs dock changes which height rule applies
	document.addEventListener('onPanelLayout', sizeWindow);
	if (window.ResizeObserver) {
		new window.ResizeObserver(() => {
			if (mapWrap.clientWidth) {
				drawMap();
			}
		}).observe(mapWrap);
	}

	State.toolSettings.mount('character', mapPanel);
	State.toolSettings.mount('character', meta);
	await refresh();

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
	// fill lives in the brush submenu, so like its siblings it keeps
	// the bar open and the brushes nav lit while active
	const nav = $('brushes');
	const fillPoint = e => {
		// a seed outside the document floods a phantom wrapped row; the
		// pointer clamps downs now, but the seed must never trust it
		// (a blank read for the phantom cell would still seed a flood)
		if (
			!cellInRange(
				e.detail.x,
				e.detail.halfBlockY,
				State.textArtCanvas.getColumns(),
				State.textArtCanvas.getRows() * 2,
			)
		) {
			return;
		}
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

				// mirror mode: seed the mirrored position too when it matches
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
		nav.classList.add('enabled');
		State.toolSettings.hide();
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasDown', fillPoint);
		nav.classList.remove('enabled');
	};

	return {
		enable: enable,
		disable: disable,
	};
};

// a ruled path replayed as a synthetic brush stroke: dense samples in
// half-block space keep the engine on a deterministic walk, so the
// same shape always voices the same glyphs and the ghost is exactly
// what a commit produces
const asciiStrokeCells = (points, width) => {
	const engine = createAsciiStampEngine({
		width: width,
		// ruled shapes end square, no calligraphic swoop
		swoop: false,
	});
	const out = [];
	points.forEach(([x, hb], i) => {
		const cells =
			i === 0
				? engine.begin(x, Math.floor(hb / 2), hb % 2)
				: engine.move(x, Math.floor(hb / 2), hb % 2);
		out.push(...cells);
	});
	out.push(...engine.end());
	return out;
};

// a shape's edges and arcs always end against its own geometry, so a
// tip or root junction probe can only misread nearby art: a bar that
// starts one cell past a crossed line loses its first cell to the
// snap-back meant for touch down overshoot, breaking the shape. the
// stroke metadata comes off and crossings voice through the merge
// tables instead
const shapeStrokeCells = (points, width) => {
	return asciiStrokeCells(points, width).map(cell => {
		if (cell.tip || cell.root) {
			return { x: cell.x, y: cell.y, charCode: cell.charCode };
		}
		return cell;
	});
};

const hPathPoints = (x0, x1, hb) => {
	const points = [];
	for (let x = x0; x <= x1; x++) {
		points.push([x, hb]);
	}
	return points;
};

const vPathPoints = (x, hb0, hb1) => {
	const points = [];
	for (let hb = hb0; hb <= hb1; hb++) {
		points.push([x, hb]);
	}
	return points;
};

// the three shape vocabularies, each with a glyph taste of itself
const SHAPE_MODES = [
	{ value: 'block', label: 'Block', glyph: '▀▄▀' },
	{ value: 'oldskool', label: 'Old Skool', glyph: '.-\'' },
	{ value: 'nuskool', label: 'Nu Skool', glyph: ',d$P' },
];

// a labeled control row in the tool settings window; the row keeps the
// pair together so a bar can lay them out side by side
const mountSetting = (section, text, element) => {
	const row = document.createElement('DIV');
	row.className = 'settingRow';
	const label = document.createElement('LABEL');
	label.innerText = text;
	row.appendChild(label);
	row.appendChild(element);
	State.toolSettings.mount(section, row);
};

const createLineController = () => {
	const nav = $('shapes');
	const painter = createAsciiStrokePainter();
	let startXY;
	let endXY;

	const modeControl = createSegmentedControl('lineMode', SHAPE_MODES, mode =>
		State.toolSettings.set('lineMode', mode));
	mountSetting('line', 'Mode', modeControl.getElement());
	modeControl.set(State.toolSettings.get('lineMode', 'block'));

	// the mode latches at down: a select touched mid drag must not
	// commit a different vocabulary than the ghost showed
	let dragMode;

	const asciiMode = () => dragMode === 'oldskool' || dragMode === 'nuskool';

	const canvasDown = e => {
		startXY = e.detail;
		endXY = undefined;
		dragMode = modeControl.value();
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

	const asciiLineCells = (x0, y0, x1, y1) => {
		const points = [];
		line(x0, y0, x1, y1, (x, hb) => {
			points.push([x, hb]);
		});
		return asciiStrokeCells(points, dragMode === 'nuskool' ? 2 : 1);
	};

	const canvasUp = () => {
		if (startXY) {
			State.toolPreview.clear();
			const endPoint = endXY || startXY;
			State.textArtCanvas.startUndo();
			if (asciiMode()) {
				painter.begin();
				painter.commit(
					asciiLineCells(
						startXY.x,
						startXY.halfBlockY,
						endPoint.x,
						endPoint.halfBlockY,
					),
				);
			} else {
				const foreground = State.palette.getForegroundColor();
				State.textArtCanvas.drawHalfBlock(draw => {
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
			}
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
				if (asciiMode()) {
					painter.begin();
					const ghost = painter.preview(
						asciiLineCells(
							startXY.x,
							startXY.halfBlockY,
							endXY.x,
							endXY.halfBlockY,
						),
					);
					for (const g of ghost) {
						State.toolPreview.drawGlyph(g.charCode, g.fg, g.x, g.y);
					}
				} else {
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
		}
	};

	const enable = () => {
		nav.classList.add('enabled');
		State.toolSettings.show('line');
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
	};

	const disable = () => {
		nav.classList.remove('enabled');
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		// a tool switch mid drag never sees the up: stale corners would
		// commit a phantom shape on the next tap
		startXY = undefined;
		endXY = undefined;
		State.toolPreview.clear();
	};

	return {
		enable: enable,
		disable: disable,
	};
};

// old skool ruled squares wear soft corners in both edge halves: period
// shoulders up top, backtick and quote feet below. the r/7/L/J family
// stays reserved for junctions against other lines, where the stem
// has an existing stroke to hook into
const SQUARE_CORNERS = {
	top: [46, 46],
	bottom: [96, 39],
};

const createSquareController = () => {
	const tsSection = 'square';
	const nav = $('shapes');
	const painter = createAsciiStrokePainter();
	let startXY;
	let endXY;
	let outlineMode = true;

	const fillControl = createSegmentedControl(
		tsSection + 'Fill',
		[
			{ value: 'outline', label: 'Outline' },
			{ value: 'filled', label: 'Filled' },
		],
		fill => {
			outlineMode = fill === 'outline';
			State.toolSettings.set(tsSection + 'Fill', fill);
		},
	);

	// old skool has no fill vocabulary: any fill char reads nu skool,
	// so the fill pair naps while the mode offers none, and the
	// persisted choice returns when it does
	const syncFill = () => {
		const noFill = modeControl.value() === 'oldskool';
		fillControl.setEnabled(!noFill);
		const fill = noFill
			? 'outline'
			: State.toolSettings.get(tsSection + 'Fill', 'outline');
		fillControl.set(fill);
		outlineMode = fill === 'outline';
	};

	const modeControl = createSegmentedControl(
		tsSection + 'Mode',
		SHAPE_MODES,
		mode => {
			State.toolSettings.set(tsSection + 'Mode', mode);
			syncFill();
		},
	);
	mountSetting(tsSection, 'Mode', modeControl.getElement());
	mountSetting(tsSection, 'Style', fillControl.getElement());
	modeControl.set(State.toolSettings.get(tsSection + 'Mode', 'block'));
	syncFill();

	// mode and fill latch at down: a select or pill touched mid drag
	// must not commit a different shape than the ghost showed
	let dragMode;
	let dragOutline = true;

	const asciiMode = () => dragMode === 'oldskool' || dragMode === 'nuskool';

	const originalCode = (x, y) => {
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		if (!cellInRange(x, y, columns, rows)) {
			return 0;
		}
		return State.textArtCanvas.getBlock(x, y).charCode;
	};

	// a corner landing on an existing line voices the tip vocabulary
	// instead of melting into the heavier ink: the box's bar is the
	// stem, hanging below top corners and rising above bottom ones.
	// a voiced pick is a deliberate junction and marks itself so the
	// painter draws it raw: the weight tables would eat a period knot
	// on the underscore that earned it
	const cornerCell = (x, cy, dy, plain) => {
		const glyph = junctionForTip(
			{ dx: 0, dy: dy, cls: 'vertical' },
			originalCode(x, cy),
			originalCode(x - 1, cy),
			originalCode(x + 1, cy),
		);
		if (glyph) {
			return { x: x, y: cy, charCode: glyph, joint: true };
		}
		return { x: x, y: cy, charCode: plain };
	};

	// terminal glyphs a second touch must not escalate: a plus joint
	// over a standing T would densify to X through the merge
	const TERMINALS = [84, 55, 114, 74, 76];

	// an existing bar ending flush against an edge row reconnects;
	// plain dashes would bury the contact. bars crossing the row and
	// standing junctions already voice through the merge tables
	const edgeJoints = (xa, xb, cy) => {
		const joints = [];
		for (let x = xa; x <= xb; x++) {
			const own = originalCode(x, cy);
			if (own === 124 || isJunctionGlyph(own) || TERMINALS.includes(own)) {
				continue;
			}
			if (originalCode(x, cy - 1) === 124) {
				joints.push({ x: x, y: cy, charCode: 43, joint: true });
			} else if (originalCode(x, cy + 1) === 124) {
				joints.push({ x: x, y: cy, charCode: 84, joint: true });
			}
		}
		return joints;
	};

	const asciiSquareCells = coords => {
		let { x0, x1 } = coords;
		let cy0 = Math.floor(coords.y0 / 2);
		let cy1 = Math.floor(coords.y1 / 2);
		// a box needs a distinct line on every side: a drag inside one
		// cell row or column grows one instead of flattening into a
		// bare edge or a capped bar
		if (cy1 === cy0) {
			if (cy1 + 1 < State.textArtCanvas.getRows()) {
				cy1 += 1;
			} else {
				cy0 -= 1;
			}
		}
		if (x1 === x0) {
			if (x1 + 1 < State.textArtCanvas.getColumns()) {
				x1 += 1;
			} else {
				x0 -= 1;
			}
		}
		const cells = [];
		if (dragMode === 'nuskool') {
			if (!dragOutline) {
				// a filled ribbon square is a solid slab; the rim is the
				// same fill ink so no outline pass is needed
				for (let cy = cy0; cy <= cy1; cy++) {
					for (let x = x0; x <= x1; x++) {
						cells.push({ x: x, y: cy, charCode: 36 });
					}
				}
				return cells;
			}
			// full length edges overlap at the corners and merge solid;
			// the right path column pulls in one so the 2 wide ribbon
			// stays inside the drag rect
			const rightX = Math.max(x1 - 1, x0);
			cells.push(...shapeStrokeCells(vPathPoints(x0, cy0 * 2, cy1 * 2 + 1), 2));
			if (rightX !== x0) {
				cells.push(
					...shapeStrokeCells(vPathPoints(rightX, cy0 * 2, cy1 * 2 + 1), 2),
				);
			}
			cells.push(...shapeStrokeCells(hPathPoints(x0, x1, cy0 * 2), 2));
			cells.push(...shapeStrokeCells(hPathPoints(x0, x1, cy1 * 2), 2));
			return cells;
		}
		// old skool: edges run between the corner cells and the corner glyphs
		// land last so they win their cells. both edges ride the upper
		// half and voice dashes: per half voicing let stacked boxes land
		// an underscore on a hyphen and densify the shared line to an
		// equals sign. a path of one cell skips the engine, whose lone
		// tap stamps an apostrophe pebble instead of line ink
		if (x1 - 1 >= x0 + 1) {
			if (x1 - 1 === x0 + 1) {
				cells.push({ x: x0 + 1, y: cy0, charCode: 45 });
				cells.push({ x: x0 + 1, y: cy1, charCode: 45 });
			} else {
				cells.push(
					...shapeStrokeCells(hPathPoints(x0 + 1, x1 - 1, cy0 * 2), 1),
				);
				cells.push(
					...shapeStrokeCells(hPathPoints(x0 + 1, x1 - 1, cy1 * 2), 1),
				);
			}
			cells.push(...edgeJoints(x0 + 1, x1 - 1, cy0));
			cells.push(...edgeJoints(x0 + 1, x1 - 1, cy1));
		}
		const barTop = (cy0 + 1) * 2;
		const barBottom = cy1 * 2 - 1;
		if (barBottom >= barTop) {
			if (Math.floor(barBottom / 2) === Math.floor(barTop / 2)) {
				cells.push({ x: x0, y: Math.floor(barTop / 2), charCode: 124 });
				cells.push({ x: x1, y: Math.floor(barTop / 2), charCode: 124 });
			} else {
				cells.push(...shapeStrokeCells(vPathPoints(x0, barTop, barBottom), 1));
				cells.push(...shapeStrokeCells(vPathPoints(x1, barTop, barBottom), 1));
			}
		}
		const [tl, tr] = SQUARE_CORNERS.top;
		const [bl, br] = SQUARE_CORNERS.bottom;
		cells.push(cornerCell(x0, cy0, -1, tl));
		cells.push(cornerCell(x0, cy1, 1, bl));
		cells.push(cornerCell(x1, cy0, -1, tr));
		cells.push(cornerCell(x1, cy1, 1, br));
		return cells;
	};

	const canvasDown = e => {
		startXY = e.detail;
		endXY = undefined;
		dragMode = modeControl.value();
		dragOutline = outlineMode;
	};

	const processCoords = () => {
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
		// a color sample tap fires an up without a down
		if (startXY === undefined) {
			return;
		}
		State.toolPreview.clear();
		const coords = processCoords();
		State.textArtCanvas.startUndo();
		if (asciiMode()) {
			painter.begin();
			painter.commit(asciiSquareCells(coords));
			startXY = undefined;
			endXY = undefined;
			return;
		}
		const foreground = State.palette.getForegroundColor();
		State.textArtCanvas.drawHalfBlock(draw => {
			if (dragOutline) {
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
		if (startXY !== undefined && hasEndPointChanged(e.detail, endXY || startXY)) {
			if (endXY !== undefined) {
				State.toolPreview.clear();
			}
			endXY = e.detail;
			const coords = processCoords();
			if (asciiMode()) {
				painter.begin();
				const ghost = painter.preview(asciiSquareCells(coords));
				for (const g of ghost) {
					State.toolPreview.drawGlyph(g.charCode, g.fg, g.x, g.y);
				}
				return;
			}
			const foreground = State.palette.getForegroundColor();
			if (dragOutline) {
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
		nav.classList.add('enabled');
		syncFill();
		State.toolSettings.show(tsSection);
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
	};

	const disable = () => {
		nav.classList.remove('enabled');
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		// a tool switch mid drag never sees the up: stale corners would
		// commit a phantom shape on the next tap
		startXY = undefined;
		endXY = undefined;
		State.toolPreview.clear();
	};

	return {
		enable: enable,
		disable: disable,
	};
};

const createCircleController = () => {
	const tsSection = 'circle';
	const nav = $('shapes');
	const painter = createAsciiStrokePainter();
	let startXY;
	let endXY;
	let outlineMode = true;

	const fillControl = createSegmentedControl(
		tsSection + 'Fill',
		[
			{ value: 'outline', label: 'Outline' },
			{ value: 'filled', label: 'Filled' },
		],
		fill => {
			outlineMode = fill === 'outline';
			State.toolSettings.set(tsSection + 'Fill', fill);
		},
	);

	// old skool has no fill vocabulary: any fill char reads nu skool,
	// so the fill pair naps while the mode offers none, and the
	// persisted choice returns when it does
	const syncFill = () => {
		const noFill = modeControl.value() === 'oldskool';
		fillControl.setEnabled(!noFill);
		const fill = noFill
			? 'outline'
			: State.toolSettings.get(tsSection + 'Fill', 'outline');
		fillControl.set(fill);
		outlineMode = fill === 'outline';
	};

	const modeControl = createSegmentedControl(
		tsSection + 'Mode',
		SHAPE_MODES,
		mode => {
			State.toolSettings.set(tsSection + 'Mode', mode);
			syncFill();
		},
	);
	mountSetting(tsSection, 'Mode', modeControl.getElement());
	mountSetting(tsSection, 'Style', fillControl.getElement());
	modeControl.set(State.toolSettings.get(tsSection + 'Mode', 'block'));
	syncFill();

	// mode and fill latch at down: a select or pill touched mid drag
	// must not commit a different vocabulary than the ghost showed
	let dragMode;
	let dragOutline = true;

	const asciiMode = () => dragMode === 'oldskool' || dragMode === 'nuskool';

	const asciiEllipseCells = coords => {
		let cells;
		if (dragMode === 'nuskool') {
			const { sx, sy, width, height } = coords;
			cells = dragOutline
				? nuskoolCircleCells(sx, sy, width, height)
				: nuskoolCircleFilledCells(sx, sy, width, height);
		} else {
			cells = oldskoolCircleCells(
				coords.x0,
				coords.yTop,
				coords.boxW,
				coords.boxH,
			);
		}
		// grown boxes and tiny templates can poke past the canvas; shifted
		// whole they stay closed rings instead of losing walls and caps to
		// the range guards
		if (cells.length === 0) {
			return cells;
		}
		let minX = Infinity;
		let maxX = -Infinity;
		let minY = Infinity;
		let maxY = -Infinity;
		for (const c of cells) {
			minX = Math.min(minX, c.x);
			maxX = Math.max(maxX, c.x);
			minY = Math.min(minY, c.y);
			maxY = Math.max(maxY, c.y);
		}
		const cols = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const dx = minX < 0 ? -minX : Math.min(0, cols - 1 - maxX);
		const dy = minY < 0 ? -minY : Math.min(0, rows - 1 - maxY);
		if (dx === 0 && dy === 0) {
			return cells;
		}
		return cells.map(c => ({ x: c.x + dx, y: c.y + dy, charCode: c.charCode }));
	};

	const canvasDown = e => {
		startXY = e.detail;
		endXY = undefined;
		dragMode = modeControl.value();
		dragOutline = outlineMode;
	};

	const processCoords = () => {
		const endPoint = endXY || startXY;
		// box drag like the square tool next door: the drag rect IS the
		// circle's box. old skool fills it exactly, both width parities;
		// block and nu skool keep their center anchored odd grammars and
		// inscribe inside it
		const x0 = Math.min(startXY.x, endPoint.x);
		const x1 = Math.max(startXY.x, endPoint.x);
		const hb0 = Math.min(startXY.halfBlockY, endPoint.halfBlockY);
		const hb1 = Math.max(startXY.halfBlockY, endPoint.halfBlockY);
		const rx = (x1 - x0) >> 1;
		const rhb = (hb1 - hb0) >> 1;
		return {
			sx: x0 + rx,
			sy: hb0 + rhb,
			width: rx,
			height: rhb,
			x0: x0,
			yTop: Math.floor(hb0 / 2),
			boxW: x1 - x0 + 1,
			boxH: Math.floor(hb1 / 2) - Math.floor(hb0 / 2) + 1,
		};
	};

	const ellipseOutline = (sx, sy, width, height, callback) => {
		// a zero radius spins the bresenham walk forever (0 <= 0 never
		// breaks); sub cell drags plot their bar directly
		if (width <= 0 || height <= 0) {
			for (let px = -width; px <= width; px++) {
				for (let py = -height; py <= height; py++) {
					callback(sx + px, sy + py);
				}
			}
			return;
		}
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
		// same zero radius guard as the outline walk
		if (width <= 0 || height <= 0) {
			for (let px = -width; px <= width; px++) {
				for (let py = -height; py <= height; py++) {
					callback(sx + px, sy + py);
				}
			}
			return;
		}
		const a2 = width * width;
		const b2 = height * height;
		const fa2 = 4 * a2;
		const fb2 = 4 * b2;
		for (
			let px = 0, py = height, sigma = 2 * b2 + a2 * (1 - 2 * height);
			b2 * px <= a2 * py;
			px += 1
		) {
			// through the rim column: px * 2 stopped one short of the right
			// wall and skipped the apexes entirely at px = 0
			const amount = px * 2 + 1;
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
			// through the rim column: px * 2 stopped one short of the right
			// wall and skipped the apexes entirely at px = 0
			const amount = px * 2 + 1;
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
		// a color sample tap fires an up without a down
		if (startXY === undefined) {
			return;
		}
		State.toolPreview.clear();
		const coords = processCoords();
		State.textArtCanvas.startUndo();
		if (asciiMode()) {
			painter.begin();
			painter.commit(asciiEllipseCells(coords));
			startXY = undefined;
			endXY = undefined;
			return;
		}
		const foreground = State.palette.getForegroundColor();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const doubleRows = rows * 2;
		State.textArtCanvas.drawHalfBlock(draw => {
			if (dragOutline) {
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
		if (startXY !== undefined && hasEndPointChanged(e.detail, endXY || startXY)) {
			if (endXY !== undefined) {
				State.toolPreview.clear();
			}
			endXY = e.detail;
			const coords = processCoords();
			if (asciiMode()) {
				painter.begin();
				const ghost = painter.preview(asciiEllipseCells(coords));
				for (const g of ghost) {
					State.toolPreview.drawGlyph(g.charCode, g.fg, g.x, g.y);
				}
				return;
			}
			const foreground = State.palette.getForegroundColor();
			const columns = State.textArtCanvas.getColumns();
			const rows = State.textArtCanvas.getRows();
			const doubleRows = rows * 2;
			if (dragOutline) {
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
		nav.classList.add('enabled');
		syncFill();
		State.toolSettings.show(tsSection);
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasUp', canvasUp);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
	};

	const disable = () => {
		nav.classList.remove('enabled');
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasUp', canvasUp);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		// a tool switch mid drag never sees the up: stale corners would
		// commit a phantom shape on the next tap
		startXY = undefined;
		endXY = undefined;
		State.toolPreview.clear();
	};

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
		State.toolSettings.hide();
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
	let brushSize = 1;
	let previewCursor = null;
	let lastPreviewX = -1;
	let lastPreviewY = -1;

	const createPreviewCursor = () => {
		const cursor = createCanvas(0, 0);
		// the cursor class carries the canvas overlay band z; anything
		// higher would paint over app chrome (flyouts sit at 200)
		cursor.classList.add('cursor');
		cursor.style.pointerEvents = 'none';
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
			// Alt+click modifies background color only (the -8 fold is
			// classic16 semantics; extended color words pass through)
			newForeground = block.foregroundColor;
			newBackground =
				currentForeground > 7 && currentForeground <= 15
					? currentForeground - 8
					: currentForeground;
		} else {
			// Normal click modifies both foreground and background colors
			newForeground = currentForeground;
			newBackground = currentBackground;
		}

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
			paintArea(e.detail.x, e.detail.y, e.detail.altKey);
		}

		lastCoord = { x: e.detail.x, y: e.detail.y };
	};

	const canvasDrag = e => {
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

	// the slider speaks 1-16; the brush itself wants the squared cell
	// count its validator expects
	const sizeSlider = document.createElement('INPUT');
	sizeSlider.type = 'range';
	sizeSlider.id = 'attribSize';
	sizeSlider.min = '1';
	sizeSlider.max = '16';
	const sizeReadout = document.createElement('OUTPUT');
	const applySize = n => {
		sizeSlider.value = String(n);
		sizeReadout.innerText = String(n);
		setBrushSize(n * n);
	};
	sizeSlider.addEventListener('input', () => {
		const n = parseInt(sizeSlider.value, 10) || 1;
		applySize(n);
		State.toolSettings.set('attribSize', n);
	});
	// the readout rides the heading, so the label is built by hand
	const sizeLabel = document.createElement('LABEL');
	sizeLabel.innerText = 'Size';
	sizeLabel.appendChild(sizeReadout);
	const sizeRow = document.createElement('DIV');
	sizeRow.className = 'settingRow';
	sizeRow.appendChild(sizeLabel);
	sizeRow.appendChild(sizeSlider);
	State.toolSettings.mount('attrib', sizeRow);
	applySize(State.toolSettings.get('attribSize', 1));

	const enable = () => {
		if (!previewCursor) {
			previewCursor = createPreviewCursor();
		}
		document.addEventListener('onTextCanvasMove', canvasMove);
		document.addEventListener('onTextCanvasDown', canvasDown);
		document.addEventListener('onTextCanvasDrag', canvasDrag);
		document.addEventListener('onTextCanvasUp', canvasUp);
		State.toolSettings.show('attrib');
		showPreview();
	};

	const disable = () => {
		document.removeEventListener('onTextCanvasMove', canvasMove);
		document.removeEventListener('onTextCanvasDown', canvasDown);
		document.removeEventListener('onTextCanvasDrag', canvasDrag);
		document.removeEventListener('onTextCanvasUp', canvasUp);
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
	createHalfBlockController,
	createShadingController,
	createShadingPanel,
	createCharacterBrushPanel,
	createFillController,
	createLineController,
	createSquareController,
	createCircleController,
	createAttributeBrushController,
	createSampleTool,
};
