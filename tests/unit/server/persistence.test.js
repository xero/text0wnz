/**
 * Room persistence through the shared codecs: native .0wnz round trip,
 * the legacy v2 .bin migration path, and sha1-deduped hourly backups.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	saveRoom,
	loadRoomDoc,
	backupRoom,
	roomFile,
} from '../../../src/js/server/persistence.js';
import { createRoom } from '../../../src/js/server/room.js';
import {
	MoebiusAction as A,
	createDocV3,
	encodeBin,
	glyphWord,
	paletteColor,
} from '../../../src/js/core/index';

let dir;
beforeEach(() => {
	dir = mkdtempSync(path.join(tmpdir(), 't0wnz-persist-'));
});
afterEach(() => {
	rmSync(dir, { recursive: true, force: true });
});

const editorIn = room => {
	const client = { send: () => {} };
	room.connect(client, { nick: 'x' });
	return client;
};

describe('room persistence', () => {
	it('saves and reloads a room doc through the envelope', async () => {
		const room = createRoom({ name: 'art', columns: 6, rows: 3 });
		const editor = editorIn(room);
		room.message(editor, {
			type: A.DRAW,
			data: { x: 4, y: 2, block: { code: 219, fg: 12, bg: 4 }, id: 0 },
		});
		room.message(editor, { type: A.ICE_COLORS, data: { value: true, id: 0 } });
		await saveRoom(room, dir);
		expect(room.isDirty()).toBe(false);

		const loaded = await loadRoomDoc(dir, 'art');
		expect(loaded.columns).toBe(6);
		expect(loaded.rows).toBe(3);
		expect(loaded.ice_colors).toBe(true);
		expect(loaded.data[2 * 6 + 4]).toEqual({ code: 219, fg: 12, bg: 4 });

		const fresh = createRoom({ name: 'art' });
		fresh.loadState(loaded);
		expect(fresh.stats().columns).toBe(6);
	});

	it('migrates a legacy v2 .bin session on first load', async () => {
		// even columns <= 510: the v2 save format constraint
		const doc = createDocV3({ columns: 4, rows: 2 });
		doc.setIceColors(true);
		doc.setCell(0, 3, 1, {
			glyph: glyphWord(88, 0),
			fg: paletteColor(14),
			bg: paletteColor(2),
		});
		writeFileSync(path.join(dir, 'joint.bin'), encodeBin(doc));
		const loaded = await loadRoomDoc(dir, 'joint');
		expect(loaded.columns).toBe(4);
		expect(loaded.ice_colors).toBe(true);
		expect(loaded.data[1 * 4 + 3]).toEqual({ code: 88, fg: 14, bg: 2 });
	});

	it('returns null when nothing is persisted', async () => {
		expect(await loadRoomDoc(dir, 'ghost')).toBeNull();
	});

	it('backups dedupe by content hash', async () => {
		const room = createRoom({ name: 'art', columns: 4, rows: 2 });
		const editor = editorIn(room);
		const hashes = new Map();
		let bytes = await saveRoom(room, dir);
		expect(await backupRoom(dir, 'art', bytes, hashes)).not.toBeNull();
		bytes = await saveRoom(room, dir);
		expect(await backupRoom(dir, 'art', bytes, hashes)).toBeNull();
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		bytes = await saveRoom(room, dir);
		expect(await backupRoom(dir, 'art', bytes, hashes)).not.toBeNull();
		const backups = readdirSync(path.join(dir, 'backups'));
		expect(backups).toHaveLength(2);
		expect(roomFile(dir, 'art').endsWith('art.0wnz')).toBe(true);
	});
});
