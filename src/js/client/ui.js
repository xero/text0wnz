import State from './state.js';

// Utilities for DOM manipulation
const D = document,
			$ = D.getElementById.bind(D),
			$$ = D.querySelector.bind(D);

const createCanvas = (width, height) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

// Toggles
const createSettingToggle = (divButton, getter, setter) => {
	let currentSetting;
	let g = getter;
	let s = setter;

	const update = () => {
		currentSetting = g();
		if (currentSetting === true) {
			divButton.classList.add('enabled');
		} else {
			divButton.classList.remove('enabled');
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

	divButton.addEventListener('click', changeSetting);
	update();

	return {
		sync: sync,
		update: update,
	};
};

const onReturn = (divElement, divTarget) => {
	divElement.addEventListener('keypress', e => {
		if (!e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'Enter') {
			// Enter key
			e.preventDefault();
			e.stopPropagation();
			divTarget.click();
		}
	});
};

const onClick = (divElement, func) => {
	divElement.addEventListener('click', e => {
		e.preventDefault();
		func(divElement);
	});
};

const onFileChange = (divElement, func) => {
	divElement.addEventListener('change', e => {
		if (e.target.files.length > 0) {
			func(e.target.files[0]);
		}
	});
};

const onSelectChange = (divElement, func) => {
	divElement.addEventListener('change', _ => {
		func(divElement.value);
	});
};

const createPositionInfo = divElement => {
	const update = (x, y) => {
		divElement.textContent = x + 1 + ', ' + (y + 1);
	};

	return { update: update };
};

const showOverlay = divElement => {
	divElement.classList.add('enabled');
};

const hideOverlay = divElement => {
	divElement.classList.remove('enabled');
};

const undoAndRedo = e => {
	if ((e.ctrlKey === true || (e.metaKey === true && e.shiftKey === false)) && e.code === 'KeyZ') {
		// Ctrl/Cmd+Z - Undo
		e.preventDefault();
		State.textArtCanvas.undo();
	} else if (
		(e.ctrlKey === true && e.code === 'KeyY') ||
		(e.metaKey === true && e.shiftKey === true && e.code === 'KeyZ')
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
		State.network.isConnected() === false ||
		keyPair[e.key].classList.contains('excluded-for-websocket') === false;

	const keyDown = e => {
		if (ignored === false) {
			if (e.ctrlKey === false && e.altKey === false && e.shiftKey === false && e.metaKey === false) {
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
		if (ignored === false) {
			if (e.ctrlKey === true && e.altKey === false && e.shiftKey === false && e.metaKey === false) {
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
	const divContainer = document.createElement('DIV');
	divContainer.classList.add('toggle-button-container');
	const stateOne = document.createElement('DIV');
	stateOne.classList.add('toggle-button');
	stateOne.classList.add('left');
	stateOne.textContent = stateOneName;
	const stateTwo = document.createElement('DIV');
	stateTwo.classList.add('toggle-button');
	stateTwo.classList.add('right');
	stateTwo.textContent = stateTwoName;
	divContainer.appendChild(stateOne);
	divContainer.appendChild(stateTwo);

	const getElement = () => {
		return divContainer;
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

const createGrid = divElement => {
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
		divElement.appendChild(canvases[0]);
		for (let i = 1; i < canvases.length; i++) {
			canvases[i].getContext('2d').drawImage(canvases[0], 0, 0);
			divElement.appendChild(canvases[i]);
		}
	};

	const resize = () => {
		canvases.forEach(canvas => {
			divElement.removeChild(canvas);
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
		if (enabled === true && turnOn === false) {
			divElement.classList.remove('enabled');
			enabled = false;
		} else if (enabled === false && turnOn === true) {
			divElement.classList.add('enabled');
			enabled = true;
		}
	};

	return {
		isShown: isShown,
		show: show,
	};
};

const createToolPreview = divElement => {
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
			divElement.appendChild(canvas);
		});
	};

	const resize = () => {
		canvases.forEach(canvas => {
			divElement.removeChild(canvas);
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
	divElement.classList.add('enabled');

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
	createCanvas,
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	onSelectChange,
	createPositionInfo,
	showOverlay,
	hideOverlay,
	undoAndRedo,
	createGenericController,
	createPaintShortcuts,
	createToggleButton,
	createGrid,
	createToolPreview,
	menuHover,
	enforceMaxBytes,
	createResolutionController,
	websocketUI,
};
