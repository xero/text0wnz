/**
 * Frames timeline: the animation panel. Frame strip,
 * add/duplicate/delete, per-frame delay, live-fps playback, onion
 * skin. Pure UI over the canvas frames API.
 *
 * Collab sessions are single-frame by policy (no frame op exists in
 * the protocol): the controls disable with a visible note while
 * connected, matching the charset/color lockouts.
 */
import State from './state.js';
import { $ } from './ui.js';

const createFramesPanel = () => {
	const panel = $('framesPanel');
	const navButton = $('navFrames');
	if (!panel || !navButton) {
		return null;
	}
	const strip = $('frameStrip');
	const label = $('frameLabel');
	const btnPrev = $('framePrev');
	const btnNext = $('frameNext');
	const btnAdd = $('frameAdd');
	const btnDup = $('frameDup');
	const btnDel = $('frameDel');
	const btnPlay = $('framePlay');
	const btnOnion = $('frameOnion');
	const inputDelay = $('frameDelay');
	const inputFps = $('frameFps');
	const selBaud = $('frameBaud');
	const btnBaud = $('frameBaudPlay');
	const lockNote = $('framesLockNote');

	let playing = false;
	let playTimer = 0;
	let baudActive = false;
	let baudRaf = 0;
	// every stop/play bumps the token; a step chain that outlives its
	// token aborts, so no stale timer can ever keep animating
	let playToken = 0;

	const canvas = () => State.textArtCanvas;
	const locked = () => State.network?.isConnected?.() === true;

	/** stops BOTH playback modes (frame stepping and the baud reveal) */
	const stop = () => {
		playToken++;
		if (playTimer) {
			clearTimeout(playTimer);
			playTimer = 0;
		}
		if (playing) {
			playing = false;
			btnPlay.textContent = 'play';
			btnPlay.classList.remove('active');
		}
		if (baudActive) {
			baudActive = false;
			cancelAnimationFrame(baudRaf);
			canvas().setBaudReveal(null);
			btnBaud.classList.remove('active');
		}
	};

	const playBaud = () => {
		stop();
		const token = playToken;
		const c = canvas();
		const offsets = c.getBaudOffsets();
		// 8N1: one byte costs 10 bits on the wire
		const bytesPerSecond = parseInt(selBaud.value, 10) / 10;
		const t0 = performance.now();
		baudActive = true;
		btnBaud.classList.add('active');
		const tick = () => {
			if (token !== playToken || !baudActive) {
				return;
			}
			const bytes = ((performance.now() - t0) / 1000) * bytesPerSecond;
			// first cell whose cumulative cost exceeds the elapsed bytes
			let lo = 0;
			let hi = offsets.length;
			while (lo < hi) {
				const mid = (lo + hi) >> 1;
				if (offsets[mid] <= bytes) {
					lo = mid + 1;
				} else {
					hi = mid;
				}
			}
			canvas().setBaudReveal(lo);
			if (lo >= offsets.length) {
				stop();
				return;
			}
			baudRaf = requestAnimationFrame(tick);
		};
		tick();
	};

	const play = () => {
		if (locked() || canvas().getFrameCount() < 2) {
			return;
		}
		stop(); // any prior chain dies before a new one starts
		playing = true;
		btnPlay.textContent = 'stop';
		btnPlay.classList.add('active');
		const token = playToken;
		const step = () => {
			const c = canvas();
			if (token !== playToken || !playing || c.getFrameCount() < 2) {
				return;
			}
			const next = (c.getCurrentFrame() + 1) % c.getFrameCount();
			c.setCurrentFrame(next);
			const delay = c.getFrameDelay(next) ?? c.getGlobalDelayMs();
			playTimer = setTimeout(step, Math.max(16, delay));
		};
		step();
	};

	const refresh = () => {
		const c = canvas();
		if (!c) {
			return;
		}
		const count = c.getFrameCount();
		const current = c.getCurrentFrame();
		label.textContent = `${current + 1}/${count}`;
		const isLocked = locked();
		lockNote.classList.toggle('hide', !isLocked);
		for (const button of [btnPrev, btnNext, btnAdd, btnDup, btnDel, btnPlay]) {
			button.disabled = isLocked;
		}
		inputDelay.disabled = isLocked;
		inputFps.disabled = isLocked;
		btnDel.disabled = isLocked || count === 1;
		const delay = c.getFrameDelay(current);
		inputDelay.value = delay === undefined ? '' : String(delay);
		inputDelay.placeholder = String(c.getGlobalDelayMs());
		inputFps.value = String(Math.round(1000 / c.getGlobalDelayMs()));
		btnOnion.classList.toggle('active', c.getOnionSkin() === true);
		// numbered strip: click to jump, current highlighted
		strip.textContent = '';
		for (let i = 0; i < count; i++) {
			const cell = document.createElement('button');
			cell.textContent = String(i + 1);
			cell.className = i === current ? 'frameCell current' : 'frameCell';
			cell.addEventListener('click', () => {
				stop();
				canvas().setCurrentFrame(i);
			});
			strip.appendChild(cell);
		}
		const currentCell = strip.children[current];
		currentCell?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
	};

	const jump = offset => {
		stop();
		const c = canvas();
		const count = c.getFrameCount();
		c.setCurrentFrame((c.getCurrentFrame() + offset + count) % count);
	};

	btnPrev.addEventListener('click', () => jump(-1));
	btnNext.addEventListener('click', () => jump(1));
	btnAdd.addEventListener('click', () => {
		stop();
		const c = canvas();
		if (!c.canAddFrame()) {
			if (
				!confirm(
					'This passes the animation memory budget. Add the frame anyway?',
				)
			) {
				return;
			}
			const index = c.addFrame({ force: true });
			c.setCurrentFrame(index);
			return;
		}
		c.setCurrentFrame(c.addFrame({}));
	});
	btnDup.addEventListener('click', () => {
		stop();
		const c = canvas();
		if (!c.canAddFrame()) {
			return;
		}
		c.setCurrentFrame(c.addFrame({ copyFrom: c.getCurrentFrame() }));
	});
	btnDel.addEventListener('click', () => {
		stop();
		const c = canvas();
		if (c.getFrameCount() > 1) {
			c.removeFrame(c.getCurrentFrame());
		}
	});
	btnPlay.addEventListener('click', () => {
		// the play/stop button stops EVERY animation mode (a running
		// baud reveal included) before it would ever start playback
		if (playing || baudActive) {
			stop();
		} else {
			play();
		}
	});
	btnOnion.addEventListener('click', () => {
		const c = canvas();
		c.setOnionSkin(!c.getOnionSkin());
		refresh();
	});
	btnBaud.addEventListener('click', () => {
		if (baudActive) {
			stop();
		} else {
			playBaud();
		}
	});
	inputDelay.addEventListener('change', () => {
		const c = canvas();
		const value = parseInt(inputDelay.value, 10);
		c.setFrameDelay(
			c.getCurrentFrame(),
			Number.isInteger(value) && value >= 16 ? value : undefined,
		);
		refresh();
	});
	inputFps.addEventListener('change', () => {
		const fps = parseInt(inputFps.value, 10);
		if (Number.isInteger(fps) && fps >= 1 && fps <= 60) {
			canvas().setGlobalDelayMs(Math.round(1000 / fps));
		}
		refresh();
	});

	// the toolbar button wires through createSettingToggle in main.js
	// (the house pattern: the 'enabled' highlight persists across
	// toolbar view switches, like the grid button)
	const isOpen = () => !panel.classList.contains('hide');
	const setOpen = open => {
		panel.classList.toggle('hide', !open);
		if (open) {
			refresh();
		} else {
			stop();
		}
	};

	document.addEventListener('onFrameChange', refresh);
	// editing stops playback (drawing into a flipbook is chaos)
	document.addEventListener('onTextCanvasDown', stop);

	return { refresh, stop, isPlaying: () => playing, isOpen, setOpen };
};

export { createFramesPanel };
