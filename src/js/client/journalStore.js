// @ts-check
/**
 * Autosave journal store (PLAN §3.2): the client side of the OPFS
 * journal. Picks a backend at open time:
 * - OPFS sync-access handles in a worker (journalWorker.js) wherever
 *   `navigator.storage.getDirectory` exists (Safari 15.2+, Chromium,
 *   Firefox 111+),
 * - an IndexedDB record log otherwise (Safari 15.0-15.1),
 * - an in-memory log as the last resort (private windows that refuse
 *   both; autosave then simply does not survive the tab).
 *
 * The store owns append/compaction bookkeeping; the journal FORMAT
 * (records, replay, torn tails) lives in core/journal.ts. Backends are
 * injectable for tests.
 */

import { shouldCompact } from '../core/index';

/**
 * @typedef {object} JournalBackend
 * @property {string} kind
 * @property {() => Promise<Uint8Array>} read
 * @property {(bytes: Uint8Array) => Promise<unknown>} append
 * @property {(bytes: Uint8Array) => Promise<unknown>} rewrite
 * @property {() => Promise<unknown>} wipe
 * @property {() => Promise<unknown>} close
 */

const IDB_NAME = 'text0wnz-journal';
const IDB_STORE = 'records';

// --------------------------------------------------------- OPFS backend

/** @returns {JournalBackend} */
const createOpfsBackend = () => {
	const worker = new Worker(new URL('./journalWorker.js', import.meta.url), { type: 'module' });
	let nextId = 1;
	/** @type {Map<number, {resolve: (v: Uint8Array | null) => void, reject: (e: Error) => void}>} */
	const pending = new Map();
	worker.onmessage = event => {
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
			pending.set(id, { resolve, reject });
			if (bytes) {
				// Copy so the caller keeps its view; the buffer transfers
				const copy = new Uint8Array(bytes);
				worker.postMessage({ id, op, bytes: copy }, [copy.buffer]);
			} else {
				worker.postMessage({ id, op });
			}
		});
	return {
		kind: 'opfs',
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

// ---------------------------------------------------- IndexedDB backend

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
		kind: 'idb',
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

// ------------------------------------------------------- memory backend

/** @returns {JournalBackend} */
export const createMemoryBackend = () => {
	/** @type {Uint8Array[]} */
	let chunks = [];
	return {
		kind: 'memory',
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

/** @returns {JournalBackend} */
const pickBackend = () => {
	try {
		if (
			typeof navigator !== 'undefined' &&
			navigator.storage &&
			typeof navigator.storage.getDirectory === 'function' &&
			typeof Worker !== 'undefined'
		) {
			return createOpfsBackend();
		}
	} catch {
		// fall through
	}
	try {
		if (typeof indexedDB !== 'undefined') {
			return createIdbBackend();
		}
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
	const backend = options.backend ?? pickBackend();
	let bytesSinceKeyframe = 0;
	let strokesSinceKeyframe = 0;
	/** @type {Promise<unknown>} */
	let chain = Promise.resolve();

	/**
	 * Serialize backend calls; a failed write never breaks the chain.
	 * @template T
	 * @param {() => Promise<T>} fn
	 * @returns {Promise<T>}
	 */
	const enqueue = fn => {
		const next = chain.then(fn);
		chain = next.catch(() => undefined);
		return next;
	};

	return {
		backendKind: backend.kind,
		/** Raw journal bytes as persisted (may be empty). */
		open: () => enqueue(() => backend.read()),
		/**
		 * Append one stroke record. Resolves true when compaction is due.
		 * @param {Uint8Array} bytes
		 */
		appendStroke: bytes =>
			enqueue(async () => {
				await backend.append(bytes);
				bytesSinceKeyframe += bytes.length;
				strokesSinceKeyframe += 1;
				return shouldCompact(
					{ bytesSinceKeyframe, strokesSinceKeyframe },
					options.compactLimits,
				);
			}),
		/**
		 * Replace the whole journal (fresh keyframe / compaction).
		 * @param {Uint8Array} bytes
		 */
		rewrite: bytes =>
			enqueue(async () => {
				await backend.rewrite(bytes);
				bytesSinceKeyframe = 0;
				strokesSinceKeyframe = 0;
			}),
		wipe: () =>
			enqueue(async () => {
				await backend.wipe();
				bytesSinceKeyframe = 0;
				strokesSinceKeyframe = 0;
			}),
		stats: () => ({ bytesSinceKeyframe, strokesSinceKeyframe }),
		close: () => enqueue(() => backend.close()),
	};
};
