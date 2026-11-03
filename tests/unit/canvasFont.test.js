import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTextArtCanvas } from '../../src/js/client/canvas.js';
import { loadFontFromImage } from '../../src/js/client/font.js';
import State from '../../src/js/client/state.js';
import magicNumbers from '../../src/js/client/magicNumbers.js';

// a font handle whose spacing setter fires the event the real one does
const { makeFont } = vi.hoisted(() => ({
	makeFont: (name, spacing = false, glyphs = { width: 8, height: 16 }) => ({
		name,
		draw: vi.fn(),
		drawWithAlpha: vi.fn(),
		getWidth: () => glyphs.width,
		getHeight: () => glyphs.height,
		getData: () => glyphs,
		dispose: vi.fn(),
		getScaleFactor: () => 1,
		getLetterSpacing: () => spacing,
		setLetterSpacing: vi.fn(value => {
			if (value !== spacing) {
				spacing = value;
				document.dispatchEvent(
					new CustomEvent('onLetterSpacingChange', { detail: value }),
				);
			}
		}),
		setPalette: vi.fn(),
		redraw: vi.fn(),
	}),
}));

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: makeFont('boot'),
		palette: {
			getRGBAColor: vi.fn(() => [255, 255, 255, 255]),
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
		},
		modal: {
			loading: vi.fn(),
			close: vi.fn(),
		},
		loadingFromStorage: false,
		saveToLocalStorage: vi.fn(),
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(_id => ({
		style: {},
		classList: { add: vi.fn(), remove: vi.fn() },
		appendChild: vi.fn(),
		addEventListener: vi.fn(),
	})),
	createCanvas: vi.fn(() => ({
		width: 640,
		height: 400,
		style: {},
		getContext: vi.fn(() => ({
			fillStyle: '',
			fillRect: vi.fn(),
			clearRect: vi.fn(),
			drawImage: vi.fn(),
			createImageData: vi.fn((width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width,
				height,
			})),
			putImageData: vi.fn(),
			getImageData: vi.fn((_x, _y, width, height) => ({
				data: new Uint8ClampedArray(width * height * 4),
				width,
				height,
			})),
		})),
	})),
}));

vi.mock('../../src/js/client/font.js', () => ({
	loadFontFromImage: vi.fn(async (name, spacing) => makeFont(name, spacing)),
	loadFontFromXBData: vi.fn(async () => makeFont('XBIN')),
}));

vi.mock('../../src/js/client/palette.js', () => ({
	createPalette: vi.fn(() => ({ getRGBAColor: vi.fn(() => [255, 255, 255, 255]) })),
	createDefaultPalette: vi.fn(() => ({ getRGBAColor: vi.fn(() => [255, 255, 255, 255]) })),
}));

describe('setFont', () => {
	let canvas;
	let installed;
	const onFontChange = e => installed.push(e.detail);
	const container = () => ({
		style: {},
		classList: { add: vi.fn(), remove: vi.fn() },
		appendChild: vi.fn(),
		removeChild: vi.fn(),
		addEventListener: vi.fn(),
		children: [],
	});
	const boot = () =>
		new Promise(resolve => {
			canvas = createTextArtCanvas(container(), resolve);
		});
	// the next image load waits for the test; loading settles with its
	// arguments once setFont starts it
	const holdLoad = () => {
		let finish;
		let reached;
		const loading = new Promise(resolve => {
			reached = resolve;
		});
		vi.mocked(loadFontFromImage).mockImplementationOnce((name, spacing) => {
			reached([name, spacing]);
			return new Promise(resolve => {
				finish = () => {
					const font = makeFont(name, spacing);
					resolve(font);
					return font;
				};
			});
		});
		return { loading, finish: () => finish() };
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		await boot();
		installed = [];
		document.addEventListener('onFontChange', onFontChange);
	});

	afterEach(() => {
		document.removeEventListener('onFontChange', onFontChange);
		vi.useRealTimers();
	});

	it('installs loads in call order, so the last call wins', async () => {
		const slow = holdLoad();
		const first = canvas.setFont('Topaz 500');
		const second = canvas.setFont('IBM VGA');
		await slow.loading;
		slow.finish();
		await Promise.all([first, second]);
		expect(installed).toEqual(['Topaz 500', 'IBM VGA']);
		expect(State.font.name).toBe('IBM VGA');
	});

	it('runs every callback once, in call order', async () => {
		const order = [];
		const slow = holdLoad();
		const first = canvas.setFont('Topaz 500', () => order.push('Topaz 500'));
		const second = canvas.setFont('IBM VGA', () => order.push('IBM VGA'));
		await slow.loading;
		slow.finish();
		await Promise.all([first, second]);
		expect(order).toEqual(['Topaz 500', 'IBM VGA']);
	});

	it('a callback that waits on a later setFont leaves the queue moving', async () => {
		const done = vi.fn();
		let inner;
		await canvas.setFont('Topaz 500', async () => {
			inner = canvas.setFont('IBM VGA', done);
			await inner;
		});
		await inner;
		expect(done).toHaveBeenCalledTimes(1);
		expect(State.font.name).toBe('IBM VGA');
	});

	it('a load that never settles falls back once the wait runs out, and later loads follow', async () => {
		vi.useFakeTimers();
		vi.mocked(loadFontFromImage).mockImplementationOnce(() => new Promise(() => {}));
		const called = vi.fn();
		const stuck = canvas.setFont('Topaz 500', called);
		const next = canvas.setFont('IBM VGA');
		await vi.advanceTimersByTimeAsync(10000);
		await Promise.all([stuck, next]);
		expect(called).toHaveBeenCalledTimes(1);
		expect(installed).toEqual([magicNumbers.DEFAULT_FONT, 'IBM VGA']);
	});

	it('time the page spends hidden does not count toward the wait', async () => {
		vi.useFakeTimers();
		let hidden = false;
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			get: () => hidden,
		});
		const turn = value => {
			hidden = value;
			document.dispatchEvent(new Event('visibilitychange'));
		};
		try {
			const slow = holdLoad();
			const swapping = canvas.setFont('Topaz 500');
			await slow.loading;
			await vi.advanceTimersByTimeAsync(9000);
			turn(true);
			await vi.advanceTimersByTimeAsync(60000);
			turn(false);
			await vi.advanceTimersByTimeAsync(900);
			slow.finish();
			await swapping;
			expect(installed).toEqual(['Topaz 500']);
			// visible time still runs the wait out
			const stuck = holdLoad();
			const next = canvas.setFont('IBM VGA');
			await stuck.loading;
			await vi.advanceTimersByTimeAsync(4000);
			turn(true);
			await vi.advanceTimersByTimeAsync(60000);
			turn(false);
			await vi.advanceTimersByTimeAsync(6000);
			await next;
			expect(installed).toEqual(['Topaz 500', magicNumbers.DEFAULT_FONT]);
		} finally {
			delete document.hidden;
		}
	});

	it('a load that finishes after its wait ran out is disposed and sizes nothing', async () => {
		vi.useFakeTimers();
		const late = makeFont('Topaz 500', false, { width: 8, height: 8 });
		vi.mocked(loadFontFromImage).mockImplementationOnce(
			() =>
				new Promise(resolve => {
					setTimeout(() => resolve(late), 15000);
				}),
		);
		const swapping = canvas.setFont('Topaz 500');
		await vi.advanceTimersByTimeAsync(10000);
		await swapping;
		expect(installed).toEqual([magicNumbers.DEFAULT_FONT]);
		await vi.advanceTimersByTimeAsync(5000);
		expect(late.dispose).toHaveBeenCalledTimes(1);
		expect(State.font).not.toBe(late);
		expect([State.fontWidth, State.fontHeight]).toEqual([8, 16]);
	});

	it('the glyph size in State follows the font that goes live', async () => {
		vi.mocked(loadFontFromImage).mockImplementationOnce(async (name, spacing) =>
			makeFont(name, spacing, { width: 8, height: 8 }));
		await canvas.setFont('IBM VGA 8x8');
		expect([State.fontWidth, State.fontHeight]).toEqual([8, 8]);
		await canvas.setFont('IBM VGA');
		expect([State.fontWidth, State.fontHeight]).toEqual([8, 16]);
	});

	it('a load its caller disowns before it installs is disposed', async () => {
		const slow = holdLoad();
		let wanted = true;
		const called = vi.fn();
		const swapping = canvas.setFont('IBM VGA', called, undefined, () => wanted);
		await slow.loading;
		wanted = false;
		const font = slow.finish();
		await swapping;
		expect(font.dispose).toHaveBeenCalledTimes(1);
		expect(State.font).not.toBe(font);
		expect(installed).toEqual([]);
		expect(called).not.toHaveBeenCalled();
	});

	it('the first load waits out a slow network instead of falling back', async () => {
		vi.useFakeTimers();
		State.font = null;
		vi.mocked(loadFontFromImage).mockImplementationOnce(
			(name, spacing) =>
				new Promise(resolve => {
					setTimeout(() => resolve(makeFont(name, spacing)), 15000);
				}),
		);
		const called = vi.fn();
		const first = canvas.setFont('Topaz 500', called);
		await vi.advanceTimersByTimeAsync(15000);
		await first;
		expect(installed).toEqual(['Topaz 500']);
		expect(called).toHaveBeenCalledTimes(1);
	});

	it('a 9px toggle made during the load carries onto the new font', async () => {
		const slow = holdLoad();
		const swapping = canvas.setFont('Topaz 500');
		const [, spacing] = await slow.loading;
		expect(spacing).toBe(false);
		// the toggle lands on the font still live
		State.font.setLetterSpacing(true);
		const relayouts = [];
		const onSpacing = () => relayouts.push(State.font.name);
		document.addEventListener('onLetterSpacingChange', onSpacing);
		try {
			slow.finish();
			await swapping;
		} finally {
			document.removeEventListener('onLetterSpacingChange', onSpacing);
		}
		expect(State.font.name).toBe('Topaz 500');
		expect(State.font.getLetterSpacing()).toBe(true);
		// spacing listeners relayout against the font just installed
		expect(relayouts).toEqual(['Topaz 500']);
	});

	it('a palette swapped during the load reaches the new font', async () => {
		const slow = holdLoad();
		const swapping = canvas.setFont('Topaz 500');
		await slow.loading;
		const previous = State.palette;
		const palette = { getRGBAColor: vi.fn(() => [0, 0, 0, 255]) };
		State.palette = palette;
		try {
			slow.finish();
			await swapping;
			expect(State.font.setPalette).toHaveBeenCalledWith(palette);
		} finally {
			State.palette = previous;
		}
	});

	it('a caller that stops wanting the swap before its turn skips the load and the callback', async () => {
		const slow = holdLoad();
		const first = canvas.setFont('Topaz 500');
		let wanted = true;
		const called = vi.fn();
		const second = canvas.setFont('IBM VGA', called, undefined, () => wanted);
		await slow.loading;
		wanted = false;
		slow.finish();
		await Promise.all([first, second]);
		expect(loadFontFromImage).not.toHaveBeenCalledWith('IBM VGA', expect.anything(), expect.anything(), expect.anything());
		expect(called).not.toHaveBeenCalled();
		expect(State.font.name).toBe('Topaz 500');
	});
});
