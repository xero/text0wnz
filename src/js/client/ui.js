import State from './state.js';
import { loadFontFromXBData } from './font.js';

// Utilities for DOM manipulation
const D = document,
			$ = D.getElementById.bind(D),
			$$ = D.querySelector.bind(D),
			$$$ = D.querySelectorAll.bind(D),
			has = (i, c) => i.classList.contains(c),
			classList = (el, className, add = true) =>
				add ? el.classList.add(className) : el.classList.remove(className);

const createCanvas = (width, height) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

const toggleFullscreen = () => {
	if (document.fullscreenEnabled) {
		if (document.fullscreenElement) {
			document.exitFullscreen();
		} else {
			document.documentElement.requestFullscreen();
		}
	}
};

// Modal
const createModalController = modal => {
	const modals = [
		$('about-modal'),
		$('resize-modal'),
		$('fonts-modal'),
		$('sauce-modal'),
		$('websocket-modal'),
		$('choice-modal'),
		$('update-modal'),
		$('loading-modal'),
		$('warning-modal'),
	];
	let closingTimeout = null;
	let focus = () => {};
	let blur = () => {};

	const focusEvents = (onFocus, onBlur) => {
		focus = onFocus;
		blur = onBlur;
	};

	const clear = () => modals.forEach(s => classList(s, 'hide'));

	const open = name => {
		const section = name + '-modal';
		if ($(section)) {
			// cancel current close event
			if (closingTimeout) {
				clearTimeout(closingTimeout);
				closingTimeout = null;
				classList(modal, 'closing', false);
			}
			clear();
			focus();
			classList($(section), 'hide', false);
			modal.showModal();
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
		if (!queued()) {
			classList(modal, 'closing');
			closingTimeout = setTimeout(() => {
				blur();
				classList(modal, 'closing', false);
				modal.close();
				closingTimeout = null;
			}, 700);
		}
	};

	const error = message => {
		$('modalError').innerHTML = message;
		open('error');
	};

	// attach to all close buttons
	$$$('.close').forEach(b => onClick(b, _ => close()));

	return {
		isOpen: () => modal.open,
		open: open,
		close: close,
		error: error,
		focusEvents: focusEvents,
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
			// Enter key
			e.preventDefault();
			e.stopPropagation();
			target.click();
		}
	});
};

const onClick = (el, func) => {
	el.addEventListener('click', e => {
		e.preventDefault();
		func(el);
	});
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
	const maxTapDuration = 300;
	let touchStartTime = 0;
	let activeTouches = 0;

	view.addEventListener('touchstart', event => {
		activeTouches = event.touches.length;
		if (activeTouches === 2) {
			touchStartTime = Date.now();
		}
		State.menus.close();
	});

	view.addEventListener('touchend', event => {
		if (activeTouches === 2 && event.changedTouches.length === 2) {
			const endTime = Date.now();
			const tapDuration = endTime - touchStartTime;
			if (tapDuration < maxTapDuration) {
				State.textArtCanvas.undo();
			}
		}
		activeTouches = 0;
	});

	view.addEventListener('touchcancel', _ => {
		activeTouches = 0;
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
		!keyPair[e.key].classList.contains('excluded-for-websocket');

	const keyDown = e => {
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

const createToggleButton = (
	stateOneName,
	stateTwoName,
	stateOneClick,
	stateTwoClick,
) => {
	const container = document.createElement('DIV');
	container.classList.add('toggle-button-container');
	const stateOne = document.createElement('DIV');
	stateOne.classList.add('toggle-button');
	stateOne.classList.add('left');
	stateOne.textContent = stateOneName;
	const stateTwo = document.createElement('DIV');
	stateTwo.classList.add('toggle-button');
	stateTwo.classList.add('right');
	stateTwo.textContent = stateTwoName;
	container.appendChild(stateOne);
	container.appendChild(stateTwo);

	const getElement = () => {
		return container;
	};

	const setStateOne = () => {
		stateOne.classList.add('enabled');
		stateTwo.classList.remove('enabled');
	};

	const setStateTwo = () => {
		stateTwo.classList.add('enabled');
		stateOne.classList.remove('enabled');
	};

	stateOne.addEventListener('click', _ => {
		setStateOne();
		stateOneClick();
	});

	stateTwo.addEventListener('click', _ => {
		setStateTwo();
		stateTwoClick();
	});

	return {
		getElement: getElement,
		setStateOne: setStateOne,
		setStateTwo: setStateTwo,
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

	const resize = () => {
		canvases.forEach(canvas => {
			el.removeChild(canvas);
		});
		createGrid();
	};

	createGrid();

	document.addEventListener('onTextCanvasSizeChange', resize);
	document.addEventListener('onLetterSpacingChange', resize);
	document.addEventListener('onFontChange', resize);
	document.addEventListener('onOpenedFile', resize);

	const isShown = () => {
		return enabled;
	};

	const show = turnOn => {
		if (enabled && !turnOn) {
			el.classList.remove('enabled');
			enabled = false;
		} else if (!enabled && turnOn) {
			el.classList.add('enabled');
			enabled = true;
		}
	};

	return {
		isShown: isShown,
		show: show,
	};
};

const createToolPreview = el => {
	let canvases = [];
	let ctxs = [];

	const createCanvases = () => {
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const canvasWidth = fontWidth * columns;
		const canvasHeight = fontHeight * 25;
		canvases = new Array();
		ctxs = new Array();
		for (let i = 0; i < Math.floor(rows / 25); i++) {
			const canvas = createCanvas(canvasWidth, canvasHeight);
			canvases.push(canvas);
			ctxs.push(canvas.getContext('2d'));
		}
		if (rows % 25 !== 0) {
			const canvas = createCanvas(canvasWidth, fontHeight * (rows % 25));
			canvases.push(canvas);
			ctxs.push(canvas.getContext('2d'));
		}
		canvases.forEach(canvas => {
			el.appendChild(canvas);
		});
	};

	const resize = () => {
		canvases.forEach(canvas => {
			el.removeChild(canvas);
		});
		createCanvases();
	};

	const drawHalfBlock = (foreground, x, y) => {
		const halfBlockY = y % 2;
		const textY = Math.floor(y / 2);
		const ctxIndex = Math.floor(textY / 25);
		if (ctxIndex >= 0 && ctxIndex < ctxs.length) {
			State.font.drawWithAlpha(
				halfBlockY === 0 ? 223 : 220,
				foreground,
				ctxs[ctxIndex],
				x,
				textY % 25,
			);
		}
	};

	const clear = () => {
		for (let i = 0; i < ctxs.length; i++) {
			ctxs[i].clearRect(0, 0, canvases[i].width, canvases[i].height);
		}
	};

	createCanvases();
	el.classList.add('enabled');

	document.addEventListener('onTextCanvasSizeChange', resize);
	document.addEventListener('onLetterSpacingChange', resize);
	document.addEventListener('onFontChange', resize);
	document.addEventListener('onOpenedFile', resize);

	return {
		clear: clear,
		drawHalfBlock: drawHalfBlock,
	};
};

const getUtf8Bytes = str => {
	return new TextEncoder().encode(str).length;
};

const enforceMaxBytes = () => {
	const SAUCE_MAX_BYTES = 16320;
	const sauceComments = $('sauce-comments');
	let val = sauceComments.value;
	let bytes = getUtf8Bytes(val);
	while (bytes > SAUCE_MAX_BYTES) {
		val = val.slice(0, -1);
		bytes = getUtf8Bytes(val);
	}
	if (val !== sauceComments.value) {
		sauceComments.value = val;
	}
	$('sauce-bytes').value = `${bytes}/${SAUCE_MAX_BYTES} bytes`;
};

const createGenericController = (panel, nav) => {
	const enable = () => {
		panel.style.display = 'flex';
		nav.classList.add('enabled-parent');
	};
	const disable = () => {
		panel.style.display = 'none';
		nav.classList.remove('enabled-parent');
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
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handler(files[0]);
		}
	});
};

const createMenuController = (menus, view) => {
	const close = menu => {
		setTimeout(_ => {
			menu.classList.remove('menu-open');
			view.focus();
		}, 60);
	};
	const closeAll = () => {
		menus.forEach(m => {
			m.classList.remove('menu-open');
		});
		view.focus();
	};
	menus.forEach(menu => {
		menu.addEventListener('click', e => {
			e.stopPropagation();
			e.preventDefault();
			if (menu.classList.contains('menu-open')) {
				close(menu);
			} else {
				menu.classList.add('menu-open');
				menu.focus();
			}
		});
		menu.addEventListener('blur', _ => {
			close(menu);
		});
	});
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

	// Init
	let focusedIdx = getOptions().findIndex(
		opt => opt.getAttribute('aria-selected') === 'true',
	);
	if (focusedIdx < 0) {
		focusedIdx = 0;
	}
	updateSelection(focusedIdx);
	updateFontPreview(getValue());

	return {
		focus: setFocus,
		getValue: getValue,
		setValue: setValue,
	};
};

const websocketUI = show => {
	[
		['excluded-for-websocket', !show],
		['included-for-websocket', show],
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
	createGenericController,
	createViewportController,
	createPaintShortcuts,
	createToggleButton,
	createGrid,
	createToolPreview,
	enforceMaxBytes,
	createResolutionController,
	createDragDropController,
	createMenuController,
	createFontSelect,
	websocketUI,
};
