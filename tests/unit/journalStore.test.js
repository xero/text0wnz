/**
 * journalStore orchestration over the injectable memory backend: the
 * open -> append -> compact -> rewrite lifecycle, write serialization,
 * and end-to-end replay through the core journal format.
 */
import { afterEach, describe, it, expect, vi } from 'vitest';
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

		// a rewrite resets the counters: the window re-arms behaviorally
		await store.rewrite(await createJournal(doc));
		expect(await store.appendStroke(record)).toBe(false);
		expect(await store.appendStroke(record)).toBe(false);
		expect(await store.appendStroke(record)).toBe(true);
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

	describe('backend choice', () => {
		const workers = [];

		// answers every op like journalWorker.js would
		class FakeWorker {
			constructor() {
				workers.push(this);
				this.ops = [];
				this.stored = new Uint8Array(0);
			}

			postMessage({ id, op, bytes }) {
				this.ops.push(op);
				if (op === 'rewrite') {
					this.stored = bytes;
				}
				Promise.resolve().then(() =>
					this.onmessage({ data: { id, ok: true, bytes: op === 'read' ? this.stored : null } }));
			}

			terminate() {}
		}

		const storage = getDirectory => {
			Object.defineProperty(navigator, 'storage', {
				configurable: true,
				value: { getDirectory },
			});
		};

		afterEach(() => {
			vi.unstubAllGlobals();
			delete navigator.storage;
			localStorage.removeItem('text0wnz-journal-home');
			workers.length = 0;
		});

		it('keeps journaling when OPFS exists but refuses', async () => {
			// WebKit private sessions: the method is there, the call rejects
			vi.stubGlobal('Worker', FakeWorker);
			storage(() =>
				Promise.reject(Object.assign(new Error('transient'), { name: 'UnknownError' })));
			const store = createJournalStore();
			await store.rewrite(Uint8Array.of(1, 2, 3));
			expect([...(await store.open())]).toEqual([1, 2, 3]);
			expect(workers).toEqual([]);
		});

		it('gives up on an OPFS probe that never answers', async () => {
			vi.useFakeTimers();
			try {
				vi.stubGlobal('Worker', FakeWorker);
				storage(() => new Promise(() => {}));
				const store = createJournalStore();
				const writing = store.rewrite(Uint8Array.of(7));
				await vi.advanceTimersByTimeAsync(10000);
				await writing;
				expect([...(await store.open())]).toEqual([7]);
				expect(workers).toEqual([]);
			} finally {
				vi.useRealTimers();
			}
		});

		it('takes OPFS when it answers', async () => {
			vi.stubGlobal('Worker', FakeWorker);
			storage(() => Promise.resolve({}));
			const store = createJournalStore();
			await store.rewrite(Uint8Array.of(4, 5));
			expect([...(await store.open())]).toEqual([4, 5]);
			expect(workers).toHaveLength(1);
			expect(workers[0].ops).toEqual(['rewrite', 'read']);
			expect(localStorage.getItem('text0wnz-journal-home')).toBe('opfs');
		});

		it('keeps a journal that lives in OPFS there through a failed probe', async () => {
			// one bad boot must not fork the journal into IndexedDB, where
			// the next boot would never look
			localStorage.setItem('text0wnz-journal-home', 'opfs');
			vi.stubGlobal('Worker', FakeWorker);
			storage(() =>
				Promise.reject(Object.assign(new Error('transient'), { name: 'UnknownError' })));
			const store = createJournalStore();
			await store.rewrite(Uint8Array.of(8));
			expect(workers).toHaveLength(1);
		});

		/** just enough IndexedDB for the journal's one store, shared by every
		 * boot that opens it, like the real database */
		const fakeIndexedDb = () => {
			const records = [];
			let created = false;
			const request = run => {
				const req = {};
				Promise.resolve().then(() => {
					req.result = run();
					req.onsuccess?.();
				});
				return req;
			};
			const store = {
				getAll: () => request(() => records.slice()),
				add: value => request(() => records.push(value)),
				clear: () => request(() => (records.length = 0)),
			};
			const db = {
				objectStoreNames: { contains: () => created },
				createObjectStore: () => (created = true),
				transaction: () => ({ objectStore: () => store }),
				close: () => {},
			};
			return {
				open: () => {
					const req = { result: db };
					Promise.resolve().then(() => {
						req.onupgradeneeded?.();
						req.onsuccess?.();
					});
					return req;
				},
			};
		};

		it('keeps a journal left in IndexedDB there once OPFS answers', async () => {
			vi.stubGlobal('Worker', FakeWorker);
			vi.stubGlobal('indexedDB', fakeIndexedDb());
			// the first boot's probe runs out of time: the journal lands in
			// IndexedDB and the profile remembers that
			vi.useFakeTimers();
			try {
				storage(() => new Promise(() => {}));
				const first = createJournalStore();
				const writing = first.rewrite(Uint8Array.of(9, 9));
				await vi.advanceTimersByTimeAsync(10000);
				await writing;
			} finally {
				vi.useRealTimers();
			}
			expect(localStorage.getItem('text0wnz-journal-home')).toBe('idb');
			// the next boot's probe answers at once, and must not abandon it
			storage(() => Promise.resolve({}));
			const second = createJournalStore();
			expect([...(await second.open())]).toEqual([9, 9]);
			expect(workers).toEqual([]);
		});
	});
});
