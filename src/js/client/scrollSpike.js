/**
 * P1 scroll spike (PLAN.md §3.1, §4 P1): a THROWAWAY implementation of the
 * slack-buffer scroll pattern, loaded only when the page is opened with
 * ?spike (see main.js). It exists to measure the pattern before the real GL
 * renderer is built on it, on desktop Chromium via Playwright
 * (tests/perf/captureScrollSpike.js) and on real devices by hand (O9).
 *
 * The pattern (production precedent: Perfetto VirtualCanvas): keep a NATIVE
 * scroller with a full-document-height spacer, and position one WebGL2
 * canvas absolutely INSIDE the scrolled content, sized to the viewport plus
 * slack screens of overdraw. The compositor moves the canvas in perfect
 * sync with momentum/rubber-band for free; the scroll handler only acts
 * when the viewport nears the drawn edge, re-anchoring the canvas and
 * repainting coverage in one instanced draw.
 *
 * Renders the EXISTING u16 doc model (charCode<<8 | bg<<4 | fg) with the
 * current font and palette. Blink is drawn at a fixed phase (bg dimmed,
 * glyph visible) — animation is out of scope for a scroll measurement.
 */
import State from './state.js';

const PRESETS = {
	'80x3000': { columns: 80, rows: 3000 },
	'240x3000': { columns: 240, rows: 3000 },
	'80x10000': { columns: 80, rows: 10000 },
};

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

const stats = values => ({
	mean: round(values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1), 2),
	max: round(Math.max(0, ...values), 2),
	p95: round(percentile(values, 95), 2),
});

const VERTEX_SRC = `#version 300 es
in vec2 a_corner;
in float a_cell;
uniform vec2 u_cellPx;
uniform vec2 u_canvasPx;
uniform float u_cols;
uniform float u_ice;
uniform vec4 u_palette[16];
flat out float v_char;
flat out vec4 v_fg;
flat out vec4 v_bg;
out vec2 v_pix;
void main() {
	float id = float(gl_InstanceID);
	float col = mod(id, u_cols);
	float row = floor(id / u_cols);
	vec2 px = (vec2(col, row) + a_corner) * u_cellPx;
	vec2 ndc = px / u_canvasPx * 2.0 - 1.0;
	gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
	v_pix = a_corner * u_cellPx;
	float ch = floor(a_cell / 256.0);
	float color = a_cell - ch * 256.0;
	float bg = floor(color / 16.0);
	float fg = color - bg * 16.0;
	// without ice, bright backgrounds mean blink; draw the static phase
	if (u_ice < 0.5 && bg > 7.0) {
		bg -= 8.0;
	}
	v_char = ch;
	v_fg = u_palette[int(fg)];
	v_bg = u_palette[int(bg)];
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform vec2 u_fontPx;
uniform float u_pxScale;
uniform float u_spacing;
flat in float v_char;
flat in vec4 v_fg;
flat in vec4 v_bg;
in vec2 v_pix;
out vec4 fragColor;
void main() {
	float fx = floor(v_pix.x / u_pxScale);
	float fy = floor(v_pix.y / u_pxScale);
	if (u_spacing > 0.5 && fx >= u_fontPx.x) {
		// VGA ninth column: background, except 0xC0-0xDF duplicate column 8
		if (v_char >= 192.0 && v_char <= 223.0) {
			fx = u_fontPx.x - 1.0;
		} else {
			fragColor = v_bg;
			return;
		}
	}
	float gx = mod(v_char, 16.0) * u_fontPx.x + min(fx, u_fontPx.x - 1.0);
	float gy = floor(v_char / 16.0) * u_fontPx.y + min(fy, u_fontPx.y - 1.0);
	float bit = texelFetch(u_atlas, ivec2(int(gx), int(gy)), 0).r;
	fragColor = bit > 0.5 ? v_fg : v_bg;
}`;

const installScrollSpike = () => {
	const dpr = window.devicePixelRatio || 1;

	// --- doc sources ---------------------------------------------------
	const snapshotEditorDoc = () => ({
		name: 'editor doc',
		columns: State.textArtCanvas.getColumns(),
		rows: State.textArtCanvas.getRows(),
		// snapshot: the spike never mutates (or follows) the live doc
		data: State.textArtCanvas.getImageData().slice(),
		iceColors: State.textArtCanvas.getIceColors(),
	});

	const buildSyntheticDoc = presetName => {
		const preset = PRESETS[presetName];
		const rand = lcg(0xc0ffee);
		const chars = [32, 32, 46, 176, 177, 178, 219, 220, 223, 254, 88];
		const data = new Uint16Array(preset.columns * preset.rows);
		for (let i = 0; i < data.length; i++) {
			const charCode = chars[Math.floor(rand() * chars.length)];
			const fg = Math.floor(rand() * 16);
			const bg = Math.floor(rand() * 8);
			data[i] = (charCode << 8) | (bg << 4) | fg;
		}
		return {
			name: presetName,
			columns: preset.columns,
			rows: preset.rows,
			data,
			iceColors: false,
		};
	};

	// --- spike state ---------------------------------------------------
	let doc = snapshotEditorDoc();
	// tunables under measurement (screens = multiples of viewport height)
	const params = {
		slackScreens: 1.5, // total overdraw beyond the viewport
		toleranceScreens: 0.5, // re-anchor when the edge gets this close
	};
	const counters = {
		reAnchors: 0,
		repackMs: [],
		drawMs: [],
		anchorMs: [],
		blankFrames: 0,
	};
	const resetCounters = () => {
		counters.reAnchors = 0;
		counters.repackMs = [];
		counters.drawMs = [];
		counters.anchorMs = [];
		counters.blankFrames = 0;
	};

	// font metrics (unscaled font pixels; the spike always draws at zoom 1)
	const fontData = State.font.getData();
	const letterSpacing = State.font.getLetterSpacing() ? 1 : 0;
	const advanceCss = fontData.width + letterSpacing;
	const cellHCss = fontData.height;

	// --- DOM -----------------------------------------------------------
	const overlay = document.createElement('div');
	overlay.id = 'scrollSpikeOverlay';
	overlay.style.cssText =
		'position:fixed;inset:0;z-index:99998;background:#111;overscroll-behavior:none';

	const scroller = document.createElement('div');
	scroller.style.cssText = 'position:absolute;inset:0;overflow:auto';
	overlay.appendChild(scroller);

	const content = document.createElement('div');
	content.style.cssText = 'position:relative';
	scroller.appendChild(content);

	const canvas = document.createElement('canvas');
	canvas.style.cssText = 'position:absolute;left:0;display:block';
	content.appendChild(canvas);

	document.body.appendChild(overlay);

	// --- WebGL2 setup ----------------------------------------------------
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
	});
	if (!gl) {
		overlay.innerHTML =
			'<div style="color:#f00;font:14px monospace;padding:2em">webgl2 unavailable</div>';
		return;
	}

	const compile = (type, src) => {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, src);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
		}
		return shader;
	};
	const program = gl.createProgram();
	gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SRC));
	gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		throw new Error(`program: ${gl.getProgramInfoLog(program)}`);
	}
	gl.useProgram(program);

	const uniforms = {};
	[
		'u_cellPx',
		'u_canvasPx',
		'u_cols',
		'u_ice',
		'u_palette',
		'u_atlas',
		'u_fontPx',
		'u_pxScale',
		'u_spacing',
	].forEach(name => {
		uniforms[name] = gl.getUniformLocation(program, name);
	});

	// one unit quad, instanced per cell
	const vao = gl.createVertexArray();
	gl.bindVertexArray(vao);
	const cornerBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cornerBuffer);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
		gl.STATIC_DRAW,
	);
	const cornerLoc = gl.getAttribLocation(program, 'a_corner');
	gl.enableVertexAttribArray(cornerLoc);
	gl.vertexAttribPointer(cornerLoc, 2, gl.FLOAT, false, 0, 0);

	// per-instance: the raw u16 cell, read as an exact float
	const cellBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
	const cellLoc = gl.getAttribLocation(program, 'a_cell');
	gl.enableVertexAttribArray(cellLoc);
	gl.vertexAttribPointer(cellLoc, 1, gl.UNSIGNED_SHORT, false, 0, 0);
	gl.vertexAttribDivisor(cellLoc, 1);

	// R8 glyph atlas: 16x16 grid of glyphs unpacked from the 1bpp font data
	const buildAtlas = () => {
		const { width, height, data } = fontData;
		const atlasW = width * 16;
		const atlasH = height * 16;
		const pixels = new Uint8Array(atlasW * atlasH);
		let k = 0; // bit cursor across the packed font data
		for (let glyph = 0; glyph < 256; glyph++) {
			const gx = (glyph % 16) * width;
			const gy = Math.floor(glyph / 16) * height;
			for (let i = 0; i < width * height; i++, k++) {
				const bit = (data[k >> 3] >> (7 - (k & 7))) & 1;
				if (bit) {
					const px = gx + (i % width);
					const py = gy + Math.floor(i / width);
					pixels[py * atlasW + px] = 255;
				}
			}
		}
		const texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.R8,
			atlasW,
			atlasH,
			0,
			gl.RED,
			gl.UNSIGNED_BYTE,
			pixels,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	};
	buildAtlas();

	const uploadPalette = () => {
		const flat = new Float32Array(64);
		for (let i = 0; i < 16; i++) {
			const rgba = State.palette.getRGBAColor(i);
			flat[i * 4] = rgba[0] / 255;
			flat[i * 4 + 1] = rgba[1] / 255;
			flat[i * 4 + 2] = rgba[2] / 255;
			flat[i * 4 + 3] = 1;
		}
		gl.uniform4fv(uniforms.u_palette, flat);
	};
	uploadPalette();

	gl.uniform1i(uniforms.u_atlas, 0);
	gl.uniform2f(uniforms.u_fontPx, fontData.width, fontData.height);
	gl.uniform1f(uniforms.u_pxScale, dpr);
	gl.uniform1f(uniforms.u_spacing, letterSpacing);
	gl.clearColor(0, 0, 0, 1);

	// --- slack-buffer geometry -----------------------------------------
	let anchorRow = 0; // first doc row drawn into the canvas
	let canvasRows = 0; // rows of coverage the canvas holds
	let coverageRows = 0; // rows actually drawn this anchor (doc may end)

	const viewportH = () => scroller.clientHeight;

	const layout = () => {
		content.style.width = `${doc.columns * advanceCss}px`;
		content.style.height = `${doc.rows * cellHCss}px`;
		canvasRows = Math.min(
			doc.rows,
			Math.ceil((viewportH() * (1 + params.slackScreens)) / cellHCss),
		);
		canvas.width = Math.round(doc.columns * advanceCss * dpr);
		canvas.height = Math.round(canvasRows * cellHCss * dpr);
		canvas.style.width = `${doc.columns * advanceCss}px`;
		canvas.style.height = `${canvasRows * cellHCss}px`;
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform2f(uniforms.u_canvasPx, canvas.width, canvas.height);
		gl.uniform2f(uniforms.u_cellPx, advanceCss * dpr, cellHCss * dpr);
		gl.uniform1f(uniforms.u_cols, doc.columns);
		gl.uniform1f(uniforms.u_ice, doc.iceColors ? 1 : 0);
	};

	const repaint = () => {
		coverageRows = Math.min(canvasRows, doc.rows - anchorRow);
		const t0 = performance.now();
		const first = anchorRow * doc.columns;
		const slice = doc.data.subarray(first, first + coverageRows * doc.columns);
		gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, slice, gl.DYNAMIC_DRAW);
		const t1 = performance.now();
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, coverageRows * doc.columns);
		const t2 = performance.now();
		counters.repackMs.push(t1 - t0);
		counters.drawMs.push(t2 - t1);
	};

	const anchorTo = row => {
		const t0 = performance.now();
		anchorRow = Math.max(0, Math.min(row, doc.rows - canvasRows));
		repaint();
		canvas.style.top = `${anchorRow * cellHCss}px`;
		counters.anchorMs.push(performance.now() - t0);
	};

	// the heart of the pattern: do nothing while the viewport stays inside
	// the drawn slack; re-center the canvas when it nears a drawn edge
	const onScroll = () => {
		const top = scroller.scrollTop;
		const bottom = top + viewportH();
		const drawnTop = anchorRow * cellHCss;
		const drawnBottom = (anchorRow + coverageRows) * cellHCss;
		const tolerance = params.toleranceScreens * viewportH();
		const nearTop = top - drawnTop < tolerance && anchorRow > 0;
		const nearBottom =
			drawnBottom - bottom < tolerance && anchorRow + coverageRows < doc.rows;
		if (nearTop || nearBottom) {
			counters.reAnchors++;
			anchorTo(Math.round((top + viewportH() / 2) / cellHCss - canvasRows / 2));
		}
	};
	scroller.addEventListener('scroll', onScroll, { passive: true });

	// blank-slack detector: a frame where the viewport shows undrawn rows
	let monitoring = true;
	const monitor = () => {
		if (!monitoring) {
			return;
		}
		const top = scroller.scrollTop;
		const bottom = top + viewportH();
		if (
			top < anchorRow * cellHCss - 0.5 ||
			bottom > (anchorRow + coverageRows) * cellHCss + 0.5
		) {
			counters.blankFrames++;
		}
		requestAnimationFrame(monitor);
	};
	requestAnimationFrame(monitor);

	const rebuild = () => {
		layout();
		anchorTo(Math.round(scroller.scrollTop / cellHCss - canvasRows / 2));
	};
	window.addEventListener('resize', rebuild);
	rebuild();

	// --- scripted measurement -------------------------------------------
	const scrollRun = async (pxPerFrame, maxMs) => {
		scroller.scrollTop = 0;
		await doubleRaf();
		resetCounters();
		const deltas = [];
		const start = performance.now();
		let last = start;
		await new Promise(resolve => {
			const step = now => {
				deltas.push(now - last);
				last = now;
				scroller.scrollTop += pxPerFrame;
				const atEnd =
					scroller.scrollTop + viewportH() >= scroller.scrollHeight - 2;
				if (atEnd || now - start > maxMs) {
					resolve();
				} else {
					requestAnimationFrame(step);
				}
			};
			requestAnimationFrame(step);
		});
		deltas.shift();
		const avgMs =
			deltas.reduce((a, b) => a + b, 0) / Math.max(deltas.length, 1);
		return {
			pxPerFrame,
			frames: deltas.length,
			avgFps: round(1000 / avgMs),
			p95FrameMs: round(percentile(deltas, 95)),
			jankFrames: deltas.filter(d => d > 33).length,
			reAnchors: counters.reAnchors,
			repackMs: stats(counters.repackMs),
			drawMs: stats(counters.drawMs),
			anchorMs: stats(counters.anchorMs),
			blankFrames: counters.blankFrames,
		};
	};

	const runScripted = async () => {
		const runs = {};
		setStatus('slow scroll…');
		runs.slow = await scrollRun(4, 5000);
		setStatus('fling…');
		runs.fling = await scrollRun(40, 5000);
		setStatus('extreme fling…');
		runs.extreme = await scrollRun(120, 5000);
		scroller.scrollTop = 0;
		const results = {
			capturedAt: new Date().toISOString(),
			pattern: 'slack-buffer webgl2 instanced',
			doc: { name: doc.name, columns: doc.columns, rows: doc.rows },
			font: {
				name: State.textArtCanvas.getCurrentFontName(),
				cellCss: `${advanceCss}x${cellHCss}`,
				letterSpacing: !!letterSpacing,
			},
			params: { ...params, canvasRows, canvasMB: round((canvas.width * canvas.height * 4) / 1048576) },
			machine: {
				userAgent: navigator.userAgent,
				devicePixelRatio: dpr,
				viewport: `${scroller.clientWidth}x${viewportH()}`,
				hardwareConcurrency: navigator.hardwareConcurrency || null,
			},
			runs,
		};
		window.__t0wnzSpikeResults = results;
		setStatus('done');
		showResults(results);
		return results;
	};

	// --- HUD -------------------------------------------------------------
	const hud = document.createElement('div');
	hud.style.cssText = [
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
	overlay.appendChild(hud);

	const title = document.createElement('div');
	title.textContent = 'scroll spike (slack-buffer GL)';
	title.style.cssText = 'font-weight:bold;margin-bottom:6px';
	hud.appendChild(title);

	const closeButton = document.createElement('button');
	closeButton.textContent = 'x';
	closeButton.style.cssText =
		'background:#000;color:#f00;border:1px solid #f00;cursor:pointer;float:right';
	closeButton.addEventListener('click', () => {
		monitoring = false;
		window.removeEventListener('resize', rebuild);
		overlay.remove();
	});
	hud.insertBefore(closeButton, title);

	const makeSelect = (labelText, options, value, onChange) => {
		const wrap = document.createElement('div');
		wrap.style.cssText = 'margin:2px 0';
		const label = document.createElement('span');
		label.textContent = `${labelText} `;
		wrap.appendChild(label);
		const select = document.createElement('select');
		select.style.cssText =
			'background:#000;color:#0f0;border:1px solid #0f0';
		options.forEach(option => {
			const el = document.createElement('option');
			el.value = String(option);
			el.textContent = String(option);
			if (option === value) {
				el.selected = true;
			}
			select.appendChild(el);
		});
		select.addEventListener('change', () => onChange(select.value));
		wrap.appendChild(select);
		hud.appendChild(wrap);
		return select;
	};

	makeSelect(
		'doc',
		['editor doc', ...Object.keys(PRESETS)],
		'editor doc',
		value => {
			doc = value === 'editor doc' ? snapshotEditorDoc() : buildSyntheticDoc(value);
			scroller.scrollTop = 0;
			rebuild();
		},
	);
	makeSelect('slack screens', [0.5, 1, 1.5, 2, 3], params.slackScreens, value => {
		params.slackScreens = parseFloat(value);
		rebuild();
	});
	makeSelect('tolerance screens', [0.25, 0.5, 0.75, 1], params.toleranceScreens, value => {
		params.toleranceScreens = parseFloat(value);
	});

	const runButton = document.createElement('button');
	runButton.textContent = 'run scripted flings';
	runButton.style.cssText =
		'background:#000;color:#0f0;border:1px solid #0f0;cursor:pointer;margin-top:4px';
	hud.appendChild(runButton);

	const status = document.createElement('div');
	status.style.cssText = 'margin-top:6px;color:#fff';
	hud.appendChild(status);
	const setStatus = text => {
		status.textContent = text;
	};

	const live = document.createElement('div');
	live.style.cssText = 'margin-top:6px;color:#9cf;white-space:pre';
	hud.appendChild(live);

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
	hud.appendChild(output);

	// The app globally disables text selection and touch callout (style.css
	// base layer, !important); the results must opt back in or no copy path
	// exists on a device
	for (const prop of ['user-select', '-webkit-user-select']) {
		output.style.setProperty(prop, 'text', 'important');
	}
	output.style.setProperty('-webkit-touch-callout', 'default', 'important');

	const selectAll = () => {
		// iOS refuses select() on readonly textareas; lift it for the call
		output.readOnly = false;
		output.focus();
		output.select();
		output.setSelectionRange(0, output.value.length);
		output.readOnly = true;
	};

	const copyButton = document.createElement('button');
	copyButton.textContent = 'copy json';
	copyButton.style.cssText =
		'background:#000;color:#0f0;border:1px solid #0f0;cursor:pointer;margin-top:4px;display:none';
	copyButton.addEventListener('click', async () => {
		let copied = false;
		// The clipboard API exists only in secure contexts (https/localhost);
		// LAN http:// device runs land in the execCommand fallback
		if (navigator.clipboard) {
			try {
				await navigator.clipboard.writeText(output.value);
				copied = true;
			} catch {
				copied = false;
			}
		}
		if (!copied) {
			selectAll();
			try {
				copied = document.execCommand('copy');
			} catch {
				copied = false;
			}
		}
		copyButton.textContent = copied ? 'copied!' : 'copy blocked: selected instead';
		setTimeout(() => {
			copyButton.textContent = 'copy json';
		}, 2500);
	});
	hud.appendChild(copyButton);

	const downloadButton = document.createElement('button');
	downloadButton.textContent = 'download json';
	downloadButton.style.cssText =
		'background:#000;color:#0f0;border:1px solid #0f0;cursor:pointer;margin-top:4px;margin-left:6px;display:none';
	downloadButton.addEventListener('click', () => {
		const blob = new Blob([output.value], { type: 'application/json' });
		const link = document.createElement('a');
		link.href = URL.createObjectURL(blob);
		link.download = `t0wnz-spike-${Date.now()}.json`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(link.href), 10000);
	});
	hud.appendChild(downloadButton);

	const showResults = results => {
		output.value = JSON.stringify(results, null, '\t');
		output.style.display = 'block';
		copyButton.style.display = 'inline-block';
		downloadButton.style.display = 'inline-block';
	};

	// live stats for hand-scrolling on devices: rolling fps + counters
	const frameTimes = [];
	let lastScrollTop = -1;
	const liveLoop = now => {
		if (!monitoring) {
			return;
		}
		if (scroller.scrollTop !== lastScrollTop) {
			lastScrollTop = scroller.scrollTop;
			frameTimes.push(now);
			while (frameTimes.length && now - frameTimes[0] > 1000) {
				frameTimes.shift();
			}
		}
		const lastAnchor = counters.anchorMs[counters.anchorMs.length - 1];
		live.textContent =
			`scroll fps   ${frameTimes.length}\n` +
			`re-anchors   ${counters.reAnchors}\n` +
			`last anchor  ${lastAnchor === undefined ? '-' : round(lastAnchor, 2)}ms\n` +
			`blank frames ${counters.blankFrames}\n` +
			`coverage     ${canvasRows} rows`;
		requestAnimationFrame(liveLoop);
	};
	requestAnimationFrame(liveLoop);

	let running = false;
	runButton.addEventListener('click', async () => {
		if (running) {
			return;
		}
		running = true;
		runButton.disabled = true;
		try {
			await runScripted();
		} catch (error) {
			setStatus(`error: ${error.message}`);
			console.error('[ScrollSpike]', error);
		}
		runButton.disabled = false;
		running = false;
	});

	// Scripted access for Playwright (tests/perf/captureScrollSpike.js)
	window.__t0wnzScrollSpike = {
		runScripted,
		setDoc: presetName => {
			doc = buildSyntheticDoc(presetName);
			scroller.scrollTop = 0;
			rebuild();
		},
		setParams: next => {
			Object.assign(params, next);
			rebuild();
		},
	};
	console.log('[ScrollSpike] installed; window.__t0wnzScrollSpike ready');
};

export { installScrollSpike };
export default { installScrollSpike };
