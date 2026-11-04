// @ts-check
import State from './state.js';
import { $ } from './ui.js';
import { xterm256RGB } from '../core/codecs/dur.js';
import { expand6to8 } from '../core/doc.js';
import { createTouchHold } from './touchHold.js';

/** @param {{r: number, g: number, b: number, a: number}} rgba @returns {number[]} */
const rgbaToXbin = ({ r, g, b, a }) => [
	Math.min(r >> 2, 63),
	Math.min(g >> 2, 63),
	Math.min(b >> 2, 63),
	a,
];

/** @param {number[]} xbin 6-bit [r, g, b, a] @returns {number[]} */
const xbinToRgba = ([r, g, b, a]) => [
	// the canonical expansion lives in ONE place (doc.ts): an inline
	// round(v/63*255) differs by one LSB on ten of 64 values, so a
	// load, autosave, reload cycle would shift colors
	expand6to8(r),
	expand6to8(g),
	expand6to8(b),
	a,
];

/** @param {string} hex @returns {{r: number, g: number, b: number, a: number}} */
const hexToRbga = hex => {
	const m = (/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i).exec(hex);
	if (!m) {
		console.error(`[Palette] Invalid hex color: ${hex}`);
		return { r: 0, g: 0, b: 0, a: 255 };
	}
	return {
		r: parseInt(m[1], 16),
		g: parseInt(m[2], 16),
		b: parseInt(m[3], 16),
		a: 255,
	};
};

/** @param {string} rgbColor comma-separated "r,g,b[,a]" @returns {string} */
const rgbaToHex = rgbColor => {
	const [r, g, b] = rgbColor.split(',').map(num => parseInt(num.trim(), 10));
	/** @param {number} value */
	const toHex = value => value.toString(16).padStart(2, '0');
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

/** @param {number[][]} RGB6Bit sixteen 6-bit [r, g, b] entries */
const createPalette = RGB6Bit => {
	const RGBAColors = RGB6Bit.map(RGB6Bit => {
		return new Uint8Array([
			expand6to8(RGB6Bit[0]),
			expand6to8(RGB6Bit[1]),
			expand6to8(RGB6Bit[2]),
			255,
		]);
	});
	let foreground = 7;
	let background = 0;

	/** @param {number} index @param {number[]} newColor 6-bit [r, g, b, a] */
	const setRGBAColor = (index, newColor) => {
		const expandedColor = xbinToRgba(newColor);
		RGBAColors[index] = new Uint8Array(expandedColor);
		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);
		State.font?.redraw();
		setForegroundColor(index);
	};

	/** @param {number} newForeground */
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

	/** @param {number} newBackground */
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

	/** @param {string} hex */
	const hexToXbin = hex => rgbaToXbin(hexToRbga(hex));
	/** @param {number} index */
	const getRGBColor = index => rgbaToHex(RGBAColors[index].toString());
	/**
	 * RGBA for any color value: classic 0-15 index, tag-bit palette word
	 * (indexes above 15 resolve through the xterm table), or a raw
	 * 0x00RRGGBB word.
	 * @param {number} value
	 */
	const getRGBAColor = value => {
		if (value >= 0 && value <= 15) {
			return RGBAColors[value];
		}
		if ((value & 0x80000000) !== 0) {
			const index = value & 0xff;
			if (index <= 15) {
				return RGBAColors[index];
			}
			const word = xterm256RGB(index);
			return new Uint8Array([
				(word >> 16) & 0xff,
				(word >> 8) & 0xff,
				word & 0xff,
				255,
			]);
		}
		return new Uint8Array([
			(value >> 16) & 0xff,
			(value >> 8) & 0xff,
			value & 0xff,
			255,
		]);
	};
	// strict PLANE WORD resolver: bit 31 tags a palette or xterm index,
	// a clear bit 31 is frozen RGB even for values 0-15 (tundra near
	// black fades), which getRGBAColor's index branch paints bright
	/** @param {number} word */
	const getRGBAColorForWord = word => {
		if ((word & 0x80000000) !== 0) {
			return getRGBAColor(word);
		}
		return new Uint8Array([
			(word >> 16) & 0xff,
			(word >> 8) & 0xff,
			word & 0xff,
			255,
		]);
	};
	const getForegroundColor = () => foreground;
	const getBackgroundColor = () => background;
	const getPalette = () => RGBAColors;

	return {
		// conversion helpers stay off the instance; only hexToXbin is
		// read off one (the custom color input)
		hexToXbin: hexToXbin,
		getPalette: getPalette,
		getRGBColor: getRGBColor,
		getRGBAColor: getRGBAColor,
		getRGBAColorForWord: getRGBAColorForWord,
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

/** @param {HTMLCanvasElement} canvas */
const createPalettePreview = canvas => {
	const updatePreview = () => {
		const ctx = canvas.getContext('2d');
		const palette = State.palette;
		if (!ctx || !palette) {
			return;
		}
		const w = canvas.width;
		const h = canvas.height;
		const squareSize = Math.floor(Math.min(w, h) * 0.6);
		const offset = Math.floor(squareSize * 0.66) + 1;
		ctx.clearRect(0, 0, w, h);
		ctx.fillStyle = `rgba(${palette.getRGBAColor(palette.getBackgroundColor()).join(',')})`;
		ctx.fillRect(offset, 0, squareSize, squareSize);
		ctx.fillStyle = `rgba(${palette.getRGBAColor(palette.getForegroundColor()).join(',')})`;
		ctx.fillRect(0, offset, squareSize, squareSize);
	};

	updatePreview();
	document.addEventListener('onForegroundChange', updatePreview);
	document.addEventListener('onBackgroundChange', updatePreview);
	document.addEventListener('onPaletteChange', updatePreview);

	return { updatePreview: updatePreview };
};

/**
 * Which color a swatch press picks, by the same buttons as Moebius
 * palette.js, update_swatches(). The ctrl test reads the mouse event
 * because Windows and Linux deliver a ctrl click as a plain left
 * click, which no contextmenu listener ever sees
 * @param {MouseEvent} e
 * @returns {boolean|undefined} true for the background, false for the
 * foreground, undefined for a button that picks neither
 */
const picksBackground = e =>
	(e.button === 2 || e.ctrlKey ? true : e.button === 0 ? false : undefined);

/**
 * Binds swatches that pick on click, contextmenu, and a touch hold so
 * each press picks once. A binder's swatches share one guard: some
 * engines still send a click after a macOS ctrl click's contextmenu or
 * a hold, and by then a pick that rebuilt its row has slid another
 * swatch under the pointer
 * @returns {(el: HTMLElement, pick: (bg?: boolean) => void) => void}
 */
const createSwatchBinder = () => {
	const hold = createTouchHold();
	let picked = false;
	// the native long-press contextmenu that trails a hold, during it
	// or after the lift, belongs to the same press
	let held = false;
	// iPadOS sends the click of a quick second tap, finger or Pencil, to
	// where the first tap landed: another swatch, or off the swatches
	// altogether, where it and the dblclick after it can shade a panel.
	// The swatch the second tap pressed owns that click
	/** @type {{el: HTMLElement, pick: (bg?: boolean) => void} | null} */
	let press = null;
	let redirected = false;
	document.addEventListener(
		'pointerdown',
		() => {
			press = null;
			redirected = false;
		},
		true,
	);
	document.addEventListener(
		'click',
		e => {
			if (!press || e.detail < 2 || press.el.contains(/** @type {Node} */ (e.target))) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			redirected = true;
			if (!picked) {
				picked = true;
				press.pick(picksBackground(e));
			}
		},
		true,
	);
	document.addEventListener(
		'dblclick',
		e => {
			if (redirected) {
				redirected = false;
				e.preventDefault();
				e.stopPropagation();
			}
		},
		true,
	);
	return (el, pick) => {
		el.addEventListener('pointerdown', e => {
			picked = held = false;
			if ((e.pointerType === 'touch' || e.pointerType === 'pen') && e.isPrimary) {
				press = { el, pick };
			}
			hold.arm(e, () => {
				picked = held = true;
				pick(true);
			});
		});
		el.addEventListener('pointermove', hold.move);
		el.addEventListener('click', e => {
			// a keyboard click (detail 0) has no pointerdown to clear the
			// guard, so a menu key's pick would otherwise swallow it
			if (!picked || !e.detail) {
				pick(picksBackground(e));
			}
		});
		el.addEventListener('contextmenu', e => {
			// stopped as well, or a module's panel menu opens over the pick
			e.preventDefault();
			e.stopPropagation();
			// a native long press that beats the timer picks through the
			// hold, so held marks the press's one pick either way
			hold.flush();
			if (held) {
				held = false;
			} else {
				picked = true;
				pick(true);
			}
		});
	};
};

/** @param {HTMLCanvasElement} canvas */
const createPalettePicker = canvas => {
	/** @type {ImageData[]} */
	const imageData = [];
	const doubleTapThreshold = 300; // ms
	let lastTouchTime = 0;
	let lastMouseTime = 0;
	// a double tap needs both taps on one color, or two quick picks of
	// two colors open the editor for the second instead of picking it
	let lastTouchIndex = -1;
	let lastMouseIndex = -1;
	const hold = createTouchHold();
	// a press that held, wandered, met a second finger, or was
	// cancelled lifts as neither a tap nor half of a double tap
	let spent = false;
	/** @type {HTMLInputElement|null} */
	let cc = null;
	let colorEdited = 0;

	/** @param {number} index */
	const updateColor = index => {
		const palette = State.palette;
		if (!palette) {
			return;
		}
		const color = palette.getRGBAColor(index);
		for (let y = 0, i = 0; y < imageData[index].height; y++) {
			for (let x = 0; x < imageData[index].width; x++, i += 4) {
				imageData[index].data.set(color, i);
			}
		}
		canvas
			.getContext('2d')
			?.putImageData(
				imageData[index],
				index > 7 ? canvas.width / 2 : 0,
				(index % 8) * imageData[index].height,
			);
	};

	const updatePalette = () => {
		for (let i = 0; i < 16; i++) {
			updateColor(i);
		}
	};

	/** @param {KeyboardEvent} e */
	const keydown = e => {
		const palette = State.palette;
		if (!palette) {
			return;
		}
		if (
			e.code.startsWith('Digit') &&
			['0', '1', '2', '3', '4', '5', '6', '7'].includes(e.code.slice(-1))
		) {
			const num = parseInt(e.code.slice(-1), 10);

			if (e.ctrlKey) {
				e.preventDefault();
				if (palette.getForegroundColor() === num) {
					palette.setForegroundColor(num + 8);
				} else {
					palette.setForegroundColor(num);
				}
			} else if (e.altKey) {
				// e.code reads the physical key, whatever character it produced
				e.preventDefault();
				if (palette.getBackgroundColor() === num) {
					palette.setBackgroundColor(num + 8);
				} else {
					palette.setBackgroundColor(num);
				}
			}
		} else if (e.code.startsWith('Arrow') && e.ctrlKey) {
			e.preventDefault();
			let color;
			switch (e.code) {
				case 'ArrowLeft':
					color = palette.getBackgroundColor();
					color = color === 0 ? 15 : color - 1;
					palette.setBackgroundColor(color);
					break;
				case 'ArrowUp':
					color = palette.getForegroundColor();
					color = color === 0 ? 15 : color - 1;
					palette.setForegroundColor(color);
					break;
				case 'ArrowRight':
					color = palette.getBackgroundColor();
					color = color === 15 ? 0 : color + 1;
					palette.setBackgroundColor(color);
					break;
				case 'ArrowDown':
					color = palette.getForegroundColor();
					color = color === 15 ? 0 : color + 1;
					palette.setForegroundColor(color);
					break;
				default:
					break;
			}
		}
	};

	/**
	 * @param {number} colorIndex
	 * @param {boolean} isDoubleClick
	 */
	const handleInteraction = (colorIndex, isDoubleClick) => {
		const palette = State.palette;
		if (!palette) {
			return;
		}
		if (isDoubleClick) {
			if (cc !== null) {
				cc.classList.remove('hide');
				// Chrome for Android opens no picker for an input without a
				// layout box, and the box would wait for the next frame unless
				// a layout read builds it now
				cc.getBoundingClientRect();
				cc.value = palette.getRGBColor(colorIndex);
				cc.click();
				colorEdited = colorIndex;
			} else {
				palette.setForegroundColor(colorIndex);
			}
		} else {
			palette.setForegroundColor(colorIndex);
		}
	};

	/**
	 * @param {number} px
	 * @param {number} py
	 * @returns {number} the strip color index under the point
	 */
	const swatchAt = (px, py) => {
		// fractions of the rendered rect, not the backing store: the
		// phone palette flyout scales the canvas with CSS
		const rect = canvas.getBoundingClientRect();
		// a finger can slide a few pixels off the strip before it lifts
		// and still pick, so a point past an edge takes the nearest swatch
		const column = Math.floor(((px - rect.left) / rect.width) * 2);
		const row = Math.min(
			7,
			Math.max(0, Math.floor(((py - rect.top) / rect.height) * 8)),
		);
		return row + (column <= 0 ? 0 : 8);
	};

	/**
	 * @param {number} px
	 * @param {number} py
	 */
	const pickBackground = (px, py) => {
		State.palette?.setBackgroundColor(swatchAt(px, py));
	};

	/**
	 * A touchend fires with touches already empty, so the lifted
	 * finger's coords live on changedTouches
	 * @param {*} e TouchEvent or MouseEvent
	 * @param {boolean} isTouch
	 */
	const processEvent = (e, isTouch) => {
		const touch = isTouch ? (e.changedTouches?.[0] ?? e.touches?.[0]) : null;
		if (isTouch && !touch) {
			return;
		}
		const index = isTouch
			? swatchAt(touch.pageX, touch.pageY)
			: swatchAt(e.clientX, e.clientY);

		const currentTime = new Date().getTime();
		const lastTime = isTouch ? lastTouchTime : lastMouseTime;
		const lastIndex = isTouch ? lastTouchIndex : lastMouseIndex;

		handleInteraction(
			index,
			currentTime - lastTime < doubleTapThreshold && index === lastIndex,
		);

		if (isTouch) {
			lastTouchTime = currentTime;
			lastTouchIndex = index;
		} else {
			lastMouseTime = currentTime;
			lastMouseIndex = index;
		}
	};

	/** @param {TouchEvent} e */
	const touchEnd = e => {
		// without this the browser follows up with a synthetic mouseup
		// and mouseEnd processes the same tap a second time
		e.preventDefault();
		if (e.touches.length === 0 && !spent) {
			processEvent(e, true);
		}
	};

	/** @param {MouseEvent} e */
	const mouseEnd = e => {
		// a desktop pen sends no touch events to cancel, so its mouseup
		// follows a hold that already picked
		if (spent) {
			return;
		}
		const bg = picksBackground(e);
		// a background pick stays out of the double click timing, or a
		// quick fg then bg pick would open the color editor
		if (bg) {
			pickBackground(e.clientX, e.clientY);
		} else if (bg === false) {
			processEvent(e, false);
		}
	};

	/** @param {number[]} a @param {number[]} b */
	const arraysEqual = (a, b) =>
		a.length === b.length && a.every((value, index) => value === b[index]);

	/** @param {Event} e */
	const colorChange = e => {
		const palette = State.palette;
		if (!palette) {
			return;
		}
		const oldColor = palette.hexToXbin(palette.getRGBColor(colorEdited));
		const input = /** @type {HTMLInputElement} */ (e.target);
		const newColor = palette.hexToXbin(input.value);
		if (!arraysEqual(oldColor, newColor)) {
			palette.setRGBAColor(colorEdited, newColor);
		}
	};

	const pickerCtx = canvas.getContext('2d');
	if (pickerCtx) {
		for (let i = 0; i < 16; i++) {
			imageData[i] = pickerCtx.createImageData(
				canvas.width / 2,
				canvas.height / 8,
			);
		}
	}
	const customColor = /** @type {HTMLInputElement|null} */ ($('customColor'));
	if (customColor) {
		cc = customColor;
		cc.addEventListener('change', colorChange);
		cc.addEventListener('blur', colorChange);
	}
	canvas.addEventListener('pointerdown', e => {
		spent = !e.isPrimary;
		hold.arm(
			e,
			() => {
				spent = true;
				pickBackground(e.clientX, e.clientY);
			},
			() => {
				spent = true;
			},
		);
	});
	canvas.addEventListener('pointermove', hold.move);
	canvas.addEventListener('touchend', touchEnd);
	canvas.addEventListener('touchcancel', touchEnd);
	canvas.addEventListener('mouseup', mouseEnd);
	updatePalette();
	canvas.addEventListener('contextmenu', e => {
		e.preventDefault();
		hold.flush();
	});
	document.addEventListener('keydown', keydown);
	document.addEventListener('onPaletteChange', updatePalette);

	return { updatePalette: updatePalette };
};

export {
	createPalette,
	createDefaultPalette,
	createPalettePreview,
	createPalettePicker,
	createSwatchBinder,
	picksBackground,
};
