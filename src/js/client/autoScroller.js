/**
 * Compo-style autoscroll: glides the viewport to the bottom of the
 * artwork, holds a beat, glides back up to the top, holds again, and
 * repeats the round trip a set number of times or forever. Speed is
 * rows per second so playback reads the same at any zoom or font
 * size. A manual scroll anywhere (wheel, minimap scrub, keyboard)
 * pauses playback in place, the PabloDraw escape hatch. Scroll speed
 * persists; mode, count, and transport state are session-only.
 */
import State from './state.js';
import { $, createSegmentedControl, iconHref } from './ui.js';

const BOTTOM_PAUSE_MS = 1500;
const TOP_PAUSE_MS = 1500;
// a tick lands within a pixel of what it wrote; anything farther is
// the user grabbing the scroll away from us
const ESCAPE_PX = 2;
// background tabs stop rAF; cap the hold arithmetic or it teleports
const MAX_DT_MS = 100;
// CP437 shade glyphs are checkerboards with a two px vertical period;
// any odd per frame displacement shifts them a HALF period, inverting
// every dither cell each frame, a fixed point flicker the eye reads
// as flashing cells (120Hz displays hit this at speeds that land on
// one px per frame). Glide steps are quantized to whole periods
const PERIOD_PX = 2;
// displays a vsync period can belong to; electing the base from this
// set keeps one dropped frame from ever reading as a cadence change
const CANON_MS = [
	1000 / 240,
	1000 / 165,
	1000 / 144,
	1000 / 120,
	1000 / 90,
	1000 / 75,
	1000 / 60,
	1000 / 48,
	1000 / 30,
];

const SPEED_KEY = 'autoscrollSpeed';
const SPEED_DEFAULT = 7;
const SPEED_MIN = 1;
const SPEED_MAX = 25;
// slider tick to rows per second: the old ceiling of ten sits one
// tick above the middle default, so the top third is new headroom
const SPEED_ROWS = [1, 2, 3, 5, 7, 10, 14, 19, 25];
const SPEED_TICKS = SPEED_ROWS.length;
const COUNT_MIN = 1;
const COUNT_MAX = 5;

/**
 * The playback state machine, DOM-free except for the injected
 * viewport. deps: {viewport, raf, caf, onState} where viewport() is a
 * getter and onState fires on every play/pause flip so the transport
 * button can mirror self-pauses (escape, finished runs).
 */
const createScrollEngine = deps => {
	const viewport = deps.viewport;
	const raf = deps.raf ?? (cb => requestAnimationFrame(cb));
	const caf = deps.caf ?? (id => cancelAnimationFrame(id));
	const now = deps.now ?? (() => performance.now());
	const onState = deps.onState ?? (() => {});

	let playing = false;
	let phase = 'down';
	let mode = 'count';
	let count = 1;
	let runsLeft = 0;
	let speed = SPEED_DEFAULT;
	let pos = 0;
	let expected = 0;
	let pauseLeft = 0;
	let lastTs = 0;
	let rafId = 0;
	// the browser rounds scrollTop writes, so a fractional rate aliases
	// into runs of N px frames broken by an N-1 px frame, a rhythmic
	// judder whose beat tracks the speed; on dither glyphs that beat
	// reads as a luminance pulse. Gliding instead advances a UNIFORM
	// whole px count per vsync (or one px every few vsyncs when slow),
	// snapping the true rate to the nearest beatless one. The base
	// vsync period is the median of recent deltas snapped to a
	// canonical display rate with hysteresis, so a hitch can neither
	// stall a frame nor poison the cadence into a wobble tail
	let base = deps.frameMs ?? 1000 / 60;
	const fixedFrame = Boolean(deps.frameMs);
	const recent = [];
	let stepKey = '';
	let stepPx = 0;
	let stepEvery = 1;
	let slowPhase = 0;
	// a parked hold fires no scroll events, so the app's row settle
	// snap (main.js) rewrites scrollTop once; one sub-row nudge per
	// hold is that snap, anything more is the user grabbing the scroll
	let adopted = false;

	const setPlaying = value => {
		if (playing === value) {
			return;
		}
		playing = value;
		if (!playing && rafId) {
			caf(rafId);
			rafId = 0;
		}
		onState(playing);
	};

	const maxScroll = vp => vp.scrollHeight - vp.clientHeight;

	const tick = ts => {
		rafId = 0;
		const vp = viewport();
		if (!vp || !State.font) {
			setPlaying(false);
			return;
		}
		const max = maxScroll(vp);
		if (max <= 0) {
			setPlaying(false);
			return;
		}
		const gliding = phase === 'down' || phase === 'up';
		const drift = Math.abs(vp.scrollTop - expected);
		if (drift > ESCAPE_PX) {
			if (!gliding && !adopted && drift < State.font.getHeight()) {
				adopted = true;
				pos = vp.scrollTop;
			} else {
				setPlaying(false);
				return;
			}
		}
		// WebKit can hand the first tick a timestamp older than play()'s
		// clock sample; a negative delta must not reach the arithmetic
		const dtMs = Math.max(0, Math.min(ts - lastTs, MAX_DT_MS));
		lastTs = ts;
		if (gliding) {
			if (!fixedFrame && dtMs > 1 && dtMs < 50) {
				recent.push(dtMs);
				if (recent.length > 8) {
					recent.shift();
				}
				const sorted = [...recent].sort((a, b) => a - b);
				const median = sorted[sorted.length >> 1];
				const candidate = CANON_MS.reduce((best, period) =>
					(Math.abs(period - median) < Math.abs(best - median)
						? period
						: best));
				// hysteresis: jitter never reelects, a real rate change does
				if (Math.abs(candidate - base) / base > 0.2) {
					base = candidate;
				}
			}
			// every rAF callback IS a frame: at least one vsync passed, and
			// a dropped frame owes whole catch-up steps, never a stall
			const vsyncs = Math.max(1, Math.min(12, Math.round(dtMs / base)));
			// the step sizes are frozen per cadence and speed, so a rate
			// that lands on a rounding boundary cannot flap frame to frame
			const key = `${base}|${speed}|${State.font.getHeight()}`;
			if (key !== stepKey) {
				stepKey = key;
				const periods =
					(speed * State.font.getHeight() * base) / 1000 / PERIOD_PX;
				stepPx = periods >= 1 ? PERIOD_PX * Math.round(periods) : 0;
				stepEvery =
					periods >= 1 ? 1 : Math.max(1, Math.round(1 / periods));
				slowPhase = 0;
			}
			let px;
			if (stepPx > 0) {
				px = stepPx * vsyncs;
			} else {
				slowPhase += vsyncs;
				px = Math.floor(slowPhase / stepEvery) * PERIOD_PX;
				slowPhase %= stepEvery;
			}
			if (phase === 'down') {
				pos = Math.min(pos + px, max);
				if (pos >= max) {
					phase = 'bottomPause';
					pauseLeft = BOTTOM_PAUSE_MS;
					adopted = false;
				}
			} else {
				pos = Math.max(pos - px, 0);
				if (pos <= 0) {
					// a round trip ends back at the top
					if (mode === 'count' && --runsLeft <= 0) {
						vp.scrollTop = 0;
						setPlaying(false);
						return;
					}
					phase = 'topPause';
					pauseLeft = TOP_PAUSE_MS;
					adopted = false;
				}
			}
		} else {
			pauseLeft -= dtMs;
			if (pauseLeft <= 0) {
				phase = phase === 'bottomPause' ? 'up' : 'down';
				slowPhase = 0;
			}
		}
		vp.scrollTop = pos;
		// read back what the browser kept, not what we asked for, so
		// clamping and rounding never trip the escape check
		expected = vp.scrollTop;
		rafId = raf(tick);
	};

	const play = () => {
		if (playing) {
			return;
		}
		const vp = viewport();
		if (!vp || maxScroll(vp) <= 0) {
			return;
		}
		// resume picks up wherever the user or a pause left the view;
		// a fresh start after finished runs refills the counter
		if (runsLeft <= 0) {
			runsLeft = count;
		}
		pos = vp.scrollTop;
		expected = vp.scrollTop;
		// resume always heads down first; starting at the bottom just
		// means the bottom hold arrives on the first tick
		phase = 'down';
		slowPhase = 0;
		lastTs = now();
		setPlaying(true);
		rafId = raf(tick);
	};

	const pause = () => setPlaying(false);

	return {
		play,
		pause,
		toggle: () => (playing ? pause() : play()),
		isPlaying: () => playing,
		setMode: value => {
			mode = value;
			runsLeft = count;
		},
		getMode: () => mode,
		setCount: value => {
			count = Math.max(COUNT_MIN, Math.min(COUNT_MAX, value));
			runsLeft = count;
		},
		getCount: () => count,
		setSpeed: value => {
			speed = Math.max(SPEED_MIN, Math.min(SPEED_MAX, value));
		},
		getSpeed: () => speed,
	};
};

/** Wires the minimap's autoscroll menu; null without its markup. */
const createAutoScroller = () => {
	const toggle = $('minimapMenuToggle');
	const menu = $('minimapMenu');
	const transport = $('autoscrollToggle');
	const modeRow = $('autoscrollModeRow');
	const countCluster = $('autoscrollCount');
	const countValue = $('autoscrollCountValue');
	const speedSlider = $('autoscrollSpeed');
	if (!toggle || !menu || !transport || !modeRow) {
		return null;
	}

	const transportUse = transport.querySelector('use');
	const engine = createScrollEngine({
		viewport: () => document.getElementById('viewport'),
		onState: playing => {
			transportUse?.setAttribute(
				'href',
				iconHref(playing ? 'pause' : 'play'),
			);
			transport.setAttribute('aria-label', playing ? 'Pause' : 'Play');
			// the stylesheet drops canvas stack transitions while this
			// class is up; easing fights the per frame scrollTop writes
			document.body.classList.toggle('autoscrolling', playing);
		},
	});

	// menu expand/collapse: the loop glyph becomes the close X, and the
	// panel's flex column crops the map from the bottom on its own
	const toggleUse = toggle.querySelector('use');
	const setOpen = open => {
		menu.classList.toggle('hide', !open);
		toggle.setAttribute('aria-expanded', String(open));
		toggle.setAttribute('aria-label', open ? 'Close Autoscroll Menu' : 'Autoscroll Menu');
		toggleUse?.setAttribute('href', iconHref(open ? 'cancel' : 'loop'));
	};
	toggle.addEventListener('click', () => {
		setOpen(menu.classList.contains('hide'));
	});

	transport.addEventListener('click', () => engine.toggle());

	const paintCount = () => {
		countValue.textContent = String(engine.getCount());
	};
	const stepDown = $('autoscrollCountDown');
	const stepUp = $('autoscrollCountUp');
	const modeControl = createSegmentedControl(
		'autoscrollMode',
		[
			{ value: 'count', label: 'scroll', icon: 'loop' },
			{ value: 'loop', label: 'loop', icon: 'infinite' },
		],
		value => {
			engine.setMode(value);
			// forever mode has no use for a pass count: dim the row and
			// fence it off rather than reflowing the menu
			const off = value !== 'count';
			countCluster?.classList.toggle('dimmed', off);
			if (stepDown) {
				stepDown.disabled = off;
			}
			if (stepUp) {
				stepUp.disabled = off;
			}
		},
	);
	modeRow.prepend(modeControl.getElement());

	stepDown?.addEventListener('click', () => {
		engine.setCount(engine.getCount() - 1);
		paintCount();
	});
	stepUp?.addEventListener('click', () => {
		engine.setCount(engine.getCount() + 1);
		paintCount();
	});
	paintCount();

	if (speedSlider) {
		let stored = null;
		try {
			stored = parseInt(localStorage.getItem(SPEED_KEY), 10);
		} catch {
			// storage blocked: the default rules
		}
		if (stored >= 1 && stored <= SPEED_TICKS) {
			engine.setSpeed(SPEED_ROWS[stored - 1]);
			speedSlider.value = String(stored);
		}
		speedSlider.addEventListener('input', e => {
			const tick = parseInt(e.target.value, 10);
			engine.setSpeed(SPEED_ROWS[tick - 1] ?? SPEED_DEFAULT);
			try {
				localStorage.setItem(SPEED_KEY, String(tick));
			} catch {
				// storage blocked: the speed just does not persist
			}
		});
	}

	// a wheel over the art is unambiguous takeover: escape on the event
	// itself, because Firefox animates wheel scrolls and the early
	// frames can duck under the drift threshold while the engine's own
	// writes cancel the rest of the animation
	document
		.getElementById('viewport')
		?.addEventListener('wheel', () => engine.pause(), { passive: true });

	// a buffer swap mid-glide would strand the old position; new art
	// starts parked like everything else in the panel
	document.addEventListener('onNewDocument', () => engine.pause());

	return engine;
};

export { createScrollEngine, createAutoScroller };
