/**
 * Room persistence through the shared codecs; legacy v2 session files
 * (<room>.bin, BinaryText + SAUCE) migrate on first load.
 * (No @ts-check: node builtin types are not in the repo's TS lib set.)
 */

import { createHash } from 'node:crypto';
import {
	copyFile,
	mkdir,
	open,
	readdir,
	readFile,
	rename,
	rm,
} from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { ROOM_NAME_RE } from './utils.js';

/**
 * Temp sibling, then rename over the target (atomic on POSIX): a
 * crash mid-write would otherwise tear the envelope or sidecar in
 * place.
 * @param {string} file @param {Uint8Array | string} data
 */
const writeFileAtomic = async (file, data) => {
	const tmp = `${file}.tmp-${process.pid}`;
	const handle = await open(tmp, 'w');
	try {
		// fsync before rename: the rename can survive a power loss the
		// data did not, leaving a truncated file at the final name
		await handle.writeFile(data);
		await handle.sync();
	} finally {
		await handle.close();
	}
	await rename(tmp, file);
};

/** crash leftovers: .tmp-<pid> siblings a crash never renamed */
export const sweepTempFiles = async dir => {
	let entries;
	try {
		entries = await readdir(dir);
	} catch {
		return; // no sessions dir yet
	}
	for (const entry of entries) {
		if ((/\.tmp-\d+$/).test(entry)) {
			await rm(path.join(dir, entry), { force: true });
		}
	}
};

/** session files under mixed-case room names (written before room
 * names lowercased) are unreachable, so boot renames them; with a
 * lowercase twin present it is ambiguous, so both stay and it warns */
export const migrateSessionCase = async dir => {
	let entries;
	try {
		entries = await readdir(dir);
	} catch {
		return; // no sessions dir yet
	}
	// judge twins against the real listing, not existsSync: on a
	// case-insensitive filesystem existsSync(lower) sees the SAME file
	// and would skip the legal case-change rename
	const names = new Set(entries);
	for (const entry of entries) {
		const match = entry.match(/^(.+?)\.(0wnz|state\.json|bin)$/);
		if (!match || !ROOM_NAME_RE.test(match[1]) || !(/[A-Z]/).test(match[1])) {
			continue;
		}
		const lower = `${match[1].toLowerCase()}.${match[2]}`;
		if (names.has(lower)) {
			console.warn(`[Server] ${entry} shadowed by ${lower}; left in place`);
			continue;
		}
		await rename(path.join(dir, entry), path.join(dir, lower));
		// two mixed-case twins lowering to one name: the second stays
		names.add(lower);
	}
};

/**
 * One save at a time per room, or the interval timer, onRoomEmpty, and
 * shutdown interleave writes to the same files.
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
	const settled = next
		.catch(() => undefined)
		.then(() => {
			// a drained queue frees its key: client-chosen names must
			// not grow the map for the life of the process
			if (saveQueues.get(roomName) === settled) {
				saveQueues.delete(roomName);
			}
		});
	saveQueues.set(roomName, settled);
	return next;
};

/** test seam and ops debugging: queues currently holding a key */
export const pendingSaves = () => saveQueues.size;
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
	// the room's join palette is our own 8-bit objects: never guess
	const { doc } = joinDocToDoc(join, { paletteDepth: 8 });
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

/** legacy v2 session file (BinaryText + SAUCE) */
const legacyFile = (dir, roomName) => path.join(dir, `${roomName}.bin`);

/**
 * Copies the saved envelope aside only when its sha1 changed since the
 * last backup.
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
	// the hash records only a backup that EXISTS, or a transient copy
	// failure skips this content forever
	lastHashes.set(roomName, sha1);
	return file;
};

/**
 * The legacy .bin goes too, or erasing a migrated room's art silently
 * resurrects it on the next join. Serialized behind the room's save
 * queue: racing an in-flight save would re-create these files.
 * @param {string} dir @param {string} roomName
 */
export const removeRoomFiles = (dir, roomName) =>
	serialized(roomName, async () => {
		await rm(roomFile(dir, roomName), { force: true });
		await rm(stateFile(dir, roomName), { force: true });
		await rm(legacyFile(dir, roomName), { force: true });
	});

/**
 * Sidecar, then the native envelope, then the legacy v2 .bin (the
 * migration).
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
	const legacy = legacyFile(dir, roomName);
	if (existsSync(legacy)) {
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

