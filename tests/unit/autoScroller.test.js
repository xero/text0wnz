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
	let rafSeq;
	let clock;
	let states;
	let engine;

	// rAF stand-in that cancels by id: popping an arbitrary callback
	// would cancel the wrong tick when more than one engine is live
	const raf = cb => {
		rafSeq++;
		queue.push({ id: rafSeq, cb });
		return rafSeq;
	};
	const caf = id => {
		const at = queue.findIndex(entry => entry.id === id);
		if (at >= 0) {
			queue.splice(at, 1);
		}
	};

	// one queued rAF callback per frame; 100ms steps stay inside the
	// engine's dt clamp so simulated time is never discarded
	const step = (ms = 100) => {
		clock += ms;
		const entry = queue.shift();
		if (entry) {
			entry.cb(clock);
		}
	};
	const stepUntil = (predicate, limit = 500) => {
		for (let i = 0; i < limit && !predicate(); i++) {
			step();
		}
	};

	// an engine on live cadence election instead of an injected base
	const electingEngine = () =>
		createScrollEngine({
			viewport: () => vp,
			raf,
			caf,
			now: () => clock,
			onState: () => {},
		});

	beforeEach(() => {
		vp = { scrollTop: 0, scrollHeight: 1000, clientHeight: 200 };
		queue = [];
		rafSeq = 0;
		clock = 0;
		states = [];
		engine = createScrollEngine({
			viewport: () => vp,
			raf,
			caf,
			now: () => clock,
			onState: playing => states.push(playing),
			// a fixed cadence so each step() is exactly one frame
			frameMs: 100,
		});
	});

	it('glides down in uniform whole dither period frames', () => {
		engine.play();
		expect(states).toEqual([true]);
		// default 7 rows/s * 16px * 0.1s is 11.2px, 5.6 dither periods,
		// snapped to 12px flat: an odd step would invert shade glyphs
		step();
		expect(vp.scrollTop).toBe(12);
		step();
		expect(vp.scrollTop).toBe(24);
		step();
		expect(vp.scrollTop).toBe(36);
	});

	it('crawls one dither period every few frames when slow', () => {
		const crawler = createScrollEngine({
			viewport: () => vp,
			now: () => clock,
			raf,
			caf,
			frameMs: 25,
		});
		crawler.setSpeed(1);
		crawler.play();
		// 16px/s at a 25ms frame is 0.2 periods: 2px every fifth frame
		for (let i = 0; i < 10; i++) {
			step(25);
		}
		expect(vp.scrollTop).toBe(4);
		crawler.pause();
	});

	it('holds at the bottom before gliding back up', () => {
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		expect(vp.scrollTop).toBe(800);
		// 1500ms hold: still parked a second in
		for (let i = 0; i < 10; i++) {
			step();
		}
		expect(vp.scrollTop).toBe(800);
	});

	it('reverses up smoothly instead of snapping home', () => {
		engine.setMode('loop');
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		// ride out the hold until the first upward tick
		stepUntil(() => vp.scrollTop < 800, 50);
		expect(vp.scrollTop).toBeGreaterThan(0);
		const partway = vp.scrollTop;
		step();
		expect(vp.scrollTop).toBeLessThan(partway);
		expect(vp.scrollTop).toBeGreaterThan(0);
	});

	it('holds at the top between round trips', () => {
		engine.setMode('loop');
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		stepUntil(() => vp.scrollTop === 0, 600);
		// 1500ms top hold: still parked a second in
		for (let i = 0; i < 10; i++) {
			step();
		}
		expect(vp.scrollTop).toBe(0);
		expect(engine.isPlaying()).toBe(true);
		stepUntil(() => vp.scrollTop > 0, 100);
		expect(engine.isPlaying()).toBe(true);
	});

	it('a single counted run parks back at the top and stops', () => {
		engine.setCount(1);
		engine.play();
		stepUntil(() => !engine.isPlaying());
		expect(vp.scrollTop).toBe(0);
		expect(states).toEqual([true, false]);
	});

	it('count 2 makes two full round trips before stopping', () => {
		engine.setCount(2);
		engine.play();
		stepUntil(() => vp.scrollTop >= 800);
		const firstBottom = clock;
		stepUntil(() => !engine.isPlaying(), 1000);
		// still ahead: the ride up, the top hold, and a whole second lap
		// at the period locked 120px/s effective rate
		expect(clock - firstBottom).toBeGreaterThan(
			1500 + 1500 + 3 * (800 / 120) * 1000,
		);
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

	it('vsync jitter never stalls a frame or changes the step', () => {
		const live = electingEngine();
		live.play();
		const jitter = [1.5, -1.2, 0.8, -1.5, 1.1, -0.4, 0.2, -0.9];
		const tops = [];
		for (let i = 0; i < 300; i++) {
			step(16.7 + jitter[i % jitter.length]);
			tops.push(vp.scrollTop);
		}
		const deltas = tops.slice(1).map((v, i) => v - tops[i]);
		// 7 rows/s at a 60Hz base is 1.87px, snapped to a flat 2: no
		// zero px stall frames, no step size flap, ever
		expect(deltas.every(d => d === 2)).toBe(true);
		live.pause();
	});

	it('a dropped frame owes one whole catch-up, nothing after', () => {
		const live = electingEngine();
		live.play();
		for (let i = 0; i < 20; i++) {
			step(16.7);
		}
		const before = vp.scrollTop;
		step(33.4);
		// two vsyncs passed: exactly one doubled step
		expect(vp.scrollTop - before).toBe(4);
		const tops = [];
		for (let i = 0; i < 20; i++) {
			step(16.7);
			tops.push(vp.scrollTop);
		}
		const deltas = tops.slice(1).map((v, i) => v - tops[i]);
		// the hitch must not leave a cadence wobble tail
		expect(deltas.every(d => d === 2)).toBe(true);
		live.pause();
	});

	it('a rounding-boundary rate holds one schedule at 120Hz', () => {
		const live = electingEngine();
		live.setSpeed(5);
		live.play();
		const tops = [];
		const jitter = [0.9, -0.7, 0.4, -1, 0.6, -0.2];
		for (let i = 0; i < 80; i++) {
			step(8.33 + jitter[i % jitter.length]);
			tops.push(vp.scrollTop);
		}
		const deltas = tops.slice(1).map((v, i) => v - tops[i]);
		// 5 rows/s at 120Hz is a third of a period per frame, frozen at
		// one 2px period every third frame; steps never flap and never
		// land odd, which would invert shade glyphs
		expect(deltas.every(d => d === 0 || d === 2)).toBe(true);
		let run = 0;
		let longest = 0;
		deltas.forEach(d => {
			run = d === 0 ? run + 1 : 0;
			longest = Math.max(longest, run);
		});
		expect(longest).toBeLessThanOrEqual(2);
		live.pause();
	});

	it('clamps a backwards first timestamp to zero dt', () => {
		const live = electingEngine();
		clock = 1000;
		live.play();
		clock = 999;
		const entry = queue.shift();
		entry.cb(clock);
		expect(Number.isFinite(vp.scrollTop)).toBe(true);
		expect(vp.scrollTop).toBeGreaterThanOrEqual(0);
		expect(live.isPlaying()).toBe(true);
		live.pause();
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
		expect(engine.getSpeed()).toBe(25);
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
			<div id="minimapMenu">
				<div id="autoscrollTransport">
					<span>autoscroll</span>
					<button id="autoscrollToggle"><svg><use href="img/icons.svg#play"></use></svg></button>
				</div>
				<div id="autoscrollModeRow"></div>
				<div id="autoscrollCount">
					<label>count</label>
					<button id="autoscrollCountDown">-</button>
					<span id="autoscrollCountValue">1</span>
					<button id="autoscrollCountUp">+</button>
				</div>
				<label id="autoscrollSpeedRow">
					speed
					<input id="autoscrollSpeed" type="range" value="5" max="9" min="1" step="1"/>
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

	it('the toggle swaps loop for the close X and expands the menu', async () => {
		createAutoScroller();
		const toggle = document.getElementById('minimapMenuToggle');
		const menu = document.getElementById('minimapMenu');
		toggle.click();
		expect(menu.classList.contains('open')).toBe(true);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');
		// the icon remount defers a microtask so it never detaches the
		// node mid click dispatch; flush it before reading the glyph
		await Promise.resolve();
		expect(toggle.querySelector('use').getAttribute('href')).toContain(
			'#cancel',
		);
		toggle.click();
		expect(menu.classList.contains('open')).toBe(false);
		await Promise.resolve();
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

	it('loop mode dims and disables the count row', () => {
		createAutoScroller();
		const cluster = document.getElementById('autoscrollCount');
		const down = document.getElementById('autoscrollCountDown');
		const up = document.getElementById('autoscrollCountUp');
		document.querySelector('#autoscrollMode [data-value="loop"]').click();
		expect(cluster.classList.contains('dimmed')).toBe(true);
		expect(down.disabled).toBe(true);
		expect(up.disabled).toBe(true);
		document.querySelector('#autoscrollMode [data-value="count"]').click();
		expect(cluster.classList.contains('dimmed')).toBe(false);
		expect(down.disabled).toBe(false);
		expect(up.disabled).toBe(false);
	});

	it('raises the transition kill switch only while playing', () => {
		const engine = createAutoScroller();
		const vp = document.getElementById('viewport');
		Object.defineProperty(vp, 'scrollHeight', {
			value: 1000,
			configurable: true,
		});
		Object.defineProperty(vp, 'clientHeight', {
			value: 200,
			configurable: true,
		});
		engine.play();
		expect(document.body.classList.contains('autoscrolling')).toBe(true);
		engine.pause();
		expect(document.body.classList.contains('autoscrolling')).toBe(false);
	});

	it('persists the speed tick and restores its rows per second', () => {
		const engine = createAutoScroller();
		const slider = document.getElementById('autoscrollSpeed');
		slider.value = '7';
		slider.dispatchEvent(new Event('input'));
		// tick seven on the curve is fourteen rows per second
		expect(engine.getSpeed()).toBe(14);
		expect(localStorage.getItem('autoscrollSpeed')).toBe('7');
		document.body.innerHTML = MARKUP;
		const next = createAutoScroller();
		expect(next.getSpeed()).toBe(14);
		expect(document.getElementById('autoscrollSpeed').value).toBe('7');
	});
});
