/**
 * In-app profiling harness (PLAN.md P0). Loaded ONLY when the page is opened
 * with ?profile (see main.js). Runs scripted scroll / keystroke / zoom /
 * repaint scenarios against the live renderer and reports fps, latencies,
 * and canvas memory, so the same numbers can be captured on desktop CI
 * (Playwright, tests/perf/captureBaseline.js) and on real devices by hand.
 *
 * While the overlay is open, autosave is disabled so profiling docs never
 * clobber the artist's autosaved work; reloading restores the last autosave.
 */
import State from './state.js';

const DOC_PRESETS = {
	'80x1000': { columns: 80, rows: 1000 },
	'80x3000': { columns: 80, rows: 3000 },
	'240x3000': { columns: 240, rows: 3000 },
};
const DEFAULT_PRESET = '80x3000';

// Seeded LCG so every run draws the identical document
const lcg = seed => {
	let state = seed >>> 0;
	return () => {
		state = (state * 1664525 + 1013904223) >>> 0;
		return state / 4294967296;
	};
};

const nextFrame = () =>
	new Promise(resolve => requestAnimationFrame(() => resolve()));

const doubleRaf = async () => {
	await nextFrame();
	await nextFrame();
};

const waitForEvent = (name, timeoutMs) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			document.removeEventListener(name, handler);
			reject(new Error(`timed out waiting for ${name}`));
		}, timeoutMs);
		const handler = () => {
			clearTimeout(timer);
			resolve();
		};
		document.addEventListener(name, handler, { once: true });
	});

const median = values => {
	if (!values.length) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2
		? sorted[mid]
		: (sorted[mid - 1] + sorted[mid]) / 2;
};

const percentile = (values, p) => {
	if (!values.length) {
		return 0;
	}
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const round = (value, places = 1) => {
	const f = 10 ** places;
	return Math.round(value * f) / f;
};

const installProfiler = () => {
	// Kill persistence for the whole session: profiling docs must never
	// overwrite the artist's autosave
	State.saveToLocalStorage = () => Promise.resolve(false);
	State.saveUndoHistory = () => Promise.resolve(false);

	const viewport = document.getElementById('viewport');

	const buildDoc = (columns, rows) => {
		const rand = lcg(0xc0ffee);
		const chars = [32, 32, 46, 176, 177, 178, 219, 220, 223, 254, 88];
		const data = new Uint16Array(columns * rows);
		for (let i = 0; i < data.length; i++) {
			const charCode = chars[Math.floor(rand() * chars.length)];
			const fg = Math.floor(rand() * 16);
			const bg = Math.floor(rand() * 8);
			data[i] = (charCode << 8) | (bg << 4) | fg;
		}
		return data;
	};

	const setupDoc = (columns, rows) =>
		new Promise(resolve => {
			const data = buildDoc(columns, rows);
			State.textArtCanvas.setImageData(columns, rows, data, false, null, () => {
				resolve();
			});
		});

	// rAF-driven scroll ramp; returns frame statistics
	const scrollRun = async (pxPerFrame, maxMs) => {
		viewport.scrollTop = 0;
		await doubleRaf();
		const deltas = [];
		const start = performance.now();
		let last = start;
		await new Promise(resolve => {
			const step = now => {
				deltas.push(now - last);
				last = now;
				viewport.scrollTop += pxPerFrame;
				const atEnd =
					viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2;
				if (atEnd || now - start > maxMs) {
					resolve();
				} else {
					requestAnimationFrame(step);
				}
			};
			requestAnimationFrame(step);
		});
		// First delta spans setup work; drop it
		deltas.shift();
		const avgMs = deltas.reduce((a, b) => a + b, 0) / Math.max(deltas.length, 1);
		return {
			frames: deltas.length,
			avgFps: round(1000 / avgMs),
			p95FrameMs: round(percentile(deltas, 95)),
			jankFrames: deltas.filter(d => d > 33).length,
		};
	};

	const scrollScenario = async () => {
		performance.mark('p0:scroll:start');
		const slow = await scrollRun(4, 5000);
		const fling = await scrollRun(40, 5000);
		performance.mark('p0:scroll:end');
		viewport.scrollTop = 0;
		await doubleRaf();
		return { slow, fling };
	};

	// Latency from draw call to the start of the frame that paints it
	// (single rAF; a double rAF would add a full-frame measurement floor)
	const keystrokeScenario = async () => {
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const rand = lcg(0xdead);
		const samples = 40;
		const totals = [];
		const calls = [];
		for (let i = 0; i < samples; i++) {
			const row = Math.floor(rand() * rows);
			const col = Math.floor(rand() * (columns - 1));
			// Keystrokes land where the artist is looking; bring the row on screen
			viewport.scrollTop = Math.max(
				0,
				(row / rows) * viewport.scrollHeight - viewport.clientHeight / 2,
			);
			await doubleRaf();
			const t0 = performance.now();
			State.textArtCanvas.startUndo();
			State.textArtCanvas.draw(callback => {
				callback(88, 15, 0, col, row); // 'X' white on black
			}, false);
			const t1 = performance.now();
			await nextFrame();
			calls.push(t1 - t0);
			totals.push(performance.now() - t0);
		}
		viewport.scrollTop = 0;
		await doubleRaf();
		return {
			medianMs: round(median(totals), 2),
			p95Ms: round(percentile(totals, 95), 2),
			medianCallMs: round(median(calls), 2),
		};
	};

	// Full glyph re-rasterization: scale factor change -> progressive repaint
	const zoomScenario = async () => {
		const original = State.font.getScaleFactor();
		const target = original === 2 ? 1 : 2;
		performance.mark('p0:zoom:start');
		const t0 = performance.now();
		const done = waitForEvent('onCanvasRenderComplete', 120000);
		State.font.setScaleFactor(target);
		await done;
		const zoomMs = performance.now() - t0;
		performance.mark('p0:zoom:end');
		// Restore and wait out the second repaint before the next scenario
		const back = waitForEvent('onCanvasRenderComplete', 120000);
		State.font.setScaleFactor(original);
		await back;
		return { zoomMs: round(zoomMs) };
	};

	const repaintScenario = async () => {
		const t0 = performance.now();
		await new Promise(resolve => {
			State.textArtCanvas.redrawEntireImage(null, () => resolve());
		});
		return { fullRepaintMs: round(performance.now() - t0) };
	};

	const memoryScenario = () => {
		const canvases = document.querySelectorAll('canvas');
		let bytes = 0;
		canvases.forEach(canvas => {
			bytes += canvas.width * canvas.height * 4;
		});
		const result = {
			canvasCount: canvases.length,
			canvasMemMB: round(bytes / 1048576),
		};
		if (performance.memory) {
			result.jsHeapMB = round(performance.memory.usedJSHeapSize / 1048576);
		}
		return result;
	};

	const machineDescriptor = () => ({
		userAgent: navigator.userAgent,
		hardwareConcurrency: navigator.hardwareConcurrency || null,
		deviceMemory: navigator.deviceMemory || null,
		devicePixelRatio: window.devicePixelRatio,
		screen: `${window.screen.width}x${window.screen.height}`,
		viewport: `${viewport.clientWidth}x${viewport.clientHeight}`,
	});

	const runAll = async (presetName = DEFAULT_PRESET) => {
		const preset = DOC_PRESETS[presetName] || DOC_PRESETS[DEFAULT_PRESET];
		setStatus(`building ${preset.columns}x${preset.rows} doc…`);
		await setupDoc(preset.columns, preset.rows);
		await doubleRaf();

		setStatus('scroll…');
		const scroll = await scrollScenario();
		setStatus('keystrokes…');
		const keystroke = await keystrokeScenario();
		setStatus('zoom…');
		const zoom = await zoomScenario();
		setStatus('full repaint…');
		const repaint = await repaintScenario();
		const memory = memoryScenario();

		const results = {
			capturedAt: new Date().toISOString(),
			renderer:
				new URLSearchParams(window.location.search).get('renderer') === 'gl'
					? 'webgl2-slack-buffer'
					: 'canvas2d-chunks',
			machine: machineDescriptor(),
			docSize: preset,
			// Headline metrics (PLAN.md P0 baseline shape)
			scrollFps: scroll.fling.avgFps,
			keystrokeMs: keystroke.medianMs,
			zoomMs: zoom.zoomMs,
			fullRepaintMs: repaint.fullRepaintMs,
			canvasMemMB: memory.canvasMemMB,
			detail: { scroll, keystroke, memory },
		};
		window.__t0wnzProfileResults = results;
		setStatus('done');
		showResults(results);
		return results;
	};

	// --- overlay UI (dependency-free, inline styles) ---
	const panel = document.createElement('div');
	panel.id = 'profilerPanel';
	panel.style.cssText = [
		'position:fixed',
		'top:8px',
		'right:8px',
		'z-index:99999',
		'background:rgba(0,0,0,0.92)',
		'color:#0f0',
		'font:12px monospace',
		'padding:12px',
		'border:1px solid #0f0',
		'border-radius:4px',
		'max-width:340px',
		'max-height:90vh',
		'overflow:auto',
	].join(';');

	const title = document.createElement('div');
	title.textContent = 'teXt0wnz profiler';
	title.style.cssText = 'font-weight:bold;margin-bottom:6px';
	panel.appendChild(title);

	const warning = document.createElement('div');
	warning.textContent =
		'autosave is OFF while profiling; reload to restore your art';
	warning.style.cssText = 'color:#ff0;margin-bottom:6px';
	panel.appendChild(warning);

	const presetSelect = document.createElement('select');
	presetSelect.style.cssText =
		'background:#000;color:#0f0;border:1px solid #0f0;margin-right:6px';
	Object.keys(DOC_PRESETS).forEach(name => {
		const option = document.createElement('option');
		option.value = name;
		option.textContent = name;
		if (name === DEFAULT_PRESET) {
			option.selected = true;
		}
		presetSelect.appendChild(option);
	});
	panel.appendChild(presetSelect);

	const runButton = document.createElement('button');
	runButton.textContent = 'run all';
	runButton.style.cssText =
		'background:#000;color:#0f0;border:1px solid #0f0;cursor:pointer';
	panel.appendChild(runButton);

	const closeButton = document.createElement('button');
	closeButton.textContent = 'x';
	closeButton.style.cssText =
		'background:#000;color:#f00;border:1px solid #f00;cursor:pointer;float:right';
	closeButton.addEventListener('click', () => panel.remove());
	panel.appendChild(closeButton);

	const status = document.createElement('div');
	status.style.cssText = 'margin-top:6px;color:#fff';
	panel.appendChild(status);
	const setStatus = text => {
		status.textContent = text;
	};

	const output = document.createElement('textarea');
	output.readOnly = true;
	output.rows = 14;
	output.style.cssText = [
		'width:100%',
		'margin-top:6px',
		'background:#000',
		'color:#0f0',
		'border:1px solid #0f0',
		'font:11px monospace',
		'display:none',
	].join(';');
	panel.appendChild(output);

	const copyButton = document.createElement('button');
	copyButton.textContent = 'copy json';
	copyButton.style.cssText =
		'background:#000;color:#0f0;border:1px solid #0f0;cursor:pointer;margin-top:4px;display:none';
	copyButton.addEventListener('click', () => {
		output.select();
		if (navigator.clipboard) {
			navigator.clipboard.writeText(output.value);
		} else {
			document.execCommand('copy');
		}
		copyButton.textContent = 'copied!';
		setTimeout(() => {
			copyButton.textContent = 'copy json';
		}, 1500);
	});
	panel.appendChild(copyButton);

	const showResults = results => {
		output.value = JSON.stringify(results, null, '\t');
		output.style.display = 'block';
		copyButton.style.display = 'inline-block';
	};

	let running = false;
	runButton.addEventListener('click', async () => {
		if (running) {
			return;
		}
		running = true;
		runButton.disabled = true;
		try {
			await runAll(presetSelect.value);
		} catch (error) {
			setStatus(`error: ${error.message}`);
			console.error('[Profiler]', error);
		}
		runButton.disabled = false;
		running = false;
	});

	document.body.appendChild(panel);

	// Scripted access for Playwright (tests/perf/captureBaseline.js)
	window.__t0wnzProfiler = {
		runAll,
		scenarios: {
			setupDoc,
			scrollScenario,
			keystrokeScenario,
			zoomScenario,
			repaintScenario,
			memoryScenario,
		},
	};
	console.log('[Profiler] installed; window.__t0wnzProfiler ready');
};

export { installProfiler };
export default { installProfiler };
