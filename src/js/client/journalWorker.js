/**
 * OPFS journal worker (PLAN §3.2): owns the autosave journal file via
 * createSyncAccessHandle, which only exists in workers (Safari 15.2+).
 * (No @ts-check: FileSystemSyncAccessHandle and the worker-scoped
 * postMessage overloads are not in the repo's TS lib set; the JSDoc
 * below is documentation, not checked types.)
 * The main thread talks to it through journalStore.js's tiny RPC:
 * every message is `{ id, op, bytes? }` and every reply is
 * `{ id, ok, bytes?, error? }`.
 *
 * Crash safety: two generation files (journal.a / journal.b) plus a
 * one-byte meta file naming the active one. Appends go to the active
 * generation and flush; a rewrite (compaction / fresh keyframe) writes
 * the INACTIVE generation completely, flushes it, then flips the meta
 * byte. A crash mid-rewrite leaves the old generation intact; a crash
 * mid-append leaves a torn tail the journal format already tolerates.
 */

import { trustedMessage } from './messageGuard.js';

const META_FILE = 'journal.meta';
const GENERATIONS = ['journal.a', 'journal.b'];

/** @type {FileSystemDirectoryHandle | null} */
let root = null;
/** @type {FileSystemSyncAccessHandle | null} */
let meta = null;
/** @type {number} index into GENERATIONS */
let active = 0;
/** @type {FileSystemSyncAccessHandle | null} */
let handle = null;

/**
 * @param {string} name
 * @returns {Promise<FileSystemSyncAccessHandle>}
 */
const openHandle = async name => {
	if (!root) {
		throw new Error('journal worker not initialized');
	}
	const file = await root.getFileHandle(name, { create: true });
	return file.createSyncAccessHandle();
};

/**
 * @param {FileSystemSyncAccessHandle} h
 * @returns {Uint8Array}
 */
const readAll = h => {
	const size = h.getSize();
	const bytes = new Uint8Array(size);
	if (size > 0) {
		h.read(bytes, { at: 0 });
	}
	return bytes;
};

const init = async () => {
	root = await navigator.storage.getDirectory();
	meta = await openHandle(META_FILE);
	const flag = new Uint8Array(1);
	if (meta.getSize() > 0) {
		meta.read(flag, { at: 0 });
	}
	active = flag[0] === 1 ? 1 : 0;
	handle = await openHandle(GENERATIONS[active]);
};

/** @param {number} index */
const setActive = index => {
	if (!meta) {
		throw new Error('journal worker not initialized');
	}
	const flag = Uint8Array.of(index === 1 ? 1 : 0);
	meta.truncate(0);
	meta.write(flag, { at: 0 });
	meta.flush();
	active = index;
};

/** @returns {FileSystemSyncAccessHandle} */
const activeHandle = () => {
	if (!handle) {
		throw new Error('journal file is closed');
	}
	return handle;
};

/** @type {Record<string, (bytes?: Uint8Array) => Promise<Uint8Array | null>>} */
const ops = {
	read: async () => readAll(activeHandle()),
	append: async bytes => {
		if (!bytes) {
			throw new Error('append needs bytes');
		}
		const h = activeHandle();
		h.write(bytes, { at: h.getSize() });
		h.flush();
		return null;
	},
	rewrite: async bytes => {
		if (!bytes) {
			throw new Error('rewrite needs bytes');
		}
		const next = active === 0 ? 1 : 0;
		const nextHandle = await openHandle(GENERATIONS[next]);
		nextHandle.truncate(0);
		nextHandle.write(bytes, { at: 0 });
		nextHandle.flush();
		setActive(next);
		const old = activeHandle();
		handle = nextHandle;
		old.truncate(0);
		old.flush();
		old.close();
		return null;
	},
	wipe: async () => {
		const h = activeHandle();
		h.truncate(0);
		h.flush();
		return null;
	},
	close: async () => {
		handle?.close();
		meta?.close();
		handle = null;
		meta = null;
		return null;
	},
};

/** @type {Promise<void> | null} */
let ready = null;

self.onmessage = async event => {
	if (!trustedMessage(event) || typeof event.data.op !== 'string') {
		return;
	}
	const { id, op, bytes } = event.data;
	try {
		if (!ready) {
			ready = init();
		}
		await ready;
		const fn = ops[op];
		if (!fn) {
			throw new Error(`unknown journal op ${op}`);
		}
		const result = await fn(bytes);
		if (result instanceof Uint8Array) {
			self.postMessage({ id, ok: true, bytes: result }, [result.buffer]);
		} else {
			self.postMessage({ id, ok: true });
		}
	} catch (error) {
		self.postMessage({
			id,
			ok: false,
			error: String((error && error.message) || error),
		});
	}
};
