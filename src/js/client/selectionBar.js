/**
 * The floating action bar over an active selection, replacing the old
 * header selection toolbar. It adopts the existing toolbar element so
 * every button id and handler rides along, centers above the selection
 * rect, flips below it when there is no headroom, clamps to the canvas
 * area, and follows the selection, viewport scroll, zoom (through the
 * canvas resizing), and window resizes. Keys keep working without it.
 */
import State from './state.js';
import { $ } from './ui.js';

const BAR_GAP_PX = 6;
const EDGE_PAD_PX = 4;

const createSelectionBar = () => {
	const bar = $('selectionToolbar');
	const viewport = $('viewport');
	const sizeReadout = $('selectionSize');
	const deselect = $('deselect');

	const active = () => State.selectionCursor?.isVisible?.() === true;

	const place = () => {
		if (!bar) {
			return;
		}
		const show = active();
		bar.hidden = !show;
		if (!show) {
			// the next selection greets the main face, not a stale submenu
			bar.classList.remove('pasteOpen');
			return;
		}
		const rectEl = State.selectionCursor.getElement?.();
		const vp = viewport?.getBoundingClientRect();
		if (!rectEl || !vp) {
			return;
		}
		const sel = rectEl.getBoundingClientRect();
		const width = bar.offsetWidth;
		const height = bar.offsetHeight;
		const x = Math.min(
			Math.max(sel.left + sel.width / 2 - width / 2, vp.left + EDGE_PAD_PX),
			Math.max(vp.left + EDGE_PAD_PX, vp.right - width - EDGE_PAD_PX),
		);
		let y = sel.top - height - BAR_GAP_PX;
		if (y < vp.top + EDGE_PAD_PX) {
			// no headroom: sit below the selection instead, still clamped
			y = Math.min(sel.bottom + BAR_GAP_PX, vp.bottom - height - EDGE_PAD_PX);
		}
		bar.style.left = `${Math.round(x)}px`;
		bar.style.top = `${Math.round(y)}px`;
		if (sizeReadout) {
			const s = State.selectionCursor.getSelection();
			sizeReadout.textContent = s ? `${s.width}x${s.height}` : '';
		}
	};

	// the rect settles after the event that announces it
	let raf = 0;
	const sync = () => {
		if (raf) {
			return;
		}
		raf = requestAnimationFrame(() => {
			raf = 0;
			place();
		});
	};

	/** Escape's second stop: clear an active selection */
	const dismiss = () => {
		if (!active()) {
			return false;
		}
		State.selectionCursor.hide();
		sync();
		return true;
	};

	document.addEventListener('onSelectionChange', sync);
	viewport?.addEventListener('scroll', sync, { passive: true });
	window.addEventListener('resize', sync);
	// zoom and resolution both resize the canvas under the selection
	const canvas = $('canvasContainer');
	if (canvas && window.ResizeObserver) {
		new window.ResizeObserver(sync).observe(canvas);
	}
	deselect?.addEventListener('click', dismiss);

	// the paste button swaps the bar for its submenu face; an action
	// there (or back) returns to the main face, re-centered either way
	const setPasteMode = openState => {
		bar?.classList.toggle('pasteOpen', openState);
		sync();
	};
	$('pasteMenu')?.addEventListener('click', () => setPasteMode(true));
	$('pasteBack')?.addEventListener('click', () => setPasteMode(false));
	bar?.addEventListener('click', e => {
		const sub = e.target.closest?.('.pasteSub');
		if (sub && sub.id !== 'pasteBack') {
			setPasteMode(false);
		}
	});

	return {
		sync,
		dismiss,
	};
};

export { createSelectionBar };
export default { createSelectionBar };
