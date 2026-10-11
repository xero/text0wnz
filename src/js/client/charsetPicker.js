/**
 * Charset picker modal (P5, durdraw lineage): search every Unicode
 * block by name, preview the glyphs the bundled hex fonts cover,
 * click to insert at the cursor, and import charset tables (durdraw
 * .ini or teXt0wnz .json) that then ride the F-key bar via the
 * onCustomCharsetsChange event.
 *
 * Big CJK-class blocks render in slices of GRID_LIMIT glyphs with a
 * more... row; coverage comes from hexFontPages.previewBits, which
 * never interns, so browsing pollutes no doc glyph table.
 */
import State from './state.js';
import { $ } from './ui.js';
import { UNICODE_BLOCKS } from '../core/blocksData.js';
import { CharsetError, parseCharset } from '../core/charsets.js';

const GRID_LIMIT = 512;

const createCharsetPicker = () => {
	const search = $('charsetSearch');
	const blockList = $('charsetBlocks');
	const grid = $('charsetGrid');
	const importInput = $('charsetImport');
	const blockLabel = $('charsetBlockLabel');

	let currentBlock = null;
	let gridOffset = 0;
	let open = false;

	const cellWidth = () => State.fontWidth * 1.5;
	const cellHeight = () => State.fontHeight * 1.5;

	const insertCodepoint = codepoint => {
		State.textArtCanvas.resolveUnicode([codepoint]).then(resolved => {
			const charCode = resolved.get(codepoint) ?? 63;
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
		});
	};

	const paintGlyph = (canvas, codepoint) => {
		const width = Math.round(cellWidth());
		const height = Math.round(cellHeight());
		canvas.width = width;
		canvas.height = height;
		const bits = State.textArtCanvas.unicodeGlyphBits(
			codepoint,
			width,
			height,
		);
		const ctx = canvas.getContext('2d');
		const fg = State.palette.getRGBAColor(State.palette.getForegroundColor());
		const bg = State.palette.getRGBAColor(State.palette.getBackgroundColor());
		const image = ctx.createImageData(width, height);
		for (let i = 0; i < width * height; i++) {
			const color = bits instanceof Uint8Array && bits[i] === 1 ? fg : bg;
			image.data[i * 4] = color[0];
			image.data[i * 4 + 1] = color[1];
			image.data[i * 4 + 2] = color[2];
			image.data[i * 4 + 3] = 255;
		}
		ctx.putImageData(image, 0, 0);
		return bits;
	};

	const renderGrid = () => {
		if (!grid || !currentBlock) {
			return;
		}
		grid.replaceChildren();
		const [first, last, name] = currentBlock;
		if (blockLabel) {
			blockLabel.textContent = name;
		}
		const start = first + gridOffset;
		const end = Math.min(last, start + GRID_LIMIT - 1);
		for (let codepoint = start; codepoint <= end; codepoint++) {
			const canvas = document.createElement('canvas');
			canvas.className = 'charsetGlyph';
			const bits = paintGlyph(canvas, codepoint);
			if (bits === null) {
				// no coverage in either bundled font: skip the dead cell
				continue;
			}
			canvas.title = `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
			const cp = codepoint;
			canvas.addEventListener('click', () => insertCodepoint(cp));
			grid.appendChild(canvas);
		}
		if (end < last) {
			const more = document.createElement('button');
			more.textContent = `more (${last - end} left)`;
			more.className = 'charsetMore';
			more.addEventListener('click', () => {
				gridOffset += GRID_LIMIT;
				renderGrid();
			});
			grid.appendChild(more);
		}
		if (gridOffset > 0) {
			const back = document.createElement('button');
			back.textContent = 'back';
			back.className = 'charsetMore';
			back.addEventListener('click', () => {
				gridOffset = Math.max(0, gridOffset - GRID_LIMIT);
				renderGrid();
			});
			grid.prepend(back);
		}
	};

	const selectBlock = block => {
		currentBlock = block;
		gridOffset = 0;
		renderGrid();
	};

	const renderBlockList = () => {
		if (!blockList) {
			return;
		}
		const query = (search?.value ?? '').trim().toLowerCase();
		blockList.replaceChildren();
		for (const block of UNICODE_BLOCKS) {
			if (query && !block[2].toLowerCase().includes(query)) {
				continue;
			}
			const item = document.createElement('li');
			item.setAttribute('role', 'option');
			item.textContent = block[2];
			item.addEventListener('click', () => {
				for (const sibling of blockList.children) {
					sibling.setAttribute('aria-selected', 'false');
				}
				item.setAttribute('aria-selected', 'true');
				selectBlock(block);
			});
			blockList.appendChild(item);
		}
	};

	const importCharset = async file => {
		try {
			const pages = parseCharset(await file.text());
			let existing = [];
			try {
				existing = JSON.parse(localStorage.getItem('customCharsets')) ?? [];
			} catch {
				existing = [];
			}
			if (!Array.isArray(existing)) {
				existing = [];
			}
			localStorage.setItem(
				'customCharsets',
				JSON.stringify([...existing, ...pages]),
			);
			document.dispatchEvent(new CustomEvent('onCustomCharsetsChange'));
			State.modal.close();
		} catch (error) {
			if (error instanceof CharsetError) {
				alert(`Could not read charset: ${error.message}`);
			} else {
				throw error;
			}
		}
	};

	if (search) {
		search.addEventListener('input', renderBlockList);
	}
	if (importInput) {
		importInput.addEventListener('change', () => {
			if (importInput.files && importInput.files[0]) {
				importCharset(importInput.files[0]);
				importInput.value = '';
			}
		});
	}
	// hex blocks land async while browsing: repaint the open grid
	document.addEventListener('onHexBlocksLoaded', () => {
		if (open) {
			renderGrid();
		}
	});

	const show = () => {
		open = true;
		renderBlockList();
		if (!currentBlock) {
			// start somewhere scene-useful
			const legacy = UNICODE_BLOCKS.find(
				block => block[2] === 'Symbols for Legacy Computing',
			);
			selectBlock(legacy ?? UNICODE_BLOCKS[0]);
		} else {
			renderGrid();
		}
		State.modal.open('charset');
		State.modal.onClose(() => {
			open = false;
		});
	};

	return { show };
};

export { createCharsetPicker };
export default { createCharsetPicker };
