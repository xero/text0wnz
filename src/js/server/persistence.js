/**
 * Room persistence through the shared codecs (PLAN §3.6.3): the live
 * wire-shaped room doc converts through joinDocToDoc and saves as the
 * native .0wnz envelope. Legacy v2 session files (<room>.bin, the
 * BinaryText + SAUCE format the old server wrote) migrate on first
 * load through the core BIN codec. Hourly backups are sha1-deduped:
 * a timestamped copy lands only when the content hash changed.
 * (No @ts-check: node builtin types are not in the repo's TS lib set,
 * same reasoning as journalWorker.js.)
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import {
	decodeBin,
	decodeEnvelope,
	docToJoinDoc,
	encodeEnvelope,
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
export const saveRoom = async (room, dir) => {
	await mkdir(dir, { recursive: true });
	const join = room.toJoinDoc();
	const { doc } = joinDocToDoc(join);
	const bytes = await encodeEnvelope(doc, {
		meta: {
			title: join.title,
			author: join.author,
			group: join.group,
		},
	});
	await writeFile(roomFile(dir, room.name), bytes);
	room.markClean();
	return bytes;
};

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
	lastHashes.set(roomName, sha1);
	const backupDir = path.join(dir, 'backups');
	await mkdir(backupDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:]/g, '-');
	const file = path.join(backupDir, `${roomName}-${stamp}.0wnz`);
	await copyFile(roomFile(dir, roomName), file);
	return file;
};

/**
 * Load a room doc: native envelope first, then the legacy v2 .bin
 * (BinaryText + SAUCE, big-endian u16 words), which is the migration.
 * @param {string} dir
 * @param {string} roomName
 * @returns {Promise<import('../core/index').MoebiusJoinDoc | null>}
 */
export const loadRoomDoc = async (dir, roomName) => {
	const native = roomFile(dir, roomName);
	if (existsSync(native)) {
		const decoded = await decodeEnvelope(await readFile(native));
		return withData(docToJoinDoc(decoded.doc ?? decoded, decoded.meta ?? {}));
	}
	const legacy = path.join(dir, `${roomName}.bin`);
	if (existsSync(legacy)) {
		// the old server wrote BinaryText + SAUCE; the core codec decodes
		// it to a v3 doc, and docToJoinDoc projects to wire blocks
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

export const expandJoinData = withData;
