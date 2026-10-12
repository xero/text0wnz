/**
 * WebGL2 text renderer (PLAN.md §3.1), the editor's DEFAULT renderer.
 * ?renderer=2d forces the legacy chunk renderer, which is also the
 * automatic fallback wherever webgl2 is unavailable.
 *
 * Architecture: the slack-buffer pattern. One canvas positioned
 * absolutely inside #canvasContainer, sized to the viewport plus slack
 * screens of overdraw; the native scroller moves it in compositor-sync,
 * and scrolling only re-anchors + repaints when the viewport nears a
 * drawn edge. Every paint is one instanced draw over the coverage
 * window, so full repaints, zoom, font, palette, and ice changes all
 * cost well under a frame.
 *
 * Renders the v3 doc planes (PLAN §3.2): per-instance data is the raw
 * glyph/fg/bg words, and color resolve follows the tag bit in-shader -
 * bit 31 set means a live palette index, clear means frozen 0x00RRGGBB.
 * Blink is attr bit 0 of the glyph word (the editor folds the classic
 * bright-bg convention into it), flipped by a uniform + repaint on the
 * same 500ms cadence as the 2D path. Exports rasterize on the CPU from
 * the same planes (byte-equal to the 2D glyph blits at integer zoom).
 *
 * Glyph ids are 16-bit (PLAN §3.2): 0-255 address the classic atlas,
 * higher ids are doc glyph-table entries rendered from the hex font
 * pages. The repaint interleave remaps those ids to slots in a
 * second, grow-on-demand atlas texture; a glyph whose block has not
 * arrived yet (hexFontPages fetches lazily and repaints on landing),
 * is absent, or is wide under the v1 single-width policy renders the
 * reserved substitute slot (a hollow box, deliberately distinct from
 * any real glyph).
 *
 * Context loss is intercepted and GL state rebuilt on restore;
 * repeated loss leaves the last frame visible and logs.
 */
import State from './state.js';
import { createCanvas } from './ui.js';
import { xterm256RGB } from '../core/codecs/dur.js';

// Baselined in tests/baselines/p1-scroll-spike.json: zero blank frames
// at every tested velocity; tolerance well under half the slack so
// re-anchoring never degenerates to every-frame thrash
const SLACK_SCREENS = 1.5;
const TOLERANCE_SCREENS = 0.5;

const VERTEX_SRC = `#version 300 es
in vec2 a_corner;
// per-instance plane words: x = glyph (id:16|attrs:8), y = fg, z = bg
in uvec3 a_cell;
uniform vec2 u_cellPx;
uniform vec2 u_canvasPx;
uniform float u_cols;
uniform float u_blink;
// 256x1 texture: 0-15 the live UI palette, 16-255 the doc/xterm table
uniform sampler2D u_palette;
flat out float v_char;
flat out vec4 v_fg;
flat out vec4 v_bg;
out vec2 v_pix;
// tag-bit resolve (PLAN §3.2): bit 31 = palette index, else 0x00RRGGBB
vec4 cellColor(uint word) {
	if ((word & 0x80000000u) != 0u) {
		return texelFetch(u_palette, ivec2(int(word & 0xffu), 0), 0);
	}
	return vec4(
		float((word >> 16) & 0xffu) / 255.0,
		float((word >> 8) & 0xffu) / 255.0,
		float(word & 0xffu) / 255.0,
		1.0);
}
void main() {
	float id = float(gl_InstanceID);
	float col = mod(id, u_cols);
	float row = floor(id / u_cols);
	vec2 px = (vec2(col, row) + a_corner) * u_cellPx;
	vec2 ndc = px / u_canvasPx * 2.0 - 1.0;
	gl_Position = vec4(ndc.x, -ndc.y, 0.0, 1.0);
	v_pix = a_corner * u_cellPx;
	// 0-255 = classic atlas; 256+n = unicode page slot n (CPU-remapped)
	v_char = float(a_cell.x & 0xffffu);
	vec4 fg = cellColor(a_cell.y);
	vec4 bg = cellColor(a_cell.z);
	// attr bit 0 = blink: the glyph hides during the off phase
	bool blinkCell = (a_cell.x & 0x10000u) != 0u;
	v_fg = (u_blink > 0.5 && blinkCell) ? bg : fg;
	v_bg = bg;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_atlas;
uniform sampler2D u_upages;
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
		// (a classic-font rule: unicode slots always render background)
		if (v_char >= 192.0 && v_char <= 223.0) {
			fx = u_fontPx.x - 1.0;
		} else {
			fragColor = v_bg;
			return;
		}
	}
	float glyph = v_char;
	if (glyph >= 256.0) {
		float slot = glyph - 256.0;
		float ux = mod(slot, 16.0) * u_fontPx.x + min(fx, u_fontPx.x - 1.0);
		float uy = floor(slot / 16.0) * u_fontPx.y + min(fy, u_fontPx.y - 1.0);
		float ubit = texelFetch(u_upages, ivec2(int(ux), int(uy)), 0).r;
		fragColor = ubit > 0.5 ? v_fg : v_bg;
		return;
	}
	float gx = mod(glyph, 16.0) * u_fontPx.x + min(fx, u_fontPx.x - 1.0);
	float gy = floor(glyph / 16.0) * u_fontPx.y + min(fy, u_fontPx.y - 1.0);
	float bit = texelFetch(u_atlas, ivec2(int(gx), int(gy)), 0).r;
	fragColor = bit > 0.5 ? v_fg : v_bg;
}`;

// CRT post pass (PLAN §3.1): scene renders into an FBO, then one
// fullscreen quad applies scanlines (one per glyph pixel row), a soft
// aperture-grille mask, cheap horizontal phosphor bleed, and a
// vignette. GL-only, like the minimap and onion skin.
const CRT_VERTEX_SRC = `#version 300 es
const vec2 corners[4] = vec2[4](
	vec2(-1.0, -1.0), vec2(1.0, -1.0), vec2(-1.0, 1.0), vec2(1.0, 1.0));
out vec2 v_uv;
void main() {
	vec2 corner = corners[gl_VertexID];
	v_uv = corner * 0.5 + 0.5;
	gl_Position = vec4(corner, 0.0, 1.0);
}`;

const CRT_FRAGMENT_SRC = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform vec2 u_resolution;
uniform float u_pxScale;
in vec2 v_uv;
out vec4 fragColor;
void main() {
	vec3 color = texture(u_scene, v_uv).rgb;
	float pitch = max(u_pxScale, 1.0);
	float phase = fract(gl_FragCoord.y / pitch);
	float scan = 0.82 + 0.18 * cos(6.28318 * phase);
	float m = mod(gl_FragCoord.x, 3.0);
	vec3 mask = m < 1.0 ? vec3(1.0, 0.92, 0.92)
		: m < 2.0 ? vec3(0.92, 1.0, 0.92)
		: vec3(0.92, 0.92, 1.0);
	vec2 texel = 1.0 / u_resolution;
	vec3 glow =
		texture(u_scene, v_uv + vec2(texel.x, 0.0)).rgb +
		texture(u_scene, v_uv - vec2(texel.x, 0.0)).rgb;
	color = color * 0.85 + glow * 0.12;
	vec2 d = v_uv - 0.5;
	float vig = 1.0 - dot(d, d) * 0.45;
	fragColor = vec4(color * scan * mask * vig * 1.12, 1.0);
}`;

/**
 * @param {HTMLElement} canvasContainer - the sized, scrolled content element
 * @param {Object} host - doc accessors from the text art canvas closure:
 *   { getColumns, getRows, getPlanes, getIceColors, getGlyphDef,
 *     getHexPages } - the last two feed the unicode glyph pages and are
 *   optional (absent means ids >= 256 render the substitute box)
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

	// CRT post pass state (scene FBO + composite program)
	let sceneProgram = null;
	let sceneVao = null;
	let crtEnabled = false;
	let crtProgram = null;
	let crtVao = null;
	let crtUniforms = {};
	let crtFbo = null;
	let crtTexture = null;
	let crtW = 0;
	let crtH = 0;

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
		sceneProgram = program;

		uniforms = {};
		[
			'u_cellPx',
			'u_canvasPx',
			'u_cols',
			'u_blink',
			'u_palette',
			'u_atlas',
			'u_upages',
			'u_fontPx',
			'u_pxScale',
			'u_spacing',
		].forEach(name => {
			uniforms[name] = gl.getUniformLocation(program, name);
		});

		const vao = gl.createVertexArray();
		gl.bindVertexArray(vao);
		sceneVao = vao;

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

		// per-instance: the three raw plane words, interleaved (12B/cell,
		// the §3.1 coverage repack - ~100-300KB per repaint window)
		cellBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
		const cellLoc = gl.getAttribLocation(program, 'a_cell');
		gl.enableVertexAttribArray(cellLoc);
		gl.vertexAttribIPointer(cellLoc, 3, gl.UNSIGNED_INT, 0, 0);
		gl.vertexAttribDivisor(cellLoc, 1);

		gl.uniform1i(uniforms.u_atlas, 0);
		gl.uniform1i(uniforms.u_upages, 1);
		gl.uniform1i(uniforms.u_palette, 2);
		gl.clearColor(0, 0, 0, 1);

		// CRT composite program (fullscreen quad from gl_VertexID; the
		// empty VAO satisfies WebGL2's bound-VAO requirement)
		crtProgram = gl.createProgram();
		gl.attachShader(crtProgram, compile(gl.VERTEX_SHADER, CRT_VERTEX_SRC));
		gl.attachShader(crtProgram, compile(gl.FRAGMENT_SHADER, CRT_FRAGMENT_SRC));
		gl.linkProgram(crtProgram);
		if (!gl.getProgramParameter(crtProgram, gl.LINK_STATUS)) {
			throw new Error(
				`[GLRenderer] crt program: ${gl.getProgramInfoLog(crtProgram)}`,
			);
		}
		crtVao = gl.createVertexArray();
		crtUniforms = {};
		for (const name of ['u_scene', 'u_resolution', 'u_pxScale']) {
			crtUniforms[name] = gl.getUniformLocation(crtProgram, name);
		}
		crtFbo = null;
		crtTexture = null;
		crtW = 0;
		crtH = 0;
	};
	initGL();

	/** (re)size the CRT scene target to the current canvas */
	const ensureCrtTarget = () => {
		if (!crtEnabled || (crtW === canvas.width && crtH === canvas.height)) {
			return;
		}
		if (crtTexture) {
			gl.deleteTexture(crtTexture);
		}
		if (crtFbo) {
			gl.deleteFramebuffer(crtFbo);
		}
		crtTexture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE3);
		gl.bindTexture(gl.TEXTURE_2D, crtTexture);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA8,
			canvas.width,
			canvas.height,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		crtFbo = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, crtFbo);
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			crtTexture,
			0,
		);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		crtW = canvas.width;
		crtH = canvas.height;
	};

	// unpack the 1bpp font into cached per-glyph bit rows (shared by the
	// atlas upload and the CPU export rasterizer). Deliberately capped at
	// 256 glyphs: ids above 255 are doc glyph-table entries served by the
	// unicode pages, never the classic font, so the upper page of a
	// 512-glyph XB font is unaddressable here (it still survives save
	// round-trips at the codec level).
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

	// ------------------------------------------------ unicode glyph pages
	// Slot grid matches the classic atlas (16 glyphs per row at font
	// resolution); slot 0 is the substitute box, rows double on demand up
	// to SLOT_CAP, then the map resets and repaints refill what's visible.
	const SLOT_CAP = 4096;
	let unicodeTexture = null;
	let unicodeSlotRows = 16;
	/** glyphId -> slot (0 = substitute, cached only for definite misses) */
	let slotByGlyphId = new Map();
	/** CPU copies at font resolution, re-uploaded on grow/restore */
	let slotBits = [];

	const substituteBits = () => {
		const bits = new Uint8Array(fontW * fontH);
		for (let y = 1; y < fontH - 1; y++) {
			for (let x = 1; x < fontW - 1; x++) {
				if (y === 1 || y === fontH - 2 || x === 1 || x === fontW - 2) {
					bits[y * fontW + x] = 1;
				}
			}
		}
		return bits;
	};

	const uploadSlot = (slot, bits) => {
		const pixels = new Uint8Array(fontW * fontH);
		for (let i = 0; i < pixels.length; i++) {
			pixels[i] = bits[i] ? 255 : 0;
		}
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, unicodeTexture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			(slot % 16) * fontW,
			Math.floor(slot / 16) * fontH,
			fontW,
			fontH,
			gl.RED,
			gl.UNSIGNED_BYTE,
			pixels,
		);
	};

	// (re)allocate the page texture and re-upload every cached slot
	const buildUnicodePages = () => {
		if (unicodeTexture) {
			gl.deleteTexture(unicodeTexture);
		}
		unicodeTexture = gl.createTexture();
		gl.activeTexture(gl.TEXTURE1);
		gl.bindTexture(gl.TEXTURE_2D, unicodeTexture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.R8,
			fontW * 16,
			fontH * unicodeSlotRows,
			0,
			gl.RED,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		if (slotBits.length === 0) {
			slotBits.push(substituteBits());
		}
		slotBits.forEach((bits, slot) => uploadSlot(slot, bits));
	};

	// metric change invalidates every scaled bitmap; the texture itself
	// is created lazily on the first unicode glyph, so classic docs
	// never allocate any of this
	const resetUnicodePages = () => {
		slotByGlyphId = new Map();
		slotBits = [];
		unicodeSlotRows = 16;
		if (unicodeTexture) {
			gl.deleteTexture(unicodeTexture);
			unicodeTexture = null;
		}
	};

	// set when a repaint pass hits SLOT_CAP; cells already written into
	// the in-flight attribute slice reference their old slots, so the
	// reset must happen BETWEEN passes, never mid-pass (and at most once
	// per anchor/layout so a pathological doc cannot churn forever)
	let slotOverflow = false;
	let slotOverflowHandled = false;

	const assignSlot = bits => {
		if (slotBits.length >= SLOT_CAP) {
			slotOverflow = true;
			return 0; // substitute for the rest of this pass
		}
		const slot = slotBits.length;
		slotBits.push(bits);
		if (slot >= unicodeSlotRows * 16) {
			unicodeSlotRows = Math.min(unicodeSlotRows * 2, SLOT_CAP / 16);
			buildUnicodePages();
		} else {
			uploadSlot(slot, bits);
		}
		return slot;
	};

	/**
	 * Map a 16-bit glyph id to its unicode page slot, rasterizing on
	 * first sight. Pending block fetches return the substitute WITHOUT
	 * caching, so the repaint fired by onBlocksLoaded resolves them.
	 */
	const slotForGlyphId = glyphId => {
		if (!unicodeTexture) {
			buildUnicodePages();
		}
		const known = slotByGlyphId.get(glyphId);
		if (known !== undefined) {
			return known;
		}
		const def = host.getGlyphDef ? host.getGlyphDef(glyphId) : undefined;
		const pages = def && host.getHexPages ? host.getHexPages() : null;
		const bits = pages
			? pages.glyphBits(def.fontSlot, def.codepoint, fontW, fontH)
			: null;
		if (bits === undefined) {
			return 0;
		}
		if (!bits) {
			slotByGlyphId.set(glyphId, 0); // definitive miss: substitute
			return 0;
		}
		const slot = assignSlot(bits);
		if (slot > 0) {
			slotByGlyphId.set(glyphId, slot);
		}
		return slot;
	};

	// repaint-path remap: ids 0-255 pass through, higher ids become
	// 256 + slot with the attr byte preserved
	const mapGlyphWord = word => {
		const glyphId = word & 0xffff;
		if (glyphId < 256) {
			return word;
		}
		return ((word & 0xffff0000) | (256 + slotForGlyphId(glyphId))) >>> 0;
	};

	let paletteTexture = null;
	const uploadPalette = () => {
		if (!State.palette) {
			return;
		}
		// 256-entry palette as a 256x1 texture (a uniform array this size
		// can bust minimum GLES3 uniform budgets on weak devices): 0-15
		// live from the UI palette, 16+ from the doc palette when it has
		// them (xterm-256 docs), else the canonical xterm table
		const pixels = new Uint8Array(256 * 4);
		for (let i = 0; i < 16; i++) {
			const rgba = State.palette.getRGBAColor(i);
			pixels.set([rgba[0], rgba[1], rgba[2], 255], i * 4);
		}
		const docPalette = host.getPalette ? host.getPalette() : null;
		for (let i = 16; i < 256; i++) {
			const word =
				docPalette && i < docPalette.length
					? docPalette[i]
					: xterm256RGB(i);
			pixels.set(
				[(word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff, 255],
				i * 4,
			);
		}
		if (!paletteTexture) {
			paletteTexture = gl.createTexture();
		}
		gl.activeTexture(gl.TEXTURE2);
		gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
		gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			256,
			1,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			pixels,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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
		const { glyph, fg, bg } = host.getPlanes();
		coverageRows = Math.min(canvasRows, rows - anchorRow);
		const first = anchorRow * columns;
		const count = coverageRows * columns;
		// interleave the coverage window from the planes; blink attrs in
		// coverage decide whether the blink tick repaints
		const slice = new Uint32Array(count * 3);
		hasBlink = false;
		for (let i = 0, j = 0; i < count; i++, j += 3) {
			const glyphWord = glyph[first + i];
			slice[j] =
				(glyphWord & 0xffff) < 256 ? glyphWord : mapGlyphWord(glyphWord);
			slice[j + 1] = fg[first + i];
			slice[j + 2] = bg[first + i];
			if ((glyphWord & 0x10000) !== 0) {
				hasBlink = true;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, cellBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, slice, gl.DYNAMIC_DRAW);
		gl.uniform1f(uniforms.u_blink, blinkOn ? 1 : 0);
		if (crtEnabled) {
			ensureCrtTarget();
		}
		const useCrt = crtEnabled && crtFbo !== null;
		if (useCrt) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, crtFbo);
		}
		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
		if (useCrt) {
			// composite the scene through the CRT quad, then restore the
			// scene program + VAO (everything else binds per-repaint)
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.useProgram(crtProgram);
			gl.bindVertexArray(crtVao);
			gl.activeTexture(gl.TEXTURE3);
			gl.bindTexture(gl.TEXTURE_2D, crtTexture);
			gl.uniform1i(crtUniforms.u_scene, 3);
			gl.uniform2f(crtUniforms.u_resolution, canvas.width, canvas.height);
			gl.uniform1f(crtUniforms.u_pxScale, scale);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			gl.useProgram(sceneProgram);
			gl.bindVertexArray(sceneVao);
		}
		if (slotOverflow && !slotOverflowHandled) {
			// one clean refill for this coverage: reset between passes and
			// repaint once; glyphs beyond the cap render the substitute
			slotOverflowHandled = true;
			slotOverflow = false;
			resetUnicodePages();
			requestAnimationFrame(repaint);
		}
	};

	const anchorTo = row => {
		const rows = host.getRows();
		slotOverflowHandled = false; // new coverage may refill the atlas
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
		// slot bitmaps are scaled to the font metrics, so any rebuild
		// invalidates them; repaint refills from the hex page cache
		slotOverflowHandled = false;
		resetUnicodePages();
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
	// (one instanced draw, ~0.05ms)
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
	const exportPlanes = () =>
		(host.getDocPlanes ?? host.getPlanes)();

	const getImageRGBA = () => {
		const columns = host.getColumns();
		const rows = host.getRows();
		const { glyph, fg: fgPlane, bg: bgPlane } = exportPlanes();
		const width = cellW * columns;
		const height = cellH * rows;
		const data = new Uint8ClampedArray(width * height * 4);
		const colors = [];
		for (let i = 0; i < 16; i++) {
			colors.push(State.palette.getRGBAColor(i));
		}
		const docPalette = host.getPalette ? host.getPalette() : null;
		for (let i = 16; i < 256; i++) {
			const word =
				docPalette && i < docPalette.length ? docPalette[i] : xterm256RGB(i);
			colors.push([(word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff, 255]);
		}
		// same tag-bit resolve as the shader; blink cells export in their
		// visible phase (the planes already hold the dim background)
		const resolve = word =>
			((word & 0x80000000) !== 0
				? colors[word & 0xff]
				: [(word >> 16) & 0xff, (word >> 8) & 0xff, word & 0xff, 255]);
		// unicode glyph bits for exports, independent of what the paint
		// path has cached (off-coverage cells were never slot-assigned)
		const unicodeExportBits = glyphId => {
			const slot = slotByGlyphId.get(glyphId);
			if (slot !== undefined && slot > 0) {
				return slotBits[slot];
			}
			const def = host.getGlyphDef ? host.getGlyphDef(glyphId) : undefined;
			const pages = def && host.getHexPages ? host.getHexPages() : null;
			const bits = pages
				? pages.glyphBits(def.fontSlot, def.codepoint, fontW, fontH)
				: null;
			return bits || substituteBits();
		};
		for (let index = 0; index < columns * rows; index++) {
			const glyphId = glyph[index] & 0xffff;
			const classic = glyphId < 256;
			const bits = classic ? fontBits : unicodeExportBits(glyphId);
			const glyphBase = classic ? glyphId * fontW * fontH : 0;
			const fg = resolve(fgPlane[index]);
			const bg = resolve(bgPlane[index]);
			const ninthDuplicates =
				classic && spacing && glyphId >= 0xc0 && glyphId <= 0xdf;
			const originX = (index % columns) * cellW;
			const originY = Math.floor(index / columns) * cellH;
			for (let py = 0; py < cellH; py++) {
				const fy = Math.min(Math.floor(py / scale), fontH - 1);
				let offset = ((originY + py) * width + originX) * 4;
				for (let px = 0; px < cellW; px++, offset += 4) {
					const fx = Math.floor(px / scale);
					let color = bg;
					if (fx >= fontW) {
						// ninth column (classic-font rule only)
						if (ninthDuplicates && bits[glyphBase + fy * fontW + fontW - 1]) {
							color = fg;
						}
					} else if (bits[glyphBase + fy * fontW + fx]) {
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

	// context loss: intercept and rebuild on restore (PLAN.md §3.1)
	canvas.addEventListener('webglcontextlost', event => {
		event.preventDefault();
		contextLost = true;
		console.warn('[GLRenderer] context lost; awaiting restore');
	});
	canvas.addEventListener('webglcontextrestored', () => {
		contextLost = false;
		console.warn('[GLRenderer] context restored; rebuilding');
		// GL object handles died with the old context
		paletteTexture = null;
		unicodeTexture = null;
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
		setCrt: enabled => {
			crtEnabled = enabled === true;
			if (!crtEnabled && crtFbo) {
				gl.deleteFramebuffer(crtFbo);
				gl.deleteTexture(crtTexture);
				crtFbo = null;
				crtTexture = null;
				crtW = 0;
				crtH = 0;
			}
			repaint();
		},
		getCrt: () => crtEnabled,
		canvas,
	};
};

export { createGLRenderer };
export default { createGLRenderer };
