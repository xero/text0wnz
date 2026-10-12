/**
 * Extended color panel (P5, owner-chosen UX: the 16-swatch strip stays
 * the anchor and gains this expansion): the xterm-256 grid, an RGB
 * picker, and recent swatches. Click sets the foreground, right-click
 * the background, exactly one gesture away from the classic strip.
 *
 * Values flow as tag-bit palette words (paletteColor(16..255)) or raw
 * RGB words through State.palette.set*Color and the editor's extended
 * cell path; RGB words below 16 bump to 16 so a near-black can never
 * collide with a classic index (editor.ts documents the convention).
 *
 * Collab lockout: the vanilla wire quantizes extended colors, so an
 * apply-locally sender would diverge from its peers; while connected
 * the panel is inert and says why.
 */
import State from './state.js';
import { $ } from './ui.js';
import { xterm256RGB } from '../core/codecs/dur.js';
import { paletteColor, rgbColor } from '../core/doc.js';

const RECENT_LIMIT = 10;
const RECENT_KEY = 'recentColors';

const createColorPanel = () => {
	const panel = $('colorPanel');
	const toggleButton = $('paletteMore');
	const grid = $('colorGrid');
	const recent = $('colorRecent');
	const hexInput = $('colorHexInput');
	const fgButton = $('colorRGBfg');
	const bgButton = $('colorRGBbg');
	const lockNote = $('colorLockNote');

	// extended colors lock only in VANILLA sessions; the t0wnz extension
	// suite carries full color words natively
	const locked = () =>
		State.network?.isConnected?.() === true &&
		State.network?.extCollab?.() !== true;

	const loadRecent = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(RECENT_KEY)) ?? [];
			return Array.isArray(parsed)
				? parsed.filter(value => typeof value === 'number')
				: [];
		} catch {
			return [];
		}
	};

	const saveRecent = value => {
		const list = [value, ...loadRecent().filter(v => v !== value)].slice(
			0,
			RECENT_LIMIT,
		);
		try {
			localStorage.setItem(RECENT_KEY, JSON.stringify(list));
		} catch {
			// private windows etc.: recents just don't persist
		}
		renderRecent();
	};

	const cssColor = value => {
		const rgba = State.palette.getRGBAColor(value);
		return `rgb(${rgba[0]},${rgba[1]},${rgba[2]})`;
	};

	const apply = (value, asBackground) => {
		if (locked()) {
			return;
		}
		if (asBackground) {
			State.palette.setBackgroundColor(value);
		} else {
			State.palette.setForegroundColor(value);
		}
		saveRecent(value);
	};

	const makeSwatch = (value, title) => {
		const swatch = document.createElement('div');
		swatch.className = 'colorSwatch';
		swatch.style.backgroundColor = cssColor(value);
		swatch.title = title;
		swatch.addEventListener('click', () => apply(value, false));
		swatch.addEventListener('contextmenu', event => {
			event.preventDefault();
			apply(value, true);
		});
		return swatch;
	};

	const renderGrid = () => {
		if (!grid) {
			return;
		}
		grid.replaceChildren();
		for (let index = 16; index < 256; index++) {
			const word = xterm256RGB(index);
			const hex = (word & 0xffffff).toString(16).padStart(6, '0');
			grid.appendChild(makeSwatch(paletteColor(index), `${index} #${hex}`));
		}
	};

	const renderRecent = () => {
		if (!recent) {
			return;
		}
		recent.replaceChildren();
		for (const value of loadRecent()) {
			recent.appendChild(makeSwatch(value, 'recent'));
		}
	};

	const rgbFromInput = () => {
		const hex = hexInput?.value ?? '#000000';
		const word = rgbColor(
			parseInt(hex.slice(1, 3), 16),
			parseInt(hex.slice(3, 5), 16),
			parseInt(hex.slice(5, 7), 16),
		);
		// never emit an RGB word that collides with a classic index
		return word <= 15 ? 16 : word;
	};

	if (fgButton) {
		fgButton.addEventListener('click', () => apply(rgbFromInput(), false));
	}
	if (bgButton) {
		bgButton.addEventListener('click', () => apply(rgbFromInput(), true));
	}
	if (toggleButton && panel) {
		toggleButton.addEventListener('click', () => {
			const opening = panel.classList.contains('hide');
			panel.classList.toggle('hide');
			if (opening) {
				if (lockNote) {
					lockNote.classList.toggle('hide', !locked());
				}
				panel.classList.toggle('locked', locked());
				if (grid.childElementCount === 0) {
					renderGrid();
				}
				renderRecent();
			}
		});
	}

	return { hide: () => panel?.classList.add('hide') };
};

export { createColorPanel };
export default { createColorPanel };
