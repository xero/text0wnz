/**
 * Reference-image overlay (P6 steal): the visibility contract rides
 * the canvasOverlay 'enabled' class (owner-reported: the first cut
 * toggled 'hide' while the class kept the overlay display:none, so
 * nothing ever appeared).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createReferenceImage } from '../../src/js/client/referenceImage.js';

const MARKUP = `
	<div id="navRef"></div>
	<div id="refPanel" class="hide">
		<button id="refLoad"></button>
		<input id="refFileInput" type="file"/>
		<input id="refOpacity" type="range" value="40"/>
		<input id="refScale" type="range" value="100"/>
		<button id="refClear"></button>
	</div>
	<div id="viewport"><div id="canvasContainer"></div></div>
	<img id="refOverlay" class="canvasOverlay" alt=""/>
`;

describe('reference image overlay', () => {
	let ref;
	let overlay;

	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		vi.stubGlobal('URL', {
			...URL,
			createObjectURL: vi.fn(() => 'blob:fake'),
			revokeObjectURL: vi.fn(),
		});
		ref = createReferenceImage();
		overlay = document.getElementById('refOverlay');
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
	});

	const loadFile = () => {
		const input = document.getElementById('refFileInput');
		Object.defineProperty(input, 'files', {
			value: [new File([Uint8Array.of(1)], 'trace.png')],
			configurable: true,
		});
		input.dispatchEvent(new Event('change'));
	};

	it('loading a file ENABLES the overlay (the canvasOverlay contract)', () => {
		expect(ref.isVisible()).toBe(false);
		loadFile();
		expect(overlay.classList.contains('enabled')).toBe(true);
		expect(overlay.src).toContain('blob:fake');
		expect(ref.isVisible()).toBe(true);
		expect(overlay.style.opacity).toBe('0.4');
	});

	it('clear disables the overlay and revokes the object url', () => {
		loadFile();
		document.getElementById('refClear').click();
		expect(overlay.classList.contains('enabled')).toBe(false);
		expect(overlay.getAttribute('src')).toBeNull();
		expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
		expect(ref.isVisible()).toBe(false);
	});

	it('panel open state rides the settings-toggle surface', () => {
		const panel = document.getElementById('refPanel');
		expect(ref.isOpen()).toBe(false);
		ref.setOpen(true);
		expect(panel.classList.contains('hide')).toBe(false);
		ref.setOpen(false);
		expect(panel.classList.contains('hide')).toBe(true);
	});
});
