/**
 * A canvas resize as one undo step. Recorded cell indexes are only
 * valid at the geometry they were drawn at, so the resize sits in the
 * same ring as the strokes around it.
 */
import { describe, it, expect, vi } from 'vitest';
import {
	ATTR_BLINK,
	attrsOf,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
	type DocV3,
} from '../../src/js/core/doc.js';
import {
	createEditorCore,
	type EditorCore,
	type EditorWrite,
} from '../../src/js/core/editor.js';
import { createPatchArena } from '../../src/js/core/patchArena.js';
import { decodeAns } from '../../src/js/core/codecs/ans.js';

const makeEditor = (columns = 4, rows = 3) => {
	const doc = createDocV3({ columns, rows });
	const writes: EditorWrite[] = [];
	const onFrameChange = vi.fn();
	const editor = createEditorCore(doc, {
		arena: createPatchArena(),
		onWrite: write => writes.push(write),
		onFrameChange,
	});
	return { doc, editor, writes, onFrameChange };
};

const stroke = (editor: EditorCore, charCode: number, x: number, y: number) => {
	editor.startUndo();
	editor.drawBlocks(draw => draw(charCode, 7, 1, x, y), false);
	editor.endUndo();
};

const charAt = (doc: DocV3, frame: number, x: number, y: number) =>
	doc.getCell(frame, x, y).glyph & 0xffff;

const dims = (doc: DocV3) => [doc.getColumns(), doc.getRows()];

describe('resize as an undo step', () => {
	it('undo restores the old size and every dropped cell, redo cuts again', () => {
		const { doc, editor } = makeEditor();
		stroke(editor, 65, 3, 2);
		stroke(editor, 66, 1, 1);
		editor.resize(2, 2);
		expect(dims(doc)).toEqual([2, 2]);
		expect(charAt(doc, 0, 1, 1)).toBe(66);

		expect(editor.undo()).toBe(true);
		expect(dims(doc)).toEqual([4, 3]);
		expect(charAt(doc, 0, 3, 2)).toBe(65);
		expect(doc.getCell(0, 3, 2).bg).toBe(paletteColor(1));
		expect(charAt(doc, 0, 1, 1)).toBe(66);

		expect(editor.redo()).toBe(true);
		expect(dims(doc)).toEqual([2, 2]);
		expect(charAt(doc, 0, 1, 1)).toBe(66);
	});

	it('brings back a dropped cell that differs from blank in any word', () => {
		const black = paletteColor(0);
		for (const iceColors of [false, true]) {
			const cells = [
				{ glyph: 0, fg: paletteColor(7), bg: black },
				{ glyph: 0, fg: black, bg: paletteColor(4) },
				// bright bg 8 on an empty glyph, in each mode's own fold
				iceColors
					? { glyph: 0, fg: black, bg: paletteColor(8) }
					: { glyph: glyphWord(0, ATTR_BLINK), fg: black, bg: black },
				{ glyph: glyphWord(0x2603), fg: black, bg: black },
				// RGB black is a different word from palette black
				{ glyph: 0, fg: rgbColor(0, 0, 0), bg: black },
				{ glyph: 0, fg: black, bg: rgbColor(0, 0, 0) },
			];
			const doc = createDocV3({
				columns: cells.length + 1,
				rows: 1,
				iceColors,
			});
			const editor = createEditorCore(doc, { arena: createPatchArena() });
			cells.forEach((cell, x) => doc.setCell(0, x + 1, 0, cell));
			editor.resize(1, 1);
			editor.undo();
			cells.forEach((cell, x) =>
				expect(doc.getCell(0, x + 1, 0)).toEqual(cell),
			);
		}
	});

	it('strokes on both sides of a resize undo and redo at their own geometry', () => {
		const { doc, editor } = makeEditor();
		// index 11 at 4x3; at 6x2 the same index is (5, 1)
		stroke(editor, 65, 3, 2);
		editor.resize(6, 2);
		stroke(editor, 66, 5, 1);

		editor.undo();
		expect(charAt(doc, 0, 5, 1)).toBe(0);
		editor.undo();
		expect(dims(doc)).toEqual([4, 3]);
		expect(charAt(doc, 0, 3, 2)).toBe(65);
		editor.undo();
		expect(charAt(doc, 0, 3, 2)).toBe(0);
		expect(editor.undo()).toBe(false);

		editor.redo();
		expect(charAt(doc, 0, 3, 2)).toBe(65);
		editor.redo();
		expect(dims(doc)).toEqual([6, 2]);
		// the 4x3 stroke fell off the 6x2 canvas
		expect(charAt(doc, 0, 3, 1)).toBe(0);
		editor.redo();
		expect(charAt(doc, 0, 5, 1)).toBe(66);
		expect(editor.redo()).toBe(false);
	});

	it('every undo and redo across two resizes lands on the state first reached there', () => {
		const { doc, editor } = makeEditor(80, 25);
		const snap = () => ({
			dims: dims(doc),
			frames: doc.frames.map(f =>
				[f.glyph, f.fg, f.bg].map(p => Array.from(p)),
			),
		});
		const expectAt = (want: ReturnType<typeof snap>) => {
			const got = snap();
			expect(got.dims).toEqual(want.dims);
			// a frame added later outlives the undo; the frames that
			// existed then must match exactly
			want.frames.forEach((planes, i) => expect(got.frames[i]).toEqual(planes));
		};
		const at = [snap()];
		const step = (fn: () => void) => {
			fn();
			at.push(snap());
		};
		const strokeIn =
			(frame: number, ...args: [number, number, number]) =>
			() => {
				editor.setCurrentFrame(frame);
				stroke(editor, ...args);
			};
		editor.addFrame();
		at[0] = snap();
		step(strokeIn(1, 65, 70, 20));
		step(() => editor.resize(40, 10));
		editor.addFrame({ copyFrom: 0 });
		at[2] = snap();
		step(strokeIn(2, 66, 39, 9));
		// wider but shorter: B falls off the bottom
		step(() => editor.resize(100, 8));
		step(strokeIn(0, 67, 99, 7));

		for (let k = at.length - 2; k >= 0; k--) {
			expect(editor.undo()).toBe(true);
			expectAt(at[k]);
		}
		expect(editor.undo()).toBe(false);
		for (let k = 1; k < at.length; k++) {
			expect(editor.redo()).toBe(true);
			expectAt(at[k]);
		}
		expect(snap()).toEqual(at[at.length - 1]);
	});

	it('restores the dropped cells of every frame', () => {
		const { doc, editor } = makeEditor();
		stroke(editor, 65, 3, 0);
		editor.addFrame();
		editor.setCurrentFrame(1);
		stroke(editor, 66, 0, 2);
		editor.resize(3, 2);
		expect(doc.frames.every(f => f.glyph.length === 6)).toBe(true);

		editor.undo();
		expect(dims(doc)).toEqual([4, 3]);
		expect(charAt(doc, 0, 3, 0)).toBe(65);
		expect(charAt(doc, 1, 0, 2)).toBe(66);
	});

	it('undo leaves the view on its frame even when the cell count matches', () => {
		const { editor, onFrameChange } = makeEditor(4, 2);
		editor.addFrame();
		editor.resize(2, 4);
		editor.setCurrentFrame(1);
		onFrameChange.mockClear();
		editor.undo();
		expect(editor.getCurrentFrame()).toBe(1);
		expect(onFrameChange).not.toHaveBeenCalled();
	});

	it('the undo emits the restored cells of the view frame as history writes', () => {
		const { editor, writes } = makeEditor();
		stroke(editor, 65, 3, 2);
		editor.addFrame({ copyFrom: 0 });
		editor.resize(2, 2);
		writes.length = 0;
		editor.undo();
		// frame 1 holds a copy, but only the frame on view reaches the
		// mirror and the collab wire
		expect(writes).toEqual([
			{ index: 11, x: 3, y: 2, word: (65 << 8) | (1 << 4) | 7, history: true },
		]);
	});

	it('a redo restores what the undo cut off', () => {
		const { doc, editor } = makeEditor(2, 2);
		editor.resize(4, 2);
		// a peer's draw in the grown columns never enters the history
		editor.quickDrawExt([
			{
				index: 3,
				glyph: glyphWord(67, 0),
				fg: paletteColor(2),
				bg: paletteColor(0),
			},
		]);
		editor.undo();
		expect(dims(doc)).toEqual([2, 2]);
		editor.redo();
		expect(charAt(doc, 0, 3, 0)).toBe(67);
	});

	it('a frame added after the resize gets its cut cells back on redo', () => {
		const { doc, editor } = makeEditor(2, 2);
		editor.resize(4, 2);
		stroke(editor, 68, 3, 1);
		// the copy is no step, so undoing the stroke leaves it in frame 1
		editor.addFrame({ copyFrom: 0 });
		editor.undo();
		editor.undo();
		expect(doc.frames[1].glyph.length).toBe(4);
		editor.redo();
		expect(charAt(doc, 1, 3, 1)).toBe(68);
		expect(charAt(doc, 0, 3, 1)).toBe(0);
	});

	it('restored cells refold under an ice toggle made since the resize', () => {
		const { doc, editor } = makeEditor();
		// bright bg 9 without ice stores as blink + bg 1
		editor.drawBlocks(draw => draw(65, 7, 9, 3, 2), false);
		editor.endUndo();
		editor.resize(2, 2);
		editor.setIceColors(true);
		editor.undo();
		const cell = doc.getCell(0, 3, 2);
		expect(attrsOf(cell.glyph) & ATTR_BLINK).toBe(0);
		expect(cell.bg).toBe(paletteColor(9));
	});

	it('a cut cell holding a steady bright bg without ice comes back word for word', () => {
		// a SAUCE-less UTF-8 ANSI paints SGR 101 as a steady bright bg
		// with ice off, a fold no edit under that flag writes
		const { doc: source } = decodeAns(
			new TextEncoder().encode('\x1b[79C\x1b[101mA\x1b[0m'),
			{ utf8: true },
		);
		const { doc, editor } = makeEditor();
		editor.loadDoc(source);
		const f = doc.frames[0];
		const wordsAt79 = () => [f.glyph[79], f.fg[79], f.bg[79]];
		const loaded = wordsAt79();
		expect(loaded[0]).toBe(glyphWord(65, 0));
		expect(loaded[2]).toBe(paletteColor(12));
		editor.resize(40, doc.getRows());
		editor.undo();
		expect(wordsAt79()).toEqual(loaded);
		editor.redo();
		editor.undo();
		expect(wordsAt79()).toEqual(loaded);
	});

	it('commits the open stroke before resizing', () => {
		const { doc, editor } = makeEditor();
		editor.startUndo();
		editor.drawBlocks(draw => draw(65, 7, 0, 3, 2), false);
		editor.resize(2, 2);
		editor.undo();
		expect(charAt(doc, 0, 3, 2)).toBe(65);
		editor.undo();
		expect(charAt(doc, 0, 3, 2)).toBe(0);
	});

	it('a peer resize clears the history instead of becoming a step', () => {
		const { doc, editor } = makeEditor();
		stroke(editor, 65, 1, 1);
		editor.resize(2, 2, { undoable: false });
		expect(dims(doc)).toEqual([2, 2]);
		expect(editor.undo()).toBe(false);
		expect(dims(doc)).toEqual([2, 2]);
		expect(charAt(doc, 0, 1, 1)).toBe(65);
	});

	it('the same size records nothing', () => {
		const { editor } = makeEditor();
		editor.resize(4, 3);
		expect(editor.arena.stats().strokes).toBe(0);
	});
});
