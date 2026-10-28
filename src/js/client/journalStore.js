// @ts-check
/**
 * Autosave journal store. Backend, probed once per store:
 * - OPFS sync-access handles in a worker (journalWorker.js) wherever
 *   `navigator.storage.getDirectory()` resolves (Safari 15.2+,
 *   Chromium, Firefox 111+),
 * - an IndexedDB record log where it is missing or rejects (Safari
 *   15.0-15.1, Firefox private windows, Playwright's WebKit),
 * - an in-memory log where IndexedDB refuses too (autosave then does
 *   not survive the tab).
 *
 * An OPFS call that fails after the probe never falls back, as in a
 * second tab, whose sync-access handle fails on the lock the first
 * tab holds: the IndexedDB log may hold a journal from an earlier
 * episode, and restoring that is worse than the u16 snapshot.
 *
 * The store owns append/compaction bookkeeping; the journal FORMAT
 * (records, replay, torn tails) lives in core/journal.ts.
 */

import { shouldCompact } from '../core/index';
import { trustedMessage } from './messageGuard.js';
import { visibleTimeout } from './visibleWait.js';

/**
 * @typedef {object} JournalBackend
 * @property {() => Promise<Uint8Array>} read
 * @property {(bytes: Uint8Array) => Promise<unknown>} append
 * @property {(bytes: Uint8Array) => Promise<unknown>} rewrite
 * @property {() => Promise<unknown>} wipe
 * @property {() => Promise<unknown>} close
 */

const IDB_NAME = 'text0wnz-journal';
const IDB_STORE = 'records';

/** @returns {JournalBackend} */
const createOpfsBackend = () => {
	const worker = new Worker(new URL('./journalWorker.js', import.meta.url), { type: 'module' });
	let nextId = 1;
	/** @type {Map<number, {resolve: (v: Uint8Array | null) => void, reject: (e: Error) => void}>} */
	const pending = new Map();
	worker.onmessage = event => {
		if (!trustedMessage(event)) {
			return;
		}
		const { id, ok, bytes, error } = event.data;
		const entry = pending.get(id);
		if (!entry) {
			return;
		}
		pending.delete(id);
		if (ok) {
			entry.resolve(bytes ?? null);
		} else {
			entry.reject(new Error(error));
		}
	};
	/**
	 * @param {string} op
	 * @param {Uint8Array} [bytes]
	 * @returns {Promise<Uint8Array | null>}
	 */
	const call = (op, bytes) =>
		new Promise((resolve, reject) => {
			const id = nextId++;
			// a dead worker must degrade (legacy restore, warn-and-continue
			// writes), never wedge callers awaiting a reply forever
			const cancel = visibleTimeout(() => {
				if (pending.delete(id)) {
					reject(new Error(`journal worker timed out on ${op}`));
				}
			}, 10000);
			pending.set(id, {
				resolve: value => {
					cancel();
					resolve(value);
				},
				reject: error => {
					cancel();
					reject(error);
				},
			});
			if (bytes) {
				// copy so the caller keeps its view; the buffer transfers
				const copy = new Uint8Array(bytes);
				worker.postMessage({ id, op, bytes: copy }, [copy.buffer]);
			} else {
				worker.postMessage({ id, op });
			}
		});
	return {
		read: async () => (await call('read')) ?? new Uint8Array(0),
		append: bytes => call('append', bytes),
		rewrite: bytes => call('rewrite', bytes),
		wipe: () => call('wipe'),
		close: async () => {
			await call('close').catch(() => undefined);
			worker.terminate();
		},
	};
};

/** @returns {Promise<IDBDatabase>} */
const openIdb = () =>
	new Promise((resolve, reject) => {
		const request = indexedDB.open(IDB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(IDB_STORE)) {
				request.result.createObjectStore(IDB_STORE, { autoIncrement: true });
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
const idbRequest = request =>
	new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});

/** @returns {JournalBackend} */
const createIdbBackend = () => {
	/**
	 * Each record is one appended byte chunk; read concatenates.
	 * @template T
	 * @param {IDBTransactionMode} mode
	 * @param {(store: IDBObjectStore) => Promise<T>} fn
	 * @returns {Promise<T>}
	 */
	const withStore = async (mode, fn) => {
		const db = await openIdb();
		try {
			const store = db.transaction(IDB_STORE, mode).objectStore(IDB_STORE);
			return await fn(store);
		} finally {
			db.close();
		}
	};
	return {
		read: () =>
			withStore('readonly', async store => {
				/** @type {Uint8Array[]} */
				const chunks = await idbRequest(store.getAll());
				const total = chunks.reduce((sum, c) => sum + c.length, 0);
				const out = new Uint8Array(total);
				let at = 0;
				for (const chunk of chunks) {
					out.set(chunk, at);
					at += chunk.length;
				}
				return out;
			}),
		append: bytes =>
			withStore('readwrite', store =>
				idbRequest(store.add(new Uint8Array(bytes)))),
		rewrite: bytes =>
			withStore('readwrite', async store => {
				await idbRequest(store.clear());
				await idbRequest(store.add(new Uint8Array(bytes)));
			}),
		wipe: () => withStore('readwrite', store => idbRequest(store.clear())),
		close: async () => {},
	};
};

/** @returns {JournalBackend} */
export const createMemoryBackend = () => {
	/** @type {Uint8Array[]} */
	let chunks = [];
	return {
		read: async () => {
			const total = chunks.reduce((sum, c) => sum + c.length, 0);
			const out = new Uint8Array(total);
			let at = 0;
			for (const chunk of chunks) {
				out.set(chunk, at);
				at += chunk.length;
			}
			return out;
		},
		append: async bytes => {
			chunks.push(new Uint8Array(bytes));
		},
		rewrite: async bytes => {
			chunks = [new Uint8Array(bytes)];
		},
		wipe: async () => {
			chunks = [];
		},
		close: async () => {},
	};
};

// every journal call waits on the pick, so a probe that never answers
// must give up like a dead worker does, not wedge the restore
const OPFS_PROBE_MS = 10000;

// set once OPFS has held this profile's journal: the next boot looks
// for it there, so a slow or failed probe must not move it
const OPFS_HOME = 'text0wnz-journal-opfs';

const opfsIsHome = () => {
	try {
		return localStorage.getItem(OPFS_HOME) === '1';
	} catch {
		return false;
	}
};

/** @returns {Promise<unknown>} */
const probeOpfs = () =>
	new Promise((resolve, reject) => {
		const answer = navigator.storage.getDirectory();
		const cancel = visibleTimeout(
			() => reject(new Error('OPFS probe timed out')),
			OPFS_PROBE_MS,
		);
		answer.then(
			dir => {
				cancel();
				resolve(dir);
			},
			error => {
				cancel();
				reject(error);
			},
		);
	});

/**
 * A profile whose journal already lives in OPFS stays there through a
 * slow or failed probe: demoting would fork the journal into IndexedDB,
 * where the next boot never looks, and the worker's own deadlines
 * degrade a truly dead OPFS.
 * @returns {Promise<JournalBackend>}
 */
const pickBackend = async () => {
	try {
		if (typeof Worker !== 'undefined') {
			try {
				await probeOpfs();
			} catch (error) {
				if (!opfsIsHome()) {
					throw error;
				}
			}
			try {
				localStorage.setItem(OPFS_HOME, '1');
			} catch {
				// the flag only steadies the next boot's choice
			}
			return createOpfsBackend();
		}
	} catch {
		// fall through
	}
	try {
		(await openIdb()).close();
		return createIdbBackend();
	} catch {
		// fall through
	}
	return createMemoryBackend();
};

/**
 * @param {object} [options]
 * @param {JournalBackend} [options.backend]
 * @param {{bytes?: number, strokes?: number}} [options.compactLimits]
 */
export const createJournalStore = (options = {}) => {
	/** @type {JournalBackend} */
	let backend;
	let bytesSinceKeyframe = 0;
	let strokesSinceKeyframe = 0;
	// Strokes extend only a keyframe this session wrote. The file
	// starts out with whatever an earlier session left, and a failed
	// rewrite leaves it without the doc-level change the strokes queued
	// behind that rewrite were drawn on.
	let baseline = false;
	// an append that runs while a rewrite still holds a slot sits ahead
	// of it, so that rewrite's snapshot already holds the stroke
	let rewritesQueued = 0;
	// every call queues behind the probe, so all of them run on the
	// one backend it picks, in the order they were made
	/** @type {Promise<unknown>} */
	let chain = (options.backend ? Promise.resolve(options.backend) : pickBackend())
		.then(picked => {
			backend = picked;
		});
	// a closed worker never answers, so a later call would wait out its
	// whole deadline, and a rewrite would find the worker half torn down
	/** @type {Promise<unknown> | null} */
	let closing = null;

	/**
	 * Serialize backend calls; a failed write never breaks the chain.
	 * @template T
	 * @param {() => Promise<T>} fn
	 * @returns {Promise<T>}
	 */
	const enqueue = fn => {
		if (closing) {
			return Promise.reject(new Error('journal store is closed'));
		}
		const next = chain.then(fn);
		chain = next.catch(() => undefined);
		return next;
	};

	return {
		/** Raw journal bytes as persisted (may be empty). */
		open: () => enqueue(() => backend.read()),
		/**
		 * Resolves true when the journal needs a keyframe no queued
		 * rewrite will write: compaction is due, or the stroke was
		 * dropped for want of a baseline.
		 * @param {Uint8Array} bytes
		 */
		appendStroke: bytes =>
			enqueue(async () => {
				if (!baseline) {
					return rewritesQueued === 0;
				}
				try {
					await backend.append(bytes);
				} catch (error) {
					// replay stops at a torn record, so a stroke appended past
					// one would never come back
					baseline = false;
					throw error;
				}
				bytesSinceKeyframe += bytes.length;
				strokesSinceKeyframe += 1;
				return (
					rewritesQueued === 0 &&
					shouldCompact(
						{ bytesSinceKeyframe, strokesSinceKeyframe },
						options.compactLimits,
					)
				);
			}),
		/**
		 * Takes its queue slot at call time and awaits the bytes inside
		 * it, so a stroke appended after this call lands behind the
		 * rewrite, however long the encode runs.
		 * @param {Uint8Array | Promise<Uint8Array>} bytes whole journal:
		 *   keyframe or compaction
		 */
		rewrite: bytes => {
			const ready = Promise.resolve(bytes);
			// a snapshot that rejects while earlier writes still run would
			// otherwise report as unhandled before its slot rethrows it
			ready.catch(() => undefined);
			rewritesQueued += 1;
			return enqueue(async () => {
				baseline = false;
				try {
					await backend.rewrite(await ready);
				} finally {
					rewritesQueued -= 1;
				}
				baseline = true;
				bytesSinceKeyframe = 0;
				strokesSinceKeyframe = 0;
			});
		},
		/**
		 * Empties the journal behind every earlier call. Strokes then
		 * drop until a later rewrite lands, as at boot.
		 */
		wipe: () =>
			enqueue(async () => {
				baseline = false;
				bytesSinceKeyframe = 0;
				strokesSinceKeyframe = 0;
				await backend.wipe();
			}),
		/** Lets go of the backend behind every earlier call. */
		close: () => (closing ??= enqueue(() => backend.close())),
	};
};
