import { describe, it, expect } from 'vitest';
import {
	createDocV3,
	glyphWord,
	paletteColor,
} from '../../src/js/core/doc.js';
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

		arena.beginStroke({ frame: 0, userId: 'xero' });
		arena.record('glyph', 5, f.glyph[5], glyphWord(219, 0));
		f.glyph[5] = glyphWord(219, 0);
		arena.record('fg', 5, f.fg[5], paletteColor(14));
		f.fg[5] = paletteColor(14);
		expect(arena.endStroke()).toBe(true);

		const meta = arena.undo(doc);
		expect(meta).toEqual({ frame: 0, userId: 'xero' });
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
		arena.endStroke();
	});
});
