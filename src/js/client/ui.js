import State from './state.js';
import { loadFontFromXBData } from './font.js';
import { getZoomController } from './zoom.js';
import { mirrorCharCode } from '../core/index';

// Utilities for DOM manipulation
const D = document,
			$ = D.getElementById.bind(D),
			$$ = D.querySelector.bind(D),
			$$$ = D.querySelectorAll.bind(D),
			has = (i, c) => !!i && i.classList.contains(c),
			classList = (el, className, add = true) => {
				if (!el || !el.classList) {
					return;
				}
				add ? el.classList.add(className) : el.classList.remove(className);
			};

const createCanvas = (width, height) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

const toggleFullscreen = () => {
	const isFullscreenEnabled =
		document.fullscreenEnabled || document.webkitFullscreenEnabled;

	if (!isFullscreenEnabled) {
		console.warn('[UI] Fullscreen not supported');
		$('fullscreen').classList.add('disabled');
		return;
	}

	try {
		const fullscreenElement =
			document.fullscreenElement ||
			document.webkitFullscreenElement ||
			document.webkitCurrentFullScreenElement; // Safari specific

		if (fullscreenElement) {
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			} else if (document.webkitCancelFullScreen) {
				document.webkitCancelFullScreen(); // Older Safari
			}
		} else {
			const element = document.documentElement;

			if (element.requestFullscreen) {
				element.requestFullscreen();
			} else if (element.webkitRequestFullscreen) {
				element.webkitRequestFullscreen();
			} else if (element.webkitRequestFullScreen) {
				element.webkitRequestFullScreen(); // Older Safari (capital S)
			}
		}
	} catch {
		console.error('[UI] Failed toggling fullscreen mode');
	}
};

// Modal
const createModalController = modal => {
	const modals = [
		$('aboutModal'),
		$('resizeModal'),
		$('fontsModal'),
		$('sauceModal'),
		$('charsetModal'),
		$('exportModal'),
		$('artpacksModal'),
		$('sixteenModal'),
		$('arenaModal'),
		$('archiveModal'),
		$('pluginModal'),
		$('choiceModal'),
		$('updateModal'),
		$('loadingModal'),
		$('warningModal'),
		$('tutorialsModal'),
	];
	let current = false;
	let closingTimeout = null;
	let transitionHandler = null;
	let backdropHandler = null;
	let cleanupHandler = null;
	let focus = () => {};
	let blur = () => {};

	const cancelPendingClose = () => {
		if (closingTimeout) {
			clearTimeout(closingTimeout);
			closingTimeout = null;
		}
		if (transitionHandler) {
			modal.removeEventListener('transitionend', transitionHandler);
			transitionHandler = null;
		}
	};

	const focusEvents = (onFocus, onBlur) => {
		focus = onFocus;
		blur = onBlur;
	};

	const currentScreen = () => current;

	const clear = () => modals.forEach(s => classList(s, 'hide'));

	const open = name => {
		current = name;
		const section = name + 'Modal';
		if ($(section)) {
			// cancel current close event
			if (closingTimeout || transitionHandler) {
				cancelPendingClose();
				classList(modal, 'closing', false);
			}
			clear();
			focus();
			classList($(section), 'hide', false);
			modal.showModal();
			// the old backdrop handler must go first: stacked copies make
			// one backdrop tap run close() several times over
			if (typeof backdropHandler === 'function') {
				backdropHandler();
				backdropHandler = null;
			}
			if (name !== 'update') {
				backdropHandler = onClick(modal, e => {
					if (e.target === modal) {
						close();
					}
				});
			}
		} else {
			error(`Unknown modal: <kbd>#{section}</kbd>`);
			console.error(`Unknown modal: <kbd>#{section}</kbd>`);
		}
	};

	const queued = () => {
		let i = 0;
		modals.forEach(s => {
			if (has(s, 'hide')) {
				i++;
			}
		});
		return i !== modals.length - 1 ? true : false;
	};

	const close = () => {
		if (typeof backdropHandler === 'function') {
			backdropHandler();
			backdropHandler = null;
		}
		if (typeof cleanupHandler === 'function') {
			cleanupHandler();
			cleanupHandler = null;
		}
		// a second close while one is pending must not re-register: the
		// overwritten handler would outlive cancelPendingClose and close
		// every future open the moment its enter transition ends
		if (!queued() && !transitionHandler && !closingTimeout) {
			classList(modal, 'closing');
			const finishClose = () => {
				cancelPendingClose();
				blur();
				classList(modal, 'closing', false);
				modal.close();
				current = false;
			};
			// Close as soon as the dialog transition ends; the timeout is a
			// fallback for environments without transitions
			transitionHandler = e => {
				if (e.target === modal) {
					finishClose();
				}
			};
			modal.addEventListener('transitionend', transitionHandler);
			closingTimeout = setTimeout(finishClose, 700);
		}
	};

	const loading = (message = 'Reinitializing editor state...') => {
		if (current !== 'loading') {
			$('loadingMsg').innerHTML = message;
		}
		open('loading');
	};

	const error = message => {
		$('modalError').innerHTML = message;
		open('error');
	};

	const onClose = handler => {
		cleanupHandler = handler;
	};

	$$$('.close').forEach(b => onClick(b, _ => close()));

	return {
		isOpen: () => modal.open,
		current: currentScreen,
		open: open,
		close: close,
		error: error,
		focusEvents: focusEvents,
		loading: loading,
		onClose: onClose,
	};
};

// Toggles
const createSettingToggle = (el, getter, setter) => {
	let currentSetting;
	let g = getter;
	let s = setter;

	const update = () => {
		currentSetting = g();
		if (currentSetting) {
			el.classList.add('enabled');
		} else {
			el.classList.remove('enabled');
		}
	};

	const sync = (getter, setter) => {
		g = getter;
		s = setter;
		update();
	};

	const changeSetting = e => {
		e.preventDefault();
		currentSetting = !currentSetting;
		s(currentSetting);
		update();
	};

	el.addEventListener('click', changeSetting);
	update();

	return {
		sync: sync,
		update: update,
	};
};

const onReturn = (el, target) => {
	el.addEventListener('keypress', e => {
		if (!e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'Enter') {
			e.preventDefault();
			e.stopPropagation();
			target.click();
		}
	});
};

const onClick = (el, func) => {
	const handler = e => {
		if (el.tagName === 'A' || el.tagName === 'BUTTON') {
			e.preventDefault();
		}
		func(e, el);
	};
	el.addEventListener('click', handler);
	return () => el.removeEventListener('click', handler);
};

const onFileChange = (el, func) => {
	el.addEventListener('change', e => {
		if (e.target.files.length > 0) {
			func(e.target.files[0]);
		}
	});
};

const createPositionInfo = el => {
	const update = (x, y) => {
		el.textContent = x + 1 + ', ' + (y + 1);
	};

	return { update: update };
};

const viewportTap = view => {
	// Menu close, plus the margin gesture: a quick 2-finger tap on the
	// viewport OUTSIDE the canvas still undoes. On the canvas itself the
	// gesture recognizer owns taps; filtering by target keeps both
	// layers from seeing the same tap (a double undo).
	const maxTapDuration = 300;
	let touchStartTime = 0;
	let eligible = false;

	view.addEventListener('touchstart', event => {
		State.menus.close();
		const onCanvas =
			typeof event.target?.closest === 'function' &&
			event.target.closest('#canvasContainer') !== null;
		eligible = event.touches.length === 2 && !onCanvas;
		if (eligible) {
			touchStartTime = Date.now();
		}
	});

	view.addEventListener('touchend', event => {
		// evaluate on the LAST lift: real fingers rarely leave in the
		// same event frame, so requiring changedTouches === 2 would
		// almost never fire on hardware
		const remaining = event.touches?.length ?? 0;
		if (
			eligible &&
			remaining === 0 &&
			Date.now() - touchStartTime < maxTapDuration
		) {
			State.textArtCanvas.undo();
		}
		if (remaining === 0) {
			eligible = false;
		}
	});

	view.addEventListener('touchcancel', () => {
		eligible = false;
	});
};

const undoAndRedo = e => {
	if ((e.ctrlKey || (e.metaKey && !e.shiftKey)) && e.code === 'KeyZ') {
		// Ctrl/Cmd+Z - Undo
		e.preventDefault();
		State.textArtCanvas.undo();
	} else if (
		(e.ctrlKey && e.code === 'KeyY') ||
		(e.metaKey && e.shiftKey && e.code === 'KeyZ')
	) {
		// Ctrl+Y or Cmd+Shift+Z - Redo
		e.preventDefault();
		State.textArtCanvas.redo();
	}
};

const createPaintShortcuts = keyPair => {
	let ignored = false;

	const isConnected = e =>
		!State.network ||
		!State.network.isConnected() ||
		!keyPair[e.key].classList.contains('excludedForWebsocket');

	const keyDown = e => {
		const t = e.target;
		const tag = t && t.tagName;
		if (
			tag === 'SELECT' ||
			tag === 'INPUT' ||
			tag === 'TEXTAREA' ||
			(t && t.isContentEditable)
		) {
			// the shape toolbars put selects inside tool buttons: typing
			// in one must configure it, never fire a paint shortcut
			return;
		}
		if (!ignored) {
			if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
				if (e.key >= '0' && e.key <= '7') {
					// Number keys 0-7 for color shortcuts
					const color = parseInt(e.key, 10);
					const currentColor = State.palette.getForegroundColor();
					if (currentColor === color) {
						State.palette.setForegroundColor(color + 8);
					} else {
						State.palette.setForegroundColor(color);
					}
				} else {
					// Use the actual key character for lookup
					if (keyPair[e.key] !== undefined) {
						if (isConnected(e)) {
							e.preventDefault();
							keyPair[e.key].click();
						}
					}
				}
			}
		}
	};

	const keyDownWithCtrl = e => {
		if (!ignored) {
			if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
				// Use the actual key character for lookup
				if (keyPair[e.key] !== undefined) {
					if (isConnected(e)) {
						e.preventDefault();
						keyPair[e.key].click();
					}
				}
			}
		}
	};

	document.addEventListener('keydown', keyDownWithCtrl);

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

	enable();

	return {
		enable: enable,
		disable: disable,
		ignore: ignore,
		unignore: unignore,
	};
};


/**
 * The bake hashes icons.svg and rewrites every static use href, so a
 * hardcoded sprite path only resolves in dev. Steal the baked base
 * from any sprite reference already in the DOM and swap fragments.
 */
let iconBase = null;
const iconHref = name => {
	iconBase ??=
		document
			.querySelector('use[href*=".svg#"]')
			?.getAttribute('href')
			.split('#')[0] ?? 'img/icons.svg';
	return `${iconBase}#${name}`;
};

/**
 * An n-way radio row in the toggle button's visual family. Options are
 * {value, label, glyph?, icon?}; a glyph renders as a small vocabulary
 * preview above the label, an icon as a sprite from icons.svg. set()
 * moves the selection without firing onChange, so controllers can
 * restore persisted values silently.
 */
const createSegmentedControl = (id, options, onChange) => {
	const group = document.createElement('DIV');
	group.id = id;
	group.classList.add('segmented');
	group.setAttribute('role', 'radiogroup');
	let current = options[0]?.value;
	let enabled = true;
	const order = options.map(opt => opt.value);
	const buttons = new Map();

	const paint = () => {
		buttons.forEach((btn, value) => {
			const on = value === current;
			btn.classList.toggle('enabled', on);
			btn.setAttribute('aria-checked', on ? 'true' : 'false');
			// a napping control must drop out of the tab order too, or
			// the keyboard reaches what pointer-events: none fences off
			btn.tabIndex = enabled && on ? 0 : -1;
		});
	};

	const select = value => {
		if (!enabled || value === current || !buttons.has(value)) {
			return;
		}
		current = value;
		paint();
		if (typeof onChange === 'function') {
			onChange(current);
		}
	};

	options.forEach(opt => {
		const btn = document.createElement('BUTTON');
		btn.type = 'button';
		btn.classList.add('segment');
		btn.setAttribute('role', 'radio');
		btn.dataset.value = String(opt.value);
		if (opt.glyph) {
			const glyph = document.createElement('SAMP');
			glyph.textContent = opt.glyph;
			btn.appendChild(glyph);
		}
		if (opt.icon) {
			const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
			const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
			use.setAttribute('href', iconHref(opt.icon));
			svg.appendChild(use);
			btn.appendChild(svg);
		}
		const label = document.createElement('SPAN');
		label.textContent = opt.label;
		btn.appendChild(label);
		btn.addEventListener('click', _ => select(opt.value));
		buttons.set(opt.value, btn);
		group.appendChild(btn);
	});

	group.addEventListener('keydown', e => {
		if (!enabled) {
			return;
		}
		let step = 0;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			step = 1;
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			step = -1;
		}
		if (step === 0) {
			return;
		}
		e.preventDefault();
		const next =
			order[(order.indexOf(current) + step + order.length) % order.length];
		select(next);
		buttons.get(next)?.focus();
	});

	paint();

	return {
		getElement: () => group,
		value: () => current,
		set: value => {
			if (buttons.has(value)) {
				current = value;
				paint();
			}
		},
		setEnabled: on => {
			enabled = Boolean(on);
			group.classList.toggle('dimmed', !enabled);
			group.setAttribute('aria-disabled', enabled ? 'false' : 'true');
			paint();
		},
	};
};

const createGrid = el => {
	let canvases = [];
	let enabled = false;

	const createCanvases = () => {
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const canvasWidth = fontWidth * columns;
		const canvasHeight = fontHeight * 25;
		canvases = [];
		for (let i = 0; i < Math.floor(rows / 25); i++) {
			const canvas = createCanvas(canvasWidth, canvasHeight);
			canvases.push(canvas);
		}
		if (rows % 25 !== 0) {
			const canvas = createCanvas(canvasWidth, fontHeight * (rows % 25));
			canvases.push(canvas);
		}
	};

	const renderGrid = canvas => {
		const columns = State.textArtCanvas.getColumns();
		const rows = Math.min(State.textArtCanvas.getRows(), 25);
		const fontWidth = canvas.width / columns;
		const fontHeight = State.font.getHeight();
		const ctx = canvas.getContext('2d');
		const imageData = ctx.createImageData(canvas.width, canvas.height);
		const byteWidth = canvas.width * 4;
		const darkGray = new Uint8Array([63, 63, 63, 255]);
		for (let y = 0; y < rows; y += 1) {
			for (
				let x = 0, i = y * fontHeight * byteWidth;
				x < canvas.width;
				x += 1, i += 4
			) {
				imageData.data.set(darkGray, i);
			}
		}
		for (let x = 0; x < columns; x += 1) {
			for (
				let y = 0, i = x * fontWidth * 4;
				y < canvas.height;
				y += 1, i += byteWidth
			) {
				imageData.data.set(darkGray, i);
			}
		}
		ctx.putImageData(imageData, 0, 0);
	};

	const createGrid = () => {
		createCanvases();
		renderGrid(canvases[0]);
		el.appendChild(canvases[0]);
		for (let i = 1; i < canvases.length; i++) {
			canvases[i].getContext('2d').drawImage(canvases[0], 0, 0);
			el.appendChild(canvases[i]);
		}
	};

	const destroyGrid = () => {
		// remove() tolerates canvases a failed build never appended,
		// where removeChild would throw and wedge every later resize
		canvases.forEach(canvas => {
			canvas.remove();
		});
		canvases = [];
	};

	const resize = () => {
		// Only rebuild while the grid is shown; it is created lazily on toggle
		if (canvases.length > 0) {
			destroyGrid();
		}
		if (enabled) {
			createGrid();
		}
	};

	document.addEventListener('onTextCanvasSizeChange', resize);
	document.addEventListener('onLetterSpacingChange', resize);
	document.addEventListener('onFontChange', resize);
	document.addEventListener('onScaleFactorChange', resize);
	document.addEventListener('onOpenedFile', resize);

	const isShown = () => {
		return enabled;
	};

	const show = turnOn => {
		if (enabled && !turnOn) {
			el.classList.remove('enabled');
			enabled = false;
			destroyGrid();
		} else if (!enabled && turnOn) {
			if (canvases.length === 0) {
				createGrid();
			}
			el.classList.add('enabled');
			enabled = true;
		}
		try {
			localStorage.setItem('gridVisible', String(enabled));
		} catch {
			// storage blocked: the preference just does not persist
		}
	};

	// the preference survives reloads, like the minimap's
	let stored = null;
	try {
		stored = localStorage.getItem('gridVisible');
	} catch {
		// storage blocked: default wins
	}
	if (stored === 'true') {
		// the boot font races this restore: build now when it already
		// landed, otherwise its onFontChange rebuild draws the first grid
		try {
			show(true);
		} catch {
			el.classList.add('enabled');
			enabled = true;
		}
	}

	return {
		isShown: isShown,
		show: show,
	};
};

const createToolPreview = el => {
	let canvases = [];
	let ctxs = [];
	let fontWidth = 0;
	let fontHeight = 0;
	let columns = 0;
	let rows = 0;

	const updateDimensions = () => {
		fontWidth = State.font.getWidth();
		fontHeight = State.font.getHeight();
		columns = State.textArtCanvas.getColumns();
		rows = State.textArtCanvas.getRows();
	};

	// Preview canvases are created lazily, one 25-row chunk at a time,
	// so a tall document never allocates a full overlay stack up front
	const getOrCreateCtx = ctxIndex => {
		if (ctxs[ctxIndex]) {
			return ctxs[ctxIndex];
		}
		const chunkRows = Math.min(25, rows - ctxIndex * 25);
		const canvas = createCanvas(fontWidth * columns, fontHeight * chunkRows);
		canvas.style.position = 'absolute';
		canvas.style.left = '0px';
		canvas.style.top = ctxIndex * 25 * fontHeight + 'px';
		el.appendChild(canvas);
		canvases[ctxIndex] = canvas;
		ctxs[ctxIndex] = canvas.getContext('2d');
		return ctxs[ctxIndex];
	};

	const resize = () => {
		canvases.forEach(canvas => {
			el.removeChild(canvas);
		});
		canvases = [];
		ctxs = [];
		updateDimensions();
	};

	const drawOneHalfBlock = (foreground, x, y) => {
		const halfBlockY = y % 2;
		const textY = Math.floor(y / 2);
		const ctxIndex = Math.floor(textY / 25);
		if (ctxIndex >= 0 && ctxIndex < Math.ceil(rows / 25)) {
			State.font.drawWithAlpha(
				halfBlockY === 0 ? 223 : 220,
				foreground,
				getOrCreateCtx(ctxIndex),
				x,
				textY % 25,
			);
		}
	};

	const drawHalfBlock = (foreground, x, y) => {
		drawOneHalfBlock(foreground, x, y);
		// mirror mode draws the reflected half on COMMIT (editor core);
		// the ghost has to say so beforehand, for every shape tool at once
		if (State.textArtCanvas.getMirrorMode?.()) {
			const mirrorX = State.textArtCanvas.getMirrorX(x);
			if (mirrorX !== x && mirrorX >= 0 && mirrorX < columns) {
				drawOneHalfBlock(foreground, mirrorX, y);
			}
		}
	};

	const drawOneGlyph = (charCode, foreground, x, y) => {
		const ctxIndex = Math.floor(y / 25);
		if (ctxIndex >= 0 && ctxIndex < Math.ceil(rows / 25)) {
			State.font.drawWithAlpha(
				charCode,
				foreground,
				getOrCreateCtx(ctxIndex),
				x,
				y % 25,
			);
		}
	};

	const drawGlyph = (charCode, foreground, x, y) => {
		drawOneGlyph(charCode, foreground, x, y);
		// commit mirroring lives in the editor core and flips the glyph;
		// the ghost has to match both the position and the flip
		if (State.textArtCanvas.getMirrorMode?.()) {
			const mirrorX = State.textArtCanvas.getMirrorX(x);
			if (mirrorX !== x && mirrorX >= 0 && mirrorX < columns) {
				drawOneGlyph(mirrorCharCode(charCode), foreground, mirrorX, y);
			}
		}
	};

	const clear = () => {
		for (let i = 0; i < ctxs.length; i++) {
			if (ctxs[i]) {
				ctxs[i].clearRect(0, 0, canvases[i].width, canvases[i].height);
			}
		}
	};

	updateDimensions();
	el.classList.add('enabled');

	document.addEventListener('onTextCanvasSizeChange', resize);
	document.addEventListener('onLetterSpacingChange', resize);
	document.addEventListener('onFontChange', resize);
	// Zoom dispatches onScaleFactorChange only (not onFontChange); without
	// this, the chunk canvases keep stale metrics and a preview crossing a
	// 25-row boundary draws its lower part into a mispositioned canvas
	document.addEventListener('onScaleFactorChange', resize);
	document.addEventListener('onOpenedFile', resize);

	return {
		clear: clear,
		drawHalfBlock: drawHalfBlock,
		drawGlyph: drawGlyph,
	};
};

const getUtf8Bytes = str => {
	return new TextEncoder().encode(str).length;
};

const enforceMaxBytes = () => {
	const SAUCE_MAX_BYTES = 16320;
	const sauceComments = $('sauceComments');
	let val = sauceComments.value;
	let bytes = getUtf8Bytes(val);
	while (bytes > SAUCE_MAX_BYTES) {
		val = val.slice(0, -1);
		bytes = getUtf8Bytes(val);
	}
	if (val !== sauceComments.value) {
		sauceComments.value = val;
	}
	$('sauceBytes').value = `${bytes}/${SAUCE_MAX_BYTES} bytes`;
};

const createGenericController = (panel, nav) => {
	const enable = () => {
		panel.style.display = 'flex';
		nav.classList.add('enabledParent');
	};
	const disable = () => {
		panel.style.display = 'none';
		nav.classList.remove('enabledParent');
	};
	return {
		enable: enable,
		disable: disable,
	};
};

const createViewportController = el => {
	const panel = el;
	const enable = () => {
		panel.style.display = 'flex';
	};
	const disable = () => {
		panel.style.display = 'none';
	};
	return {
		enable: enable,
		disable: disable,
	};
};

// one shared stack so overlapping tool windows focus on press: any
// pointer down inside a registered window lifts it above its siblings.
// The whole band (40 to 40 + count) stays below the z-[45] menu lists;
// modals open through showModal and the top layer beats any z-index
const panelStack = [];
const PANEL_BASE_Z = 40;
const restackPanels = () => {
	panelStack.forEach((p, i) => {
		p.style.zIndex = String(PANEL_BASE_Z + i);
	});
};
const registerFloatingPanel = panel => {
	const focus = () => {
		const i = panelStack.indexOf(panel);
		if (i === panelStack.length - 1) {
			return;
		}
		panelStack.splice(i, 1);
		panelStack.push(panel);
		restackPanels();
	};
	panelStack.push(panel);
	restackPanels();
	panel.addEventListener('mousedown', focus, true);
	panel.addEventListener('touchstart', focus, { capture: true, passive: true });
	return focus;
};

// drag + close chrome for the fixed tool windows (colors, frames),
// matching the brush windows' behavior. A press on a control is a
// control gesture, so only free panel area starts a drag. Extras ride
// opt-in options so legacy panels keep their exact behavior:
// onMoved(left, top) fires when a drag ends
const makePanelFloat = (panel, onClose, options = {}) => {
	const focus = registerFloatingPanel(panel);
	const close = document.createElement('div');
	close.classList.add('hidePanel');
	close.innerText = 'X';
	panel.appendChild(close);
	close.addEventListener('click', onClose);

	const interactive = target =>
		target.closest('button, input, select, canvas, .colorSwatch, .hidePanel') !==
		null;

	let startPointer = null;
	let startPanel = null;

	const setPos = (newX, newY) => {
		// dropping the far-edge anchors keeps a bottom- or right-pinned
		// panel from stretching once top and left are set
		panel.style.bottom = 'auto';
		panel.style.right = 'auto';
		panel.style.left = newX + 'px';
		panel.style.top = newY + 'px';
	};

	const begin = (px, py) => {
		startPointer = [px, py];
		const rect = panel.getBoundingClientRect();
		startPanel = [rect.left, rect.top];
	};

	const dragTo = (px, py) => {
		setPos(
			startPanel[0] + (px - startPointer[0]),
			startPanel[1] + (py - startPointer[1]),
		);
	};

	const mouseMove = e => {
		if (startPointer) {
			e.preventDefault();
			dragTo(e.clientX, e.clientY);
		}
	};

	const moved = () => {
		if (startPointer && typeof options.onMoved === 'function') {
			const rect = panel.getBoundingClientRect();
			options.onMoved(rect.left, rect.top);
		}
	};

	const mouseUp = () => {
		moved();
		startPointer = null;
		document.removeEventListener('mousemove', mouseMove);
		document.removeEventListener('mouseup', mouseUp);
	};

	panel.addEventListener('mousedown', e => {
		if (interactive(e.target)) {
			return;
		}
		begin(e.clientX, e.clientY);
		document.addEventListener('mousemove', mouseMove);
		document.addEventListener('mouseup', mouseUp);
	});

	const touchMove = e => {
		if (startPointer) {
			e.preventDefault();
			dragTo(e.touches[0].pageX, e.touches[0].pageY);
		}
	};

	const touchEnd = () => {
		moved();
		startPointer = null;
		document.removeEventListener('touchmove', touchMove);
		document.removeEventListener('touchend', touchEnd);
	};

	panel.addEventListener(
		'touchstart',
		e => {
			if (interactive(e.target)) {
				return;
			}
			begin(e.touches[0].pageX, e.touches[0].pageY);
			document.addEventListener('touchmove', touchMove, { passive: false });
			document.addEventListener('touchend', touchEnd);
		},
		{ passive: true },
	);

	return { focus };
};

const createResolutionController = (lbl, txtC, txtR) => {
	[
		'onTextCanvasSizeChange',
		'onFontChange',
		'onXBFontLoaded',
		'onOpenedFile',
	].forEach(e => {
		document.addEventListener(e, _ => {
			const cols = State.textArtCanvas.getColumns();
			const rows = State.textArtCanvas.getRows();
			lbl.innerText = `${cols}x${rows}`;
			txtC.value = cols;
			txtR.value = rows;
		});
	});
};

const createDragDropController = (handler, el) => {
	let dragCounter = 0;
	document.addEventListener('dragenter', e => {
		e.preventDefault();
		dragCounter++;
		el.style.display = 'flex';
	});
	document.addEventListener('dragover', e => {
		e.preventDefault();
	});
	document.addEventListener('dragleave', e => {
		e.preventDefault();
		dragCounter--;
		if (dragCounter === 0) {
			el.style.display = 'none';
		}
	});
	document.addEventListener('drop', e => {
		e.preventDefault();
		dragCounter = 0;
		el.style.display = 'none';
		// collab lockout: opening a file mid-session replaces the local
		// doc with content peers never see (the Open menu item is hidden
		// while connected for the same reason)
		if (State.network?.isConnected?.() === true) {
			return;
		}
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handler(files[0]);
		}
	});
};

const createMenuController = (elements, canvas, view) => {
	const menus = [];
	let current = null;

	const closeAll = () => {
		menus.forEach(menu => {
			classList(menu, 'hide', true);
		});
		canvas.focus();
	};
	const close = _ => {
		current = null;
		closeAll();
	};

	const toggle = menu => {
		current = has(menu, 'hide') ? menu : null;
		closeAll();
		if (current) {
			classList(current, 'hide', false);
			menu.focus();
		} else {
			canvas.focus();
		}
	};
	elements.forEach(el => {
		const button = el.button;
		const menu = el.menu;
		menus.push(menu);
		onClick(button, _ => {
			toggle(menu);
		});
		menu.querySelectorAll('.menuItem').forEach(item => {
			onClick(item, close);
		});
		menu.addEventListener('blur', close);
	});
	onClick(view, close);
	return { close: closeAll };
};

const createFontSelect = (el, lbl, img, btn) => {
	const listbox = el;
	const previewInfo = lbl;
	const previewImage = img;

	function getOptions() {
		return Array.from(listbox.querySelectorAll('[role="option"]'));
	}
	function getValue() {
		const selected = getOptions().find(
			opt => opt.getAttribute('aria-selected') === 'true',
		);
		return selected ? selected.dataset.value || selected.textContent : null;
	}
	function setValue(value) {
		const options = getOptions();
		const idx = options.findIndex(opt => opt.dataset.value === value);
		if (idx === -1) {
			return false;
		}
		updateSelection(idx);
		return true;
	}
	function setFocus() {
		const w8 = setTimeout(() => {
			listbox.focus();
			const options = getOptions();
			const idx = options.findIndex(opt => opt.dataset.value === getValue());
			options[idx].scrollIntoView({ block: 'nearest' });
			clearTimeout(w8);
		}, 100);
	}
	function updateSelection(idx) {
		const options = getOptions();
		options.forEach((opt, i) => {
			const isSelected = i === idx;
			opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
			opt.classList.toggle('focused', isSelected);
		});
		listbox.setAttribute('aria-activedescendant', options[idx].id);
		options[idx].scrollIntoView({ block: 'nearest' });
		focusedIdx = idx;
		updateFontPreview(getValue());
	}
	async function updateFontPreview(fontName) {
		if (fontName === 'XBIN') {
			const xbFontData = State.textArtCanvas.getXBFontData();
			if (xbFontData && xbFontData.bytes) {
				const xbfont = await loadFontFromXBData(
					xbFontData.bytes,
					xbFontData.width,
					xbFontData.height,
					xbFontData.letterSpacing,
					State.palette,
				);
				const previewCanvas = createCanvas(
					xbFontData.width * 16,
					xbFontData.height * 16,
				);
				const previewCtx = previewCanvas.getContext('2d');
				const foreground = 15,
							background = 0;
				for (let y = 0, charCode = 0; y < 16; y++) {
					for (let x = 0; x < 16; x++, charCode++) {
						xbfont.draw(charCode, foreground, background, previewCtx, x, y);
					}
				}
				previewInfo.textContent =
					'XBIN: embedded ' + xbFontData.width + 'x' + xbFontData.height;
				previewImage.src = previewCanvas.toDataURL();
			} else {
				previewInfo.textContent = 'XBIN: none';
				previewImage.src = `${State.fontDir}missing.png`;
			}
		} else {
			const image = new Image();
			image.onload = () => {
				previewInfo.textContent = fontName;
				previewImage.src = image.src;
			};
			image.onerror = () => {
				previewInfo.textContent = fontName + ' (not found)';
				image.src = `${State.fontDir}missing.png`;
			};
			image.src = `${State.fontDir}${fontName}.png`;
		}
	}
	// Listeners
	listbox.addEventListener('keydown', e => {
		const options = getOptions();
		if (e.key === 'ArrowDown' && focusedIdx < options.length - 1) {
			e.preventDefault();
			updateSelection(++focusedIdx);
		} else if (e.key === 'ArrowUp' && focusedIdx > 0) {
			e.preventDefault();
			updateSelection(--focusedIdx);
		} else if (e.key === 'Home') {
			e.preventDefault();
			updateSelection((focusedIdx = 0));
		} else if (e.key === 'End') {
			e.preventDefault();
			updateSelection((focusedIdx = options.length - 1));
		} else if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			btn.click();
		}
	});
	getOptions().forEach((opt, i) => {
		opt.addEventListener('click', () => {
			updateSelection(i);
			updateFontPreview(getValue());
		});
	});
	listbox.addEventListener('focus', () => updateSelection(focusedIdx));
	listbox.addEventListener('blur', () =>
		getOptions().forEach(opt => opt.classList.remove('focused')));

	// font browser favorites: starred fonts pin to a Favorites group
	// at the top of the listbox, kept in localStorage
	const FAVORITES_KEY = 'fontFavorites';
	const favorites = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY)) ?? [];
			return Array.isArray(parsed)
				? parsed.filter(value => typeof value === 'string')
				: [];
		} catch {
			return [];
		}
	};
	const saveFavorites = values => {
		try {
			localStorage.setItem(FAVORITES_KEY, JSON.stringify(values));
		} catch {
			// storage blocked: favorites just don't persist
		}
	};
	const originalOptionFor = value =>
		getOptions().find(
			opt =>
				!opt.classList.contains('favoriteOption') &&
				opt.dataset.value === value,
		);
	const rebuildFavorites = () => {
		const selected = getValue();
		listbox
			.querySelectorAll('.favoriteOption, .favoritesLabel')
			.forEach(node => node.remove());
		const values = favorites().filter(value => originalOptionFor(value));
		if (values.length > 0) {
			const label = document.createElement('li');
			label.className = 'groupLabel favoritesLabel';
			label.setAttribute('role', 'presentation');
			label.textContent = 'Favorites';
			const nodes = [label];
			values.forEach((value, i) => {
				const clone = originalOptionFor(value).cloneNode(true);
				clone.classList.add('favoriteOption');
				clone.classList.remove('focused');
				clone.id = `fontFav-${i}`;
				clone.setAttribute('aria-selected', 'false');
				clone.addEventListener('click', () => {
					updateSelection(getOptions().indexOf(clone));
				});
				nodes.push(clone);
			});
			listbox.prepend(...nodes);
		}
		if (selected !== null) {
			setValue(selected);
		}
	};
	const toggleFavorite = () => {
		const value = getValue();
		if (value === null) {
			return false;
		}
		const values = favorites();
		const at = values.indexOf(value);
		if (at >= 0) {
			values.splice(at, 1);
		} else {
			values.push(value);
		}
		saveFavorites(values);
		rebuildFavorites();
		return values.includes(value);
	};
	const isFavorite = () => favorites().includes(getValue());

	// Init
	let focusedIdx = getOptions().findIndex(
		opt => opt.getAttribute('aria-selected') === 'true',
	);
	if (focusedIdx < 0) {
		focusedIdx = 0;
	}
	updateSelection(focusedIdx);
	updateFontPreview(getValue());
	rebuildFavorites();

	return {
		focus: setFocus,
		getValue: getValue,
		setValue: setValue,
		toggleFavorite: toggleFavorite,
		isFavorite: isFavorite,
	};
};

const createZoomControl = () => {
	const container = document.createElement('div');
	container.className = 'zoomControl';
	container.setAttribute('aria-label', 'Canvas Zoom Control');

	const label = document.createElement('label');
	label.textContent = 'Zoom';
	label.htmlFor = 'zoomSlider';

	const slider = document.createElement('input');
	slider.type = 'range';
	slider.id = 'zoomSlider';
	slider.min = '0.5';
	slider.max = '4';
	slider.step = '0.5';
	slider.value = '1';
	slider.setAttribute('aria-valuemin', '0.5');
	slider.setAttribute('aria-valuemax', '4');
	slider.setAttribute('aria-valuenow', '1');
	slider.setAttribute('aria-label', 'Canvas zoom level');

	const display = document.createElement('span');
	display.className = 'zoomDisplay';
	display.textContent = '1.0x';
	display.setAttribute('aria-live', 'polite');

	const updateZoom = value => {
		const scale = parseFloat(value);
		display.textContent = `${scale.toFixed(1)}x`;
		slider.setAttribute('aria-valuenow', value);

		const zoom = getZoomController();
		if (zoom) {
			zoom.setZoom(scale);
		} else if (State.font && State.font.setScaleFactor) {
			State.font.setScaleFactor(scale);
		}
	};

	const updateSliderFromState = () => {
		if (State.font && State.font.getScaleFactor) {
			const currentScale = State.font.getScaleFactor();
			slider.value = currentScale.toString();
			display.textContent = `${currentScale.toFixed(1)}x`;
			slider.setAttribute('aria-valuenow', currentScale.toString());
		}
	};

	State.waitFor('font', updateSliderFromState);

	document.addEventListener(
		'onStateRestorationComplete',
		updateSliderFromState,
	);

	// pinch and wheel zoom change the scale outside the slider; mirror it
	document.addEventListener('onScaleFactorChange', updateSliderFromState);

	// Event listeners
	slider.addEventListener('input', e => {
		// Update display during drag (preview)
		const scale = parseFloat(e.target.value);
		display.textContent = `${scale.toFixed(1)}x`;
	});

	slider.addEventListener('change', e => {
		// Apply zoom on release
		updateZoom(e.target.value);
		// Save immediately to state (don't wait for debounced save)
		if (State.saveToLocalStorage) {
			State.saveToLocalStorage();
		}
	});

	// Keyboard zoom (ctrl/cmd + = / - / 0). The controller path anchors
	// at the viewport center and saves; the slider fallback covers
	// contexts without a controller.
	const handleKeyboardZoom = e => {
		if ((e.ctrlKey || e.metaKey) && e.key === '=') {
			// Ctrl/Cmd + Plus: Zoom in
			e.preventDefault();
			const zoom = getZoomController();
			if (zoom) {
				zoom.zoomIn();
				return;
			}
			const currentValue = parseFloat(slider.value);
			const newValue = Math.min(4, currentValue + 0.5);
			slider.value = newValue.toString();
			updateZoom(newValue.toString());
			if (State.saveToLocalStorage) {
				State.saveToLocalStorage();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
			// Ctrl/Cmd + Minus: Zoom out
			e.preventDefault();
			const zoom = getZoomController();
			if (zoom) {
				zoom.zoomOut();
				return;
			}
			const currentValue = parseFloat(slider.value);
			const newValue = Math.max(0.5, currentValue - 0.5);
			slider.value = newValue.toString();
			updateZoom(newValue.toString());
			if (State.saveToLocalStorage) {
				State.saveToLocalStorage();
			}
		}
	};

	document.addEventListener('keydown', handleKeyboardZoom);
	// icon, label and value ride the top row (main.js moves the sprite
	// icon in); the slider gets the full row below
	const top = document.createElement('div');
	top.className = 'zoomTop';
	top.appendChild(label);
	top.appendChild(display);
	container.appendChild(top);
	container.appendChild(slider);
	return container;
};

const websocketUI = show => {
	[
		['excludedForWebsocket', !show],
		['includedForWebsocket', show],
	].forEach(([sel, prop]) =>
		[...D.getElementsByClassName(sel)].forEach(
			el => (el.style.display = prop ? 'block' : 'none'),
		));
};

export {
	$,
	$$,
	$$$,
	createCanvas,
	toggleFullscreen,
	createModalController,
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	createPositionInfo,
	undoAndRedo,
	viewportTap,
	createViewportController,
	createGenericController,
	createPaintShortcuts,
	createSegmentedControl,
	iconHref,
	createGrid,
	createToolPreview,
	enforceMaxBytes,
	createResolutionController,
	makePanelFloat,
	registerFloatingPanel,
	createDragDropController,
	createMenuController,
	createFontSelect,
	createZoomControl,
	websocketUI,
};
