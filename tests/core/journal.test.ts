import { describe, it, expect } from 'vitest';
import {
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../../src/js/core/doc.js';
import {
	CommittedStroke,
	createPatchArena,
} from '../../src/js/core/patchArena.js';
import {
	JOURNAL_VERSION,
	RECORD_STROKE,
	createJournal,
	decodeStrokePayload,
	encodeKeyframeRecord,
	encodeStrokeRecord,
	replayJournal,
	scanJournal,
	shouldCompact,
} from '../../src/js/core/journal.js';
import {
	CodecError,
	concatBytes,
	crc32,
} from '../../src/js/core/codecs/util.js';

const strokeOf = (
	frame: number,
	writes: Array<[number, number, number]>,
	userId?: string | number,
): CommittedStroke => ({
	meta: { frame, userId },
	patches: { glyph: Uint32Array.from(writes.flat()) },
});

describe('journal format', () => {
	it('replays keyframe + strokes into the exact doc', async () => {
		const doc = createDocV3({ columns: 6, rows: 2 });
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(219, 0),
			fg: paletteColor(14),
			bg: paletteColor(1),
		});
		const journal = [await createJournal(doc, { meta: { title: 'wip' } })];

		// Live edits recorded through the arena's commit hook
		const strokes: CommittedStroke[] = [];
		const arena = createPatchArena({ onCommit: s => strokes.push(s) });
		arena.beginStroke({ frame: 0, userId: 'xero' });
		const f = doc.frames[0];
		arena.record('glyph', 3, f.glyph[3], glyphWord(65, 0));
		f.glyph[3] = glyphWord(65, 0);
		arena.record('fg', 3, f.fg[3], rgbColor(1, 2, 3));
		f.fg[3] = rgbColor(1, 2, 3);
		arena.endStroke();
		arena.beginStroke({ frame: 0 });
		arena.record('glyph', 3, f.glyph[3], glyphWord(66, 0));
		f.glyph[3] = glyphWord(66, 0);
		arena.endStroke();
		expect(strokes).toHaveLength(2);
		strokes.forEach(s => journal.push(encodeStrokeRecord(s)));

		const replay = await replayJournal(concatBytes(journal));
		expect(replay.meta.title).toBe('wip');
		expect(replay.strokesApplied).toBe(2);
		expect(replay.strokesSkipped).toBe(0);
		expect(replay.tornTail).toBe(false);
		expect(replay.doc.frames[0].glyph).toEqual(doc.frames[0].glyph);
		expect(replay.doc.frames[0].fg).toEqual(doc.frames[0].fg);
		expect(replay.doc.frames[0].bg).toEqual(doc.frames[0].bg);
	});

	it('replay starts from the LAST keyframe', async () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const parts = [await createJournal(doc)];
		parts.push(encodeStrokeRecord(strokeOf(0, [[0, 0, glyphWord(65, 0)]])));
		// Doc-level change: a fresh keyframe supersedes everything above
		doc.setCell(0, 1, 0, {
			glyph: glyphWord(88, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		parts.push(await encodeKeyframeRecord(doc));
		parts.push(encodeStrokeRecord(strokeOf(0, [[2, 0, glyphWord(89, 0)]])));

		const replay = await replayJournal(concatBytes(parts));
		expect(replay.strokesApplied).toBe(1);
		// The pre-keyframe stroke (cell 0) never applies
		expect(replay.doc.getCell(0, 0, 0).glyph).toBe(0);
		expect(replay.doc.getCell(0, 1, 0).glyph).toBe(glyphWord(88, 0));
		expect(replay.doc.getCell(0, 2, 0).glyph).toBe(glyphWord(89, 0));
	});

	it('survives a torn tail from a crash mid-append', async () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const good = concatBytes([
			await createJournal(doc),
			encodeStrokeRecord(strokeOf(0, [[1, 0, glyphWord(65, 0)]])),
		]);
		const fullRecord = encodeStrokeRecord(
			strokeOf(0, [[2, 0, glyphWord(66, 0)]]),
		);
		const torn = concatBytes([good, fullRecord.subarray(0, 7)]);

		const replay = await replayJournal(torn);
		expect(replay.tornTail).toBe(true);
		expect(replay.strokesApplied).toBe(1);
		expect(replay.doc.getCell(0, 1, 0).glyph).toBe(glyphWord(65, 0));
		expect(replay.doc.getCell(0, 2, 0).glyph).toBe(0);
		// scan reports where the valid journal ends (the resume point)
		expect(scanJournal(torn).validLength).toBe(good.length);
	});

	it('stops at a corrupt record and ignores everything after it', async () => {
		const doc = createDocV3({ columns: 4, rows: 1 });
		const first = encodeStrokeRecord(strokeOf(0, [[0, 0, glyphWord(65, 0)]]));
		const second = encodeStrokeRecord(strokeOf(0, [[1, 0, glyphWord(66, 0)]]));
		const bytes = concatBytes([await createJournal(doc), first, second]);
		bytes[bytes.length - second.length + 6] ^= 0xff; // flip a payload byte

		const replay = await replayJournal(bytes);
		expect(replay.tornTail).toBe(true);
		expect(replay.strokesApplied).toBe(1);
		expect(replay.doc.getCell(0, 1, 0).glyph).toBe(0);
	});

	it('skips strokes for frames or cells the keyframe does not have', async () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		const bytes = concatBytes([
			await createJournal(doc),
			encodeStrokeRecord(strokeOf(3, [[0, 0, glyphWord(65, 0)]])),
			encodeStrokeRecord(strokeOf(0, [[99, 0, glyphWord(66, 0)]])),
			encodeStrokeRecord(strokeOf(0, [[1, 0, glyphWord(67, 0)]])),
		]);
		const replay = await replayJournal(bytes);
		expect(replay.strokesApplied).toBe(1);
		expect(replay.strokesSkipped).toBe(2);
		expect(replay.doc.getCell(0, 1, 0).glyph).toBe(glyphWord(67, 0));
	});

	it('round-trips stroke metadata (string, number, none)', () => {
		const cases: Array<string | number | undefined> = ['xero', 42, undefined];
		for (const userId of cases) {
			const record = encodeStrokeRecord(strokeOf(5, [[7, 1, 2]], userId));
			const scan = scanJournal(
				concatBytes([
					Uint8Array.from([0x54, 0x30, 0x57, 0x4a, JOURNAL_VERSION]),
					record,
				]),
			);
			expect(scan.records).toHaveLength(1);
			expect(scan.records[0].type).toBe(RECORD_STROKE);
			const stroke = decodeStrokePayload(scan.records[0].payload);
			expect(stroke.meta.frame).toBe(5);
			expect(stroke.meta.userId).toBe(userId);
			expect(stroke.patches.glyph).toEqual(Uint32Array.from([7, 1, 2]));
		}
	});

	it('rejects bad magic, future versions, and keyframeless journals', async () => {
		expect(() => scanJournal(new Uint8Array(8))).toThrow(/magic/);
		const future = Uint8Array.from([0x54, 0x30, 0x57, 0x4a, 99]);
		expect(() => scanJournal(future)).toThrow(/newer/);
		const empty = Uint8Array.from([0x54, 0x30, 0x57, 0x4a, JOURNAL_VERSION]);
		await expect(replayJournal(empty)).rejects.toThrow(/no keyframe/);
		await expect(replayJournal(empty)).rejects.toThrow(CodecError);
	});

	it('compaction policy trips on bytes or stroke count', () => {
		expect(
			shouldCompact({ bytesSinceKeyframe: 0, strokesSinceKeyframe: 0 }),
		).toBe(false);
		expect(
			shouldCompact({
				bytesSinceKeyframe: 4 * 1024 * 1024,
				strokesSinceKeyframe: 1,
			}),
		).toBe(true);
		expect(
			shouldCompact({ bytesSinceKeyframe: 10, strokesSinceKeyframe: 512 }),
		).toBe(true);
		expect(
			shouldCompact(
				{ bytesSinceKeyframe: 10, strokesSinceKeyframe: 3 },
				{ strokes: 3 },
			),
		).toBe(true);
	});

	it('compacted journal equals a fresh one and replays identically', async () => {
		const doc = createDocV3({ columns: 4, rows: 2 });
		const parts = [await createJournal(doc)];
		for (let i = 0; i < 5; i++) {
			const stroke = strokeOf(0, [
				[i, doc.frames[0].glyph[i], glyphWord(65 + i, 0)],
			]);
			doc.frames[0].glyph[i] = glyphWord(65 + i, 0);
			parts.push(encodeStrokeRecord(stroke));
		}
		const longForm = await replayJournal(concatBytes(parts));
		// Compaction = createJournal over the live doc
		const compacted = await createJournal(doc);
		const replay = await replayJournal(compacted);
		expect(replay.doc.frames[0].glyph).toEqual(longForm.doc.frames[0].glyph);
		expect(compacted.length).toBeLessThan(concatBytes(parts).length);
	});

	it('crc32 matches the reference value', () => {
		// IEEE 802.3 CRC of "123456789"
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
	});
});
