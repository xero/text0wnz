/**
 * Per-stroke patch arena: each stroke is a set of
 * `(index, before, after)` triples per touched plane plus metadata
 * `{frame}`. Strokes live in a byte-capped ring; the same
 * op-patch encoding is the substrate for the OPFS journal, so triples
 * freeze into flat Uint32Arrays on commit.
 *
 * A canvas resize is a step in the same ring, because recorded cell
 * indexes are only valid at the geometry they were drawn at: undo
 * walks back through the resize before it reaches older strokes.
 *
 * Collab rule: undo is local and remote ops never enter it, so each
 * client owns one arena of its own strokes.
 */

import { DocV3, paletteColor } from './doc.js';

export type PlaneName = 'glyph' | 'fg' | 'bg';

const PLANES: ReadonlyArray<PlaneName> = ['glyph', 'fg', 'bg'];

export interface StrokeMeta {
	frame: number;
	/**
	 * The ice flag the step's words were recorded under: they restore
	 * verbatim under the same flag and need a refold under the other.
	 * The journal never writes it.
	 */
	ice?: boolean;
}

/**
 * A resize as one undo step, across every frame. Only the cells a
 * resize drops need keeping: the overlap survives both ways and the
 * rest refills blank. Each direction re-captures what it drops, so a
 * redo also brings back what the undo cut off (a frame added since,
 * a peer's draw).
 */
export interface ResizeStep {
	from: readonly [columns: number, rows: number];
	to: readonly [columns: number, rows: number];
	/**
	 * Per frame, flat [index, glyph, fg, bg] x n of the non-blank cells
	 * the last move dropped, indexed in the geometry they fell off.
	 */
	dropped: Uint32Array[];
	/** The ice flag at the capture of `dropped`. */
	ice: boolean;
}

/**
 * A frozen, committed stroke. The arena never mutates its patches after
 * commit; treat it as read-only (the journal serializes it without
 * copying).
 */
export interface CommittedStroke {
	meta: StrokeMeta;
	/** Flat triples: [index, before, after] x n, per touched plane. */
	patches: Partial<Record<PlaneName, Uint32Array>>;
	/**
	 * Set on a resize step, whose patches are empty. The journal has no
	 * stroke record for it: a resize journals as a fresh keyframe.
	 */
	resize?: ResizeStep;
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
	frame: number,
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
	/**
	 * The open stroke frozen as endStroke would commit it, left open so
	 * the journal can hold a step still being built. Null when no
	 * stroke is open or it holds no writes.
	 */
	peekStroke: () => CommittedStroke | null;
	/**
	 * Resize every frame of `doc` and commit that as one step, keeping
	 * the cells it drops. Drops the redo tail like a stroke.
	 */
	commitResize: (
		doc: DocV3,
		columns: number,
		rows: number,
		meta: StrokeMeta,
	) => void;
	/**
	 * For a resize, the returned meta's `ice` is the flag of the capture
	 * the move restored.
	 */
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
 * triple = 36B, so 64MB holds ~1.9M cells of full plane coverage,
 * roughly 18x the largest real collab piece (80x1295). Steps evict
 * oldest-first past the cap, but never the step at the undo cursor:
 * an op bigger than the whole ring stays undoable, holding the ring
 * over the cap until the next step evicts it.
 */
export const DEFAULT_UNDO_BYTE_CAP = 64 * 1024 * 1024;

export interface PatchArenaOptions {
	byteCap?: number;
	/**
	 * Fires once per committed (non-empty) stroke or resize step, after
	 * the ring bookkeeping: the OPFS journal's append hook and the
	 * history label table's.
	 */
	onCommit?: (stroke: CommittedStroke) => void;
	/**
	 * Fires once per stroke the byte cap evicts, oldest first, so a
	 * client-side mirror (the history label table) can shift with the
	 * ring. Core strokes stay label-free; labels in StrokeMeta would
	 * bump the journal format.
	 */
	onEvict?: () => void;
	/**
	 * Fires when clear() drops the whole history, so the label table
	 * cannot keep rows for steps that no longer exist.
	 */
	onClear?: () => void;
}

const BLANK = paletteColor(0);

/**
 * Resize every frame, returning the non-blank cells that fall off, per
 * frame. Counted first so a huge drop allocates once, exactly.
 */
const resizeDropping = (
	doc: DocV3,
	[columns, rows]: readonly [number, number],
): Uint32Array[] => {
	const oldColumns = doc.getColumns();
	const oldRows = doc.getRows();
	const dropped = doc.frames.map(f => {
		const each = (fn: (i: number) => void) => {
			for (let y = 0; y < oldRows; y++) {
				for (let x = y < rows ? columns : 0; x < oldColumns; x++) {
					const i = y * oldColumns + x;
					if (f.glyph[i] !== 0 || f.fg[i] !== BLANK || f.bg[i] !== BLANK) {
						fn(i);
					}
				}
			}
		};
		let n = 0;
		each(() => n++);
		const out = new Uint32Array(n * 4);
		let at = 0;
		each(i => {
			out[at++] = i;
			out[at++] = f.glyph[i];
			out[at++] = f.fg[i];
			out[at++] = f.bg[i];
		});
		return out;
	});
	doc.resize(columns, rows);
	return dropped;
};

const restoreDropped = (
	doc: DocV3,
	dropped: Uint32Array[],
	onWrite?: PlaneWrite,
) => {
	// frames only ever grow while a step lives: removing one clears
	// the history
	dropped.forEach((cells, frame) => {
		const f = doc.frames[frame];
		for (let i = 0; i < cells.length; i += 4) {
			const index = cells[i];
			PLANES.forEach((plane, p) => {
				f[plane][index] = cells[i + 1 + p];
				onWrite?.(plane, index, cells[i + 1 + p], frame);
			});
		}
	});
};

const droppedBytes = (dropped: Uint32Array[]): number =>
	dropped.reduce((sum, cells) => sum + cells.byteLength, 0);

type OpenPatches = Map<PlaneName, Map<number, [number, number]>>;

const freeze = (open: OpenPatches) => {
	const patches: Partial<Record<PlaneName, Uint32Array>> = {};
	let bytes = 0;
	for (const plane of PLANES) {
		const planeMap = open.get(plane);
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
		bytes += flat.byteLength;
	}
	return { patches, bytes };
};

export const createPatchArena = (
	options: PatchArenaOptions = {},
): PatchArena => {
	const byteCap = options.byteCap ?? DEFAULT_UNDO_BYTE_CAP;
	const strokes: Stroke[] = [];
	// index of the last APPLIED stroke; strokes above it are the redo tail
	let cursor = -1;
	let bytes = 0;

	let openMeta: StrokeMeta | null = null;
	let openPatches: OpenPatches | null = null;

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
			options.onEvict?.();
		}
	};

	const assertClosed = () => {
		if (openMeta) {
			throw new Error('[core/patchArena] stroke still open');
		}
	};

	const dropRedo = () => {
		strokes.splice(cursor + 1).forEach(dropped => {
			bytes -= dropped.bytes;
		});
	};

	const commit = (stroke: Stroke) => {
		// a new step invalidates the redo tail
		dropRedo();
		strokes.push(stroke);
		cursor = strokes.length - 1;
		bytes += stroke.bytes;
		evictToCap();
		const { meta, patches, resize } = stroke;
		options.onCommit?.(resize ? { meta, patches, resize } : { meta, patches });
	};

	/**
	 * Move a resize step to one end, restoring what the last move
	 * dropped. Returns the ice flag the restored cells were captured
	 * under.
	 */
	const moveResize = (
		doc: DocV3,
		stroke: Stroke,
		size: readonly [number, number],
		onWrite?: PlaneWrite,
	): boolean => {
		const step = stroke.resize as ResizeStep;
		const { dropped: restore, ice } = step;
		step.dropped = resizeDropping(doc, size);
		step.ice = doc.getIceColors();
		restoreDropped(doc, restore, onWrite);
		const next = droppedBytes(step.dropped);
		bytes += next - stroke.bytes;
		stroke.bytes = next;
		return ice;
	};

	const applyPatches = (
		doc: DocV3,
		stroke: Stroke,
		slot: 1 | 2,
		onWrite?: PlaneWrite,
	) => {
		for (const plane of PLANES) {
			const flat = stroke.patches[plane];
			if (!flat) {
				continue;
			}
			const target = planeOf(doc, stroke.meta.frame, plane);
			for (let i = 0; i < flat.length; i += 3) {
				target[flat[i]] = flat[i + slot];
				onWrite?.(plane, flat[i], flat[i + slot], stroke.meta.frame);
			}
		}
	};

	const applyStep = (
		doc: DocV3,
		stroke: Stroke,
		redo: boolean,
		onWrite?: PlaneWrite,
	): StrokeMeta => {
		const { meta, resize } = stroke;
		if (!resize) {
			applyPatches(doc, stroke, redo ? 2 : 1, onWrite);
			return { ...meta };
		}
		const size = redo ? resize.to : resize.from;
		return { ...meta, ice: moveResize(doc, stroke, size, onWrite) };
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
			const { patches, bytes: strokeBytes } = freeze(openPatches);
			openMeta = null;
			openPatches = null;
			if (strokeBytes === 0) {
				return false;
			}
			commit({ meta, patches, bytes: strokeBytes });
			return true;
		},
		peekStroke: () => {
			if (!openMeta || !openPatches) {
				return null;
			}
			const { patches, bytes: strokeBytes } = freeze(openPatches);
			return strokeBytes ? { meta: { ...openMeta }, patches } : null;
		},
		commitResize: (doc, columns, rows, meta) => {
			assertClosed();
			const from = [doc.getColumns(), doc.getRows()] as const;
			const to = [columns, rows] as const;
			const ice = doc.getIceColors();
			const dropped = resizeDropping(doc, to);
			commit({
				meta: { ...meta },
				patches: {},
				resize: { from, to, dropped, ice },
				bytes: droppedBytes(dropped),
			});
		},
		// a resize move re-captures what it drops, which can outgrow the
		// cap; eviction waits for the cursor to move so it never takes the
		// step the undo or redo lands on
		undo: (doc, onWrite) => {
			assertClosed();
			if (cursor < 0) {
				return null;
			}
			const meta = applyStep(doc, strokes[cursor], false, onWrite);
			cursor--;
			evictToCap();
			return meta;
		},
		redo: (doc, onWrite) => {
			assertClosed();
			if (cursor >= strokes.length - 1) {
				return null;
			}
			const meta = applyStep(doc, strokes[cursor + 1], true, onWrite);
			cursor++;
			evictToCap();
			return meta;
		},
		dropRedo,
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
			options.onClear?.();
		},
	};
};
