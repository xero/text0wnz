/**
 * Frames timeline panel: strip rendering, navigation, structure ops,
 * playback stepping with per-frame delays, onion toggle, and the
 * collab lockout.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createFramesPanel } from '../../src/js/client/frames.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		network: { isConnected: vi.fn(() => false) },
		textArtCanvas: null,
	},
}));

const PANEL_HTML = `
	<div id="navFrames"></div>
	<div id="framesPanel" class="hide">
		<button id="framePrev"></button>
		<kbd id="frameLabel">1/1</kbd>
		<button id="frameNext"></button>
		<div id="frameStrip"></div>
		<button id="frameAdd"></button>
		<button id="frameDup"></button>
		<button id="frameDel"></button>
		<label>ms <input id="frameDelay" type="number"/></label>
		<label>fps <input id="frameFps" type="number"/></label>
		<button id="framePlay">play</button>
		<button id="frameOnion">onion</button>
		<select id="frameBaud"><option selected>14400</option></select>
		<button id="frameBaudPlay">baud</button>
		<p id="framesLockNote" class="hide"></p>
	</div>
`;

/** canvas frames API fake with a real frame model */
const makeCanvas = () => {
	const frames = [{ delayMs: undefined }];
	let current = 0;
	let globalDelay = 100;
	let onion = false;
	const fire = () =>
		document.dispatchEvent(
			new CustomEvent('onFrameChange', { detail: { frame: current, count: frames.length } }),
		);
	return {
		getFrameCount: () => frames.length,
		getCurrentFrame: () => current,
		setCurrentFrame: vi.fn(index => {
			if (index < 0 || index >= frames.length) {
				return false;
			}
			current = index;
			fire();
			return true;
		}),
		addFrame: vi.fn(() => {
			frames.push({ delayMs: undefined });
			fire();
			return frames.length - 1;
		}),
		removeFrame: vi.fn(index => {
			frames.splice(index, 1);
			current = Math.min(current, frames.length - 1);
			fire();
			return true;
		}),
		canAddFrame: () => true,
		getFrameDelay: index => frames[index]?.delayMs,
		setFrameDelay: vi.fn((index, ms) => {
			frames[index].delayMs = ms;
		}),
		getGlobalDelayMs: () => globalDelay,
		setGlobalDelayMs: vi.fn(ms => {
			globalDelay = ms;
		}),
		setOnionSkin: vi.fn(enabled => {
			onion = enabled;
		}),
		getOnionSkin: () => onion,
		getBaudOffsets: vi.fn(() => Float64Array.from([5, 10, 15])),
		setBaudReveal: vi.fn(),
	};
};

let panel;
let canvas;

beforeEach(() => {
	document.body.innerHTML = PANEL_HTML;
	canvas = makeCanvas();
	State.textArtCanvas = canvas;
	State.network.isConnected.mockReturnValue(false);
	panel = createFramesPanel();
	panel.setOpen(true); // open -> refresh (main.js wires the button)
});

afterEach(() => {
	panel.stop();
	vi.useRealTimers();
	document.body.innerHTML = '';
});

describe('strip and navigation', () => {
	it('renders one cell per frame with the current highlighted', () => {
		canvas.addFrame();
		canvas.addFrame();
		const cells = document.querySelectorAll('#frameStrip .frameCell');
		expect(cells).toHaveLength(3);
		expect(cells[0].classList.contains('current')).toBe(true);
		expect(document.getElementById('frameLabel').textContent).toBe('1/3');
		cells[2].click();
		expect(canvas.getCurrentFrame()).toBe(2);
	});

	it('prev/next wrap around', () => {
		canvas.addFrame();
		document.getElementById('framePrev').click();
		expect(canvas.getCurrentFrame()).toBe(1);
		document.getElementById('frameNext').click();
		expect(canvas.getCurrentFrame()).toBe(0);
	});

	it('add jumps to the new frame; dup copies the current one', () => {
		document.getElementById('frameAdd').click();
		expect(canvas.addFrame).toHaveBeenCalledWith({});
		expect(canvas.getCurrentFrame()).toBe(1);
		document.getElementById('frameDup').click();
		expect(canvas.addFrame).toHaveBeenLastCalledWith({ copyFrom: 1 });
	});

	it('delete is disabled on the last frame', () => {
		expect(document.getElementById('frameDel').disabled).toBe(true);
		canvas.addFrame();
		expect(document.getElementById('frameDel').disabled).toBe(false);
		// deletes the CURRENT frame (still 0: addFrame was called on the
		// fake directly, not through the jump-to-new-frame button)
		document.getElementById('frameDel').click();
		expect(canvas.removeFrame).toHaveBeenCalledWith(0);
	});
});

describe('timing inputs', () => {
	it('per-frame delay writes through; blank clears to the global', () => {
		const input = document.getElementById('frameDelay');
		input.value = '250';
		input.dispatchEvent(new Event('change'));
		expect(canvas.setFrameDelay).toHaveBeenCalledWith(0, 250);
		input.value = '';
		input.dispatchEvent(new Event('change'));
		expect(canvas.setFrameDelay).toHaveBeenLastCalledWith(0, undefined);
	});

	it('fps rewrites the global delay', () => {
		const input = document.getElementById('frameFps');
		input.value = '20';
		input.dispatchEvent(new Event('change'));
		expect(canvas.setGlobalDelayMs).toHaveBeenCalledWith(50);
	});
});

describe('playback', () => {
	it('steps frames on their own delays and stops on edit', () => {
		vi.useFakeTimers();
		canvas.addFrame();
		canvas.addFrame();
		canvas.setCurrentFrame(0);
		canvas.setFrameDelay(1, 500);
		document.getElementById('framePlay').click();
		expect(panel.isPlaying()).toBe(true);
		expect(canvas.getCurrentFrame()).toBe(1); // first step is immediate
		vi.advanceTimersByTime(510); // frame 1 holds for its own delay
		expect(canvas.getCurrentFrame()).toBe(2);
		vi.advanceTimersByTime(110); // frame 2 uses the global 100ms
		expect(canvas.getCurrentFrame()).toBe(0); // wrapped
		document.dispatchEvent(new CustomEvent('onTextCanvasDown'));
		expect(panel.isPlaying()).toBe(false);
	});

	it('pressing the button during a baud reveal STOPS it (never stacks playback)', () => {
		const raf = vi
			.spyOn(window, 'requestAnimationFrame')
			.mockReturnValue(1);
		canvas.addFrame();
		document.getElementById('frameBaudPlay').click();
		expect(canvas.setBaudReveal).toHaveBeenCalled();
		// the play/stop button must stop the baud reveal, not start frame
		// playback on top of it
		document.getElementById('framePlay').click();
		expect(canvas.setBaudReveal).toHaveBeenLastCalledWith(null);
		expect(panel.isPlaying()).toBe(false);
		raf.mockRestore();
	});

	it('refuses to play a single-frame doc', () => {
		document.getElementById('framePlay').click();
		expect(panel.isPlaying()).toBe(false);
	});
});

describe('baud preview', () => {
	it('reveals through setBaudReveal and stops cleanly', () => {
		// keep the rAF loop from free-running in jsdom: schedule nothing
		const raf = vi
			.spyOn(window, 'requestAnimationFrame')
			.mockReturnValue(1);
		document.getElementById('frameBaudPlay').click();
		expect(canvas.getBaudOffsets).toHaveBeenCalled();
		expect(canvas.setBaudReveal).toHaveBeenCalledWith(expect.any(Number));
		expect(
			document
				.getElementById('frameBaudPlay')
				.classList.contains('active'),
		).toBe(true);
		document.getElementById('frameBaudPlay').click();
		expect(canvas.setBaudReveal).toHaveBeenLastCalledWith(null);
		raf.mockRestore();
	});
});

describe('onion and lockout', () => {
	it('onion button toggles the canvas ghost mode', () => {
		document.getElementById('frameOnion').click();
		expect(canvas.setOnionSkin).toHaveBeenCalledWith(true);
	});

	it('collab sessions disable the controls and show why', () => {
		State.network.isConnected.mockReturnValue(true);
		panel.refresh();
		expect(document.getElementById('frameAdd').disabled).toBe(true);
		expect(document.getElementById('framePlay').disabled).toBe(true);
		expect(
			document.getElementById('framesLockNote').classList.contains('hide'),
		).toBe(false);
		document.getElementById('framePlay').click();
		expect(panel.isPlaying()).toBe(false);
	});
});
