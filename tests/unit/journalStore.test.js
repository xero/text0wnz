import { describe, it, expect, vi, afterEach } from 'vitest';
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

const glyphRecord = encodeStrokeRecord({
	meta: { frame: 0 },
	patches: { glyph: Uint32Array.from([0, 0, glyphWord(65, 0)]) },
});

describe('journal store', () => {
	it('persists keyframe + strokes and replays the doc', async () => {
		const backend = createMemoryBackend();
		const store = createJournalStore({ backend });

		const doc = createDocV3({ columns: 6, rows: 2 });
		const strokes = [];
		const arena = createPatchArena({ onCommit: s => strokes.push(s) });
		await store.rewrite(await createJournal(doc, { meta: { title: 'wip' } }));

		arena.beginStroke({ frame: 0 });
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
		await store.rewrite(Uint8Array.of(9));
		failNext = true;
		await expect(store.appendStroke(Uint8Array.of(1, 2))).rejects.toThrow(
			/disk full/,
		);
		// the chain keeps flowing after a failure
		await store.rewrite(Uint8Array.of(9));
		await store.appendStroke(Uint8Array.of(1, 2, 3));
		expect(order).toEqual(['rewrite', 'rewrite', 3]);
	});

	it('holds a rewrite slot while its snapshot encodes, so later strokes land behind it', async () => {
		const memory = createMemoryBackend();
		const ops = [];
		const store = createJournalStore({
			backend: {
				...memory,
				append: bytes => {
					ops.push('append');
					return memory.append(bytes);
				},
				// the worker backend copies what it gets into a Uint8Array,
				// so a promise here would post an empty journal
				rewrite: bytes => {
					ops.push(bytes instanceof Uint8Array ? 'rewrite' : typeof bytes);
					return memory.rewrite(bytes);
				},
			},
		});
		const doc = createDocV3({ columns: 6, rows: 2 });
		const strokes = [];
		const arena = createPatchArena({ onCommit: s => strokes.push(s) });
		await store.rewrite(createJournal(doc));

		let release;
		const gate = new Promise(resolve => (release = resolve));
		const snapshot = createJournal(doc);
		const compacted = store.rewrite(gate.then(() => snapshot));
		arena.beginStroke({ frame: 0 });
		arena.record('glyph', 4, doc.frames[0].glyph[4], glyphWord(219, 0));
		doc.frames[0].glyph[4] = glyphWord(219, 0);
		arena.endStroke();
		const appended = store.appendStroke(encodeStrokeRecord(strokes[0]));
		release();
		await compacted;

		expect(await appended).toBe(false);
		expect(ops).toEqual(['rewrite', 'rewrite', 'append']);
		// createJournal read the doc at call time, ahead of the stroke
		expect((await replayJournal(await snapshot)).doc.frames[0].glyph[4]).toBe(0);
		const replay = await replayJournal(await store.open());
		expect(replay.strokesApplied).toBe(1);
		expect(replay.doc.frames[0].glyph).toEqual(doc.frames[0].glyph);
	});

	it('leaves compaction to a rewrite queued behind the append that trips it', async () => {
		const store = createJournalStore({
			backend: createMemoryBackend(),
			compactLimits: { strokes: 2, bytes: 10_000 },
		});
		const doc = createDocV3({ columns: 2, rows: 1 });
		await store.rewrite(createJournal(doc));
		expect(await store.appendStroke(glyphRecord)).toBe(false);

		const ahead = store.appendStroke(glyphRecord);
		const compacted = store.rewrite(createJournal(doc));
		const behind = store.appendStroke(glyphRecord);
		expect(await ahead).toBe(false);
		await compacted;
		// the counters reset in the rewrite's slot, ahead of `behind`
		expect(await behind).toBe(false);
		expect(await store.appendStroke(glyphRecord)).toBe(true);
	});

	it('drops strokes until this session writes a keyframe, and asks for one', async () => {
		const backend = createMemoryBackend();
		const earlier = await createJournal(createDocV3({ columns: 4, rows: 1 }));
		await backend.rewrite(earlier);
		const store = createJournalStore({ backend });

		expect(await store.appendStroke(glyphRecord)).toBe(true);
		expect(await store.open()).toEqual(earlier);

		// a keyframe already queued behind the stroke holds it
		const early = store.appendStroke(glyphRecord);
		const first = store.rewrite(createJournal(createDocV3({ columns: 2, rows: 1 })));
		expect(await early).toBe(false);
		await first;
		expect(await store.appendStroke(glyphRecord)).toBe(false);
		const replay = await replayJournal(await store.open());
		expect(replay.doc.getColumns()).toBe(2);
		expect(replay.strokesApplied).toBe(1);
	});

	it('drops strokes after a failed rewrite until a fresh keyframe lands', async () => {
		const memory = createMemoryBackend();
		let diskFull = false;
		const store = createJournalStore({
			backend: {
				...memory,
				rewrite: async bytes => {
					if (diskFull) {
						throw new Error('disk full');
					}
					await memory.rewrite(bytes);
				},
			},
		});
		const stale = await createJournal(createDocV3({ columns: 4, rows: 1 }));
		await store.rewrite(stale);
		const resized = createDocV3({ columns: 2, rows: 1 });

		diskFull = true;
		await expect(store.rewrite(createJournal(resized))).rejects.toThrow(/disk full/);
		expect(await store.appendStroke(glyphRecord)).toBe(true);
		diskFull = false;
		await expect(
			store.rewrite(Promise.reject(new Error('encode failed'))),
		).rejects.toThrow(/encode failed/);
		expect(await store.appendStroke(glyphRecord)).toBe(true);
		expect(await store.open()).toEqual(stale);

		await store.rewrite(createJournal(resized));
		expect(await store.appendStroke(glyphRecord)).toBe(false);
		const replay = await replayJournal(await store.open());
		expect(replay.doc.getColumns()).toBe(2);
		expect(replay.strokesApplied).toBe(1);
	});

	it('drops strokes after a torn append until a fresh keyframe lands', async () => {
		const memory = createMemoryBackend();
		let torn = false;
		const store = createJournalStore({
			backend: {
				...memory,
				append: async bytes => {
					if (torn) {
						await memory.append(bytes.subarray(0, 3));
						throw new Error('disk full');
					}
					await memory.append(bytes);
				},
			},
		});
		const doc = createDocV3({ columns: 2, rows: 1 });
		await store.rewrite(createJournal(doc));
		expect(await store.appendStroke(glyphRecord)).toBe(false);

		torn = true;
		await expect(store.appendStroke(glyphRecord)).rejects.toThrow(/disk full/);
		torn = false;
		const tornFile = await store.open();
		// past the torn record a stroke would never replay
		expect(await store.appendStroke(glyphRecord)).toBe(true);
		expect(await store.open()).toEqual(tornFile);
		expect((await replayJournal(tornFile)).tornTail).toBe(true);

		await store.rewrite(createJournal(doc));
		expect(await store.appendStroke(glyphRecord)).toBe(false);
		const replay = await replayJournal(await store.open());
		expect(replay.tornTail).toBe(false);
		expect(replay.strokesApplied).toBe(1);
	});

	it('a wipe empties the journal behind earlier calls, and strokes wait for the next keyframe', async () => {
		const store = createJournalStore({ backend: createMemoryBackend() });
		const doc = createDocV3({ columns: 2, rows: 1 });
		await store.rewrite(createJournal(doc));
		expect(await store.appendStroke(glyphRecord)).toBe(false);

		const ahead = store.rewrite(createJournal(doc));
		await store.wipe();
		await ahead;
		expect(await store.open()).toHaveLength(0);
		// dropped, and nothing queued will hold it
		expect(await store.appendStroke(glyphRecord)).toBe(true);
		expect(await store.open()).toHaveLength(0);

		await store.rewrite(createJournal(doc));
		expect(await store.appendStroke(glyphRecord)).toBe(false);
		expect((await replayJournal(await store.open())).strokesApplied).toBe(1);
	});

	it('a closed store refuses later calls without reaching the backend', async () => {
		const memory = createMemoryBackend();
		const calls = [];
		const backend = Object.fromEntries(
			Object.entries(memory).map(([op, fn]) => [
				op,
				bytes => {
					calls.push(op);
					return fn(bytes);
				},
			]),
		);
		const store = createJournalStore({ backend });
		const written = store.rewrite(createJournal(createDocV3({ columns: 2, rows: 1 })));
		const closed = store.close();
		expect(store.close()).toBe(closed);
		await expect(store.open()).rejects.toThrow(/closed/);
		await expect(store.appendStroke(glyphRecord)).rejects.toThrow(/closed/);
		await expect(store.rewrite(Uint8Array.of(1))).rejects.toThrow(/closed/);
		await expect(store.wipe()).rejects.toThrow(/closed/);
		await written;
		await closed;
		expect(calls).toEqual(['rewrite', 'close']);
	});

	it('rethrows a snapshot that rejects behind a slow write through its rewrite alone', async () => {
		let finishRead;
		const store = createJournalStore({
			backend: {
				...createMemoryBackend(),
				read: () =>
					new Promise(resolve => {
						finishRead = () => resolve(new Uint8Array(0));
					}),
			},
		});
		const reading = store.open();
		const failed = store.rewrite(Promise.reject(new Error('encode failed')));
		// a macrotask turn, where an unhandled rejection would report
		await new Promise(resolve => setTimeout(resolve, 10));
		finishRead();
		await reading;
		await expect(failed).rejects.toThrow(/encode failed/);
	});
});

// just enough IndexedDB for the journal's record log
const fakeIndexedDB = ({ refuse = false } = {}) => {
	const records = [];
	const later = (request, result) =>
		setTimeout(() => {
			request.result = result;
			request.onsuccess?.();
		});
	const request = result => {
		const r = {};
		later(r, result);
		return r;
	};
	const store = {
		getAll: () => request(records.slice()),
		add: value => request(records.push(value)),
		clear: () => request((records.length = 0)),
	};
	const db = {
		transaction: () => ({ objectStore: () => store }),
		close: () => {},
	};
	const idb = {
		records,
		opens: 0,
		open: () => {
			idb.opens += 1;
			const r = {};
			setTimeout(() => {
				if (refuse) {
					r.error = new Error('refused');
					r.onerror?.();
				} else {
					r.result = db;
					r.onsuccess?.();
				}
			});
			return r;
		},
	};
	return idb;
};

describe('journal backend probe', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.removeItem('text0wnz-journal-home');
	});

	// an OPFS worker answers every call with `error`, as one does where
	// OPFS refuses or another tab holds the file's lock
	const environment = ({ opfs, idb, error = 'UnknownError' }) => {
		const workers = [];
		vi.stubGlobal(
			'Worker',
			class {
				constructor() {
					workers.push(this);
				}

				postMessage({ id }) {
					setTimeout(() =>
						this.onmessage?.({ origin: '', data: { id, ok: false, error } }));
				}

				terminate() {}
			},
		);
		vi.stubGlobal('navigator', {
			storage: {
				getDirectory: () =>
					opfs ? Promise.resolve({}) : Promise.reject(new Error('UnknownError')),
			},
		});
		vi.stubGlobal('indexedDB', idb);
		return workers;
	};
	const doc = () => createDocV3({ columns: 2, rows: 1 });

	it('journals through IndexedDB where OPFS refuses, running early calls in order behind the probe', async () => {
		const idb = fakeIndexedDB();
		const workers = environment({ opfs: false, idb });
		const keyframe = await createJournal(doc());
		const store = createJournalStore();
		// all three queue before the probe settles
		const written = store.rewrite(keyframe);
		const appended = store.appendStroke(glyphRecord);
		const read = store.open();
		await written;
		expect(await appended).toBe(false);
		expect((await replayJournal(await read)).strokesApplied).toBe(1);
		expect(workers).toHaveLength(0);
		expect(idb.records).toHaveLength(2);

		// a reload's store reads the log back
		const replay = await replayJournal(await createJournalStore().open());
		expect(replay.strokesApplied).toBe(1);
		expect(replay.doc.frames[0].glyph[0]).toBe(glyphWord(65, 0));
	});

	it('keeps the journal in memory where IndexedDB refuses too', async () => {
		const workers = environment({ opfs: false, idb: fakeIndexedDB({ refuse: true }) });
		const store = createJournalStore();
		await store.rewrite(createJournal(doc()));
		expect(await store.appendStroke(glyphRecord)).toBe(false);
		expect((await replayJournal(await store.open())).strokesApplied).toBe(1);
		expect(workers).toHaveLength(0);
		expect(await createJournalStore().open()).toHaveLength(0);
	});

	it('time the page spends hidden does not count toward a worker call deadline', async () => {
		vi.useFakeTimers();
		let hidden = false;
		const visibility = vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
		const turn = value => {
			hidden = value;
			document.dispatchEvent(new Event('visibilitychange'));
		};
		// a worker frozen with its tab never answers
		vi.stubGlobal(
			'Worker',
			class {
				postMessage() {}

				terminate() {}
			},
		);
		vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } });
		try {
			let outcome = 'pending';
			createJournalStore()
				.open()
				.catch(error => {
					outcome = error.message;
				});
			await vi.advanceTimersByTimeAsync(4000);
			turn(true);
			await vi.advanceTimersByTimeAsync(60000);
			turn(false);
			await vi.advanceTimersByTimeAsync(5900);
			expect(outcome).toBe('pending');
			await vi.advanceTimersByTimeAsync(100);
			expect(outcome).toBe('journal worker timed out on read');
		} finally {
			visibility.mockRestore();
			vi.useRealTimers();
		}
	});

	it('gives up on an OPFS probe that never answers and journals through IndexedDB', async () => {
		vi.useFakeTimers();
		try {
			const idb = fakeIndexedDB();
			const workers = environment({ opfs: true, idb });
			vi.stubGlobal('navigator', { storage: { getDirectory: () => new Promise(() => {}) } });
			const store = createJournalStore();
			const written = store.rewrite(Uint8Array.of(7));
			await vi.advanceTimersByTimeAsync(10100);
			await written;
			expect(workers).toHaveLength(0);
			expect(idb.records.map(r => [...r])).toEqual([[7]]);
		} finally {
			vi.useRealTimers();
		}
	});

	it('keeps a journal left in IndexedDB there once OPFS answers', async () => {
		const idb = fakeIndexedDB();
		const workers = environment({ opfs: true, idb });
		// the first boot's probe runs out of time: the journal lands in
		// IndexedDB and the profile remembers that
		vi.useFakeTimers();
		try {
			vi.stubGlobal('navigator', { storage: { getDirectory: () => new Promise(() => {}) } });
			const written = createJournalStore().rewrite(Uint8Array.of(9, 9));
			await vi.advanceTimersByTimeAsync(10100);
			await written;
		} finally {
			vi.useRealTimers();
		}
		expect(localStorage.getItem('text0wnz-journal-home')).toBe('idb');
		// the next boot's probe answers at once, and must not abandon it
		vi.stubGlobal('navigator', { storage: { getDirectory: () => Promise.resolve({}) } });
		expect([...(await createJournalStore().open())]).toEqual([9, 9]);
		expect(workers).toHaveLength(0);
	});

	it('stays on OPFS when its calls fail after the probe, leaving an older IndexedDB journal unread', async () => {
		const idb = fakeIndexedDB();
		idb.records.push(await createJournal(doc()));
		const workers = environment({
			opfs: true,
			idb,
			error: 'NoModificationAllowedError',
		});
		const store = createJournalStore();
		await expect(store.open()).rejects.toThrow(/NoModificationAllowedError/);
		await expect(store.rewrite(createJournal(doc()))).rejects.toThrow(
			/NoModificationAllowedError/,
		);
		expect(workers).toHaveLength(1);
		expect(idb.opens).toBe(0);
		expect(localStorage.getItem('text0wnz-journal-home')).toBe('opfs');
	});

	it('keeps a journal that lives in OPFS there through a failed probe', async () => {
		// one bad boot must not fork the journal into IndexedDB, where
		// the next boot would never look
		localStorage.setItem('text0wnz-journal-home', 'opfs');
		const idb = fakeIndexedDB();
		const workers = environment({ opfs: false, idb });
		const store = createJournalStore();
		await expect(store.rewrite(Uint8Array.of(8))).rejects.toThrow(/UnknownError/);
		expect(workers).toHaveLength(1);
		expect(idb.opens).toBe(0);
	});
});
