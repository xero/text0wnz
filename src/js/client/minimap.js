/**
 * Minimap: the whole doc at one pixel per cell, blended
 * fg-over-bg by glyph ink coverage, with the live viewport framed and
 * click/drag-to-scroll. Renders from the v3 planes through the
 * word-aware palette, so 256-color and RGB art previews true. Cheap by
 * construction (one ImageData walk), refreshed on a half-second tick
 * while visible plus instant frame-rect tracking on scroll.
 */
import State from './state.js';
import { $ } from './ui.js';
import magicNumbers from './magicNumbers.js';

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
	// the inner wrapper scrolls so the autoscroll menu above it never
	// enters the scrub gesture code; the panel only shows and hides
	const scroller = $('minimapScroll');
	if (!panel || !nav || !scroller) {
		return null;
	}
	const art = $('minimapArt');
	const frameRect = $('minimapViewport');
	let visible = false;
	let timer = 0;

	// native panning only exists when the map meaningfully overflows
	// its slice; a few stray pixels must not steal touch drags
	const overflowsMeaningfully = () =>
		scroller.scrollHeight > scroller.clientHeight + 8;

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
		const height = Math.max(4, Math.min(vp.clientHeight, docPx) * scaleY);
		// the viewport scrolls past the doc (container chrome below the
		// canvas); clamp the frame inside the art on BOTH ends, or its
		// overhang makes the panel report overflow and steal touch drags
		const top = Math.max(
			art.offsetTop,
			Math.min(
				art.offsetTop + vp.scrollTop * scaleY,
				art.offsetTop + art.clientHeight - height,
			),
		);
		frameRect.style.top = `${top}px`;
		frameRect.style.height = `${height}px`;
		// handed to followFocus so it never reads offsetTop back: a
		// write-then-read here forces a synchronous layout every frame
		return top;
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
		// one canvas pixel per CELL, but cells are not square: scale the
		// displayed height by the font ratio or the art reads squashed
		if (State.font && columns > 0) {
			const cellAspect = State.font.getHeight() / State.font.getWidth();
			art.style.height = `${(art.clientWidth * rows * cellAspect) / columns}px`;
		}
		// a fitting map leaves Safari nothing to pan; take the touch
		// gesture for scrubbing before the browser claims and cancels it
		scroller.style.touchAction = overflowsMeaningfully() ? '' : 'none';
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
		const fh = State.font.getHeight();
		const docPx = State.textArtCanvas.getRows() * fh;
		const target = fraction * docPx - vp.clientHeight / 2;
		// snap to row boundaries in content space (the canvas sits below
		// a container margin) so a scrub never clips the top row mid-cell
		const cc = document.getElementById('canvasContainer');
		const offY = cc
			? cc.getBoundingClientRect().top -
			vp.getBoundingClientRect().top +
			vp.scrollTop
			: 0;
		vp.scrollTop = offY + Math.round((target - offY) / fh) * fh;
		// the viewport scroll event arrives async; track the frame NOW so
		// drag-follow math never works from a stale position
		positionRect();
	};

	// taps commit on RELEASE, gated by the shared gesture slop: a jump on
	// pointerdown fights the panel's own touch scrolling (iOS claims the
	// pan and cancels the pointer after the viewport already moved).
	// Touch drags belong to native panel scrolling; mouse and pen drags
	// scrub the viewport once they travel past slop.
	let pending = null;
	let scrubbing = false;
	const travel = e =>
		Math.hypot(e.clientX - pending.x, e.clientY - pending.y);

	// drag-autoscroll: the box rides the finger 1:1 anywhere in the
	// panel's visible slice; holding at (or past) an edge scrolls the
	// map at a FIXED rate, and backing away from the edge stops it.
	// Movement never scrolls the panel, so the rate stays predictable
	let lastClientY = 0;
	let autoScroll = 0;
	const EDGE_RATE = 6;
	// the box centers on the finger, so it touches the slice edge when
	// the finger is half a box height away: hand off to the pin exactly
	// there and the box is already flush, no jump either direction
	const edgeDirection = clientY => {
		const view = scroller.getBoundingClientRect();
		const reach = frameRect.offsetHeight / 2;
		if (clientY < view.top + reach) {
			return -1;
		}
		if (clientY > view.bottom - reach) {
			return 1;
		}
		return 0;
	};
	// pin the box flush to the visible slice's edge and aim the viewport
	// there directly: no finger mapping (the art slides under a held
	// finger) and no row quantization (its alternating rounding is the
	// jitter; the global settle snap re-aligns rows on release)
	const pinBoxToEdge = direction => {
		const vp = viewport();
		const docPx = State.textArtCanvas.getRows() * State.font.getHeight();
		if (!vp || docPx <= 0 || art.clientHeight <= 0) {
			return;
		}
		const scaleY = art.clientHeight / docPx;
		const frameTop =
			direction === 1
				? scroller.scrollTop + scroller.clientHeight - frameRect.offsetHeight
				: scroller.scrollTop;
		vp.scrollTop = (frameTop - art.offsetTop) / scaleY;
		positionRect();
	};
	const autoScrollTick = () => {
		const direction = edgeDirection(lastClientY);
		if (direction !== 0) {
			scroller.scrollTop += direction * EDGE_RATE;
			pinBoxToEdge(direction);
		}
		autoScroll = requestAnimationFrame(autoScrollTick);
	};
	const stopAutoScroll = () => {
		cancelAnimationFrame(autoScroll);
		autoScroll = 0;
	};

	// canvas scrolls keep the box at the top of the visible map slice,
	// so the map pages along with you; never while a finger is on the
	// panel (or just left it), where the box answers to the gesture
	let panelTouchedAt = 0;
	const followFocus = top => {
		if (
			top === undefined ||
			pending ||
			performance.now() - panelTouchedAt < 300
		) {
			return;
		}
		// sub pixel writes churn the scroll position for nothing
		if (Math.abs(scroller.scrollTop - top) >= 1) {
			scroller.scrollTop = top;
		}
	};
	scroller.addEventListener('pointerdown', e => {
		panelTouchedAt = performance.now();
		pending = {
			x: e.clientX,
			y: e.clientY,
			// a drag born on the focus box scrubs like a scrollbar thumb,
			// even when the rest of the panel pans natively
			onFrame: e.target === frameRect || frameRect.contains(e.target),
		};
		scrubbing = false;
	});
	scroller.addEventListener('pointermove', e => {
		if (
			!pending ||
			(e.pointerType === 'touch' &&
			  overflowsMeaningfully() &&
			  !pending.onFrame)
		) {
			return;
		}
		if (!scrubbing && travel(e) > magicNumbers.GESTURE_SLOP_PX) {
			scrubbing = true;
			scroller.setPointerCapture?.(e.pointerId);
		}
		if (scrubbing) {
			lastClientY = e.clientY;
			// inside an edge zone the tick owns the box (finger tremor
			// would otherwise fight the pin); elsewhere it rides the finger
			if (edgeDirection(e.clientY) === 0) {
				scrollTo(e.clientY);
			}
			if (!autoScroll) {
				autoScroll = requestAnimationFrame(autoScrollTick);
			}
		}
	});
	scroller.addEventListener('pointerup', e => {
		if (pending && !scrubbing && travel(e) <= magicNumbers.GESTURE_SLOP_PX) {
			scrollTo(e.clientY);
		}
		pending = null;
		scrubbing = false;
		stopAutoScroll();
		panelTouchedAt = performance.now();
	});
	scroller.addEventListener('pointercancel', () => {
		pending = null;
		scrubbing = false;
		stopAutoScroll();
		panelTouchedAt = performance.now();
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
		State.panels?.layout();
		render();
		// the doc cannot change during autoscroll playback, and this
		// walk is every cell of it: skip the tick while the engine
		// drives, repaint on the first tick after the class drops
		timer = setInterval(() => {
			if (!document.body.classList.contains('autoscrolling')) {
				render();
			}
		}, 500);
		remember('true');
	};

	const hide = () => {
		visible = false;
		State.panels?.layout();
		clearInterval(timer);
		timer = 0;
		remember('false');
	};

	// the toolbar button wires through createSettingToggle in main.js
	document.getElementById('viewport')?.addEventListener(
		'scroll',
		() => {
			if (visible) {
				followFocus(positionRect());
			}
		},
		{ passive: true },
	);
	document.addEventListener('onFrameChange', () => {
		if (visible) {
			render();
		}
	});
	// a new document invalidates the whole map: the panel's own scroll
	// and the focus box both belong at the top, not wherever the last
	// (possibly much taller) artwork left them. onNewDocument, not
	// onOpenedFile: buffer swaps from row ops must not re-home it
	document.addEventListener('onNewDocument', () => {
		if (visible) {
			scroller.scrollTop = 0;
			render();
		}
	});

	// ON by default; the toggle is remembered.
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
