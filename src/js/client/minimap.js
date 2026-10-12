/**
 * Minimap (PLAN §3.1, P6): the whole doc at one pixel per cell, blended
 * fg-over-bg by glyph ink coverage, with the live viewport framed and
 * click/drag-to-scroll. Renders from the v3 planes through the
 * word-aware palette, so 256-color and RGB art previews true. Cheap by
 * construction (one ImageData walk), refreshed on a half-second tick
 * while visible plus instant frame-rect tracking on scroll.
 */
import State from './state.js';
import { $ } from './ui.js';

/** approximate ink coverage per classic glyph id; 0.35 otherwise */
const INK = new Map([
	[0, 0],
	[32, 0],
	[255, 0],
	[219, 1],
	[176, 0.25],
	[177, 0.5],
	[178, 0.75],
	[220, 0.5],
	[223, 0.5],
	[221, 0.5],
	[222, 0.5],
]);

const createMinimap = () => {
	const panel = $('minimapPanel');
	const nav = $('navMinimap');
	if (!panel || !nav) {
		return null;
	}
	const art = $('minimapArt');
	const frameRect = $('minimapViewport');
	let visible = false;
	let timer = 0;

	const viewport = () => document.getElementById('viewport');

	const positionRect = () => {
		const vp = viewport();
		if (!vp || !State.font) {
			return;
		}
		const docPx = State.textArtCanvas.getRows() * State.font.getHeight();
		if (docPx <= 0 || art.clientHeight <= 0) {
			return;
		}
		const scaleY = art.clientHeight / docPx;
		frameRect.style.top = `${art.offsetTop + vp.scrollTop * scaleY}px`;
		frameRect.style.height = `${Math.max(4, Math.min(vp.clientHeight, docPx) * scaleY)}px`;
	};

	const render = () => {
		const c = State.textArtCanvas;
		if (!c || !State.palette) {
			return;
		}
		const doc = c.getDoc();
		const frame = doc.frames[c.getCurrentFrame?.() ?? 0];
		const columns = c.getColumns();
		const rows = c.getRows();
		if (art.width !== columns || art.height !== rows) {
			art.width = columns;
			art.height = rows;
		}
		const ctx = art.getContext('2d');
		if (!ctx) {
			return;
		}
		const image = ctx.createImageData(columns, rows);
		const data = image.data;
		for (let i = 0, j = 0; i < columns * rows; i++, j += 4) {
			const ink = INK.get(frame.glyph[i] & 0xffff) ?? 0.35;
			const fg = State.palette.getRGBAColor(frame.fg[i]);
			const bg = State.palette.getRGBAColor(frame.bg[i]);
			data[j] = bg[0] * (1 - ink) + fg[0] * ink;
			data[j + 1] = bg[1] * (1 - ink) + fg[1] * ink;
			data[j + 2] = bg[2] * (1 - ink) + fg[2] * ink;
			data[j + 3] = 255;
		}
		ctx.putImageData(image, 0, 0);
		positionRect();
	};

	const scrollTo = clientY => {
		const vp = viewport();
		if (!vp || !State.font) {
			return;
		}
		const rect = art.getBoundingClientRect();
		if (rect.height <= 0) {
			return;
		}
		const fraction = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
		const docPx = State.textArtCanvas.getRows() * State.font.getHeight();
		vp.scrollTop = fraction * docPx - vp.clientHeight / 2;
	};

	let dragging = false;
	panel.addEventListener('pointerdown', e => {
		dragging = true;
		panel.setPointerCapture?.(e.pointerId);
		scrollTo(e.clientY);
	});
	panel.addEventListener('pointermove', e => {
		if (dragging) {
			scrollTo(e.clientY);
		}
	});
	panel.addEventListener('pointerup', () => {
		dragging = false;
	});

	const remember = value => {
		try {
			localStorage.setItem('minimapVisible', value);
		} catch {
			// storage blocked: the preference just does not persist
		}
	};

	const show = () => {
		visible = true;
		panel.classList.remove('hide');
		render();
		timer = setInterval(render, 500);
		remember('true');
	};

	const hide = () => {
		visible = false;
		panel.classList.add('hide');
		clearInterval(timer);
		timer = 0;
		remember('false');
	};

	// the toolbar button wires through createSettingToggle in main.js
	document.getElementById('viewport')?.addEventListener(
		'scroll',
		() => {
			if (visible) {
				positionRect();
			}
		},
		{ passive: true },
	);
	document.addEventListener('onFrameChange', () => {
		if (visible) {
			render();
		}
	});

	// ON by default (owner call, 2026-10-12); the toggle is remembered.
	// ?test pages (goldens, e2e) opt out of the DEFAULT: the panel is a
	// fixed overlay that would sit inside pixel-golden captures. An
	// explicit saved 'true' still shows it there.
	let stored = null;
	try {
		stored = localStorage.getItem('minimapVisible');
	} catch {
		// storage blocked: default wins
	}
	const testMode =
		typeof window !== 'undefined' &&
		new URLSearchParams(window.location.search).has('test');
	if (stored === 'true' || (stored === null && !testMode)) {
		show();
	}

	return { render, show, hide, isVisible: () => visible };
};

export { createMinimap };
