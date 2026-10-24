/**
 * The F-key character set bar: twelve one-tap glyph slots riding the
 * active charset page, with pager buttons and the charset button that
 * names the page. Lives in the keyboard section of the tool settings
 * module; keyboard.js enables it with the keyboard tool.
 *
 * Pages follow the durdraw model: {label, chars} where 0-255 draws the
 * classic font and negative is ~codepoint through the hex fonts and
 * the doc glyph table.
 */
import State from './state.js';
import { $ } from './ui.js';
import { fitGlyphCanvas, get1xFont } from './glyphScale.js';
import { pageFromString, pagesForRange } from '../core/charsets.js';

const createFKeys = () => {
	// Stolen "savagely" from Moebius, who stole it "mercilessly" from PabloDraw, thanks Curtis! lol
	const predefinedSets = [
		[218, 191, 192, 217, 196, 179, 195, 180, 193, 194, 32, 32],
		[201, 187, 200, 188, 205, 186, 204, 185, 202, 203, 32, 32],
		[213, 184, 212, 190, 205, 179, 198, 181, 207, 209, 32, 32],
		[214, 183, 211, 189, 196, 186, 199, 182, 208, 210, 32, 32],
		[197, 206, 216, 215, 232, 232, 155, 156, 153, 239, 32, 32],
		[176, 177, 178, 219, 223, 220, 221, 222, 254, 250, 7, 32],
		[1, 2, 3, 4, 5, 6, 240, 14, 15, 32, 32, 32],
		[24, 25, 30, 31, 16, 17, 18, 29, 20, 21, 32, 32],
		[174, 175, 242, 243, 169, 170, 253, 246, 171, 172, 32, 32],
		[227, 241, 244, 245, 234, 157, 228, 248, 251, 252, 32, 32],
		[224, 225, 226, 229, 230, 231, 235, 236, 237, 238, 32, 32],
		[128, 135, 165, 164, 152, 159, 247, 249, 173, 168, 32, 32],
		[131, 132, 133, 160, 166, 134, 142, 143, 145, 146, 32, 32],
		[136, 137, 138, 130, 144, 140, 139, 141, 161, 158, 32, 32],
		[147, 148, 149, 162, 167, 150, 129, 151, 163, 154, 32, 32],
		[47, 92, 40, 41, 123, 125, 91, 93, 96, 39, 32, 32],
	];

	// Generate additional sets to cover all 256 characters
	const generateCharSets = () => {
		const charSets = [...predefinedSets];
		const usedChars = new Set();
		predefinedSets.forEach(set => {
			set.forEach(char => usedChars.add(char));
		});
		let currentSet = [];
		for (let i = 0; i < 256; i++) {
			if (!usedChars.has(i)) {
				currentSet.push(i);
				if (currentSet.length === 12) {
					charSets.push([...currentSet]);
					currentSet = [];
				}
			}
		}
		if (currentSet.length > 0) {
			while (currentSet.length < 12) {
				currentSet.push(32); // Pad with spaces
			}
			charSets.push(currentSet);
		}
		return charSets;
	};

	const classicPages = generateCharSets().map((chars, index) => ({
		label: `CP437 ${index + 1}`,
		chars,
	}));
	const unicodePages = [
		pageFromString('Rounded & diagonals', '╭╮╰╯╱╲╳◤◥◢◣'),
		...pagesForRange('Sextants', 0x1fb00, 0x1fb3b),
		...pagesForRange('Wedges', 0x1fb3c, 0x1fb6f),
		...pagesForRange('Eighth blocks', 0x1fb70, 0x1fb8b),
	];
	const loadCustomPages = () => {
		try {
			const raw = localStorage.getItem('customCharsets');
			const parsed = raw ? JSON.parse(raw) : [];
			return Array.isArray(parsed)
				? parsed.filter(page => page && Array.isArray(page.chars))
				: [];
		} catch {
			return [];
		}
	};
	let customPages = loadCustomPages();
	const buildSets = () => [...classicPages, ...unicodePages, ...customPages];
	let fkeySets = buildSets();
	let currentSetIndex = 5; // Default to set 5 (blocks, half-blocks, etc.)

	// warm the hex blocks for the active page so previews and inserts
	// are ready; browsing must NOT intern into the doc glyph table
	// (interning happens on insert), so this uses the preview path
	const preresolveCurrentSet = () => {
		if (!State.textArtCanvas) {
			return;
		}
		// the real cell size, like the display path: warming 8x16 under
		// an 8x8 or 9px font fills a cache nothing reads
		const width = State.fontWidth || 8;
		const height = State.fontHeight || 16;
		for (const token of fkeySets[currentSetIndex].chars) {
			if (token < 0) {
				State.textArtCanvas.unicodeGlyphBits(~token, width, height);
			}
		}
	};

	/** paint one ~codepoint token onto an fkey canvas */
	const drawUnicodeToken = (ctx, width, height, codepoint) => {
		const bits = State.textArtCanvas
			? State.textArtCanvas.unicodeGlyphBits(codepoint, width, height)
			: null;
		const fg = State.palette.getRGBAColor(State.palette.getForegroundColor());
		const bg = State.palette.getRGBAColor(State.palette.getBackgroundColor());
		const image = ctx.createImageData(width, height);
		for (let i = 0; i < width * height; i++) {
			const on = bits instanceof Uint8Array && bits[i] === 1;
			const color = on ? fg : bg;
			image.data[i * 4] = color[0];
			image.data[i * 4 + 1] = color[1];
			image.data[i * 4 + 2] = color[2];
			image.data[i * 4 + 3] = 255;
		}
		ctx.putImageData(image, 0, 0);
		if (bits === null) {
			// definitively unrenderable: hollow box like the renderer
			ctx.strokeStyle = `rgba(${fg[0]},${fg[1]},${fg[2]},1)`;
			ctx.strokeRect(1.5, 1.5, width - 3, height - 3);
		}
	};

	/** insert any token at the cursor (resolves unicode first) */
	const insertToken = token => {
		const commit = charCode => {
			State.textArtCanvas.startUndo();
			State.textArtCanvas.draw(callback => {
				callback(
					charCode,
					State.palette.getForegroundColor(),
					State.palette.getBackgroundColor(),
					State.cursor.getX(),
					State.cursor.getY(),
				);
			}, false);
			State.cursor.right();
		};
		if (token >= 0) {
			commit(token);
			return;
		}
		State.textArtCanvas
			.resolveUnicode([~token])
			.then(resolved => commit(resolved.get(~token) ?? 63));
	};

	const updateCharsetButton = page => {
		const name = $('charsetName');
		const counter = $('charsetPage');
		const button = $('charsetButton');
		const standing = `${currentSetIndex + 1}/${fkeySets.length}`;
		if (name) {
			name.textContent = page.label;
		}
		if (counter) {
			counter.textContent = standing;
		}
		if (button) {
			button.setAttribute(
				'aria-label',
				`Character set ${page.label}, page ${standing}. Choose another`,
			);
		}
	};

	const updateFKeyDisplays = () => {
		const currentPage = fkeySets[currentSetIndex];
		const currentSet = currentPage.chars;
		updateCharsetButton(currentPage);
		// no font yet means nothing to draw; the font load event reruns
		// this, and drawing through a zoomed State.font would crop tiles
		const previewFont = get1xFont();
		if (!previewFont) {
			return;
		}
		for (let i = 0; i < 12; i++) {
			const canvas = $('fkey' + i);
			if (canvas) {
				canvas.width = State.fontWidth;
				canvas.height = State.fontHeight;
				fitGlyphCanvas(canvas);

				if (currentSet[i] >= 0) {
					canvas.style.opacity = '';
					previewFont.draw(
						currentSet[i],
						State.palette.getForegroundColor(),
						State.palette.getBackgroundColor(),
						canvas.getContext('2d'),
						0,
						0,
					);
				} else {
					// collab lockout: vanilla servers can't carry unicode, so
					// these dim while connected (inserts become '?'); the ext
					// suite (t0wnz-ext-1) lifts it
					canvas.style.opacity =
						State.network?.isConnected?.() === true &&
						State.network?.extCollab?.() !== true
							? '0.4'
							: '';
					drawUnicodeToken(
						canvas.getContext('2d'),
						canvas.width,
						canvas.height,
						~currentSet[i],
					);
				}
			}
		}
	};

	for (let i = 0; i < 12; i++) {
		const canvas = $('fkey' + i);
		const wrap = $('fkey' + i + 'w');
		if (canvas && wrap) {
			wrap.addEventListener('click', () => {
				insertToken(fkeySets[currentSetIndex].chars[i]);
			});
		}
	}

	const prevButton = $('fkeySetPrev');
	const nextButton = $('fkeySetNext');

	const previousCharacterSet = () => {
		currentSetIndex =
			currentSetIndex <= 0 ? fkeySets.length - 1 : currentSetIndex - 1;
		preresolveCurrentSet();
		updateFKeyDisplays();
	};

	const nextCharacterSet = () => {
		currentSetIndex =
			currentSetIndex >= fkeySets.length - 1 ? 0 : currentSetIndex + 1;
		preresolveCurrentSet();
		updateFKeyDisplays();
	};

	if (prevButton) {
		prevButton.addEventListener('click', previousCharacterSet);
	}

	if (nextButton) {
		nextButton.addEventListener('click', nextCharacterSet);
	}

	const keyDown = e => {
		const fKeyMatch = e.code.match(/^F(\d+)$/);
		if (
			!e.altKey &&
			!e.ctrlKey &&
			!e.metaKey &&
			fKeyMatch &&
			fKeyMatch[1] >= 1 &&
			fKeyMatch[1] <= 12
		) {
			e.preventDefault();
			insertToken(fkeySets[currentSetIndex].chars[fKeyMatch[1] - 1]);
		}
		// 'Ctrl+[' - previous character set
		else if (e.ctrlKey && !e.altKey && !e.metaKey && e.code === 'BracketLeft') {
			e.preventDefault();
			previousCharacterSet();
		}
		// 'Ctrl+]' - next character set
		else if (
			e.ctrlKey &&
			!e.altKey &&
			!e.metaKey &&
			e.code === 'BracketRight'
		) {
			e.preventDefault();
			nextCharacterSet();
		}
	};

	const enable = () => {
		document.addEventListener('keydown', keyDown);
		updateFKeyDisplays();
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
	};

	document.addEventListener('onPaletteChange', updateFKeyDisplays);
	document.addEventListener('onForegroundChange', updateFKeyDisplays);
	document.addEventListener('onBackgroundChange', updateFKeyDisplays);
	document.addEventListener('onFontChange', updateFKeyDisplays);
	// hex blocks land async; re-render any pending unicode slots
	document.addEventListener('onHexBlocksLoaded', updateFKeyDisplays);
	// the charset picker persisted new custom pages
	document.addEventListener('onCustomCharsetsChange', () => {
		customPages = loadCustomPages();
		fkeySets = buildSets();
		if (currentSetIndex >= fkeySets.length) {
			currentSetIndex = 0;
		}
		updateFKeyDisplays();
	});

	/** jump straight to a page by index (the charset picker's hook) */
	const showSet = index => {
		if (index >= 0 && index < fkeySets.length) {
			currentSetIndex = index;
			preresolveCurrentSet();
			updateFKeyDisplays();
		}
	};

	return {
		enable: enable,
		disable: disable,
		showSet: showSet,
		getSets: () => fkeySets,
	};
};

export { createFKeys };
export default { createFKeys };
