/**
 * Room persistence through the shared codecs: the live
 * wire-shaped room doc converts through joinDocToDoc and saves as the
 * native .0wnz envelope. Legacy v2 session files (<room>.bin,
 * BinaryText + SAUCE) migrate on first load through the core BIN
 * codec. Hourly backups are sha1-deduped:
 * a timestamped copy lands only when the content hash changed.
 * (No @ts-check: node builtin types are not in the repo's TS lib set,
 * same reasoning as journalWorker.js.)
 */

import { createHash } from 'node:crypto';
import {
	copyFile,
	mkdir,
	readFile,
	rename,
	rm,
	writeFile,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Crash-safe replace: write a sibling temp file, then rename over the
 * target (atomic on POSIX). A crash mid-write used to tear the
 * envelope or the sidecar in place.
 * @param {string} file @param {Uint8Array | string} data
 */
const writeFileAtomic = async (file, data) => {
	const tmp = `${file}.tmp-${process.pid}`;
	await writeFile(tmp, data);
	await rename(tmp, file);
};

/**
 * One save at a time per room: the interval timer, onRoomEmpty, and
 * shutdown used to interleave truncating writes to the same files.
 * @type {Map<string, Promise<unknown>>}
 */
const saveQueues = new Map();
/**
 * @template T
 * @param {string} roomName @param {() => Promise<T>} job
 * @returns {Promise<T>}
 */
const serialized = (roomName, job) => {
	const tail = saveQueues.get(roomName) ?? Promise.resolve();
	const next = tail.then(job, job);
	saveQueues.set(
		roomName,
		next.catch(() => undefined),
	);
	return next;
};
import {
	applyExtCells,
	compressExtCells,
	decodeBin,
	decodeEnvelope,
	docToExtCells,
	docToJoinDoc,
	encodeEnvelope,
	expandExtCells,
	joinDocToDoc,
	uncompressBlocks,
} from '../core/index';

/**
 * @param {string} dir sessions directory
 * @param {string} roomName
 */
export const roomFile = (dir, roomName) =>
	path.join(dir, `${roomName}.0wnz`);

/**
 * @param {ReturnType<import('./room.js').createRoom>} room
 * @param {string} dir
 */
export const saveRoom = (room, dir) =>
	serialized(room.name, () => saveRoomNow(room, dir));

/**
 * @param {ReturnType<import('./room.js').createRoom>} room
 * @param {string} dir
 */
const saveRoomNow = async (room, dir) => {
	await mkdir(dir, { recursive: true });
	// token BEFORE the writes: mutations landing mid-write must keep
	// the room dirty for the next save
	const token = room.dirtyToken();
	const join = room.toJoinDoc();
	const ext = room.extState();
	const { doc } = joinDocToDoc(join);
	// the envelope keeps the FULL-fidelity art (unicode cells, extended
	// colors), not the vanilla projection the wire blocks carry
	applyExtCells(doc, expandExtCells(ext.cells, join.columns * join.rows));
	if (ext.palette) {
		doc.palette = Uint32Array.from(ext.palette);
	}
	const bytes = await encodeEnvelope(doc, {
		meta: {
			title: join.title,
			author: join.author,
			group: join.group,
		},
	});
	await writeFileAtomic(roomFile(dir, room.name), bytes);
	// the sidecar keeps full session fidelity (palette, font bytes,
	// comments, chat, ext cells) so a restart never degrades the live
	// room
	await writeFileAtomic(
		stateFile(dir, room.name),
		JSON.stringify({ join, chat: room.chatHistory(), ext }),
	);
	room.markClean(token);
	return bytes;
};

/** @param {string} dir @param {string} roomName */
export const stateFile = (dir, roomName) =>
	path.join(dir, `${roomName}.state.json`);

/**
 * Hourly sha1-deduped backup: copies the saved envelope aside when the
 * hash changed since the last backup.
 * @param {string} dir
 * @param {string} roomName
 * @param {Uint8Array} bytes the just-saved envelope
 * @param {Map<string, string>} lastHashes roomName -> sha1
 */
export const backupRoom = async (dir, roomName, bytes, lastHashes) => {
	const sha1 = createHash('sha1').update(bytes).digest('hex');
	if (lastHashes.get(roomName) === sha1) {
		return null;
	}
	const backupDir = path.join(dir, 'backups');
	await mkdir(backupDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:]/g, '-');
	const file = path.join(backupDir, `${roomName}-${stamp}.0wnz`);
	await copyFile(roomFile(dir, roomName), file);
	// the hash records only a backup that EXISTS: a transient copy
	// failure used to skip this content forever
	lastHashes.set(roomName, sha1);
	return file;
};

/**
 * A throwaway room (blank art, no chat) leaves nothing behind:
 * client-chosen names used to grow two session files and a backup
 * each with no deletion path anywhere.
 * @param {string} dir @param {string} roomName
 */
export const removeRoomFiles = async (dir, roomName) => {
	await rm(roomFile(dir, roomName), { force: true });
	await rm(stateFile(dir, roomName), { force: true });
};

/**
 * Load a room doc: native envelope first, then the legacy v2 .bin
 * (BinaryText + SAUCE, big-endian u16 words), which is the migration.
 * @param {string} dir
 * @param {string} roomName
 * @returns {Promise<import('../core/index').MoebiusJoinDoc | null>}
 */
export const loadRoomDoc = async (dir, roomName) => {
	// the sidecar carries full fidelity; prefer it
	const sidecar = stateFile(dir, roomName);
	if (existsSync(sidecar)) {
		try {
			const saved = JSON.parse(await readFile(sidecar, 'utf8'));
			if (saved && typeof saved === 'object' && saved.join) {
				const join = withData(saved.join);
				join.chat = Array.isArray(saved.chat) ? saved.chat : [];
				join.ext = saved.ext;
				return join;
			}
		} catch {
			// corrupt sidecar: fall through to the envelope
		}
	}
	const native = roomFile(dir, roomName);
	if (existsSync(native)) {
		const decoded = await decodeEnvelope(await readFile(native));
		const doc = decoded.doc ?? decoded;
		const join = withData(docToJoinDoc(doc, decoded.meta ?? {}));
		// the envelope holds full fidelity; ride the ext view alongside
		// the vanilla projection so room.loadState restores both
		join.ext = {
			cells: compressExtCells(docToExtCells(doc)),
			palette: [...doc.palette].map(word => word & 0xffffff),
		};
		return join;
	}
	const legacy = path.join(dir, `${roomName}.bin`);
	if (existsSync(legacy)) {
		// legacy v2 .bin is BinaryText + SAUCE; the core codec decodes it
		// to a v3 doc, and docToJoinDoc projects to wire blocks
		const decoded = decodeBin(await readFile(legacy));
		return withData(docToJoinDoc(decoded.doc, decoded.meta ?? {}));
	}
	return null;
};

/** expand compressed_data into data so room.loadState can adopt it */
const withData = join => {
	if (!join.data && join.compressed_data) {
		join.data = uncompressBlocks(
			join.compressed_data,
			join.columns * join.rows,
		);
		delete join.compressed_data;
	}
	return join;
};

