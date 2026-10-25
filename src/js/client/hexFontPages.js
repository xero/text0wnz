/**
 * Runtime unicode glyph source: lazily fetches the packed
 * per-256-codepoint blocks that tools/bakeHexFonts.js bakes into
 * ui/fonts/u/, and rasterizes glyphs to the active classic font's cell
 * metrics for the renderer's unicode atlas pages (xterm.js
 * model). Blocks and the manifest load on demand only - a classic doc
 * never touches the network for any of this.
 *
 * glyphBits() is synchronous because it sits on the repaint path. Its
 * three answers:
 *   Uint8Array  scaled 1bpp bitmap, render it
 *   null        definitively unrenderable (unknown slot, absent glyph,
 *               wide glyph under the v1 single-width policy): render
 *               the substitute
 *   undefined   the manifest or block is still loading: render the
 *               substitute now; onBlocksLoaded fires when new data
 *               lands so the caller can repaint
 *
 * pickSlot() is the async half used at import/paste/picker time, where
 * awaiting a block is fine: it prefers unscii-16 (purpose-built for
 * textmode art) and falls back to Unifont's coverage.
 */
import {
	HEX_CELL_HEIGHT,
	HEX_CELL_WIDTH,
	readBlock,
} from '../core/hexfont.js';
import { FONT_SLOT_UNIFONT, FONT_SLOT_UNSCII, FONT_SLOT_XB, XB_UPPER_BASE } from '../core/doc.js';

const SLOT_KEYS = new Map([
	[FONT_SLOT_UNSCII, 'unscii16'],
	[FONT_SLOT_UNIFONT, 'unifont'],
]);

// scaled-bitmap memo bound; a full wipe on overflow is simpler than
// LRU and the repaint after it refills only what is actually visible
const SCALED_CACHE_LIMIT = 8192;

/**
 * @param {Object} options
 * @param {string} options.baseUrl - block dir (State.fontDir + 'u')
 * @param {typeof fetch} [options.fetchFn] - injected for tests
 * @param {() => void} [options.onBlocksLoaded] - fired once per block
 *   (or manifest) arrival, after it is readable
 */
const createHexFontPages = ({ baseUrl, fetchFn, onBlocksLoaded }) => {
	const doFetch =
		fetchFn ?? (typeof fetch === 'function' ? fetch : null);
	/** @type {{fonts: Record<string, {blocks: string[]}>}|null} */
	let manifest = null;
	let manifestFailed = false;
	/** @type {Promise<void>|null} */
	let manifestPromise = null;
	/** blockKey -> BlockReader, or null when the fetch failed */
	const blocks = new Map();
	/** blockKey -> in-flight promise */
	const pending = new Map();
	/** `${slot}:${cp}:${w}x${h}` -> Uint8Array */
	const scaledCache = new Map();

	const loadManifest = () => {
		if (manifestPromise) {
			return manifestPromise;
		}
		manifestPromise = (async () => {
			try {
				const response = await doFetch(`${baseUrl}/manifest.json`);
				if (!response.ok) {
					throw new Error(`manifest http ${response.status}`);
				}
				manifest = await response.json();
			} catch (error) {
				manifestFailed = true;
				console.warn('[hexFontPages] manifest load failed:', error);
			}
			onBlocksLoaded?.();
		})();
		return manifestPromise;
	};

	/** true when the font's manifest entry lists the codepoint's block */
	const fontHasBlock = (fontKey, codepoint) => {
		const entry = manifest?.fonts?.[fontKey];
		return entry
			? entry.blocks.includes((codepoint >> 8).toString(16))
			: false;
	};

	const loadBlock = (fontKey, blockId) => {
		const blockKey = `${fontKey}/${blockId.toString(16)}`;
		if (blocks.has(blockKey)) {
			return Promise.resolve();
		}
		const inFlight = pending.get(blockKey);
		if (inFlight) {
			return inFlight;
		}
		const promise = (async () => {
			try {
				const response = await doFetch(`${baseUrl}/${blockKey}.bin`);
				if (!response.ok) {
					throw new Error(`block http ${response.status}`);
				}
				const bytes = new Uint8Array(await response.arrayBuffer());
				blocks.set(blockKey, readBlock(blockId, bytes));
			} catch (error) {
				// a failed block stays failed for the session; repaints must
				// not retry-storm the server for a 404
				blocks.set(blockKey, null);
				console.warn(`[hexFontPages] block ${blockKey} failed:`, error);
			}
			pending.delete(blockKey);
			onBlocksLoaded?.();
		})();
		pending.set(blockKey, promise);
		return promise;
	};

	/** nearest-neighbor from the 8x16 hex cell to the font's cell */
	const scaleBits = (bytes, fontW, fontH) => {
		const out = new Uint8Array(fontW * fontH);
		for (let y = 0; y < fontH; y++) {
			const sy = Math.floor((y * HEX_CELL_HEIGHT) / fontH);
			for (let x = 0; x < fontW; x++) {
				const sx = Math.floor((x * HEX_CELL_WIDTH) / fontW);
				out[y * fontW + x] = (bytes[sy] >> (7 - sx)) & 1;
			}
		}
		return out;
	};

	// the 512-glyph XB upper page: bits come from the live embedded
	// font (8px wide, one byte per row), never from network blocks
	let embedded = null;
	const setEmbeddedFont = (bytes, height) => {
		embedded =
			bytes && height > 0 && bytes.length === height * 512
				? { bytes, height }
				: null;
	};
	const xbUpperBits = (codepoint, fontW, fontH) => {
		if (!embedded) {
			// UNDEFINED, not null: null is a definitive miss the renderer
			// caches forever, and a paint racing setXBFontData would pin
			// substitute boxes on whichever cells it reached first (the
			// xb512 goldens caught this as cross-run pixel lottery).
			// Pending stays uncached; the onXBFontLoaded repaint resolves.
			return undefined;
		}
		const index = codepoint - XB_UPPER_BASE + 256;
		if (index < 256 || index > 511) {
			return null;
		}
		const rows = embedded.bytes.subarray(
			index * embedded.height,
			(index + 1) * embedded.height,
		);
		const out = new Uint8Array(fontW * fontH);
		for (let y = 0; y < fontH; y++) {
			const sy = Math.floor((y * embedded.height) / fontH);
			for (let x = 0; x < fontW; x++) {
				const sx = Math.floor((x * 8) / fontW);
				out[y * fontW + x] = (rows[sy] >> (7 - sx)) & 1;
			}
		}
		return out;
	};

	/** single-font lookup; glyphBits layers the cross-font fallback */
	const glyphBitsIn = (fontKey, codepoint, fontW, fontH) => {
		if (!fontHasBlock(fontKey, codepoint)) {
			return null;
		}
		const cacheKey = `${fontKey}:${codepoint}:${fontW}x${fontH}`;
		const cached = scaledCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}
		const blockId = codepoint >> 8;
		const blockKey = `${fontKey}/${blockId.toString(16)}`;
		if (!blocks.has(blockKey)) {
			loadBlock(fontKey, blockId);
			return undefined;
		}
		const reader = blocks.get(blockKey);
		// failed fetch, absent glyph, or wide under the v1 policy
		if (!reader || !reader.has(codepoint) || reader.isWide(codepoint)) {
			return null;
		}
		if (scaledCache.size >= SCALED_CACHE_LIMIT) {
			scaledCache.clear();
		}
		const bits = scaleBits(reader.glyph(codepoint), fontW, fontH);
		scaledCache.set(cacheKey, bits);
		return bits;
	};

	/**
	 * The glyph def's fontSlot is a PREFERENCE: when that font
	 * definitively lacks the glyph, the other bundled fonts cover for
	 * it (a doc interned under unscii still renders its octants from
	 * Unifont). Only a definitive miss everywhere returns null.
	 */
	const glyphBits = (fontSlot, codepoint, fontW, fontH) => {
		if (fontSlot === FONT_SLOT_XB) {
			return xbUpperBits(codepoint, fontW, fontH);
		}
		const primary = SLOT_KEYS.get(fontSlot);
		if (!primary) {
			return null;
		}
		if (!manifest) {
			if (manifestFailed) {
				return null;
			}
			loadManifest();
			return undefined;
		}
		const order = [
			primary,
			...[...SLOT_KEYS.values()].filter(key => key !== primary),
		];
		for (const fontKey of order) {
			const bits = glyphBitsIn(fontKey, codepoint, fontW, fontH);
			if (bits instanceof Uint8Array) {
				return bits;
			}
			if (bits === undefined) {
				// wait for this font before probing the next: the common
				// case resolves here, and eager fallback fetches would
				// double every block request; onBlocksLoaded repaints
				// drive the next hop when this font turns up empty
				return undefined;
			}
		}
		return null;
	};

	/**
	 * Choose the font slot for a codepoint at import/paste/picker time:
	 * unscii-16 when it has the glyph (and it is narrow), else Unifont,
	 * else null (substitute). Await-safe; loads what it needs.
	 */
	const pickSlot = async codepoint => {
		await loadManifest();
		if (!manifest) {
			return null;
		}
		for (const [slot, fontKey] of SLOT_KEYS) {
			if (!fontHasBlock(fontKey, codepoint)) {
				continue;
			}
			const blockId = codepoint >> 8;
			await loadBlock(fontKey, blockId);
			const reader = blocks.get(`${fontKey}/${blockId.toString(16)}`);
			if (reader?.has(codepoint) && !reader.isWide(codepoint)) {
				return slot;
			}
		}
		return null;
	};

	/**
	 * Preview bits across ALL hex fonts (unscii first), without any
	 * glyph-table interning: the charset picker and F-key bar render
	 * from this. Same tri-state contract as glyphBits.
	 */
	const previewBits = (codepoint, fontW, fontH) => {
		let waiting = false;
		for (const slot of SLOT_KEYS.keys()) {
			const bits = glyphBits(slot, codepoint, fontW, fontH);
			if (bits instanceof Uint8Array) {
				return bits;
			}
			if (bits === undefined) {
				waiting = true;
			}
		}
		return waiting ? undefined : null;
	};

	/**
	 * Fire the fetches for every block a doc's glyph table touches
	 * (dedupe is free: loadBlock and the caches already collapse
	 * repeats). Used on doc load so scrolling and exports meet loaded
	 * glyphs instead of substitutes.
	 */
	const preload = async defs => {
		await loadManifest();
		if (!manifest) {
			return;
		}
		const loads = [];
		for (const def of defs) {
			const fontKey = SLOT_KEYS.get(def.fontSlot);
			if (fontKey && fontHasBlock(fontKey, def.codepoint)) {
				loads.push(loadBlock(fontKey, def.codepoint >> 8));
			}
		}
		await Promise.all(loads);
	};

	return {
		glyphBits,
		previewBits,
		pickSlot,
		preload,
		setEmbeddedFont,
		loadManifest,
		/** test/debug visibility */
		stats: () => ({
			manifestLoaded: manifest !== null,
			blocks: blocks.size,
			pending: pending.size,
			scaled: scaledCache.size,
		}),
	};
};

export { createHexFontPages };
export default { createHexFontPages };
