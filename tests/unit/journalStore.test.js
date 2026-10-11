/**
 * journalStore orchestration over the injectable memory backend: the
 * open -> append -> compact -> rewrite lifecycle, write serialization,
 * and end-to-end replay through the core journal format.
 */
import { describe, it, expect } from 'vitest';
import {
	createJournalStore,
	createMemoryBackend,
} from '../../src/js/client/journalStore.js';
import {
	createDocV3,
	createJournal,
	createPatchArena,
	encodeStrokeRecord,
	glyphWord,
	paletteColor,
	replayJournal,
} from '../../src/js/core/index';

describe('journal store', () => {
	it('persists keyframe + strokes and replays the doc', async () => {
		const backend = createMemoryBackend();
		const store = createJournalStore({ backend });
		expect(store.backendKind).toBe('memory');

		const doc = createDocV3({ columns: 6, rows: 2 });
		const strokes = [];
		const arena = createPatchArena({ onCommit: s => strokes.push(s) });
		await store.rewrite(await createJournal(doc, { meta: { title: 'wip' } }));

		arena.beginStroke({ frame: 0, userId: 'xero' });
		arena.record('glyph', 4, doc.frames[0].glyph[4], glyphWord(219, 0));
		doc.frames[0].glyph[4] = glyphWord(219, 0);
		arena.record('fg', 4, doc.frames[0].fg[4], paletteColor(14));
		doc.frames[0].fg[4] = paletteColor(14);
		arena.endStroke();
		for (const stroke of strokes) {
			await store.appendStroke(encodeStrokeRecord(stroke));
		}

		const replay = await replayJournal(await store.open());
		expect(replay.meta.title).toBe('wip');
		expect(replay.strokesApplied).toBe(1);
		expect(replay.doc.frames[0].glyph).toEqual(doc.frames[0].glyph);
		expect(replay.doc.frames[0].fg).toEqual(doc.frames[0].fg);
	});

	it('reports compaction when limits trip and rewrite resets counters', async () => {
		const store = createJournalStore({
			backend: createMemoryBackend(),
			compactLimits: { strokes: 3, bytes: 10_000 },
		});
		const doc = createDocV3({ columns: 2, rows: 1 });
		await store.rewrite(await createJournal(doc));

		const record = encodeStrokeRecord({
			meta: { frame: 0 },
			patches: { glyph: Uint32Array.from([0, 0, glyphWord(65, 0)]) },
		});
		expect(await store.appendStroke(record)).toBe(false);
		expect(await store.appendStroke(record)).toBe(false);
		expect(await store.appendStroke(record)).toBe(true);
		expect(store.stats().strokesSinceKeyframe).toBe(3);

		await store.rewrite(await createJournal(doc));
		expect(store.stats()).toEqual({
			bytesSinceKeyframe: 0,
			strokesSinceKeyframe: 0,
		});
	});

	it('serializes writes and survives a failing backend call', async () => {
		const order = [];
		let failNext = false;
		const backend = {
			kind: 'memory',
			read: async () => new Uint8Array(0),
			append: async bytes => {
				if (failNext) {
					failNext = false;
					throw new Error('disk full');
				}
				order.push(bytes.length);
			},
			rewrite: async () => order.push('rewrite'),
			wipe: async () => {},
			close: async () => {},
		};
		const store = createJournalStore({ backend });
		failNext = true;
		await expect(store.appendStroke(Uint8Array.of(1, 2))).rejects.toThrow(
			/disk full/,
		);
		// the chain keeps flowing after a failure
		await store.appendStroke(Uint8Array.of(1, 2, 3));
		await store.rewrite(Uint8Array.of(9));
		expect(order).toEqual([3, 'rewrite']);
	});

	it('wipe clears bytes and counters', async () => {
		const backend = createMemoryBackend();
		const store = createJournalStore({ backend });
		await store.appendStroke(Uint8Array.of(1, 2, 3));
		await store.wipe();
		expect(await store.open()).toEqual(new Uint8Array(0));
		expect(store.stats()).toEqual({
			bytesSinceKeyframe: 0,
			strokesSinceKeyframe: 0,
		});
	});
});
