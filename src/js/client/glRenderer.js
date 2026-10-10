/**
 * WebGL2 text renderer (PLAN.md §3.1, §4 P1), the editor's second renderer
 * implementation behind ?renderer=gl (chunk renderer stays the default until
 * the owner flips it, O11).
 *
 * Architecture: the slack-buffer pattern validated by the P1 scroll spike.
 * One canvas positioned absolutely inside #canvasContainer, sized to the
 * viewport plus slack screens of overdraw; the native scroller moves it in
 * compositor-sync, and scrolling only re-anchors + repaints when the
 * viewport nears a drawn edge. Every paint is one instanced draw over the
 * coverage window, so full repaints, zoom, font, palette, and ice changes
 * all cost well under a frame (vs seconds on the chunk renderer).
 *
 * Renders the existing u16 doc model (charCode<<8 | bg<<4 | fg) with the
 * live font and palette. Blink runs as a uniform flip + repaint on the same
 * 500ms cadence as the 2D path. Exports rasterize on the CPU from doc data
 * and the 1bpp font (byte-equal to the 2D glyph blits at integer zoom).
 *
 * Context loss (mandatory per plan): loss is intercepted, GL state is
 * rebuilt on restore; repeated loss leaves the last frame visible and logs.
 */
import State from './state.js';
import { createCanvas } from './ui.js';

// Winning spike parameters (tests/baselines/p1-scroll-spike.json): zero
// blank frames at every tested velocity; tolerance well under half the
// slack so re-anchoring never degenerates to every-frame thrash
const SLACK_SCREENS = 1.5;
const TOLERANCE_SCREENS = 0.5;

const VERTEX_SRC = `#version 300 es
in vec2 a_corner;
in float a_cell;
uniform vec2 u_cellPx;
uniform vec2 u_canvasPx;
uniform float u_cols;
uniform float u_ice;
uniform float u_blink;
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
	float blinkCell = 0.0;
	// without ice, bright backgrounds mean blink: bg drops to the dim half
	// and the glyph hides during the off phase (matches the 2D chunk path)
	if (u_ice < 0.5 && bg > 7.0) {
		bg -= 8.0;
		blinkCell = 1.0;
	}
	v_char = ch;
	v_fg = (u_blink > 0.5 && blinkCell > 0.5) ? u_palette[int(bg)] : u_palette[int(fg)];
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

/**
 * @param {HTMLElement} canvasContainer - the sized, scrolled content element
 * @param {Object} host - doc accessors from the text art canvas closure:
 *   { getColumns, getRows, getImageData, getIceColors }
 * @returns {Object|null} renderer, or null when WebGL2 is unavailable
 */
const createGLRenderer = (canvasContainer, host) => {
	const canvas = document.createElement('canvas');
	canvas.id = 'glRenderCanvas';
	canvas.style.cssText = 'position:absolute;left:0;top:0;display:block';
	const gl = canvas.getContext('webgl2', {
		alpha: false,
		antialias: false,
		depth: false,
		stencil: false,
	});
	// Guard against partial contexts too (test shims, broken drivers): the
	// caller falls back to the chunk renderer on null
	if (!gl || typeof gl.drawArraysInstanced !== 'function') {
		return null;
	}

	// font metrics, refreshed on every rebuild
	let fontW = 8;
	let fontH = 16;
	let cellW = 8;
	let cellH = 16;
	let spacing = 0;
	let scale = 1;
	let fontBits = null;

	// slack-buffer geometry
	let anchorRow = 0;
	let canvasRows = 0;
	let coverageRows = 0;

	// blink state
	let blinkOn = false;
	let blinkInterval = null;
	let hasBlink = false;

	let uniforms = {};
	let cellBuffer = null;
	let contextLost = false;

	const compile = (type, src) => {
		const shader = gl.createShader(type);
		gl.shaderSource(shader, src);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(`[GLRenderer] shader: ${gl.getShaderInfoLog(shader)}`);
		}
		return shader;
	};

	// create all GL objects; called at construction and after context restore
	const initGL = () => {
		const program = gl.createProgram();
		gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SRC));
		gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(`[GLRenderer] program: ${gl.getProgramInfoLog(program)}`);
		}
		gl.useProgram(program);

		uniforms = {};
		[
			'u_cellPx',
			'u_canvasPx',
			'u_cols',
			'u_ice',
			'u_blink',
			'u_palette',
			'u_atlas',
			'u_fontPx',
			'u_pxScale',
			'u_spacing',
		].forEach(name => {
			uniforms[name] = gl.getUniformLocation(program, name);
		});

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
		cellBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
		const cellLoc = gl.getAttribLocation(program, 'a_cell');
		gl.enableVertexAttribArray(cellLoc);
		gl.vertexAttribPointer(cellLoc, 1, gl.UNSIGNED_SHORT, false, 0, 0);
		gl.vertexAttribDivisor(cellLoc, 1);

		gl.uniform1i(uniforms.u_atlas, 0);
		gl.clearColor(0, 0, 0, 1);
	};
	initGL();

	// unpack the 1bpp font into cached per-glyph bit rows (shared by the
	// atlas upload and the CPU export rasterizer)
	const unpackFontBits = fontData => {
		const bits = new Uint8Array(fontData.width * fontData.height * 256);
		for (let k = 0; k < bits.length; k++) {
			bits[k] = (fontData.data[k >> 3] >> (7 - (k & 7))) & 1;
		}
		return bits;
	};

	const buildAtlas = () => {
		const atlasW = fontW * 16;
		const atlasH = fontH * 16;
		const pixels = new Uint8Array(atlasW * atlasH);
		for (let glyph = 0; glyph < 256; glyph++) {
			const gx = (glyph % 16) * fontW;
			const gy = Math.floor(glyph / 16) * fontH;
			const base = glyph * fontW * fontH;
			for (let i = 0; i < fontW * fontH; i++) {
				if (fontBits[base + i]) {
					pixels[(gy + Math.floor(i / fontW)) * atlasW + (gx + (i % fontW))] = 255;
				}
			}
		}
		const texture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE0);
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

	const uploadPalette = () => {
		if (!State.palette) {
			return;
		}
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

	const refreshMetrics = () => {
		const fontData = State.font.getData();
		fontW = fontData.width;
		fontH = fontData.height;
		fontBits = unpackFontBits(fontData);
		spacing = State.font.getLetterSpacing() ? 1 : 0;
		scale = State.font.getScaleFactor();
		cellW = State.font.getWidth();
		cellH = State.font.getHeight();
	};

	const viewportEl = () => document.getElementById('viewport');
	const viewportH = () => {
		const viewport = viewportEl();
		return viewport ? viewport.clientHeight : window.innerHeight;
	};
	const scrollTop = () => {
		const viewport = viewportEl();
		return viewport ? viewport.scrollTop : 0;
	};

	const layout = () => {
		const columns = host.getColumns();
		const rows = host.getRows();
		canvasContainer.style.width = `${columns * cellW}px`;
		canvasContainer.style.height = `${rows * cellH}px`;
		canvasContainer.style.position = 'relative';
		canvasRows = Math.min(
			rows,
			Math.ceil((viewportH() * (1 + SLACK_SCREENS)) / cellH),
		);
		canvas.width = columns * cellW;
		canvas.height = canvasRows * cellH;
		canvas.style.width = `${canvas.width}px`;
		canvas.style.height = `${canvas.height}px`;
		gl.viewport(0, 0, canvas.width, canvas.height);
		gl.uniform2f(uniforms.u_canvasPx, canvas.width, canvas.height);
		gl.uniform2f(uniforms.u_cellPx, cellW, cellH);
		gl.uniform1f(uniforms.u_cols, columns);
		gl.uniform2f(uniforms.u_fontPx, fontW, fontH);
		gl.uniform1f(uniforms.u_pxScale, scale);
		gl.uniform1f(uniforms.u_spacing, spacing);
	};

	const repaint = () => {
		if (contextLost) {
			return;
		}
		const columns = host.getColumns();
		const rows = host.getRows();
		const iceColors = host.getIceColors();
		const imageData = host.getImageData();
		coverageRows = Math.min(canvasRows, rows - anchorRow);
		const first = anchorRow * columns;
		const count = coverageRows * columns;
		const slice = imageData.subarray(first, first + count);
		// blink cells in coverage decide whether the blink tick repaints
		hasBlink = false;
		if (!iceColors) {
			for (let i = 0; i < count; i++) {
				if ((slice[i] & 0x80) !== 0) {
					hasBlink = true;
					break;
				}
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, slice, gl.DYNAMIC_DRAW);
		gl.uniform1f(uniforms.u_ice, iceColors ? 1 : 0);
		gl.uniform1f(uniforms.u_blink, blinkOn ? 1 : 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
	};

	const anchorTo = row => {
		const rows = host.getRows();
		anchorRow = Math.max(0, Math.min(row, rows - canvasRows));
		repaint();
		canvas.style.top = `${anchorRow * cellH}px`;
	};

	const centerOnViewport = () => {
		anchorTo(Math.round((scrollTop() + viewportH() / 2) / cellH - canvasRows / 2));
	};

	// slack-buffer scroll: act only when the viewport nears a drawn edge
	const onScroll = () => {
		const top = scrollTop();
		const bottom = top + viewportH();
		const drawnTop = anchorRow * cellH;
		const drawnBottom = (anchorRow + coverageRows) * cellH;
		const tolerance = TOLERANCE_SCREENS * viewportH();
		const rows = host.getRows();
		const nearTop = top - drawnTop < tolerance && anchorRow > 0;
		const nearBottom =
			drawnBottom - bottom < tolerance && anchorRow + coverageRows < rows;
		if (nearTop || nearBottom) {
			centerOnViewport();
		}
	};

	let resizeScheduled = false;
	const onResize = () => {
		if (resizeScheduled) {
			return;
		}
		resizeScheduled = true;
		requestAnimationFrame(() => {
			resizeScheduled = false;
			layout();
			centerOnViewport();
		});
	};

	// geometry, font, palette, or doc identity changed: full re-setup
	const rebuild = () => {
		if (contextLost) {
			return;
		}
		refreshMetrics();
		buildAtlas();
		uploadPalette();
		layout();
		centerOnViewport();
	};

	// the renderer's redrawEntireImage: coverage repaint is sub-frame, so
	// "progressive" collapses to one paint + the same completion contract
	const redraw = (onProgress, onComplete) => {
		repaint();
		if (onProgress) {
			onProgress(100);
		}
		if (onComplete) {
			requestAnimationFrame(onComplete);
		}
		document.dispatchEvent(new CustomEvent('onCanvasRenderComplete'));
	};

	// cell-level invalidations: anything inside coverage repaints it whole
	// (one instanced draw, ~0.05ms measured in the spike)
	const drawRegion = (x, y, w, h) => {
		if (y + h <= anchorRow || y >= anchorRow + coverageRows) {
			return;
		}
		repaint();
	};

	const drawCell = (x, y) => {
		drawRegion(x, y, 1, 1);
	};

	const updateBlink = () => {
		if (blinkInterval) {
			clearInterval(blinkInterval);
			blinkInterval = null;
		}
		blinkOn = false;
		if (!host.getIceColors()) {
			blinkInterval = setInterval(() => {
				blinkOn = !blinkOn;
				if (hasBlink) {
					repaint();
				}
			}, 500);
		}
	};

	/**
	 * CPU rasterizer for exports: identical semantics to the 2D glyph blits
	 * (nearest-neighbor at any scale, ninth-column rule, blink drawn in its
	 * visible phase), reading only doc data + 1bpp font + palette.
	 */
	const getImageRGBA = () => {
		const columns = host.getColumns();
		const rows = host.getRows();
		const iceColors = host.getIceColors();
		const imageData = host.getImageData();
		const width = cellW * columns;
		const height = cellH * rows;
		const data = new Uint8ClampedArray(width * height * 4);
		const colors = [];
		for (let i = 0; i < 16; i++) {
			colors.push(State.palette.getRGBAColor(i));
		}
		for (let index = 0; index < columns * rows; index++) {
			const cell = imageData[index];
			const charCode = cell >> 8;
			let background = (cell >> 4) & 15;
			const foreground = cell & 15;
			if (!iceColors && background >= 8) {
				background -= 8;
			}
			const fg = colors[foreground];
			const bg = colors[background];
			const ninthDuplicates = spacing && charCode >= 0xc0 && charCode <= 0xdf;
			const glyphBase = charCode * fontW * fontH;
			const originX = (index % columns) * cellW;
			const originY = Math.floor(index / columns) * cellH;
			for (let py = 0; py < cellH; py++) {
				const fy = Math.min(Math.floor(py / scale), fontH - 1);
				let offset = ((originY + py) * width + originX) * 4;
				for (let px = 0; px < cellW; px++, offset += 4) {
					const fx = Math.floor(px / scale);
					let color = bg;
					if (fx >= fontW) {
						// ninth column
						if (ninthDuplicates && fontBits[glyphBase + fy * fontW + fontW - 1]) {
							color = fg;
						}
					} else if (fontBits[glyphBase + fy * fontW + fx]) {
						color = fg;
					}
					data[offset] = color[0];
					data[offset + 1] = color[1];
					data[offset + 2] = color[2];
					data[offset + 3] = 255;
				}
			}
		}
		return { width: width, height: height, data: data };
	};

	const getImage = () => {
		const rgba = getImageRGBA();
		const completeCanvas = createCanvas(rgba.width, rgba.height);
		const ctx = completeCanvas.getContext('2d');
		const imageData = ctx.createImageData(rgba.width, rgba.height);
		imageData.data.set(rgba.data);
		ctx.putImageData(imageData, 0, 0);
		return completeCanvas;
	};

	// context loss: mandatory interception + restore (PLAN.md §3.1)
	canvas.addEventListener('webglcontextlost', event => {
		event.preventDefault();
		contextLost = true;
		console.warn('[GLRenderer] context lost; awaiting restore');
	});
	canvas.addEventListener('webglcontextrestored', () => {
		contextLost = false;
		console.warn('[GLRenderer] context restored; rebuilding');
		initGL();
		rebuild();
	});

	canvasContainer.appendChild(canvas);
	const viewport = viewportEl();
	if (viewport) {
		viewport.addEventListener('scroll', onScroll, { passive: true });
	}
	window.addEventListener('resize', onResize, { passive: true });

	return {
		rebuild,
		redraw,
		drawRegion,
		drawCell,
		updateBlink,
		getImage,
		getImageRGBA,
		canvas,
	};
};

export { createGLRenderer };
export default { createGLRenderer };
