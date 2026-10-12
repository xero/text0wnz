/**
 * Reference-image overlay: a translucent image floated over
 * the art for tracing. Local file only (object URL, never uploaded),
 * opacity and width sliders, pointer-events none so every tool draws
 * straight through it. Width is a percentage of the canvas and
 * reapplies on zoom/resize so the trace stays put.
 */
import { $ } from './ui.js';

const createReferenceImage = () => {
	const nav = $('navRef');
	const panel = $('refPanel');
	const overlay = $('refOverlay');
	if (!nav || !panel || !overlay) {
		return null;
	}
	const fileInput = $('refFileInput');
	const opacity = $('refOpacity');
	const scale = $('refScale');
	let objectUrl = null;

	const applyStyle = () => {
		const container = document.getElementById('canvasContainer');
		if (!container) {
			return;
		}
		overlay.style.opacity = String(Number(opacity.value) / 100);
		overlay.style.width = `${(container.clientWidth * Number(scale.value)) / 100}px`;
	};

	const clear = () => {
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

	const load = file => {
		clear();
		objectUrl = URL.createObjectURL(file);
		overlay.src = objectUrl;
		overlay.classList.add('enabled');
		applyStyle();
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
	opacity?.addEventListener('input', applyStyle);
	scale?.addEventListener('input', applyStyle);
	$('refClear')?.addEventListener('click', clear);

	// the toolbar button wires through createSettingToggle in main.js
	const isOpen = () => !panel.classList.contains('hide');
	const setOpen = open => panel.classList.toggle('hide', !open);

	// the canvas width moves under zoom and resizes; the trace follows
	document.addEventListener('onCanvasLayoutChange', applyStyle);
	document.addEventListener('onTextCanvasSizeChange', applyStyle);

	return {
		clear,
		load,
		isVisible: () => overlay.classList.contains('enabled'),
		applyStyle,
		isOpen,
		setOpen,
	};
};

export { createReferenceImage };
