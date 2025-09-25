/* Color related methods */
import State from './state.js';
import { $ } from './ui.js';

const charCodeToUnicode = new Map([
	[1, 0x263a],
	[2, 0x263b],
	[3, 0x2665],
	[4, 0x2666],
	[5, 0x2663],
	[6, 0x2660],
	[7, 0x2022],
	[8, 0x25d8],
	[9, 0x25cb],
	[10, 0x25d9],
	[11, 0x2642],
	[12, 0x2640],
	[13, 0x266a],
	[14, 0x266b],
	[15, 0x263c],
	[16, 0x25ba],
	[17, 0x25c4],
	[18, 0x2195],
	[19, 0x203c],
	[20, 0x00b6],
	[21, 0x00a7],
	[22, 0x25ac],
	[23, 0x21a8],
	[24, 0x2191],
	[25, 0x2193],
	[26, 0x2192],
	[27, 0x2190],
	[28, 0x221f],
	[29, 0x2194],
	[30, 0x25b2],
	[31, 0x25bc],
	[127, 0x2302],
	[128, 0x00c7],
	[129, 0x00fc],
	[130, 0x00e9],
	[131, 0x00e2],
	[132, 0x00e4],
	[133, 0x00e0],
	[134, 0x00e5],
	[135, 0x00e7],
	[136, 0x00ea],
	[137, 0x00eb],
	[138, 0x00e8],
	[139, 0x00ef],
	[140, 0x00ee],
	[141, 0x00ec],
	[142, 0x00c4],
	[143, 0x00c5],
	[144, 0x00c9],
	[145, 0x00e6],
	[146, 0x00c6],
	[147, 0x00f4],
	[148, 0x00f6],
	[149, 0x00f2],
	[150, 0x00fb],
	[151, 0x00f9],
	[152, 0x00ff],
	[153, 0x00d6],
	[154, 0x00dc],
	[155, 0x00a2],
	[156, 0x00a3],
	[157, 0x00a5],
	[158, 0x20a7],
	[159, 0x0192],
	[160, 0x00e1],
	[161, 0x00ed],
	[162, 0x00f3],
	[163, 0x00fa],
	[164, 0x00f1],
	[165, 0x00d1],
	[166, 0x00aa],
	[167, 0x00ba],
	[168, 0x00bf],
	[169, 0x2310],
	[170, 0x00ac],
	[171, 0x00bd],
	[172, 0x00bc],
	[173, 0x00a1],
	[174, 0x00ab],
	[175, 0x00bb],
	[176, 0x2591],
	[177, 0x2592],
	[178, 0x2593],
	[179, 0x2502],
	[180, 0x2524],
	[181, 0x2561],
	[182, 0x2562],
	[183, 0x2556],
	[184, 0x2555],
	[185, 0x2563],
	[186, 0x2551],
	[187, 0x2557],
	[188, 0x255d],
	[189, 0x255c],
	[190, 0x255b],
	[191, 0x2510],
	[192, 0x2514],
	[193, 0x2534],
	[194, 0x252c],
	[195, 0x251c],
	[196, 0x2500],
	[197, 0x253c],
	[198, 0x255e],
	[199, 0x255f],
	[200, 0x255a],
	[201, 0x2554],
	[202, 0x2569],
	[203, 0x2566],
	[204, 0x2560],
	[205, 0x2550],
	[206, 0x256c],
	[207, 0x2567],
	[208, 0x2568],
	[209, 0x2564],
	[210, 0x2565],
	[211, 0x2559],
	[212, 0x2558],
	[213, 0x2552],
	[214, 0x2553],
	[215, 0x256b],
	[216, 0x256a],
	[217, 0x2518],
	[218, 0x250c],
	[219, 0x2588],
	[220, 0x2584],
	[221, 0x258c],
	[222, 0x2590],
	[223, 0x2580],
	[224, 0x03b1],
	[225, 0x00df],
	[226, 0x0393],
	[227, 0x03c0],
	[228, 0x03a3],
	[229, 0x03c3],
	[230, 0x00b5],
	[231, 0x03c4],
	[232, 0x03a6],
	[233, 0x0398],
	[234, 0x03a9],
	[235, 0x03b4],
	[236, 0x221e],
	[237, 0x03c6],
	[238, 0x03b5],
	[239, 0x2229],
	[240, 0x2261],
	[241, 0x00b1],
	[242, 0x2265],
	[243, 0x2264],
	[244, 0x2320],
	[245, 0x2321],
	[246, 0x00f7],
	[247, 0x2248],
	[248, 0x00b0],
	[249, 0x2219],
	[250, 0x00b7],
	[251, 0x221a],
	[252, 0x207f],
	[253, 0x00b2],
	[254, 0x25a0],
	[0, 0x00a0],
	[255, 0x00a0],
]);

const getUnicode = charCode => charCodeToUnicode.get(charCode) || charCode;

const unicodeToArray = unicode => {
	if (unicode < 0x80) {
		return [unicode];
	} else if (unicode < 0x800) {
		return [(unicode >> 6) | 192, (unicode & 63) | 128];
	}
	return [(unicode >> 12) | 224, ((unicode >> 6) & 63) | 128, (unicode & 63) | 128];
};

const getUTF8 = charCode => unicodeToArray(getUnicode(charCode));

const rgbaToXbin = ({ r, g, b, a }) => [
	// Ensure the values don't exceed 63
	Math.min(r >> 2, 63),
	Math.min(g >> 2, 63),
	Math.min(b >> 2, 63),
	a, // Alpha remains unchanged
];

const xbinToRgba = ([r, g, b, a]) => [
	// Scale 6-bit to 8-bit
	Math.round((r / 63) * 255),
	Math.round((g / 63) * 255),
	Math.round((b / 63) * 255),
	a, // Alpha remains unchanged
];

const hexToRbga = hex => {
	const m = (/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i).exec(hex);
	if (!m) {
		console.error(`Invalid hex color: ${hex}`);
		return { r: 0, g: 0, b: 0, a: 255 };
	}
	return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 255 };
};

const rgbaToHex = rgbColor => {
	const [r, g, b] = rgbColor.split(',').map(num => parseInt(num.trim(), 10));
	const toHex = value => value.toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

const createPalette = RGB6Bit => {
	const RGBAColors = RGB6Bit.map(RGB6Bit => {
		return new Uint8Array([
			(RGB6Bit[0] << 2) | (RGB6Bit[0] >> 4),
			(RGB6Bit[1] << 2) | (RGB6Bit[1] >> 4),
			(RGB6Bit[2] << 2) | (RGB6Bit[2] >> 4),
			255,
		]);
	});
	let foreground = 7;
	let background = 0;

	const setRGBAColor = (index, newColor) => {
		const expandedColor = xbinToRgba(newColor); // Expand 6-bit to 8-bit
		RGBAColors[index] = new Uint8Array(expandedColor);

		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);

		State.textArtCanvas.setIceColors(true);
		State.font.setLetterSpacing(State.font.getLetterSpacing());
		setForegroundColor(index);
	};

	const setForegroundColor = newForeground => {
		foreground = newForeground;
		document.dispatchEvent(
			new CustomEvent('onForegroundChange', {
				bubbles: true,
				cancelable: false,
				detail: foreground,
			}),
		);
	};

	const setBackgroundColor = newBackground => {
		background = newBackground;
		document.dispatchEvent(
			new CustomEvent('onBackgroundChange', {
				bubbles: true,
				cancelable: false,
				detail: background,
			}),
		);
	};

	const hexToXbin = hex => rgbaToXbin(hexToRbga(hex));
	const getRGBColor = index => rgbaToHex(RGBAColors[index].toString());
	const getRGBAColor = index => RGBAColors[index];
	const getForegroundColor = () => foreground;
	const getBackgroundColor = () => background;
	const getPalette = () => RGBAColors;

	return {
		getUTF8: getUTF8,
		getUnicode: getUnicode,
		rgbToXbin: rgbaToXbin,
		rgbaToHex: rgbaToHex,
		hexToRbga: hexToRbga,
		hexToXbin: hexToXbin,
		xbinToRgba: xbinToRgba,
		getPalette: getPalette,
		getRGBColor: getRGBColor,
		getRGBAColor: getRGBAColor,
		setRGBAColor: setRGBAColor,
		getForegroundColor: getForegroundColor,
		getBackgroundColor: getBackgroundColor,
		setForegroundColor: setForegroundColor,
		setBackgroundColor: setBackgroundColor,
	};
};

const createDefaultPalette = () => {
	return createPalette([
		[0, 0, 0],
		[0, 0, 42],
		[0, 42, 0],
		[0, 42, 42],
		[42, 0, 0],
		[42, 0, 42],
		[42, 21, 0],
		[42, 42, 42],
		[21, 21, 21],
		[21, 21, 63],
		[21, 63, 21],
		[21, 63, 63],
		[63, 21, 21],
		[63, 21, 63],
		[63, 63, 21],
		[63, 63, 63],
	]);
};

const createPalettePreview = canvas => {
	const updatePreview = () => {
		const ctx = canvas.getContext('2d');
		const w = canvas.width;
		const h = canvas.height;
		const squareSize = Math.floor(Math.min(w, h) * 0.6);
		const offset = Math.floor(squareSize * 0.66) + 1;
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = `rgba(${State.palette.getRGBAColor(State.palette.getBackgroundColor()).join(',')})`;
		ctx.fillRect(offset, 0, squareSize, squareSize);
		ctx.fillStyle = `rgba(${State.palette.getRGBAColor(State.palette.getForegroundColor()).join(',')})`;
		ctx.fillRect(0, offset, squareSize, squareSize);
	};

	canvas.getContext('2d').createImageData(canvas.width, canvas.height);
	updatePreview();
	document.addEventListener('onForegroundChange', updatePreview);
	document.addEventListener('onBackgroundChange', updatePreview);
	document.addEventListener('onPaletteChange', updatePreview);

	return {
		updatePreview: updatePreview,
		setForegroundColor: updatePreview,
		setBackgroundColor: updatePreview,
	};
};

const createPalettePicker = canvas => {
	const imageData = [];
	const doubleTapThreshold = 300; // Time in ms to detect double-tap/click
	let lastTouchTime = 0;
	let lastMouseTime = 0;
	let cc = null;
	let colorEdited;

	const updateColor = index => {
		const color = State.palette.getRGBAColor(index);
		for (let y = 0, i = 0; y < imageData[index].height; y++) {
			for (let x = 0; x < imageData[index].width; x++, i += 4) {
				imageData[index].data.set(color, i);
			}
		}
		canvas
			.getContext('2d')
			.putImageData(imageData[index], index > 7 ? canvas.width / 2 : 0, (index % 8) * imageData[index].height);
	};

	const updatePalette = _ => {
		for (let i = 0; i < 16; i++) {
			updateColor(i);
		}
	};

	const keydown = e => {
		// Handle digit keys (0-7) with ctrl or alt modifiers
		if (e.code.startsWith('Digit') && ['0', '1', '2', '3', '4', '5', '6', '7'].includes(e.code.slice(-1))) {
			const num = parseInt(e.code.slice(-1), 10); // Extract the digit from 'Digit0', etc.

			if (e.ctrlKey === true) {
				e.preventDefault();
				if (State.palette.getForegroundColor() === num) {
					State.palette.setForegroundColor(num + 8);
				} else {
					State.palette.setForegroundColor(num);
				}
			} else if (e.altKey) {
				// Using e.code ensures we detect the physical key regardless of the character produced
				e.preventDefault();
				if (State.palette.getBackgroundColor() === num) {
					State.palette.setBackgroundColor(num + 8);
				} else {
					State.palette.setBackgroundColor(num);
				}
			}
			// ctrl + arrows
		} else if (e.code.startsWith('Arrow') && e.ctrlKey === true) {
			e.preventDefault();
			let color;
			switch (e.code) {
				case 'ArrowLeft': // Ctrl+Left - Previous background color
					color = State.palette.getBackgroundColor();
					color = color === 0 ? 15 : color - 1;
					State.palette.setBackgroundColor(color);
					break;
				case 'ArrowUp': // Ctrl+Up - Previous foreground color
					color = State.palette.getForegroundColor();
					color = color === 0 ? 15 : color - 1;
					State.palette.setForegroundColor(color);
					break;
				case 'ArrowRight': // Ctrl+Right - Next background color
					color = State.palette.getBackgroundColor();
					color = color === 15 ? 0 : color + 1;
					State.palette.setBackgroundColor(color);
					break;
				case 'ArrowDown': // Ctrl+Down - Next foreground color
					color = State.palette.getForegroundColor();
					color = color === 15 ? 0 : color + 1;
					State.palette.setForegroundColor(color);
					break;
				default:
					break;
			}
		}
	};

	const handleInteraction = (x, y, isDoubleClick, _isTouch) => {
		const colorIndex = y + (x === 0 ? 0 : 8);
		if (isDoubleClick) {
			if (cc !== null) {
				cc.classList.remove('hide');
				cc.value = State.palette.getRGBColor(colorIndex);
				cc.click();
				colorEdited = colorIndex;
			} else {
				State.palette.setForegroundColor(colorIndex);
			}
		} else {
			State.palette.setForegroundColor(colorIndex);
		}
	};

	const processEvent = (e, isTouch) => {
		const rect = canvas.getBoundingClientRect();
		const coords = isTouch ? { x: e.touches[0].pageX, y: e.touches[0].pageY } : { x: e.clientX, y: e.clientY };

		const x = Math.floor((coords.x - rect.left) / (canvas.width / 2));
		const y = Math.floor((coords.y - rect.top) / (canvas.height / 8));

		const currentTime = new Date().getTime();
		const lastTime = isTouch ? lastTouchTime : lastMouseTime;

		if (currentTime - lastTime < doubleTapThreshold) {
			handleInteraction(x, y, true, isTouch);
		} else {
			handleInteraction(x, y, false, isTouch);
		}

		if (isTouch) {
			lastTouchTime = currentTime;
		} else {
			lastMouseTime = currentTime;
		}
	};

	const touchEnd = e => {
		if (e.touches.length === 0) {
			processEvent(e, true);
		}
	};

	const mouseEnd = e => {
		processEvent(e, false);
	};

	const arraysEqual = (a, b) => a.length === b.length && a.every((value, index) => value === b[index]);

	const colorChange = e => {
		const oldColor = State.palette.hexToXbin(State.palette.getRGBColor(colorEdited));
		const newColor = State.palette.hexToXbin(e.target.value);
		if (!arraysEqual(oldColor, newColor)) {
			State.palette.setRGBAColor(colorEdited, newColor);
		}
	};

	// Create canvases
	for (let i = 0; i < 16; i++) {
		imageData[i] = canvas.getContext('2d').createImageData(canvas.width / 2, canvas.height / 8);
	}
	// Custom colors
	if ($('custom-color')) {
		cc = $('custom-color');
		cc.addEventListener('change', colorChange);
		cc.addEventListener('blur', colorChange);
	}
	// Add event listeners
	canvas.addEventListener('touchend', touchEnd);
	canvas.addEventListener('touchcancel', touchEnd);
	canvas.addEventListener('mouseup', mouseEnd);
	updatePalette();
	canvas.addEventListener('contextmenu', e => {
		e.preventDefault();
	});
	document.addEventListener('keydown', keydown);
	document.addEventListener('onPaletteChange', updatePalette);

	return { updatePalette: updatePalette };
};

export { createPalette, createDefaultPalette, createPalettePreview, createPalettePicker, getUTF8, getUnicode };
