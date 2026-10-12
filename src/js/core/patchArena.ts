/**
 * Per-stroke patch arena: each stroke is a set of
 * `(index, before, after)` triples per touched plane plus metadata
 * `{userId, frame}`. Strokes live in a byte-capped ring; the same
 * op-patch encoding is the substrate for the OPFS journal and the
 * frame delta path, so triples freeze into flat Uint32Arrays on commit.
 *
 * Collab rule: undo is local per-user inverse-op stacks and remote ops
 * never enter it, so userId is metadata, not a filter here; each
 * client owns one arena of its own strokes.
 */

import { DocV3 } from './doc.js';

export type PlaneName = 'glyph' | 'fg' | 'bg';

const PLANES: ReadonlyArray<PlaneName> = ['glyph', 'fg', 'bg'];

export interface StrokeMeta {
	frame: number;
	userId?: string | number;
}

/**
 * A frozen, committed stroke. The arena never mutates it after commit;
 * treat it as read-only (the journal serializes it without copying).
 */
export interface CommittedStroke {
	meta: StrokeMeta;
	/** Flat triples: [index, before, after] x n, per touched plane. */
	patches: Partial<Record<PlaneName, Uint32Array>>;
}

interface Stroke extends CommittedStroke {
	bytes: number;
}

export interface PatchArenaStats {
	strokes: number;
	bytes: number;
	canUndo: boolean;
	canRedo: boolean;
}

/** Per-write observer for undo/redo (dirty-cell + collab replication). */
export type PlaneWrite = (
	plane: PlaneName,
	index: number,
	word: number,
) => void;

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
	undo: (doc: DocV3, onWrite?: PlaneWrite) => StrokeMeta | null;
	redo: (doc: DocV3, onWrite?: PlaneWrite) => StrokeMeta | null;
	/**
	 * Drop the redo tail without committing anything: v2's startUndo
	 * clears redo unconditionally, even when no edits follow.
	 */
	dropRedo: () => void;
	stats: () => PatchArenaStats;
	clear: () => void;
}

/**
 * Default ring cap. One v3 cell write is at most 3 planes x 12B of
 * triple = 36B, so 64MB holds a single undoable op of ~1.9M cells with
 * full plane coverage, roughly 18x the largest real collab piece
 * (80x1295). Strokes evict oldest-first past the cap; an op bigger
 * than the whole ring is itself un-undoable (accepted: a full 10M-cell
 * op would need ~360MB of triples, unreasonable on mobile).
 */
export const DEFAULT_UNDO_BYTE_CAP = 64 * 1024 * 1024;

export interface PatchArenaOptions {
	byteCap?: number;
	/**
	 * Fires once per committed (non-empty) stroke, after the ring
	 * bookkeeping: the OPFS journal's append hook.
	 */
	onCommit?: (stroke: CommittedStroke) => void;
}

export const createPatchArena = (
	options: PatchArenaOptions = {},
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
			options.onCommit?.({ meta, patches });
			return true;
		},
		undo: (doc, onWrite) => {
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
					onWrite?.(plane, flat[i], flat[i + 1]);
				}
			}
			cursor--;
			return { ...stroke.meta };
		},
		redo: (doc, onWrite) => {
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
					onWrite?.(plane, flat[i], flat[i + 2]);
				}
			}
			cursor++;
			return { ...stroke.meta };
		},
		dropRedo: () => {
			strokes.splice(cursor + 1).forEach(dropped => {
				bytes -= dropped.bytes;
			});
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
