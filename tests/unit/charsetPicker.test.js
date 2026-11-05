import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCharsetPicker } from '../../src/js/client/charsetPicker.js';
import { insertToken } from '../../src/js/client/keyboard.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));

vi.mock('../../src/js/client/keyboard.js', () => ({ insertToken: vi.fn() }));

vi.mock('../../src/js/client/ui.js', () => ({ $: id => document.getElementById(id) }));

describe('Character set picker', () => {
	beforeEach(() => {
		document.body.innerHTML = `
			<input id="charsetSearch">
			<ul id="charsetBlocks"></ul>
			<span id="charsetBlockLabel"></span>
			<div id="charsetGrid"></div>`;
		vi.clearAllMocks();
		Object.assign(State, {
			fontWidth: 8,
			fontHeight: 16,
			// every glyph covered, so every cell renders
			textArtCanvas: { unicodeGlyphBits: (_cp, w, h) => new Uint8Array(w * h) },
			palette: {
				getForegroundColor: () => 7,
				getBackgroundColor: () => 0,
				getRGBAColor: () => [255, 255, 255, 255],
			},
			modal: { open: vi.fn(), onClose: vi.fn() },
		});
	});

	const pick = (block, codepoint) => {
		const picker = createCharsetPicker();
		picker.show();
		const search = document.getElementById('charsetSearch');
		search.value = block;
		search.dispatchEvent(new Event('input'));
		[...document.querySelectorAll('#charsetBlocks li')]
			.find(li => li.textContent === block)
			.click();
		const title = `U+${codepoint.toString(16).toUpperCase().padStart(4, '0')}`;
		document.querySelector(`#charsetGrid canvas[title="${title}"]`).click();
	};

	it.each([
		['Block Elements', 0x2591, 176],
		['Box Drawing', 0x2550, 205],
		['Latin-1 Supplement', 0xe9, 130],
		['Miscellaneous Symbols', 0x263a, 1],
		['Basic Latin', 0x41, 65],
	])('a %s pick CP437 has inserts its byte', (block, codepoint, byte) => {
		pick(block, codepoint);
		expect(insertToken).toHaveBeenCalledExactlyOnceWith(byte);
	});

	it('a pick CP437 lacks inserts its codepoint token', () => {
		pick('Symbols for Legacy Computing', 0x1fb00);
		expect(insertToken).toHaveBeenCalledExactlyOnceWith(~0x1fb00);
	});
});
