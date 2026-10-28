/**
 * Room persistence through the shared codecs: native .0wnz round trip,
 * the legacy v2 .bin migration path, and sha1-deduped hourly backups.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
	saveRoom,
	loadRoomDoc,
	backupRoom,
	migrateSessionCase,
	pendingSaves,
	removeRoomFiles,
	roomFile,
	stateFile,
	sweepTempFiles,
} from '../../../src/js/server/persistence.js';
import { createRoom } from '../../../src/js/server/room.js';
import {
	MoebiusAction as A,
	T0wnzAction,
	EXT_SUITE_CAP,
	createDocV3,
	encodeBin,
	expandExtCells,
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

	it('removeRoomFiles queues behind an in-flight save instead of racing it', async () => {
		const room = createRoom({ name: 'race', columns: 2, rows: 1 });
		const editor = editorIn(room);
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		const save = saveRoom(room, dir);
		const remove = removeRoomFiles(dir, 'race');
		await save;
		await remove;
		expect(existsSync(roomFile(dir, 'race'))).toBe(false);
		expect(existsSync(stateFile(dir, 'race'))).toBe(false);
	});

	it('restores a pre-sweep sidecar whose join palette is 6-bit arrays, then self-heals it', async () => {
		const palette = Array.from({ length: 16 }, () => [0, 0, 0]);
		palette[1] = [4, 12, 32];
		const join = {
			columns: 2,
			rows: 1,
			data: Array.from({ length: 2 }, () => ({ code: 32, fg: 7, bg: 0 })),
			palette,
			title: '',
			author: '',
			group: '',
			comments: '',
		};
		writeFileSync(
			stateFile(dir, 'old'),
			JSON.stringify({ join, chat: []}),
		);
		const saved = await loadRoomDoc(dir, 'old');
		const room = createRoom({ name: 'old', columns: 2, rows: 1 });
		room.loadState(saved);
		const van = {
			frames: [],
			send(type, data) {
				this.frames.push({ type, data });
			},
		};
		room.connect(van, { nick: 'v' });
		const joined = van.frames.find(f => f.type === A.CONNECTED).data.doc;
		// expand6to8 replicates the top two bits: 4 -> 16, 12 -> 48, 32 -> 130
		expect(joined.palette[1]).toEqual({ r: 16, g: 48, b: 130 });
		room.message(van, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		await saveRoom(room, dir);
		const rewritten = JSON.parse(readFileSync(stateFile(dir, 'old'), 'utf8'));
		// the sidecar self-heals into the canonical {r,g,b} shape
		expect(rewritten.join.palette[0]).toHaveProperty('r');
		expect(rewritten.join.palette[1]).toEqual({ r: 16, g: 48, b: 130 });
	});

	it('migrateSessionCase renames mixed-case session files to lowercase', async () => {
		writeFileSync(path.join(dir, 'MiXed.0wnz'), 'a');
		writeFileSync(path.join(dir, 'MiXed.state.json'), 'b');
		writeFileSync(path.join(dir, 'MiXed.bin'), 'c');
		writeFileSync(path.join(dir, 'plain.0wnz'), 'd');
		writeFileSync(path.join(dir, 'we ird.0wnz'), 'e');
		await migrateSessionCase(dir);
		const names = readdirSync(dir).sort();
		expect(names).toContain('mixed.0wnz');
		expect(names).toContain('mixed.state.json');
		expect(names).toContain('mixed.bin');
		expect(names).toContain('plain.0wnz');
		expect(names).toContain('we ird.0wnz');
		expect(names).not.toContain('MiXed.0wnz');
		expect(readFileSync(path.join(dir, 'mixed.0wnz'), 'utf8')).toBe('a');
	});

	// a genuine case twin needs a case-sensitive filesystem; macOS dev
	// machines collapse Both/both into one file
	it.skipIf(process.platform === 'darwin')(
		'leaves both files when the lowercase twin exists',
		async () => {
			writeFileSync(path.join(dir, 'Both.0wnz'), 'UPPER');
			writeFileSync(path.join(dir, 'both.0wnz'), 'lower');
			await migrateSessionCase(dir);
			expect(readFileSync(path.join(dir, 'Both.0wnz'), 'utf8')).toBe('UPPER');
			expect(readFileSync(path.join(dir, 'both.0wnz'), 'utf8')).toBe('lower');
		},
	);

	it('sweepTempFiles removes crash leftovers and nothing else', async () => {
		writeFileSync(path.join(dir, 'foo.0wnz.tmp-123'), 'x');
		writeFileSync(path.join(dir, 'bar.state.json.tmp-9'), 'y');
		writeFileSync(path.join(dir, 'keep.0wnz'), 'z');
		await sweepTempFiles(dir);
		expect(readdirSync(dir)).toEqual(['keep.0wnz']);
		// a missing dir resolves without throwing
		await sweepTempFiles(path.join(dir, 'missing'));
	});

	it('blank-room GC removes the legacy .bin so erased art stays erased', async () => {
		const doc = createDocV3({ columns: 2, rows: 1 });
		doc.setCell(0, 0, 0, {
			glyph: glyphWord(65, 0),
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
		writeFileSync(path.join(dir, 'foo.bin'), encodeBin(doc));
		const saved = await loadRoomDoc(dir, 'foo');
		const room = createRoom({ name: 'foo' });
		room.loadState(saved);
		expect(room.isBlank()).toBe(false);
		const editor = editorIn(room);
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 32, fg: 7, bg: 0 }, id: 0 },
		});
		expect(room.isBlank()).toBe(true);
		await removeRoomFiles(dir, 'foo');
		// at HEAD the .bin survived and re-restored the erased art
		expect(await loadRoomDoc(dir, 'foo')).toBeNull();
	});

	it('save queues evict their key once the tail settles', async () => {
		const room = createRoom({ name: 'evict', columns: 2, rows: 1 });
		const editor = editorIn(room);
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		await saveRoom(room, dir);
		await new Promise(r => setTimeout(r, 0));
		expect(pendingSaves()).toBe(0);
	});

	it('overlapping jobs keep one key then evict', async () => {
		const room = createRoom({ name: 'lap', columns: 2, rows: 1 });
		const editor = editorIn(room);
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		const a = saveRoom(room, dir);
		const b = saveRoom(room, dir);
		const c = removeRoomFiles(dir, 'lap');
		expect(pendingSaves()).toBe(1);
		await Promise.all([a, b, c]);
		await new Promise(r => setTimeout(r, 0));
		expect(pendingSaves()).toBe(0);
		// the delete queued last, so the files lose
		expect(existsSync(roomFile(dir, 'lap'))).toBe(false);
		expect(existsSync(stateFile(dir, 'lap'))).toBe(false);
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

	it('keeps unicode cells and extended colors across a restart, via sidecar AND envelope', async () => {
		const room = createRoom({ name: 'uni', columns: 2, rows: 1 });
		const caps = { send: () => {} };
		room.connect(caps, { nick: 'x', caps: [EXT_SUITE_CAP]});
		const cell = { u: 0x4e2d, a: 1, fg: 0xff8800, bg: paletteColor(0) };
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 1, y: 0, ...cell, id: 0 },
		});
		await saveRoom(room, dir);

		// sidecar path (the normal restart)
		const viaSidecar = await loadRoomDoc(dir, 'uni');
		const restarted = createRoom({ name: 'uni', columns: 2, rows: 1 });
		restarted.loadState(viaSidecar);
		expect(expandExtCells(restarted.extState().cells, 2)[1]).toEqual(cell);

		// envelope path (sidecar lost): fidelity survives because the .0wnz
		// stores the real art, not the vanilla projection
		rmSync(path.join(dir, 'uni.state.json'));
		const viaEnvelope = await loadRoomDoc(dir, 'uni');
		const again = createRoom({ name: 'uni', columns: 2, rows: 1 });
		again.loadState(viaEnvelope);
		expect(expandExtCells(again.extState().cells, 2)[1]).toEqual(cell);
	});

	it('keeps a dark 8-bit palette exact through the envelope leg', async () => {
		// every component under 64, which the wire heuristic would expand
		// if the envelope writer guessed instead of naming the depth
		const room = createRoom({ name: 'dusk', columns: 1, rows: 1 });
		room.loadState({
			columns: 1,
			rows: 1,
			data: [{ code: 32, fg: 7, bg: 0 }],
			palette: Array.from({ length: 16 }, (_, i) => ({ r: i, g: 8, b: 32 })),
		});
		await saveRoom(room, dir);
		rmSync(path.join(dir, 'dusk.state.json'));
		const viaEnvelope = await loadRoomDoc(dir, 'dusk');
		const again = createRoom({ name: 'dusk', columns: 1, rows: 1 });
		again.loadState(viaEnvelope);
		expect(again.toJoinDoc().palette[3]).toEqual({ r: 3, g: 8, b: 32 });
	});
});
