/**
 * Per-stroke patch arena (PLAN.md §3.2 undo): each stroke is a set of
 * `(index, before, after)` triples per touched plane plus metadata
 * `{userId, frame}`. Strokes live in a byte-capped ring; the same
 * op-patch encoding is the substrate for the OPFS journal and the O13
 * frame delta path, so triples freeze into flat Uint32Arrays on commit.
 *
 * Collab rule (§3.6.3): undo is local per-user inverse-op stacks and
 * remote ops never enter it, so userId is metadata, not a filter here;
 * each client owns one arena of its own strokes.
 */

import { DocV3 } from './doc.js';

export type PlaneName = 'glyph' | 'fg' | 'bg';

const PLANES: ReadonlyArray<PlaneName> = ['glyph', 'fg', 'bg'];

export interface StrokeMeta {
	frame: number;
	userId?: string | number;
}

interface Stroke {
	meta: StrokeMeta;
	/** Flat triples: [index, before, after] x n, per touched plane. */
	patches: Partial<Record<PlaneName, Uint32Array>>;
	bytes: number;
}

export interface PatchArenaStats {
	strokes: number;
	bytes: number;
	canUndo: boolean;
	canRedo: boolean;
}

export interface PatchArena {
	beginStroke: (meta: StrokeMeta) => void;
	/**
	 * Record one cell write. First `before` wins and last `after` wins
	 * when the same plane index is touched again within the stroke.
	 */
	record: (
		plane: PlaneName,
		index: number,
		before: number,
		after: number,
	) => void;
	/** Commit the open stroke; empty strokes vanish. Drops the redo tail. */
	endStroke: () => boolean;
	undo: (doc: DocV3) => StrokeMeta | null;
	redo: (doc: DocV3) => StrokeMeta | null;
	stats: () => PatchArenaStats;
	clear: () => void;
}

/**
 * Default ring cap. v2 capped at MAX_UNDO_CELLS = 1,048,576 cells; one
 * v3 cell write is at most 3 planes x 12B of triple = 36B, so 32MB
 * holds the same order of edits with full plane coverage (O3-class
 * value: surface to the owner with the phase report).
 */
export const DEFAULT_UNDO_BYTE_CAP = 32 * 1024 * 1024;

export const createPatchArena = (
	options: { byteCap?: number } = {},
): PatchArena => {
	const byteCap = options.byteCap ?? DEFAULT_UNDO_BYTE_CAP;
	const strokes: Stroke[] = [];
	// Index of the last APPLIED stroke; strokes above it are the redo tail
	let cursor = -1;
	let bytes = 0;

	let openMeta: StrokeMeta | null = null;
	let openPatches: Map<PlaneName, Map<number, [number, number]>> | null = null;

	const planeOf = (
		doc: DocV3,
		frame: number,
		plane: PlaneName,
	): Uint32Array => {
		const f = doc.frames[frame];
		if (!f) {
			throw new RangeError(`[core/patchArena] frame ${frame} out of range`);
		}
		return f[plane];
	};

	const evictToCap = () => {
		while (bytes > byteCap && cursor > 0) {
			const evicted = strokes.shift();
			if (!evicted) {
				break;
			}
			bytes -= evicted.bytes;
			cursor--;
		}
	};

	return {
		beginStroke: meta => {
			if (openMeta) {
				throw new Error('[core/patchArena] stroke already open');
			}
			openMeta = { ...meta };
			openPatches = new Map();
		},
		record: (plane, index, before, after) => {
			if (!openMeta || !openPatches) {
				throw new Error('[core/patchArena] no open stroke');
			}
			let planeMap = openPatches.get(plane);
			if (!planeMap) {
				planeMap = new Map();
				openPatches.set(plane, planeMap);
			}
			const existing = planeMap.get(index);
			if (existing) {
				existing[1] = after >>> 0;
			} else {
				planeMap.set(index, [before >>> 0, after >>> 0]);
			}
		},
		endStroke: () => {
			if (!openMeta || !openPatches) {
				throw new Error('[core/patchArena] no open stroke');
			}
			const meta = openMeta;
			const patches: Partial<Record<PlaneName, Uint32Array>> = {};
			let strokeBytes = 0;
			for (const plane of PLANES) {
				const planeMap = openPatches.get(plane);
				if (!planeMap || planeMap.size === 0) {
					continue;
				}
				const flat = new Uint32Array(planeMap.size * 3);
				let at = 0;
				for (const [index, [before, after]] of planeMap) {
					flat[at++] = index;
					flat[at++] = before;
					flat[at++] = after;
				}
				patches[plane] = flat;
				strokeBytes += flat.byteLength;
			}
			openMeta = null;
			openPatches = null;
			if (strokeBytes === 0) {
				return false;
			}
			// A new stroke invalidates the redo tail
			strokes.splice(cursor + 1).forEach(dropped => {
				bytes -= dropped.bytes;
			});
			strokes.push({ meta, patches, bytes: strokeBytes });
			cursor = strokes.length - 1;
			bytes += strokeBytes;
			evictToCap();
			return true;
		},
		undo: doc => {
			if (openMeta) {
				throw new Error('[core/patchArena] stroke still open');
			}
			if (cursor < 0) {
				return null;
			}
			const stroke = strokes[cursor];
			for (const plane of PLANES) {
				const flat = stroke.patches[plane];
				if (!flat) {
					continue;
				}
				const target = planeOf(doc, stroke.meta.frame, plane);
				for (let i = 0; i < flat.length; i += 3) {
					target[flat[i]] = flat[i + 1];
				}
			}
			cursor--;
			return { ...stroke.meta };
		},
		redo: doc => {
			if (openMeta) {
				throw new Error('[core/patchArena] stroke still open');
			}
			if (cursor >= strokes.length - 1) {
				return null;
			}
			const stroke = strokes[cursor + 1];
			for (const plane of PLANES) {
				const flat = stroke.patches[plane];
				if (!flat) {
					continue;
				}
				const target = planeOf(doc, stroke.meta.frame, plane);
				for (let i = 0; i < flat.length; i += 3) {
					target[flat[i]] = flat[i + 2];
				}
			}
			cursor++;
			return { ...stroke.meta };
		},
		stats: () => ({
			strokes: strokes.length,
			bytes,
			canUndo: cursor >= 0,
			canRedo: cursor < strokes.length - 1,
		}),
		clear: () => {
			strokes.length = 0;
			cursor = -1;
			bytes = 0;
			openMeta = null;
			openPatches = null;
		},
	};
};
