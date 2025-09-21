/* Color related methods */
import State from './state.js';

const getUnicode = charCode => {
	switch (charCode) {
		case 1:
			return 0x263a;
		case 2:
			return 0x263b;
		case 3:
			return 0x2665;
		case 4:
			return 0x2666;
		case 5:
			return 0x2663;
		case 6:
			return 0x2660;
		case 7:
			return 0x2022;
		case 8:
			return 0x25d8;
		case 9:
			return 0x25cb;
		case 10:
			return 0x25d9;
		case 11:
			return 0x2642;
		case 12:
			return 0x2640;
		case 13:
			return 0x266a;
		case 14:
			return 0x266b;
		case 15:
			return 0x263c;
		case 16:
			return 0x25ba;
		case 17:
			return 0x25c4;
		case 18:
			return 0x2195;
		case 19:
			return 0x203c;
		case 20:
			return 0x00b6;
		case 21:
			return 0x00a7;
		case 22:
			return 0x25ac;
		case 23:
			return 0x21a8;
		case 24:
			return 0x2191;
		case 25:
			return 0x2193;
		case 26:
			return 0x2192;
		case 27:
			return 0x2190;
		case 28:
			return 0x221f;
		case 29:
			return 0x2194;
		case 30:
			return 0x25b2;
		case 31:
			return 0x25bc;
		case 127:
			return 0x2302;
		case 128:
			return 0x00c7;
		case 129:
			return 0x00fc;
		case 130:
			return 0x00e9;
		case 131:
			return 0x00e2;
		case 132:
			return 0x00e4;
		case 133:
			return 0x00e0;
		case 134:
			return 0x00e5;
		case 135:
			return 0x00e7;
		case 136:
			return 0x00ea;
		case 137:
			return 0x00eb;
		case 138:
			return 0x00e8;
		case 139:
			return 0x00ef;
		case 140:
			return 0x00ee;
		case 141:
			return 0x00ec;
		case 142:
			return 0x00c4;
		case 143:
			return 0x00c5;
		case 144:
			return 0x00c9;
		case 145:
			return 0x00e6;
		case 146:
			return 0x00c6;
		case 147:
			return 0x00f4;
		case 148:
			return 0x00f6;
		case 149:
			return 0x00f2;
		case 150:
			return 0x00fb;
		case 151:
			return 0x00f9;
		case 152:
			return 0x00ff;
		case 153:
			return 0x00d6;
		case 154:
			return 0x00dc;
		case 155:
			return 0x00a2;
		case 156:
			return 0x00a3;
		case 157:
			return 0x00a5;
		case 158:
			return 0x20a7;
		case 159:
			return 0x0192;
		case 160:
			return 0x00e1;
		case 161:
			return 0x00ed;
		case 162:
			return 0x00f3;
		case 163:
			return 0x00fa;
		case 164:
			return 0x00f1;
		case 165:
			return 0x00d1;
		case 166:
			return 0x00aa;
		case 167:
			return 0x00ba;
		case 168:
			return 0x00bf;
		case 169:
			return 0x2310;
		case 170:
			return 0x00ac;
		case 171:
			return 0x00bd;
		case 172:
			return 0x00bc;
		case 173:
			return 0x00a1;
		case 174:
			return 0x00ab;
		case 175:
			return 0x00bb;
		case 176:
			return 0x2591;
		case 177:
			return 0x2592;
		case 178:
			return 0x2593;
		case 179:
			return 0x2502;
		case 180:
			return 0x2524;
		case 181:
			return 0x2561;
		case 182:
			return 0x2562;
		case 183:
			return 0x2556;
		case 184:
			return 0x2555;
		case 185:
			return 0x2563;
		case 186:
			return 0x2551;
		case 187:
			return 0x2557;
		case 188:
			return 0x255d;
		case 189:
			return 0x255c;
		case 190:
			return 0x255b;
		case 191:
			return 0x2510;
		case 192:
			return 0x2514;
		case 193:
			return 0x2534;
		case 194:
			return 0x252c;
		case 195:
			return 0x251c;
		case 196:
			return 0x2500;
		case 197:
			return 0x253c;
		case 198:
			return 0x255e;
		case 199:
			return 0x255f;
		case 200:
			return 0x255a;
		case 201:
			return 0x2554;
		case 202:
			return 0x2569;
		case 203:
			return 0x2566;
		case 204:
			return 0x2560;
		case 205:
			return 0x2550;
		case 206:
			return 0x256c;
		case 207:
			return 0x2567;
		case 208:
			return 0x2568;
		case 209:
			return 0x2564;
		case 210:
			return 0x2565;
		case 211:
			return 0x2559;
		case 212:
			return 0x2558;
		case 213:
			return 0x2552;
		case 214:
			return 0x2553;
		case 215:
			return 0x256b;
		case 216:
			return 0x256a;
		case 217:
			return 0x2518;
		case 218:
			return 0x250c;
		case 219:
			return 0x2588;
		case 220:
			return 0x2584;
		case 221:
			return 0x258c;
		case 222:
			return 0x2590;
		case 223:
			return 0x2580;
		case 224:
			return 0x03b1;
		case 225:
			return 0x00df;
		case 226:
			return 0x0393;
		case 227:
			return 0x03c0;
		case 228:
			return 0x03a3;
		case 229:
			return 0x03c3;
		case 230:
			return 0x00b5;
		case 231:
			return 0x03c4;
		case 232:
			return 0x03a6;
		case 233:
			return 0x0398;
		case 234:
			return 0x03a9;
		case 235:
			return 0x03b4;
		case 236:
			return 0x221e;
		case 237:
			return 0x03c6;
		case 238:
			return 0x03b5;
		case 239:
			return 0x2229;
		case 240:
			return 0x2261;
		case 241:
			return 0x00b1;
		case 242:
			return 0x2265;
		case 243:
			return 0x2264;
		case 244:
			return 0x2320;
		case 245:
			return 0x2321;
		case 246:
			return 0x00f7;
		case 247:
			return 0x2248;
		case 248:
			return 0x00b0;
		case 249:
			return 0x2219;
		case 250:
			return 0x00b7;
		case 251:
			return 0x221a;
		case 252:
			return 0x207f;
		case 253:
			return 0x00b2;
		case 254:
			return 0x25a0;
		case 0:
		case 255:
			return 0x00a0;
		default:
			return charCode;
	}
};

const unicodeToArray = unicode => {
	if (unicode < 0x80) {
		return [unicode];
	} else if (unicode < 0x800) {
		return [(unicode >> 6) | 192, (unicode & 63) | 128];
	}
	return [(unicode >> 12) | 224, ((unicode >> 6) & 63) | 128, (unicode & 63) | 128];
};

const getUTF8 = charCode => {
	return unicodeToArray(getUnicode(charCode));
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

	const getRGBAColor = index => {
		return RGBAColors[index];
	};

	const getForegroundColor = () => {
		return foreground;
	};

	const getBackgroundColor = () => {
		return background;
	};

	const setForegroundColor = newForeground => {
		foreground = newForeground;
		document.dispatchEvent(new CustomEvent('onForegroundChange', { detail: foreground }));
	};

	const setBackgroundColor = newBackground => {
		background = newBackground;
		document.dispatchEvent(new CustomEvent('onBackgroundChange', { detail: background }));
	};

	return {
		getRGBAColor: getRGBAColor,
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

	const touchEnd = e => {
		const rect = canvas.getBoundingClientRect();
		const x = Math.floor((e.touches[0].pageX - rect.left) / (canvas.width / 2));
		const y = Math.floor((e.touches[0].pageY - rect.top) / (canvas.height / 8));
		const colorIndex = y + (x === 0 ? 0 : 8);
		State.palette.setForegroundColor(colorIndex);
	};

	const mouseEnd = e => {
		const rect = canvas.getBoundingClientRect();
		const x = Math.floor((e.clientX - rect.left) / (canvas.width / 2));
		const y = Math.floor((e.clientY - rect.top) / (canvas.height / 8));
		const colorIndex = y + (x === 0 ? 0 : 8);
		if (e.altKey === false && e.ctrlKey === false) {
			State.palette.setForegroundColor(colorIndex);
		} else {
			State.palette.setBackgroundColor(colorIndex);
		}
	};

	for (let i = 0; i < 16; i++) {
		imageData[i] = canvas.getContext('2d').createImageData(canvas.width / 2, canvas.height / 8);
	}

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

	updatePalette();
	canvas.addEventListener('touchend', touchEnd);
	canvas.addEventListener('touchcancel', touchEnd);
	canvas.addEventListener('mouseup', mouseEnd);
	canvas.addEventListener('contextmenu', e => {
		e.preventDefault();
	});
	document.addEventListener('keydown', keydown);
	document.addEventListener('onPaletteChange', updatePalette);

	return { updatePalette: updatePalette };
};

export { createPalette, createDefaultPalette, createPalettePreview, createPalettePicker, getUTF8, getUnicode };
