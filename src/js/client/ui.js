import State from './state.js';

// Utilities for DOM manipulation
const D = document,
			$ = D.getElementById.bind(D),
			$$ = D.querySelector.bind(D),
			$$$ = D.querySelectorAll.bind(D),
			has = (i, c) => i.classList.contains(c),
			classList = (el, className, add = true) => (add ? el.classList.add(className) : el.classList.remove(className));

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
	];
	let closingTimeout = null;

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

const onSelectChange = (el, func) => {
	el.addEventListener('change', _ => {
		func(el.value);
	});
};

const createPositionInfo = el => {
	const update = (x, y) => {
		el.textContent = x + 1 + ', ' + (y + 1);
	};

	return { update: update };
};

const undoAndRedo = e => {
	if ((e.ctrlKey || (e.metaKey && !e.shiftKey)) && e.code === 'KeyZ') {
		// Ctrl/Cmd+Z - Undo
		e.preventDefault();
		State.textArtCanvas.undo();
	} else if ((e.ctrlKey && e.code === 'KeyY') || (e.metaKey && e.shiftKey && e.code === 'KeyZ')) {
		// Ctrl+Y or Cmd+Shift+Z - Redo
		e.preventDefault();
		State.textArtCanvas.redo();
	}
};

const createPaintShortcuts = keyPair => {
	let ignored = false;

	const isConnected = e =>
		!State.network || !State.network.isConnected() || !keyPair[e.key].classList.contains('excluded-for-websocket');

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

const createToggleButton = (stateOneName, stateTwoName, stateOneClick, stateTwoClick) => {
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
			for (let x = 0, i = y * fontHeight * byteWidth; x < canvas.width; x += 1, i += 4) {
				imageData.data.set(darkGray, i);
			}
		}
		for (let x = 0; x < columns; x += 1) {
			for (let y = 0, i = x * fontWidth * 4; y < canvas.height; y += 1, i += byteWidth) {
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
			State.font.drawWithAlpha(halfBlockY === 0 ? 223 : 220, foreground, ctxs[ctxIndex], x, textY % 25);
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

const menuHover = () => {
	$('file-menu').classList.remove('hover');
	$('edit-menu').classList.remove('hover');
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

const createResolutionController = (lbl, txtC, txtR) => {
	['onTextCanvasSizeChange', 'onFontChange', 'onXBFontLoaded', 'onOpenedFile'].forEach(e => {
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
		el.classList.add('drag-over');
	});
	document.addEventListener('dragover', e => {
		e.preventDefault();
	});
	document.addEventListener('dragleave', e => {
		e.preventDefault();
		dragCounter--;
		if (dragCounter === 0) {
			el.classList.remove('drag-over');
		}
	});
	document.addEventListener('drop', e => {
		e.preventDefault();
		dragCounter = 0;
		el.classList.remove('drag-over');
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handler(files[0]);
		}
	});
};

const websocketUI = show => {
	[
		['excluded-for-websocket', !show],
		['included-for-websocket', show],
	].forEach(([sel, prop]) =>
		[...D.getElementsByClassName(sel)].forEach(el => (el.style.display = prop ? 'block' : 'none')));
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
	onSelectChange,
	createPositionInfo,
	undoAndRedo,
	createGenericController,
	createPaintShortcuts,
	createToggleButton,
	createGrid,
	createToolPreview,
	menuHover,
	enforceMaxBytes,
	createResolutionController,
	createDragDropController,
	websocketUI,
};
