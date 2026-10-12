/**
 * Timelapse replay: the server's EXT_TIMELAPSE payload
 * (baseline snapshot + bounded op log) becomes a multi-frame doc the
 * client exports as an animation. The replay walks the mutating ops
 * (draws, batches, resizes) over the baseline grid and snapshots at a
 * stride chosen so the movie stays under maxFrames; the final state is
 * always the last frame. Resizes mid-log are handled row-aware and the
 * doc is built at the FINAL dimensions (earlier snapshots crop or pad).
 */

import { createDocV3, glyphWord, type DocV3 } from '../doc.js';
import { MoebiusAction, ProtocolError } from './moebius.js';
import {
	blockToExtCell,
	expandExtCells,
	sanitizeExtCell,
	sanitizeExtPalette,
	T0wnzAction,
	type ExtCell,
} from './extensions.js';

export interface TimelapseResult {
	doc: DocV3;
	frames: number;
	/** mutating ops replayed */
	ops: number;
}

interface Grid {
	columns: number;
	rows: number;
	cells: ExtCell[];
}

const MAX_CELLS = 10_000_000;

const MUTATING = new Set<number>([
	MoebiusAction.DRAW,
	MoebiusAction.SET_CANVAS_SIZE,
	T0wnzAction.EXT_DRAW,
	T0wnzAction.EXT_DRAW_BATCH,
]);

const blank = (): ExtCell => ({ u: 32, a: 0, fg: 0xaaaaaa, bg: 0 });

const validDims = (columns: unknown, rows: unknown): boolean =>
	Number.isInteger(columns) &&
	Number.isInteger(rows) &&
	(columns as number) > 0 &&
	(rows as number) > 0 &&
	(columns as number) * (rows as number) <= MAX_CELLS;

export const timelapseToDoc = (
	payload: Record<string, unknown>,
	options: { maxFrames?: number } = {},
): TimelapseResult => {
	const { columns, rows } = payload;
	if (!validDims(columns, rows)) {
		throw new ProtocolError(
			`bad timelapse dims ${String(columns)}x${String(rows)}`,
		);
	}
	// aggregate memory bound: frames x cells respects the frame
	// budget (doc.ts), so a 10M-cell room gets a 2-frame movie instead
	// of killing the tab
	const cells = (columns as number) * (rows as number);
	const budgetFrames = Math.floor(16_000_000 / cells);
	const maxFrames = Math.max(
		2,
		Math.min(options.maxFrames ?? 120, budgetFrames),
	);
	const baseline = expandExtCells(
		payload.cells,
		(columns as number) * (rows as number),
	);
	const rawOps = Array.isArray(payload.ops) ? payload.ops : [];
	const ops = rawOps.filter(
		(op): op is { type: number; data: Record<string, unknown> } =>
			typeof op === 'object' &&
			op !== null &&
			MUTATING.has((op as { type?: number }).type as number),
	);

	const grid: Grid = {
		columns: columns as number,
		rows: rows as number,
		cells: baseline.slice(),
	};
	const put = (x: unknown, y: unknown, cell: ExtCell | null) => {
		if (
			cell &&
			Number.isInteger(x) &&
			Number.isInteger(y) &&
			(x as number) >= 0 &&
			(y as number) >= 0 &&
			(x as number) < grid.columns &&
			(y as number) < grid.rows
		) {
			grid.cells[(y as number) * grid.columns + (x as number)] = cell;
		}
	};
	const snapshotOf = (): Grid => ({
		columns: grid.columns,
		rows: grid.rows,
		cells: grid.cells.slice(),
	});

	const stride = Math.max(1, Math.ceil(ops.length / (maxFrames - 1)));
	const snapshots: Grid[] = [snapshotOf()];
	let sinceSnapshot = 0;

	for (const op of ops) {
		const data =
			typeof op.data === 'object' && op.data !== null
				? (op.data as Record<string, unknown>)
				: {};
		switch (op.type) {
			case MoebiusAction.DRAW: {
				const block = data.block as Record<string, unknown> | undefined;
				if (
					block &&
					Number.isInteger(block.code) &&
					Number.isInteger(block.fg) &&
					Number.isInteger(block.bg)
				) {
					put(
						data.x,
						data.y,
						blockToExtCell({
							code: block.code as number,
							fg: block.fg as number,
							bg: block.bg as number,
							ext: sanitizeExtCell(block.ext) ?? undefined,
						}),
					);
				}
				break;
			}
			case T0wnzAction.EXT_DRAW:
				put(data.x, data.y, sanitizeExtCell(data));
				break;
			case T0wnzAction.EXT_DRAW_BATCH: {
				if (Array.isArray(data.cells)) {
					for (const raw of data.cells) {
						const cell = sanitizeExtCell(raw);
						put(
							(raw as Record<string, unknown>)?.x,
							(raw as Record<string, unknown>)?.y,
							cell,
						);
					}
				}
				break;
			}
			case MoebiusAction.SET_CANVAS_SIZE: {
				if (!validDims(data.columns, data.rows)) {
					break;
				}
				const next: Grid = {
					columns: data.columns as number,
					rows: data.rows as number,
					cells: Array.from(
						{ length: (data.columns as number) * (data.rows as number) },
						blank,
					),
				};
				const copyCols = Math.min(next.columns, grid.columns);
				const copyRows = Math.min(next.rows, grid.rows);
				for (let y = 0; y < copyRows; y++) {
					for (let x = 0; x < copyCols; x++) {
						next.cells[y * next.columns + x] = grid.cells[y * grid.columns + x];
					}
				}
				grid.columns = next.columns;
				grid.rows = next.rows;
				grid.cells = next.cells;
				break;
			}
			default:
				break;
		}
		sinceSnapshot++;
		if (sinceSnapshot >= stride) {
			snapshots.push(snapshotOf());
			sinceSnapshot = 0;
		}
	}
	if (sinceSnapshot > 0) {
		snapshots.push(snapshotOf()); // the final state is always a frame
	}

	const finalColumns = grid.columns;
	const finalRows = grid.rows;
	const doc = createDocV3({
		columns: finalColumns,
		rows: finalRows,
		mode: 'free',
	});
	const palette = sanitizeExtPalette(payload.palette);
	if (palette) {
		const words = new Uint32Array(Math.max(doc.palette.length, palette.length));
		words.set(
			doc.palette.subarray(0, Math.min(doc.palette.length, words.length)),
		);
		for (let i = 0; i < palette.length; i++) {
			words[i] = palette[i];
		}
		doc.palette = words;
	}
	snapshots.forEach((snapshot, frameIndex) => {
		const index = frameIndex === 0 ? 0 : doc.addFrame({ force: true });
		const target = doc.frames[index];
		const copyRows = Math.min(finalRows, snapshot.rows);
		const copyCols = Math.min(finalColumns, snapshot.columns);
		for (let y = 0; y < copyRows; y++) {
			for (let x = 0; x < copyCols; x++) {
				const cell = snapshot.cells[y * snapshot.columns + x];
				let glyphId: number;
				try {
					glyphId = doc.glyphTable.idFor(0, cell.u);
				} catch {
					glyphId = 63; // '?'
				}
				const j = y * finalColumns + x;
				target.glyph[j] = glyphWord(glyphId, cell.a);
				target.fg[j] = cell.fg >>> 0;
				target.bg[j] = cell.bg >>> 0;
			}
		}
	});
	return { doc, frames: doc.frames.length, ops: ops.length };
};
