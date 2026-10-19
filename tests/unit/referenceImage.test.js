/**
 * Reference-image overlay: visibility rides the canvasOverlay
 * 'enabled' class; a 'hide' toggle alone leaves the overlay
 * display:none and nothing ever appears. Drag mode, persistence,
 * and the reset triggers ride a fake storage so no IndexedDB is
 * needed here.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createReferenceImage } from '../../src/js/client/referenceImage.js';

const MARKUP = `
	<div id="navRef"></div>
	<div id="refPanel" class="hide">
		<button id="refLoad"></button>
		<input id="refFileInput" type="file"/>
		<input id="refOpacity" type="range" value="40" max="95" min="0"/>
		<input id="refScale" type="range" value="100" max="400" min="10"/>
		<button id="refDrag" aria-pressed="false"></button>
		<button id="refClear"></button>
	</div>
	<div id="viewport"><div id="canvasContainer"></div></div>
	<img id="refOverlay" class="canvasOverlay" alt=""/>
`;

const fakeStorage = () => ({
	saveRefImage: vi.fn(async () => true),
	// undefined means an empty store; null means the read failed
	loadRefImage: vi.fn(async () => undefined),
	clearRefImage: vi.fn(async () => true),
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('reference image overlay', () => {
	let ref;
	let overlay;
	let storage;

	const init = (extra = {}) => {
		ref = createReferenceImage({ storage, ...extra });
		overlay = document.getElementById('refOverlay');
	};

	beforeEach(() => {
		localStorage.clear();
		document.body.innerHTML = MARKUP;
		// jsdom computes no layout: the canvas-width basis for the width
		// and position math must be stubbed or everything divides by zero
		Object.defineProperty(
			document.getElementById('canvasContainer'),
			'clientWidth',
			{ value: 640, configurable: true },
		);
		vi.stubGlobal('URL', {
			...URL,
			createObjectURL: vi.fn(() => 'blob:fake'),
			revokeObjectURL: vi.fn(),
		});
		storage = fakeStorage();
		init();
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
		localStorage.clear();
	});

	const loadFile = () => {
		const input = document.getElementById('refFileInput');
		Object.defineProperty(input, 'files', {
			value: [new File([Uint8Array.of(1)], 'trace.png')],
			configurable: true,
		});
		input.dispatchEvent(new Event('change'));
	};

	const point = (type, x, y) => {
		const e = new MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
		overlay.dispatchEvent(e);
	};

	it('loading a file ENABLES the overlay (the canvasOverlay contract)', () => {
		expect(ref.isVisible()).toBe(false);
		loadFile();
		expect(overlay.classList.contains('enabled')).toBe(true);
		expect(overlay.src).toContain('blob:fake');
		expect(ref.isVisible()).toBe(true);
		expect(overlay.style.opacity).toBe('0.4');
	});

	it('panel open state rides the settings-toggle surface', () => {
		const panel = document.getElementById('refPanel');
		expect(ref.isOpen()).toBe(false);
		ref.setOpen(true);
		expect(panel.classList.contains('hide')).toBe(false);
		ref.setOpen(false);
		expect(panel.classList.contains('hide')).toBe(true);
	});

	describe('drag mode', () => {
		it('the toggle flips the overlay class and its own pressed state', () => {
			const toggle = document.getElementById('refDrag');
			loadFile();
			toggle.click();
			expect(overlay.classList.contains('dragging')).toBe(true);
			expect(toggle.getAttribute('aria-pressed')).toBe('true');
			toggle.click();
			expect(overlay.classList.contains('dragging')).toBe(false);
			expect(toggle.getAttribute('aria-pressed')).toBe('false');
		});

		it('a pointer drag moves the overlay on the canvas-width basis', () => {
			loadFile();
			document.getElementById('refDrag').click();
			point('pointerdown', 100, 100);
			point('pointermove', 164, 132);
			// 64px over a 640px basis = fraction 0.1 = 64px at this zoom
			expect(overlay.style.transform).toBe('translate(64px, 32px)');
			point('pointerup', 164, 132);
			const saved = JSON.parse(localStorage.getItem('refImage'));
			expect(saved.x).toBeCloseTo(0.1);
			expect(saved.y).toBeCloseTo(0.05);
		});

		it('pointers are ignored while drag mode is off', () => {
			loadFile();
			point('pointerdown', 100, 100);
			point('pointermove', 200, 200);
			expect(overlay.style.transform).toBe('translate(0px, 0px)');
		});

		it('a second pointer cannot steal the drag base', () => {
			loadFile();
			document.getElementById('refDrag').click();
			point('pointerdown', 100, 100);
			point('pointerdown', 500, 500);
			point('pointermove', 164, 132);
			// motion still measures from the first pointer's base
			expect(overlay.style.transform).toBe('translate(64px, 32px)');
		});

		it('a release anywhere disarms the drag', () => {
			loadFile();
			document.getElementById('refDrag').click();
			point('pointerdown', 100, 100);
			// capture can fail, so the up may land off the overlay
			document.body.dispatchEvent(
				new MouseEvent('pointerup', { bubbles: true }),
			);
			point('pointermove', 200, 200);
			expect(overlay.style.transform).toBe('translate(0px, 0px)');
		});

		it('a reset mid-drag freezes the image and saves nothing', () => {
			loadFile();
			document.getElementById('refDrag').click();
			point('pointerdown', 100, 100);
			document.dispatchEvent(new CustomEvent('onNewDocument'));
			point('pointermove', 300, 300);
			point('pointerup', 300, 300);
			expect(overlay.style.transform).toBe('');
			expect(localStorage.getItem('refImage')).toBeNull();
		});

		it('drag events never reach the canvas pointer normalizer', () => {
			loadFile();
			document.getElementById('refDrag').click();
			const leaked = vi.fn();
			document.body.addEventListener('pointerdown', leaked);
			point('pointerdown', 100, 100);
			document.body.removeEventListener('pointerdown', leaked);
			expect(leaked).not.toHaveBeenCalled();
		});
	});

	describe('persistence', () => {
		it('sliders only persist once an image is loaded', async () => {
			const opacity = document.getElementById('refOpacity');
			opacity.value = '60';
			opacity.dispatchEvent(new Event('input'));
			expect(localStorage.getItem('refImage')).toBeNull();
			loadFile();
			opacity.value = '70';
			opacity.dispatchEvent(new Event('input'));
			const saved = JSON.parse(localStorage.getItem('refImage'));
			expect(saved.opacity).toBe(70);
			expect(saved.width).toBe(100);
			await flush();
			expect(storage.saveRefImage).toHaveBeenCalledOnce();
			// Safari drops File clones in IndexedDB: the record is raw bytes
			expect(storage.saveRefImage.mock.calls[0][0].buffer).toBeInstanceOf(
				ArrayBuffer,
			);
		});

		it('restores the saved setup on boot', async () => {
			localStorage.setItem(
				'refImage',
				JSON.stringify({ opacity: 55, width: 150, x: 0.1, y: 0.05 }),
			);
			storage.loadRefImage.mockResolvedValue({
				buffer: Uint8Array.of(1).buffer,
				type: 'image/png',
			});
			document.body.innerHTML = MARKUP;
			Object.defineProperty(
				document.getElementById('canvasContainer'),
				'clientWidth',
				{ value: 640, configurable: true },
			);
			const onRestore = vi.fn();
			init({ onRestore });
			await flush();
			expect(overlay.classList.contains('enabled')).toBe(true);
			expect(overlay.style.opacity).toBe('0.55');
			expect(overlay.style.width).toBe('960px');
			expect(overlay.style.transform).toBe('translate(64px, 32px)');
			// the toolbar toggle syncs at creation, before the async
			// restore lands: the panel opens and the caller resyncs
			expect(ref.isOpen()).toBe(true);
			expect(onRestore).toHaveBeenCalledOnce();
		});

		it('orphaned settings without a stored blob are dropped', async () => {
			localStorage.setItem('refImage', JSON.stringify({ opacity: 55 }));
			document.body.innerHTML = MARKUP;
			init();
			await flush();
			expect(overlay.classList.contains('enabled')).toBe(false);
			expect(localStorage.getItem('refImage')).toBeNull();
		});

		it('a failed read keeps the settings for a later boot', async () => {
			localStorage.setItem('refImage', JSON.stringify({ opacity: 55 }));
			storage.loadRefImage.mockResolvedValue(null);
			document.body.innerHTML = MARKUP;
			init();
			await flush();
			// a blocked db is transient: wiping now would lose the trace
			expect(overlay.classList.contains('enabled')).toBe(false);
			expect(localStorage.getItem('refImage')).not.toBeNull();
		});

		it('a fresh load voids a restore still in flight', async () => {
			localStorage.setItem(
				'refImage',
				JSON.stringify({ opacity: 55, width: 150, x: 0.1, y: 0.05 }),
			);
			let release;
			storage.loadRefImage.mockReturnValue(
				new Promise(resolve => {
					release = resolve;
				}),
			);
			document.body.innerHTML = MARKUP;
			const onRestore = vi.fn();
			init({ onRestore });
			loadFile();
			release({ buffer: Uint8Array.of(9).buffer, type: 'image/png' });
			await flush();
			// the restore lost: the fresh image keeps its own sliders
			expect(document.getElementById('refOpacity').value).toBe('40');
			expect(onRestore).not.toHaveBeenCalled();
			expect(overlay.classList.contains('enabled')).toBe(true);
		});

		it('quick image swaps persist in load order', async () => {
			let releaseA;
			const slowRead = new Promise(resolve => {
				releaseA = resolve;
			});
			ref.load({ type: 'image/png', arrayBuffer: () => slowRead });
			ref.load({
				type: 'image/png',
				arrayBuffer: async () => Uint8Array.of(2).buffer,
			});
			await flush();
			releaseA(Uint8Array.of(1, 1).buffer);
			await flush();
			// the slow first read must not stamp its bytes over the second
			expect(storage.saveRefImage).toHaveBeenCalledOnce();
			expect(
				storage.saveRefImage.mock.calls[0][0].buffer.byteLength,
			).toBe(1);
		});

		it('a pending save dies with the clear that outran it', async () => {
			let release;
			const slowRead = new Promise(resolve => {
				release = resolve;
			});
			ref.load({ type: 'image/png', arrayBuffer: () => slowRead });
			document.getElementById('refClear').click();
			release(Uint8Array.of(1).buffer);
			await flush();
			// the late write must not resurrect bytes the user wiped
			expect(storage.saveRefImage).not.toHaveBeenCalled();
			expect(storage.clearRefImage).toHaveBeenCalled();
		});

		it('a new document voids a restore still in flight', async () => {
			localStorage.setItem(
				'refImage',
				JSON.stringify({ opacity: 55, width: 150, x: 0.1, y: 0.05 }),
			);
			let release;
			storage.loadRefImage.mockReturnValue(
				new Promise(resolve => {
					release = resolve;
				}),
			);
			document.body.innerHTML = MARKUP;
			const onRestore = vi.fn();
			init({ onRestore });
			document.dispatchEvent(new CustomEvent('onNewDocument'));
			release({ buffer: Uint8Array.of(1).buffer, type: 'image/png' });
			await flush();
			expect(overlay.classList.contains('enabled')).toBe(false);
			expect(localStorage.getItem('refImage')).toBeNull();
			expect(ref.isOpen()).toBe(false);
			expect(onRestore).not.toHaveBeenCalled();
		});
	});

	describe('reset', () => {
		it('clear returns everything to defaults and wipes both stores', () => {
			const opacity = document.getElementById('refOpacity');
			const scale = document.getElementById('refScale');
			loadFile();
			document.getElementById('refDrag').click();
			opacity.value = '70';
			opacity.dispatchEvent(new Event('input'));
			point('pointerdown', 100, 100);
			point('pointermove', 164, 132);
			point('pointerup', 164, 132);

			document.getElementById('refClear').click();
			expect(overlay.classList.contains('enabled')).toBe(false);
			expect(overlay.getAttribute('src')).toBeNull();
			expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
			expect(overlay.classList.contains('dragging')).toBe(false);
			expect(
				document.getElementById('refDrag').getAttribute('aria-pressed'),
			).toBe('false');
			expect(opacity.value).toBe('40');
			expect(scale.value).toBe('100');
			expect(overlay.style.transform).toBe('');
			expect(localStorage.getItem('refImage')).toBeNull();
			expect(storage.clearRefImage).toHaveBeenCalled();
		});

		it('onNewDocument resets exactly like the clear button', () => {
			loadFile();
			expect(localStorage.getItem('refImage')).not.toBeNull();
			document.dispatchEvent(new CustomEvent('onNewDocument'));
			expect(overlay.classList.contains('enabled')).toBe(false);
			expect(localStorage.getItem('refImage')).toBeNull();
			expect(storage.clearRefImage).toHaveBeenCalled();
		});
	});
});
