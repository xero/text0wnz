/**
 * Editor current-frame semantics (P6 frames UI): writes route to the
 * selected frame, strokes remember their frame, undo/redo navigate
 * back to the frame they touch, and frame removal drops the undo
 * history (stroke frame indexes go stale when frames shift).
 */
import { describe, it, expect, vi } from 'vitest';
import { createDocV3, type DocV3 } from '../../src/js/core/doc.js';
import { createEditorCore, type EditorCore } from '../../src/js/core/editor.js';
import { createPatchArena } from '../../src/js/core/patchArena.js';

const makeEditor = (onFrameChange = vi.fn()) => {
	const doc = createDocV3({ columns: 4, rows: 2 });
	const editor = createEditorCore(doc, {
		arena: createPatchArena(),
		onFrameChange,
	});
	return { doc, editor, onFrameChange };
};

const drawA = (editor: EditorCore, x = 0, y = 0) => {
	editor.drawBlocks(draw => draw(65, 7, 0, x, y), false);
};

const charAt = (doc: DocV3, frame: number, x: number, y: number) =>
	doc.getCell(frame, x, y).glyph & 0xffff;

describe('current frame routing', () => {
	it('writes land in the selected frame only', () => {
		const { doc, editor } = makeEditor();
		editor.addFrame({});
		expect(editor.setCurrentFrame(1)).toBe(true);
		drawA(editor, 2, 1);
		expect(charAt(doc, 1, 2, 1)).toBe(65);
		expect(charAt(doc, 0, 2, 1)).toBe(0);
		expect(editor.getBlock(2, 1).charCode).toBe(65);
	});

	it('rejects out-of-range navigation', () => {
		const { editor } = makeEditor();
		expect(editor.setCurrentFrame(1)).toBe(false);
		expect(editor.setCurrentFrame(-1)).toBe(false);
		expect(editor.getCurrentFrame()).toBe(0);
	});

	it('addFrame copyFrom duplicates the source planes', () => {
		const { doc, editor } = makeEditor();
		drawA(editor, 1, 0);
		const index = editor.addFrame({ copyFrom: 0 });
		expect(index).toBe(1);
		expect(charAt(doc, 1, 1, 0)).toBe(65);
	});
});

describe('undo across frames', () => {
	it('undo navigates to the stroke frame and fires onFrameChange', () => {
		const { doc, editor, onFrameChange } = makeEditor();
		editor.addFrame({});
		drawA(editor, 0, 0); // stroke in frame 0
		editor.setCurrentFrame(1);
		onFrameChange.mockClear();
		expect(editor.undo()).toBe(true);
		expect(editor.getCurrentFrame()).toBe(0);
		expect(onFrameChange).toHaveBeenCalledWith(0);
		expect(charAt(doc, 0, 0, 0)).toBe(0);
	});

	it('redo navigates back too', () => {
		const { doc, editor } = makeEditor();
		editor.addFrame({});
		editor.setCurrentFrame(1);
		drawA(editor, 3, 1); // stroke in frame 1
		editor.setCurrentFrame(0);
		editor.undo(); // jumps to frame 1, erases
		expect(editor.getCurrentFrame()).toBe(1);
		editor.setCurrentFrame(0);
		expect(editor.redo()).toBe(true);
		expect(editor.getCurrentFrame()).toBe(1);
		expect(charAt(doc, 1, 3, 1)).toBe(65);
	});
});

describe('frame removal and clear', () => {
	it('removeFrame drops undo history and clamps the view', () => {
		const { doc, editor, onFrameChange } = makeEditor();
		editor.addFrame({});
		editor.addFrame({});
		editor.setCurrentFrame(2);
		drawA(editor);
		onFrameChange.mockClear();
		editor.removeFrame(2);
		expect(doc.frames.length).toBe(2);
		expect(editor.getCurrentFrame()).toBe(1);
		expect(onFrameChange).toHaveBeenCalledWith(1);
		expect(editor.undo()).toBe(false); // history dropped
	});

	it('removing an earlier frame keeps the view on the same content', () => {
		const { doc, editor } = makeEditor();
		editor.addFrame({});
		editor.setCurrentFrame(1);
		drawA(editor, 1, 1);
		editor.removeFrame(0);
		expect(editor.getCurrentFrame()).toBe(0);
		expect(charAt(doc, 0, 1, 1)).toBe(65);
	});

	it('clear returns to a single blank frame', () => {
		const { doc, editor } = makeEditor();
		editor.addFrame({});
		editor.setCurrentFrame(1);
		drawA(editor);
		editor.clear();
		expect(doc.frames.length).toBe(1);
		expect(editor.getCurrentFrame()).toBe(0);
		expect(charAt(doc, 0, 0, 0)).toBe(0);
	});
});
