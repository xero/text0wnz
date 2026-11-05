import { describe, it, expect, vi } from 'vitest';
import { createDocV3, glyphWord, paletteColor } from '../../src/js/core/doc.js';
import { createPatchArena } from '../../src/js/core/patchArena.js';
import type { DocV3 } from '../../src/js/core/doc.js';
import type { PatchArena } from '../../src/js/core/patchArena.js';

const write = (
	doc: DocV3,
	arena: PatchArena,
	frame: number,
	index: number,
	glyph: number,
) => {
	const plane = doc.frames[frame].glyph;
	arena.record('glyph', index, plane[index], glyphWord(glyph, 0));
	plane[index] = glyphWord(glyph, 0);
};

describe('patch arena', () => {
	it('undoes and redoes a stroke across planes', () => {
		const doc = createDocV3({ columns: 4, rows: 4 });
		const arena = createPatchArena();
		const f = doc.frames[0];

		arena.beginStroke({ frame: 0 });
		arena.record('glyph', 5, f.glyph[5], glyphWord(219, 0));
		f.glyph[5] = glyphWord(219, 0);
		arena.record('fg', 5, f.fg[5], paletteColor(14));
		f.fg[5] = paletteColor(14);
		expect(arena.endStroke()).toBe(true);

		const meta = arena.undo(doc);
		expect(meta).toEqual({ frame: 0 });
		expect(f.glyph[5]).toBe(0);
		expect(f.fg[5]).toBe(paletteColor(0));

		arena.redo(doc);
		expect(f.glyph[5]).toBe(glyphWord(219, 0));
		expect(f.fg[5]).toBe(paletteColor(14));
		expect(arena.redo(doc)).toBeNull();
	});

	it('keeps first-before and last-after when a cell repeats in a stroke', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const arena = createPatchArena();
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 0, 1);
		write(doc, arena, 0, 0, 2);
		write(doc, arena, 0, 0, 3);
		arena.endStroke();

		arena.undo(doc);
		expect(doc.frames[0].glyph[0]).toBe(0);
		arena.redo(doc);
		expect(doc.frames[0].glyph[0]).toBe(glyphWord(3, 0));
		// Dedupe keeps one triple, not three
		expect(arena.stats().bytes).toBe(12);
	});

	it('drops empty strokes', () => {
		const arena = createPatchArena();
		arena.beginStroke({ frame: 0 });
		expect(arena.endStroke()).toBe(false);
		expect(arena.stats().strokes).toBe(0);
		expect(arena.stats().canUndo).toBe(false);
	});

	it('a new stroke clears the redo tail', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const arena = createPatchArena();

		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 0, 1);
		arena.endStroke();
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 1, 2);
		arena.endStroke();

		arena.undo(doc);
		expect(arena.stats().canRedo).toBe(true);

		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 1, 9);
		arena.endStroke();
		expect(arena.stats().canRedo).toBe(false);
		expect(arena.stats().strokes).toBe(2);

		arena.undo(doc);
		arena.undo(doc);
		expect(arena.undo(doc)).toBeNull();
		expect(doc.frames[0].glyph[0]).toBe(0);
		expect(doc.frames[0].glyph[1]).toBe(0);
	});

	it('evicts oldest strokes beyond the byte cap but keeps the current one', () => {
		const doc = createDocV3({ columns: 100, rows: 1 });
		// Each stroke: one triple = 12 bytes; cap at 3 strokes' worth
		const arena = createPatchArena({ byteCap: 36 });
		for (let i = 0; i < 10; i++) {
			arena.beginStroke({ frame: 0 });
			write(doc, arena, 0, i, i + 1);
			arena.endStroke();
		}
		expect(arena.stats().strokes).toBe(3);
		expect(arena.stats().bytes).toBe(36);

		// Only the surviving strokes undo; older edits stay applied
		arena.undo(doc);
		arena.undo(doc);
		arena.undo(doc);
		expect(arena.undo(doc)).toBeNull();
		expect(doc.frames[0].glyph[6]).toBe(glyphWord(7, 0));
		expect(doc.frames[0].glyph[7]).toBe(0);

		// An oversized single stroke still lands (never evict the last one)
		const big = createPatchArena({ byteCap: 24 });
		big.beginStroke({ frame: 0 });
		for (let i = 0; i < 10; i++) {
			write(doc, big, 0, i, i + 1);
		}
		big.endStroke();
		expect(big.stats().strokes).toBe(1);
	});

	it('strokes carry their frame', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		doc.addFrame();
		const arena = createPatchArena();
		arena.beginStroke({ frame: 1 });
		write(doc, arena, 1, 0, 5);
		arena.endStroke();

		arena.undo(doc);
		expect(doc.frames[1].glyph[0]).toBe(0);
		expect(doc.frames[0].glyph[0]).toBe(0);
		arena.redo(doc);
		expect(doc.frames[1].glyph[0]).toBe(glyphWord(5, 0));
	});

	it('guards stroke lifecycle misuse', () => {
		const doc = createDocV3({ columns: 1, rows: 1 });
		const arena = createPatchArena();
		expect(() => arena.record('glyph', 0, 0, 1)).toThrow(/no open stroke/);
		arena.beginStroke({ frame: 0 });
		expect(() => arena.beginStroke({ frame: 0 })).toThrow(/already open/);
		expect(() => arena.undo(doc)).toThrow(/still open/);
		expect(() => arena.commitResize(doc, 2, 2, { frame: 0 })).toThrow(
			/still open/,
		);
		arena.endStroke();
	});

	it('peekStroke is null with no stroke open or no writes in it', () => {
		const arena = createPatchArena();
		expect(arena.peekStroke()).toBeNull();
		arena.beginStroke({ frame: 0 });
		expect(arena.peekStroke()).toBeNull();
		arena.endStroke();
		expect(arena.peekStroke()).toBeNull();
	});

	it('peekStroke freezes the open stroke as a commit would and leaves it open', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const onCommit = vi.fn();
		const arena = createPatchArena({ onCommit });
		const f = doc.frames[0];
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 0, 1);
		write(doc, arena, 0, 0, 2);
		arena.record('bg', 1, f.bg[1], paletteColor(4));
		f.bg[1] = paletteColor(4);
		const peek = arena.peekStroke();
		expect(peek).toEqual({
			meta: { frame: 0 },
			patches: {
				glyph: Uint32Array.of(0, 0, glyphWord(2, 0)),
				bg: Uint32Array.of(1, paletteColor(0), paletteColor(4)),
			},
		});
		expect(onCommit).not.toHaveBeenCalled();
		expect(arena.stats()).toMatchObject({ strokes: 0, canUndo: false });
		// the stroke keeps building: a peek is a snapshot, and the commit
		// carries the same triples plus the writes made since
		write(doc, arena, 0, 0, 3);
		write(doc, arena, 0, 2, 5);
		expect(peek?.patches.glyph).toEqual(Uint32Array.of(0, 0, glyphWord(2, 0)));
		const again = arena.peekStroke();
		expect(arena.endStroke()).toBe(true);
		expect(onCommit).toHaveBeenCalledWith(again);
		expect(again?.patches.glyph).toEqual(
			Uint32Array.of(0, 0, glyphWord(3, 0), 2, 0, glyphWord(5, 0)),
		);
		expect(arena.stats()).toMatchObject({ strokes: 1, bytes: 36 });
	});

	it('clear empties the ring and tells the label table', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const onClear = vi.fn();
		const arena = createPatchArena({ onClear });
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 0, 1);
		arena.endStroke();
		arena.clear();
		expect(onClear).toHaveBeenCalledTimes(1);
		expect(arena.stats()).toEqual({
			strokes: 0,
			bytes: 0,
			canUndo: false,
			canRedo: false,
		});
	});
});

describe('resize steps', () => {
	it('keep only the non-blank cells the resize drops', () => {
		const doc = createDocV3({ columns: 4, rows: 2 });
		doc.setCell(0, 3, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		doc.setCell(0, 0, 1, {
			glyph: 0,
			fg: paletteColor(0),
			bg: paletteColor(4),
		});
		const arena = createPatchArena();
		arena.commitResize(doc, 2, 1, { frame: 0 });
		expect([doc.getColumns(), doc.getRows()]).toEqual([2, 1]);
		// two cells x [index, glyph, fg, bg] x 4 bytes; the five blank
		// dropped cells cost nothing
		expect(arena.stats().bytes).toBe(32);

		expect(arena.undo(doc)).toEqual({ frame: 0, ice: false });
		expect([doc.getColumns(), doc.getRows()]).toEqual([4, 2]);
		expect(doc.getCell(0, 3, 0).glyph).toBe(glyphWord(65, 0));
		expect(doc.getCell(0, 0, 1).bg).toBe(paletteColor(4));
		// the undo dropped nothing but blanks, so the redo side is free
		expect(arena.stats().bytes).toBe(0);

		arena.redo(doc);
		expect([doc.getColumns(), doc.getRows()]).toEqual([2, 1]);
		expect(arena.stats().bytes).toBe(32);
	});

	it('report each restored cell with its frame', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		doc.addFrame();
		doc.setCell(1, 1, 0, {
			glyph: glyphWord(66, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		const arena = createPatchArena();
		arena.commitResize(doc, 1, 1, { frame: 0 });
		const writes: Array<[string, number, number, number]> = [];
		arena.undo(doc, (plane, index, word, frame) =>
			writes.push([plane, index, word, frame]),
		);
		expect(writes).toEqual([
			['glyph', 1, glyphWord(66, 0), 1],
			['fg', 1, paletteColor(7), 1],
			['bg', 1, paletteColor(0), 1],
		]);
	});

	it('commit through onCommit and drop the redo tail like a stroke', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const onCommit = vi.fn();
		const arena = createPatchArena({ onCommit });
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 1, 7);
		arena.endStroke();
		arena.undo(doc);
		arena.commitResize(doc, 3, 1, { frame: 0 });
		expect(arena.stats()).toMatchObject({ strokes: 1, canRedo: false });
		expect(onCommit).toHaveBeenLastCalledWith({
			meta: { frame: 0 },
			patches: {},
			resize: {
				from: [2, 1],
				to: [3, 1],
				dropped: [new Uint32Array(0)],
				ice: false,
			},
		});
	});

	it('count toward the byte cap and evict oldest first', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const arena = createPatchArena({ byteCap: 24 });
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 3, 9);
		arena.endStroke();
		// the dropped cell costs 16 bytes: 12 + 16 > 24 evicts the stroke
		arena.commitResize(doc, 3, 1, { frame: 0 });
		expect(arena.stats()).toMatchObject({ strokes: 1, bytes: 16 });
		arena.undo(doc);
		expect(doc.frames[0].glyph[3]).toBe(glyphWord(9, 0));
		expect(arena.undo(doc)).toBeNull();
	});

	it('evict when a redo re-captures past the cap', () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const arena = createPatchArena({ byteCap: 40 });
		// art outside history in the column the shrink drops
		doc.setCell(0, 3, 0, {
			glyph: glyphWord(66, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		arena.beginStroke({ frame: 0 });
		write(doc, arena, 0, 0, 9);
		arena.endStroke();
		arena.commitResize(doc, 3, 1, { frame: 0 });
		expect(arena.stats()).toMatchObject({ strokes: 2, bytes: 28 });
		arena.undo(doc);
		// a frame copy of the restored cell doubles what the redo drops
		doc.addFrame({ copyFrom: 0 });
		arena.redo(doc);
		expect(arena.stats()).toMatchObject({ strokes: 1, bytes: 32 });
		arena.undo(doc);
		expect(arena.undo(doc)).toBeNull();
		expect(doc.frames[0].glyph[0]).toBe(glyphWord(9, 0));
	});

	it('evict when an undo re-captures past the cap, keeping the step it lands on', () => {
		const doc = createDocV3({ columns: 3, rows: 1 });
		const arena = createPatchArena({ byteCap: 40 });
		for (const index of [0, 1]) {
			arena.beginStroke({ frame: 0 });
			write(doc, arena, 0, index, index + 1);
			arena.endStroke();
		}
		arena.commitResize(doc, 4, 1, { frame: 0 });
		// a peer's draw in the grown column, then a frame copy of it
		doc.setCell(0, 3, 0, {
			glyph: glyphWord(66, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		doc.addFrame({ copyFrom: 0 });
		arena.undo(doc);
		// the cap stays soft: the second stroke sits at the cursor
		expect(arena.stats()).toMatchObject({
			strokes: 2,
			bytes: 44,
			canRedo: true,
		});
		arena.undo(doc);
		expect(arena.undo(doc)).toBeNull();
		expect(doc.frames[0].glyph[0]).toBe(glyphWord(1, 0));
		expect(doc.frames[0].glyph[1]).toBe(0);
		arena.redo(doc);
		arena.redo(doc);
		expect([doc.getColumns(), doc.getRows()]).toEqual([4, 1]);
		expect(doc.frames[1].glyph[3]).toBe(glyphWord(66, 0));
	});

	it('name the ice flag of each capture they restore', () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const arena = createPatchArena();
		arena.commitResize(doc, 1, 1, { frame: 0 });
		doc.setIceColors(true);
		expect(arena.undo(doc)).toEqual({ frame: 0, ice: false });
		doc.setIceColors(false);
		expect(arena.redo(doc)).toEqual({ frame: 0, ice: true });
		expect(arena.undo(doc)).toEqual({ frame: 0, ice: false });
	});
});
