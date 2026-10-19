/**
 * Reference-image overlay: a translucent image floated over
 * the art for tracing. Local file only (object URL, never uploaded),
 * opacity and width sliders, pointer-events none so every tool draws
 * straight through it. Width AND position are fractions of the canvas
 * width and reapply on zoom/resize so the trace stays put. Drag mode
 * unlocks the overlay for pointer moves. Once an image is loaded the
 * whole setup survives a reload: the blob rides IndexedDB (too big
 * for localStorage), the sliders ride a localStorage JSON blob, and
 * a new document voids both.
 */
import { $ } from './ui.js';
import { Storage } from './storage.js';

const SETTINGS_KEY = 'refImage';
const DEFAULTS = { opacity: 40, width: 100, x: 0, y: 0 };

const createReferenceImage = (deps = {}) => {
	const store = deps.storage ?? Storage;
	const nav = $('navRef');
	const panel = $('refPanel');
	const overlay = $('refOverlay');
	if (!nav || !panel || !overlay) {
		return null;
	}
	const fileInput = $('refFileInput');
	const opacity = $('refOpacity');
	const scale = $('refScale');
	const dragToggle = $('refDrag');
	let objectUrl = null;
	let loaded = false;
	let dragMode = false;
	// x/y share the width slider's canvas-width basis so zoom and
	// resize move the trace with the art instead of leaving it behind
	const pos = { x: 0, y: 0 };
	// a reset voids any restore still reading IndexedDB, or a slow
	// read would resurrect the overlay a new document just cleared
	let generation = 0;

	const basis = () => {
		const container = document.getElementById('canvasContainer');
		return container?.clientWidth || 0;
	};

	const applyStyle = () => {
		const width = basis();
		if (!width) {
			return;
		}
		overlay.style.opacity = String(Number(opacity.value) / 100);
		overlay.style.width = `${(width * Number(scale.value)) / 100}px`;
		overlay.style.transform = `translate(${pos.x * width}px, ${pos.y * width}px)`;
	};

	// settings only persist while an image is loaded: an untouched or
	// cleared tool must come back from a reload on pure defaults
	const save = () => {
		if (!loaded) {
			return;
		}
		try {
			localStorage.setItem(
				SETTINGS_KEY,
				JSON.stringify({
					opacity: Number(opacity.value),
					width: Number(scale.value),
					x: pos.x,
					y: pos.y,
				}),
			);
		} catch {
			// quota or blocked storage: the overlay still works for this
			// session, it just will not survive a reload
		}
	};

	const setDragMode = on => {
		dragMode = on;
		overlay.classList.toggle('dragging', on);
		dragToggle?.setAttribute('aria-pressed', String(on));
	};

	const unload = () => {
		// .canvasOverlay visibility rides the 'enabled' class (the
		// toolPreview convention): the class hides overlays regardless
		// of 'hide'
		overlay.classList.remove('enabled');
		overlay.removeAttribute('src');
		if (objectUrl) {
			URL.revokeObjectURL(objectUrl);
			objectUrl = null;
		}
	};

	const reset = () => {
		generation++;
		unload();
		loaded = false;
		setDragMode(false);
		if (opacity) {
			opacity.value = String(DEFAULTS.opacity);
		}
		if (scale) {
			scale.value = String(DEFAULTS.width);
		}
		pos.x = DEFAULTS.x;
		pos.y = DEFAULTS.y;
		overlay.style.transform = '';
		localStorage.removeItem(SETTINGS_KEY);
		store.clearRefImage();
	};

	// swapping images on purpose keeps the sliders and position: the
	// tracing setup belongs to the artist, not the file
	const load = file => {
		unload();
		objectUrl = URL.createObjectURL(file);
		overlay.src = objectUrl;
		overlay.classList.add('enabled');
		loaded = true;
		applyStyle();
		save();
		// Safari can drop a File cloned into IndexedDB; raw bytes survive
		file
			.arrayBuffer()
			.then(buffer => store.saveRefImage({ buffer, type: file.type }));
	};

	const restore = () => {
		let saved = null;
		try {
			saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
		} catch {
			saved = null;
		}
		if (!saved) {
			return;
		}
		const gen = generation;
		store.loadRefImage().then(image => {
			if (gen !== generation) {
				return;
			}
			if (!image?.buffer) {
				// orphaned settings (the image save failed): drop them so
				// the next boot skips the IndexedDB read
				localStorage.removeItem(SETTINGS_KEY);
				return;
			}
			const blob = new Blob([image.buffer], { type: image.type || '' });
			if (opacity) {
				opacity.value = String(saved.opacity ?? DEFAULTS.opacity);
			}
			if (scale) {
				scale.value = String(saved.width ?? DEFAULTS.width);
			}
			pos.x = Number(saved.x) || 0;
			pos.y = Number(saved.y) || 0;
			objectUrl = URL.createObjectURL(blob);
			overlay.src = objectUrl;
			overlay.classList.add('enabled');
			loaded = true;
			applyStyle();
		});
	};

	$('refLoad')?.addEventListener('click', () => fileInput?.click());
	fileInput?.addEventListener('change', event => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		load(file);
		event.target.value = '';
	});
	const onSlider = () => {
		applyStyle();
		save();
	};
	opacity?.addEventListener('input', onSlider);
	scale?.addEventListener('input', onSlider);
	$('refClear')?.addEventListener('click', reset);
	dragToggle?.addEventListener('click', () => setDragMode(!dragMode));

	// the canvas pointer normalizer listens on the container in the
	// bubble phase: stopping propagation here keeps a drag from also
	// painting a stroke under the image
	let drag = null;
	overlay.addEventListener('pointerdown', e => {
		if (!dragMode) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		try {
			overlay.setPointerCapture?.(e.pointerId);
		} catch {
			// a pointer can lift between dispatch and capture; the drag
			// still tracks through events that bubble to the overlay
		}
		drag = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
	});
	overlay.addEventListener('pointermove', e => {
		if (!drag) {
			return;
		}
		e.stopPropagation();
		const width = basis();
		if (!width) {
			return;
		}
		pos.x = drag.x + (e.clientX - drag.px) / width;
		pos.y = drag.y + (e.clientY - drag.py) / width;
		applyStyle();
	});
	const endDrag = e => {
		if (!drag) {
			return;
		}
		e.stopPropagation();
		drag = null;
		save();
	};
	overlay.addEventListener('pointerup', endDrag);
	overlay.addEventListener('pointercancel', endDrag);
	// an img ghost-drags natively and that steals the pointer capture
	overlay.addEventListener('dragstart', e => e.preventDefault());

	// the toolbar button wires through createSettingToggle in main.js
	const isOpen = () => !panel.classList.contains('hide');
	const setOpen = open => panel.classList.toggle('hide', !open);

	// the canvas width moves under zoom and resizes; the trace follows
	document.addEventListener('onCanvasLayoutChange', applyStyle);
	document.addEventListener('onTextCanvasSizeChange', applyStyle);
	// File > New and real file opens both dispatch this; the boot-time
	// autosave restore does not, so a reload keeps the trace
	document.addEventListener('onNewDocument', reset);

	restore();

	return {
		clear: reset,
		load,
		isVisible: () => overlay.classList.contains('enabled'),
		applyStyle,
		isOpen,
		setOpen,
	};
};

export { createReferenceImage };
