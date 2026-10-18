/**
 * Autoscroll engine: the state machine runs on injected clock, rAF,
 * and viewport, so every phase (glide, bottom hold, snap home, counted
 * runs, loop, the manual-scroll escape) is stepped deterministically.
 * Menu wiring is exercised against real markup at the bottom.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createScrollEngine,
	createAutoScroller,
} from '../../src/js/client/autoScroller.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		font: { getHeight: () => 16, getWidth: () => 8 },
		palette: null,
		textArtCanvas: null,
	},
}));

describe('scroll engine', () => {
	let vp;
	let queue;
	let clock;
	let states;
	let engine;

	// one queued rAF callback per frame; 100ms steps stay inside the
	// engine's dt clamp so simulated time is never discarded
	const step = (ms = 100) => {
		clock += ms;
		const cb = queue.shift();
		if (cb) {
			cb(clock);
		}
	};
	const stepUntil = (predicate, limit = 500) => {
		for (let i = 0; i < limit && !predicate(); i++) {
			step();
		}
	};

	beforeEach(() => {
		vp = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 };
		queue = [];
		clock = 0;
		states = [];
		engine = createScrollEngine({
			viewport: () => vp,
			raf: cb => queue.push(cb) && queue.length,
			caf: () => queue.pop(),
			now: () => clock,
			onState: playing => states.push(playing),
		});
	});

	it('glides down at rows per second times font height', () => {
		engine.play();
		expect(states).toEqual([true]);
		// default 4 rows/s * 16px = 64px/s, so 6.4px per 100ms frame
		step();
		expect(vp.scrollTop).toBeCloseTo(6.4, 1);
		step();
		expect(vp.scrollTop).toBeCloseTo(12.8, 1);
	});

	it('holds at the bottom before snapping home', () => {
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		expect(vp.scrollTop).toBe(800);
		// 1500ms hold: still parked a second in
		for (let i = 0; i < 10; i++) {
			step();
		}
		expect(vp.scrollTop).toBe(800);
	});

	it('a single counted run parks back at the top and stops', () => {
		engine.setCount(1);
		engine.play();
		stepUntil(() => !engine.isPlaying());
		expect(vp.scrollTop).toBe(0);
		expect(states).toEqual([true, false]);
	});

	it('count 2 makes two full passes before stopping', () => {
		engine.setCount(2);
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		const firstBottom = clock;
		stepUntil(() => !engine.isPlaying());
		// the second pass needs the hold, the glide, and another hold
		expect(clock - firstBottom).toBeGreaterThan(1500 + (800 / 64) * 1000);
		expect(vp.scrollTop).toBe(0);
	});

	it('loop mode keeps running past any count', () => {
		engine.setMode('loop');
		engine.play();
		let passes = 0;
		let wasAtBottom = false;
		for (let i = 0; i < 2000 && passes < 3; i++) {
			step();
			const atBottom = vp.scrollTop >= 800;
			if (atBottom && !wasAtBottom) {
				passes++;
			}
			wasAtBottom = atBottom;
		}
		expect(passes).toBe(3);
		expect(engine.isPlaying()).toBe(true);
	});

	it('adopts the row settle snap once per hold, then escapes', () => {
		engine.setMode('loop');
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		// the app's settle snap re-aligns the parked viewport by less
		// than a row: playback must ride it out
		vp.scrollTop = 793;
		step();
		expect(engine.isPlaying()).toBe(true);
		expect(vp.scrollTop).toBe(793);
		// a second nudge in the same hold is a human
		vp.scrollTop = 786;
		step();
		expect(engine.isPlaying()).toBe(false);
		expect(vp.scrollTop).toBe(786);
	});

	it('a sub-row nudge mid-glide still escapes', () => {
		engine.play();
		step();
		step();
		vp.scrollTop += 5;
		step();
		expect(engine.isPlaying()).toBe(false);
	});

	it('a manual scroll escapes playback in place', () => {
		engine.play();
		step();
		step();
		vp.scrollTop = 400;
		step();
		expect(engine.isPlaying()).toBe(false);
		// the user keeps their position, no snap anywhere
		expect(vp.scrollTop).toBe(400);
	});

	it('pause freezes and play resumes from the same spot', () => {
		engine.play();
		step();
		step();
		const frozen = vp.scrollTop;
		engine.pause();
		expect(engine.isPlaying()).toBe(false);
		expect(vp.scrollTop).toBe(frozen);
		engine.play();
		step();
		expect(vp.scrollTop).toBeGreaterThan(frozen);
	});

	it('refuses to play when the doc already fits', () => {
		vp.scrollHeight = 150;
		engine.play();
		expect(engine.isPlaying()).toBe(false);
		expect(states).toEqual([]);
	});

	it('clamps speed and count to their rails', () => {
		engine.setSpeed(99);
		expect(engine.getSpeed()).toBe(10);
		engine.setSpeed(-3);
		expect(engine.getSpeed()).toBe(1);
		engine.setCount(9);
		expect(engine.getCount()).toBe(5);
		engine.setCount(0);
		expect(engine.getCount()).toBe(1);
	});

	it('toggle flips transport state', () => {
		engine.toggle();
		expect(engine.isPlaying()).toBe(true);
		engine.toggle();
		expect(engine.isPlaying()).toBe(false);
	});
});

describe('autoscroll menu', () => {
	const MARKUP = `
		<div id="minimapPanel">
			<button id="minimapMenuToggle" aria-expanded="false">
				<svg><use href="img/icons.svg#loop"></use></svg>
			</button>
			<div id="minimapMenu" class="hide">
				<div id="autoscrollTransport">
					<span>autoscroll</span>
					<button id="autoscrollToggle"><svg><use href="img/icons.svg#play"></use></svg></button>
				</div>
				<div id="autoscrollModeRow">
					<div id="autoscrollCount">
						<label>count</label>
						<button id="autoscrollCountDown">-</button>
						<span id="autoscrollCountValue">1</span>
						<button id="autoscrollCountUp">+</button>
					</div>
				</div>
				<label id="autoscrollSpeedRow">
					speed
					<input id="autoscrollSpeed" type="range" value="4" max="10" min="1" step="1"/>
				</label>
			</div>
			<div id="minimapScroll"></div>
		</div>
		<div id="viewport"></div>
	`;

	beforeEach(() => {
		localStorage.removeItem('autoscrollSpeed');
		document.body.innerHTML = MARKUP;
	});

	it('returns null without its markup', () => {
		document.body.innerHTML = '';
		expect(createAutoScroller()).toBeNull();
	});

	it('the toggle swaps loop for the close X and expands the menu', () => {
		createAutoScroller();
		const toggle = document.getElementById('minimapMenuToggle');
		const menu = document.getElementById('minimapMenu');
		toggle.click();
		expect(menu.classList.contains('hide')).toBe(false);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		expect(toggle.querySelector('use').getAttribute('href')).toContain(
			'#cancel',
		);
		toggle.click();
		expect(menu.classList.contains('hide')).toBe(true);
		expect(toggle.querySelector('use').getAttribute('href')).toContain(
			'#loop',
		);
	});

	it('steps the pass count inside 1-5', () => {
		const engine = createAutoScroller();
		const up = document.getElementById('autoscrollCountUp');
		const down = document.getElementById('autoscrollCountDown');
		const value = document.getElementById('autoscrollCountValue');
		down.click();
		expect(value.textContent).toBe('1');
		for (let i = 0; i < 7; i++) {
			up.click();
		}
		expect(value.textContent).toBe('5');
		expect(engine.getCount()).toBe(5);
	});

	it('loop mode blanks the count cluster', () => {
		createAutoScroller();
		const cluster = document.getElementById('autoscrollCount');
		const loopBtn = document.querySelector(
			'#autoscrollMode [data-value="loop"]',
		);
		loopBtn.click();
		expect(cluster.classList.contains('hide')).toBe(true);
		document.querySelector('#autoscrollMode [data-value="count"]').click();
		expect(cluster.classList.contains('hide')).toBe(false);
	});

	it('persists speed and restores it on the next boot', () => {
		const engine = createAutoScroller();
		const slider = document.getElementById('autoscrollSpeed');
		slider.value = '7';
		slider.dispatchEvent(new Event('input'));
		expect(engine.getSpeed()).toBe(7);
		expect(localStorage.getItem('autoscrollSpeed')).toBe('7');
		document.body.innerHTML = MARKUP;
		const next = createAutoScroller();
		expect(next.getSpeed()).toBe(7);
		expect(document.getElementById('autoscrollSpeed').value).toBe('7');
	});
});
