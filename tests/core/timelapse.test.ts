/**
 * Timelapse replay: baseline + op log -> capped multi-frame doc.
 */
import { describe, it, expect } from 'vitest';
import { paletteColor } from '../../src/js/core/doc.js';
import {
	MoebiusAction as A,
	T0wnzAction,
	ProtocolError,
	compressExtCells,
	timelapseToDoc,
	type ExtCell,
} from '../../src/js/core/index.js';

const blankCell = (): ExtCell => ({
	u: 32,
	a: 0,
	fg: paletteColor(7),
	bg: paletteColor(0),
});

const basePayload = (columns = 3, rows = 2) => ({
	columns,
	rows,
	cells: compressExtCells(Array.from({ length: columns * rows }, blankCell)),
	palette: null,
	ops: [] as unknown[],
});

const extDrawOp = (x: number, y: number, u: number) => ({
	t: 0,
	type: T0wnzAction.EXT_DRAW,
	data: { x, y, u, a: 0, fg: 0xff8800, bg: paletteColor(0), id: 0 },
	seq: 1,
});

const glyphAt = (
	doc: ReturnType<typeof timelapseToDoc>['doc'],
	frame: number,
	x: number,
	y: number,
) => {
	const cell = doc.getCell(frame, x, y);
	return doc.glyphTable.get(cell.glyph & 0xffff)?.codepoint ?? null;
};

describe('timelapseToDoc', () => {
	it('replays baseline + ops into frames ending at the final state', () => {
		const payload = basePayload();
		payload.ops = [
			extDrawOp(0, 0, 0x2764),
			{
				t: 0,
				type: A.DRAW,
				data: { x: 1, y: 1, block: { code: 65, fg: 7, bg: 0 }, id: 1 },
				seq: 2,
			},
		];
		const { doc, frames, ops } = timelapseToDoc(payload);
		expect(ops).toBe(2);
		expect(frames).toBe(3); // baseline + one per op (stride 1)
		expect(glyphAt(doc, 0, 0, 0)).toBe(32);
		expect(glyphAt(doc, 1, 0, 0)).toBe(0x2764);
		expect(glyphAt(doc, 2, 1, 1)).toBe(65);
		expect(doc.getCell(1, 0, 0).fg).toBe(0xff8800);
	});

	it('caps the movie at maxFrames with the end state last', () => {
		const payload = basePayload(4, 1);
		payload.ops = Array.from({ length: 50 }, (_, i) =>
			extDrawOp(i % 4, 0, 65 + (i % 26)),
		);
		const { doc, frames } = timelapseToDoc(payload, { maxFrames: 10 });
		expect(frames).toBeLessThanOrEqual(11);
		// the last op drew 65 + (49 % 26) = 88 at x = 1
		expect(glyphAt(doc, doc.frames.length - 1, 1, 0)).toBe(88);
	});

	it('handles mid-log resizes row-aware at final dims', () => {
		const payload = basePayload(2, 2);
		payload.ops = [
			extDrawOp(1, 1, 66),
			{
				t: 0,
				type: A.SET_CANVAS_SIZE,
				data: { columns: 4, rows: 2, id: 0 },
				seq: 2,
			},
			extDrawOp(3, 0, 67),
		];
		const { doc } = timelapseToDoc(payload);
		expect(doc.getColumns()).toBe(4);
		const last = doc.frames.length - 1;
		expect(glyphAt(doc, last, 1, 1)).toBe(66); // survived the resize
		expect(glyphAt(doc, last, 3, 0)).toBe(67);
		// the PRE-resize frame renders padded at final dims
		expect(glyphAt(doc, 1, 3, 0)).not.toBe(67);
	});

	it('drops hostile ops and rejects bad payloads', () => {
		const payload = basePayload();
		payload.ops = [
			{
				type: T0wnzAction.EXT_DRAW,
				data: { x: 99, y: 0, u: 65, a: 0, fg: 0, bg: 0 },
			},
			{
				type: T0wnzAction.EXT_DRAW,
				data: { x: 0, y: 0, u: 0xd800, a: 0, fg: 0, bg: 0 },
			},
			{ type: A.SET_CANVAS_SIZE, data: { columns: 1e9, rows: 1e9 } },
			'junk',
			null,
		];
		const { doc } = timelapseToDoc(payload);
		expect(doc.getColumns()).toBe(3);
		expect(() =>
			timelapseToDoc({ columns: -1, rows: 5, cells: [], ops: [] }),
		).toThrow(ProtocolError);
	});

	// the doc must be big enough that the budget (not maxFrames or the
	// op count) decides the stride, but no bigger: frame planes scale
	// with cells x frames, and a 4M-cell variant blows the 5s default on
	// slow CI shards. The timeout is insurance
	it(
		'bounds frames x cells by the animation budget',
		{ timeout: 30_000 },
		() => {
			// 400k cells: the budget (16M cell-frames) allows 40 frames,
			// under both maxFrames (120) and the 50 ops
			const payload = basePayload(800, 500);
			payload.ops = Array.from({ length: 50 }, (_, i) =>
				extDrawOp(i % 4, 0, 65 + (i % 26)),
			);
			const { doc, frames } = timelapseToDoc(payload, { maxFrames: 120 });
			expect(frames).toBeLessThanOrEqual(41);
			expect(frames * doc.getColumns() * doc.getRows()).toBeLessThanOrEqual(
				16_000_000 * 1.3,
			);
		},
	);

	it('budgets frames against final dims, not the baseline', () => {
		// a 1x1 baseline must not buy 120 frames of the final canvas
		const payload = basePayload(1, 1);
		payload.ops = [
			...Array.from({ length: 11 }, () => extDrawOp(0, 0, 65)),
			{
				t: 0,
				type: A.SET_CANVAS_SIZE,
				data: { columns: 20, rows: 20, id: 0 },
				seq: 2,
			},
		];
		const { doc, frames } = timelapseToDoc(payload, { frameCellBudget: 1200 });
		expect(doc.getColumns()).toBe(20);
		expect(frames).toBeLessThanOrEqual(3);
		expect(frames * 20 * 20).toBeLessThanOrEqual(1200);
	});

	it('sheds replaced snapshot cells from the budget accounting', () => {
		const payload = basePayload(2, 2);
		payload.ops = [
			extDrawOp(0, 0, 65),
			extDrawOp(1, 1, 66),
			{
				t: 0,
				type: A.SET_CANVAS_SIZE,
				data: { columns: 1, rows: 1, id: 0 },
				seq: 2,
			},
			extDrawOp(0, 0, 67),
		];
		const { doc, frames } = timelapseToDoc(payload, { frameCellBudget: 12 });
		// stale accounting would force the last draw into another
		// replacement: 3 frames and no dedicated resize frame
		expect(frames).toBe(4);
		expect(glyphAt(doc, 3, 0, 0)).toBe(67);
		expect(glyphAt(doc, 2, 0, 0)).toBe(65);
	});

	it('keeps the full movie when the canvas shrinks mid-log', () => {
		const payload = basePayload(10, 10);
		payload.ops = [
			extDrawOp(0, 0, 66),
			{
				t: 0,
				type: A.SET_CANVAS_SIZE,
				data: { columns: 2, rows: 2, id: 0 },
				seq: 2,
			},
			extDrawOp(1, 1, 67),
		];
		const { doc, frames } = timelapseToDoc(payload);
		expect(doc.getColumns()).toBe(2);
		expect(doc.getRows()).toBe(2);
		expect(frames).toBe(4);
		expect(glyphAt(doc, 3, 0, 0)).toBe(66);
		expect(glyphAt(doc, 3, 1, 1)).toBe(67);
	});
});
