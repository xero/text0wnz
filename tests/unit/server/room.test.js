/**
 * Room protocol semantics: vanilla Moebius behavior
 * transcribed from upstream plus our policy deltas, driven through
 * fake clients so the whole surface tests without sockets. Policy
 * pins: the password gates spectators, spectators cannot draw but
 * CAN chat and hear chat, SET_CANVAS_SIZE relays the sender's id,
 * the do-not-diverge rule (default relay never
 * persisted), and the row-aware resize (v2 moves cells by linear
 * offset, scrambling rows).
 */
import { describe, it, expect, vi } from 'vitest';
import { createRoom, SERVER_CAPS, ROOM_DEFAULTS } from '../../../src/js/server/room.js';
import {
	MoebiusAction as A,
	MoebiusStatus,
	T0wnzAction,
	EXT_SUITE_CAP,
	expandExtCells,
	timelapseToDoc,
	uncompressBlocks,
} from '../../../src/js/core/index';
import { paletteColor } from '../../../src/js/core/doc.js';

const fakeClient = () => {
	const frames = [];
	return {
		frames,
		send: vi.fn((type, data) => frames.push({ type, data })),
		last: () => frames.at(-1),
		ofType: type => frames.filter(f => f.type === type),
	};
};

const joinEditor = (room, nick = 'xero', extra = {}) => {
	const client = fakeClient();
	room.connect(client, { nick, group: 'impure', pass: '', ...extra });
	return client;
};

const joinSpectator = (room, extra = {}) => {
	const client = fakeClient();
	room.connect(client, { ...extra });
	return client;
};

describe('connect', () => {
	it('replies with the upstream shapes for editors and spectators', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const editor = joinEditor(room);
		const reply = editor.last();
		expect(reply.type).toBe(A.CONNECTED);
		expect(reply.data.id).toBe(0);
		// upstream computes the users list BEFORE adding the joiner
		expect(reply.data.users).toEqual([]);
		expect(reply.data.chat_history).toEqual([]);
		expect(reply.data.doc.compressed_data).toBeDefined();
		expect(reply.data.caps).toBeUndefined(); // vanilla sees vanilla

		const spectator = joinSpectator(room);
		const spec = spectator.last();
		expect(spec.type).toBe(A.CONNECTED);
		// the second joiner's list carries the first (sans self)
		const second = fakeClient();
		room.connect(second, { nick: 'peer' });
		expect(second.ofType(A.CONNECTED)[0].data.users).toEqual([
			{ id: 0, nick: 'xero', group: 'impure', status: MoebiusStatus.ACTIVE },
			{ id: 1, nick: undefined, group: '', status: MoebiusStatus.WEB },
		]);
		expect(spec.data.users).toBeUndefined(); // upstream spectator shape
		expect(spec.data.doc).toBeDefined();
	});

	it('caps-aware clients get a caps field back', () => {
		const room = createRoom();
		const client = fakeClient();
		room.connect(client, { nick: 'x', caps: ['batch1']});
		expect(client.last().data.caps).toEqual([...SERVER_CAPS]);
	});

	it('the password gates spectators too', () => {
		const room = createRoom({ password: 'hunter2' });
		const spectator = fakeClient();
		expect(room.connect(spectator, {})).toBe(false);
		expect(spectator.last().type).toBe(A.REFUSED);
		const editor = fakeClient();
		expect(room.connect(editor, { nick: 'x', pass: 'wrong' })).toBe(false);
		const ok = fakeClient();
		expect(room.connect(ok, { nick: 'x', pass: 'hunter2' })).toBe(true);
	});

	it('an empty password refuses without opening the cooldown', () => {
		const room = createRoom({ password: 'pw' });
		for (let i = 0; i < 4; i++) {
			const probe = fakeClient();
			expect(room.connect(probe, {})).toBe(false);
			expect(probe.last().type).toBe(A.REFUSED);
		}
		const ok = fakeClient();
		expect(room.connect(ok, { nick: 'x', pass: 'pw' })).toBe(true);
	});

	it('spectators can be disabled entirely', () => {
		const room = createRoom({ spectators: { enabled: false } });
		const spectator = fakeClient();
		expect(room.connect(spectator, {})).toBe(false);
		expect(spectator.last().type).toBe(A.REFUSED);
	});

	it('broadcasts JOIN to registered users', () => {
		const room = createRoom();
		const first = joinEditor(room, 'a');
		joinEditor(room, 'b');
		const join = first.ofType(A.JOIN).at(-1);
		expect(join.data.nick).toBe('b');
	});
});

describe('draw', () => {
	it('applies, bounds-checks, and fans out including spectators, excluding sender', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const artist = joinEditor(room);
		const peer = joinEditor(room, 'peer');
		const spectator = joinSpectator(room);
		const block = { code: 219, fg: 12, bg: 4 };
		room.message(artist, { type: A.DRAW, data: { x: 1, y: 1, block, id: 0 } });
		expect(peer.ofType(A.DRAW)).toHaveLength(1);
		expect(spectator.ofType(A.DRAW)).toHaveLength(1);
		expect(artist.ofType(A.DRAW)).toHaveLength(0); // no self echo
		// out of bounds drops silently (upstream behavior)
		room.message(artist, {
			type: A.DRAW,
			data: { x: 99, y: 0, block, id: 0 },
		});
		expect(peer.ofType(A.DRAW)).toHaveLength(1);
		// the doc mutated: a fresh join sees the cell
		const late = joinEditor(room, 'late');
		const doc = late.ofType(A.CONNECTED)[0].data.doc;
		const blocks = uncompressBlocks(doc.compressed_data, 8);
		expect(blocks[1 * 4 + 1]).toEqual(block);
	});

	it('spectators cannot draw by default', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const editor = joinEditor(room);
		const spectator = joinSpectator(room);
		room.message(spectator, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 1 },
		});
		expect(editor.ofType(A.DRAW)).toHaveLength(0);
		expect(room.stats().opLogLength).toBe(0);
	});
});

describe('chat (spectators chat and hear chat)', () => {
	it('spectator chat reaches editors and spectators', () => {
		const room = createRoom();
		const editor = joinEditor(room);
		const spectator = joinSpectator(room);
		const lurker = joinSpectator(room);
		room.message(spectator, {
			type: A.CHAT,
			data: { id: 1, nick: 'ghost', group: '', text: 'hi from the void' },
		});
		expect(editor.ofType(A.CHAT)).toHaveLength(1);
		expect(lurker.ofType(A.CHAT)).toHaveLength(1);
		expect(room.chatHistory()).toHaveLength(1);
	});

	it('caps text length and history size, renames ride chat', () => {
		const room = createRoom();
		const a = joinEditor(room, 'before');
		joinEditor(room, 'peer');
		room.message(a, {
			type: A.CHAT,
			data: { id: 0, nick: 'after', group: 'new', text: 'x'.repeat(500) },
		});
		const entry = room.chatHistory()[0];
		expect(entry.text.length).toBeLessThanOrEqual(ROOM_DEFAULTS.chatTextLimit);
		expect(entry.nick).toBe('after');
	});
});

describe('settings and canvas', () => {
	it('persists sauce/ice/9px/font and fans out to spectators', () => {
		const room = createRoom();
		const editor = joinEditor(room);
		const spectator = joinSpectator(room);
		room.message(editor, { type: A.ICE_COLORS, data: { value: true, id: 0 } });
		room.message(editor, { type: A.USE_9PX_FONT, data: { value: true, id: 0 } });
		room.message(editor, {
			type: A.CHANGE_FONT,
			data: { font_name: 'Topaz 1200', id: 0 },
		});
		room.message(editor, {
			type: A.SAUCE,
			data: { title: 't', author: 'a', group: 'g', comments: '', id: 0 },
		});
		expect(spectator.ofType(A.ICE_COLORS)).toHaveLength(1);
		const doc = room.toJoinDoc();
		expect(doc.ice_colors).toBe(true);
		expect(doc.use_9px_font).toBe(true);
		expect(doc.font_name).toBe('Topaz 1200');
		expect(doc.title).toBe('t');
	});

	it('SET_CANVAS_SIZE resizes row-aware and relays the id', () => {
		const room = createRoom({ columns: 3, rows: 2 });
		const editor = joinEditor(room);
		const peer = joinEditor(room, 'peer');
		room.message(editor, {
			type: A.DRAW,
			data: { x: 2, y: 1, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		room.message(editor, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 5, rows: 3, id: 0 },
		});
		const relayed = peer.ofType(A.SET_CANVAS_SIZE)[0];
		expect(relayed.data.id).toBe(0);
		// row-aware: the cell stays at (2,1), not at linear offset
		const late = joinEditor(room, 'late');
		const doc = late.ofType(A.CONNECTED)[0].data.doc;
		const blocks = uncompressBlocks(doc.compressed_data, 15);
		expect(blocks[1 * 5 + 2].code).toBe(65);
		expect(blocks[2 * 3 + 2]?.code ?? 32).toBe(32);
	});

	it('rejects absurd sizes', () => {
		const room = createRoom();
		const editor = joinEditor(room);
		room.message(editor, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 99999, rows: 2, id: 0 },
		});
		expect(room.stats().columns).toBe(ROOM_DEFAULTS.columns);
	});

	it('honors per-room resize walls in either direction (env knob)', () => {
		// a cautious host LOWERS the wall below the compiled-in default
		const room = createRoom({ maxColumns: 200, maxRows: 500 });
		const editor = joinEditor(room);
		room.message(editor, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 201, rows: 100, id: 0 },
		});
		expect(room.stats().columns).toBe(ROOM_DEFAULTS.columns);
		room.message(editor, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 100, rows: 501, id: 0 },
		});
		expect(room.stats().rows).toBe(ROOM_DEFAULTS.rows);
		room.message(editor, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 200, rows: 500, id: 0 },
		});
		expect(room.stats().columns).toBe(200);
		expect(room.stats().rows).toBe(500);

		// a jam host RAISES it past the default (kept tiny-rowed so the
		// test doesn't allocate a jam-sized doc; the wall math is what's
		// under test)
		const jam = createRoom({ maxColumns: 1200, maxRows: 30 });
		const artist = joinEditor(jam);
		jam.message(artist, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 1100, rows: 30, id: 0 },
		});
		expect(jam.stats().columns).toBe(1100);
		expect(jam.stats().rows).toBe(30);
	});
});

describe('relay tier and misc', () => {
	it('default relay (cursor, palette) reaches registered users only, never persists', () => {
		const room = createRoom();
		const a = joinEditor(room, 'a');
		const b = joinEditor(room, 'b');
		const spectator = joinSpectator(room);
		room.message(a, { type: A.CURSOR, data: { x: 1, y: 2, id: 0 } });
		room.message(a, {
			type: A.CHANGE_PALETTE,
			data: { lospec_palette_name: 'vga', id: 0 },
		});
		expect(b.ofType(A.CURSOR)).toHaveLength(1);
		expect(b.ofType(A.CHANGE_PALETTE)).toHaveLength(1);
		expect(spectator.ofType(A.CURSOR)).toHaveLength(0);
		expect(spectator.ofType(A.CHANGE_PALETTE)).toHaveLength(0);
		expect(room.stats().opLogLength).toBe(0); // never persisted
	});

	it('SET_BG is swallowed like upstream', () => {
		const room = createRoom();
		const a = joinEditor(room, 'a');
		const b = joinEditor(room, 'b');
		room.message(a, { type: A.SET_BG, data: { value: 1, id: 0 } });
		expect(b.ofType(A.SET_BG)).toHaveLength(0);
	});

	it('unknown extension ids flow only BETWEEN caps-aware clients', () => {
		const room = createRoom();
		const vanilla = joinEditor(room, 'v');
		const capsy = fakeClient();
		const capsy2 = fakeClient();
		room.connect(capsy, { nick: 'c', caps: []});
		room.connect(capsy2, { nick: 'c2', caps: []});
		room.message(vanilla, { type: 42, data: { id: 0 } });
		expect(capsy.ofType(42)).toHaveLength(0); // vanilla sender dropped
		room.message(capsy, { type: 42, data: { id: 1 } });
		// caps sender relays to caps peers; vanilla never sees unknown shapes
		expect(capsy2.ofType(42)).toHaveLength(1);
		expect(vanilla.ofType(42)).toHaveLength(0);
	});

	it('STATUS echoes to self and others', () => {
		const room = createRoom();
		const a = joinEditor(room, 'a');
		const b = joinEditor(room, 'b');
		room.message(a, { type: A.STATUS, data: { id: 0, status: 2 } });
		expect(a.ofType(A.STATUS)).toHaveLength(1);
		expect(b.ofType(A.STATUS)).toHaveLength(1);
	});

	it('disconnect broadcasts LEAVE', () => {
		const room = createRoom();
		const a = joinEditor(room, 'a');
		const b = joinEditor(room, 'b');
		room.disconnect(b);
		expect(a.ofType(A.LEAVE)[0].data.id).toBe(1);
		expect(room.stats().memberCount).toBe(1);
	});

	it('frames before CONNECTED are dropped', () => {
		const room = createRoom();
		const stranger = fakeClient();
		room.message(stranger, { type: A.DRAW, data: {} });
		expect(room.stats().opLogLength).toBe(0);
	});
});

describe('extension suite v1 (t0wnz-ext-1)', () => {
	const joinCaps = (room, nick) =>
		joinEditor(room, nick, { caps: [EXT_SUITE_CAP]});
	const extCell = {
		u: 0x4e2d, // CJK: no cp437 home
		a: 0,
		fg: 0xff8800,
		bg: paletteColor(0),
	};

	it('caps joiners get the advertised suite and a full-fidelity sync', () => {
		const room = createRoom({ columns: 3, rows: 1 });
		const caps = joinCaps(room, 'caps');
		expect(caps.ofType(A.CONNECTED)[0].data.caps).toEqual([EXT_SUITE_CAP]);
		const sync = caps.ofType(T0wnzAction.EXT_SYNC)[0];
		expect(sync.data.columns).toBe(3);
		expect(sync.data.seq).toBe(0);
		const cells = expandExtCells(sync.data.cells, 3);
		expect(cells[0]).toEqual({
			u: 32,
			a: 0,
			fg: paletteColor(7),
			bg: paletteColor(0),
		});
	});

	it('EXT_DRAW reaches caps peers natively and vanilla peers down-converted', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const sender = joinCaps(room, 'sender');
		const capsPeer = joinCaps(room, 'peer');
		const vanilla = joinEditor(room, 'van');
		room.message(sender, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 1, y: 0, ...extCell, id: 0 },
		});
		const native = capsPeer.ofType(T0wnzAction.EXT_DRAW)[0];
		expect(native.data).toEqual({ x: 1, y: 0, ...extCell, id: 0, seq: 1 });
		const down = vanilla.ofType(A.DRAW)[0];
		expect(down.data.block.code).toBe(63); // '?' substitute
		expect(down.data.block.fg).toBeLessThan(16);
		// the sender's ack carries the same seq
		expect(sender.ofType(T0wnzAction.EXT_ACK)[0].data.seq).toBe(1);
		// late joiners: vanilla sees the projection, caps sees the truth
		const lateVan = joinEditor(room, 'late');
		const doc = lateVan.ofType(A.CONNECTED)[0].data.doc;
		expect(uncompressBlocks(doc.compressed_data, 8)[1].code).toBe(63);
		const lateCaps = joinCaps(room, 'latecaps');
		const sync = lateCaps.ofType(T0wnzAction.EXT_SYNC)[0];
		expect(expandExtCells(sync.data.cells, 8)[1]).toEqual(extCell);
	});

	it('vanilla mutations carry seq to caps peers and stay verbatim for vanilla', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const caps = joinCaps(room, 'caps');
		const vanA = joinEditor(room, 'a');
		const vanB = joinEditor(room, 'b');
		room.message(vanA, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 1 },
		});
		expect(caps.ofType(A.DRAW)[0].data.seq).toBe(1);
		expect(vanB.ofType(A.DRAW)[0].data.seq).toBeUndefined();
		// vanilla senders get no ack
		expect(vanA.ofType(T0wnzAction.EXT_ACK)).toHaveLength(0);
	});

	it('a caps client sees a contiguous seq stream across own and remote ops', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const caps = joinCaps(room, 'caps');
		const van = joinEditor(room, 'van');
		const block = { code: 65, fg: 7, bg: 0 };
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 0, y: 0, ...extCell, id: 0 },
		});
		room.message(van, { type: A.DRAW, data: { x: 1, y: 0, block, id: 1 } });
		room.message(caps, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 3, rows: 2, id: 0 },
		});
		const seqs = caps.frames
			.map(f => f.data.seq)
			.filter(s => typeof s === 'number');
		// the join-time EXT_SYNC anchors the stream; acks (own ops) and
		// broadcasts (remote ops) continue it without a gap
		expect(seqs).toEqual([0, 1, 2, 3]);
	});

	it('EXT_DRAW_BATCH is one op natively and per-cell DRAWs for vanilla', () => {
		const room = createRoom({ columns: 4, rows: 1 });
		const sender = joinCaps(room, 'sender');
		const capsPeer = joinCaps(room, 'peer');
		const vanilla = joinEditor(room, 'van');
		room.message(sender, {
			type: T0wnzAction.EXT_DRAW_BATCH,
			data: {
				cells: [
					{ x: 0, y: 0, ...extCell },
					{ x: 9, y: 9, ...extCell }, // out of bounds: skipped
					{ x: 2, y: 0, ...extCell },
				],
				id: 0,
			},
		});
		const native = capsPeer.ofType(T0wnzAction.EXT_DRAW_BATCH);
		expect(native).toHaveLength(1);
		expect(native[0].data.cells).toHaveLength(2);
		expect(native[0].data.seq).toBe(1);
		expect(vanilla.ofType(A.DRAW)).toHaveLength(2);
		expect(sender.ofType(T0wnzAction.EXT_ACK)).toHaveLength(1);
		expect(room.stats().opLogLength).toBe(1);
	});

	it('EXT_PALETTE updates caps peers, the vanilla join palette, and reprojections', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const sender = joinCaps(room, 'sender');
		const capsPeer = joinCaps(room, 'peer');
		const vanilla = joinEditor(room, 'van');
		// an RGB cell that quantizes against the CURRENT palette
		room.message(sender, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 0, y: 0, u: 65, a: 0, fg: 0x123456, bg: paletteColor(0), id: 0 },
		});
		const palette = new Array(16).fill(0x000000);
		palette[1] = 0x123456;
		room.message(sender, {
			type: T0wnzAction.EXT_PALETTE,
			data: { palette, id: 0 },
		});
		expect(capsPeer.ofType(T0wnzAction.EXT_PALETTE)[0].data.palette).toEqual(
			palette,
		);
		// vanilla peers get nothing in-session (upstream precedent)...
		expect(vanilla.ofType(T0wnzAction.EXT_PALETTE)).toHaveLength(0);
		// ...but late vanilla joiners see the classic 16 as the
		// ancestor's 8-bit {r,g,b} shape (it resolves 6-bit arrays to
		// black)
		const late = joinEditor(room, 'late');
		const joinPalette = late.ofType(A.CONNECTED)[0].data.doc.palette;
		expect(joinPalette[1]).toEqual({ r: 0x12, g: 0x34, b: 0x56 });
	});

	it('ice toggles reproject stored blink folds for vanilla viewers', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinCaps(room, 'caps');
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: {
				x: 0,
				y: 0,
				u: 65,
				a: 1, // blink
				fg: paletteColor(7),
				bg: paletteColor(1),
				id: 0,
			},
		});
		const before = joinEditor(room, 'before');
		const doc1 = before.ofType(A.CONNECTED)[0].data.doc;
		expect(uncompressBlocks(doc1.compressed_data, 2)[0].bg).toBe(9);
		room.message(caps, { type: A.ICE_COLORS, data: { value: true, id: 0 } });
		const after = joinEditor(room, 'after');
		const doc2 = after.ofType(A.CONNECTED)[0].data.doc;
		expect(uncompressBlocks(doc2.compressed_data, 2)[0].bg).toBe(1);
	});

	it('EXT_SYNC replies on request; caps spectators receive but cannot draw', () => {
		const room = createRoom({ columns: 2, rows: 1, syncCooldownMs: 0 });
		const caps = joinCaps(room, 'caps');
		const spectator = fakeClient();
		room.connect(spectator, { caps: [EXT_SUITE_CAP]});
		expect(spectator.ofType(T0wnzAction.EXT_SYNC)).toHaveLength(1);
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 0, y: 0, ...extCell, id: 0 },
		});
		expect(spectator.ofType(T0wnzAction.EXT_DRAW)).toHaveLength(1);
		room.message(spectator, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 1, y: 0, ...extCell, id: 1 },
		});
		expect(room.stats().opLogLength).toBe(1); // spectator draw dropped
		room.message(caps, { type: T0wnzAction.EXT_SYNC, data: { id: 0 } });
		const syncs = caps.ofType(T0wnzAction.EXT_SYNC);
		expect(syncs).toHaveLength(2); // join + requested
		expect(syncs[1].data.seq).toBe(1);
	});

	it('ext frames from caps-less clients are dropped', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinCaps(room, 'caps');
		const vanilla = joinEditor(room, 'van');
		room.message(vanilla, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 0, y: 0, ...extCell, id: 1 },
		});
		expect(caps.ofType(T0wnzAction.EXT_DRAW)).toHaveLength(0);
		expect(room.stats().opLogLength).toBe(0);
	});

	it('EXT_TIMELAPSE replays to the live doc even after op-log eviction', () => {
		// tiny log: draws 3-6 evict 1-2 into the baseline
		const room = createRoom({
			columns: 4,
			rows: 1,
			opLogLimit: 2,
			syncCooldownMs: 0,
		});
		const caps = joinCaps(room, 'caps');
		for (let i = 0; i < 6; i++) {
			room.message(caps, {
				type: T0wnzAction.EXT_DRAW,
				data: {
					x: i % 4,
					y: 0,
					u: 65 + i,
					a: 0,
					fg: paletteColor(7),
					bg: paletteColor(0),
					id: 0,
				},
			});
		}
		room.message(caps, { type: T0wnzAction.EXT_TIMELAPSE, data: { id: 0 } });
		const reply = caps.ofType(T0wnzAction.EXT_TIMELAPSE)[0];
		expect(reply.data.ops).toHaveLength(2);
		const { doc } = timelapseToDoc(reply.data);
		// the last frame equals the live doc: ops A..F land across x0-x3
		// (wrapping), so the final cells are E F C D with E,F from the log
		// and C,D absorbed into the baseline
		const last = doc.frames.length - 1;
		const codeAt = x =>
			doc.glyphTable.get(doc.getCell(last, x, 0).glyph & 0xffff)?.codepoint;
		expect([codeAt(0), codeAt(1), codeAt(2), codeAt(3)]).toEqual([69, 70, 67, 68]);
	});

	it('extState/loadState round-trips full fidelity across a restart', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinCaps(room, 'caps');
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 1, y: 0, ...extCell, id: 0 },
		});
		const palette = new Array(16).fill(0x101010);
		room.message(caps, {
			type: T0wnzAction.EXT_PALETTE,
			data: { palette, id: 0 },
		});
		const saved = room.toJoinDoc();
		saved.data = uncompressBlocks(saved.compressed_data, 2);
		delete saved.compressed_data;
		saved.ext = room.extState();

		const restarted = createRoom({ columns: 2, rows: 1 });
		restarted.loadState(saved);
		const rejoin = joinCaps(restarted, 'rejoin');
		const sync = rejoin.ofType(T0wnzAction.EXT_SYNC)[0];
		expect(expandExtCells(sync.data.cells, 2)[1]).toEqual(extCell);
		expect(sync.data.palette).toEqual(palette);
	});
});


describe('hostile input hardening', () => {
	const joinCaps = (room, nick) =>
		joinEditor(room, nick, { caps: [EXT_SUITE_CAP]});

	it('folds surrogate DRAW codes so the ext projection stays saveable', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const editor = joinEditor(room, 'evil');
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 0xd800, fg: 7, bg: 0 }, id: 0 },
		});
		// a poisoned cell must never make saves throw (data loss)
		const ext = room.extState();
		expect(() => expandExtCells(ext.cells, 2)).not.toThrow();
		expect(expandExtCells(ext.cells, 2)[0].u).toBe(63);
	});

	it('acks refused mutations so caps clients can book off and resync', () => {
		const room = createRoom({ columns: 4, rows: 2, maxColumns: 100, maxRows: 100 });
		const caps = joinCaps(room, 'caps');
		room.message(caps, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 500, rows: 2, id: 0 },
		});
		const ack = caps.ofType(T0wnzAction.EXT_ACK)[0];
		expect(ack.data.refused).toBe(true);
		expect(ack.data.seq).toBe(0); // nothing was accepted
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: { x: 99, y: 0, u: 65, a: 0, fg: 0, bg: 0, id: 0 },
		});
		expect(
			caps.ofType(T0wnzAction.EXT_ACK).filter(f => f.data.refused),
		).toHaveLength(2);
	});

	it('clamps SAUCE fields and broadcasts a whitelisted shape', () => {
		const room = createRoom();
		const sender = joinEditor(room, 'a');
		const peer = joinCaps(room, 'b');
		room.message(sender, {
			type: A.SAUCE,
			data: {
				title: 'x'.repeat(5000),
				author: 'me',
				seq: 999999, // smuggle attempt
				junk: 'y'.repeat(5000),
				id: 42, // forged
			},
		});
		const frame = peer.ofType(A.SAUCE)[0];
		expect(frame.data.title.length).toBe(35);
		expect(frame.data.junk).toBeUndefined();
		expect(frame.data.id).toBe(0); // the server-known id
		// the smuggled seq is REPLACED by the server's stamp, not relayed
		expect(frame.data.seq).toBe(1);
	});

	it('CHAT never relays smuggled fields to peers', () => {
		const room = createRoom();
		const sender = joinEditor(room, 'a');
		const peer = joinEditor(room, 'b');
		room.message(sender, {
			type: A.CHAT,
			data: { nick: 'a', text: 'hi', seq: 2147483647, evil: true },
		});
		const frame = peer.ofType(A.CHAT)[0];
		expect(frame.data.seq).toBeUndefined();
		expect(frame.data.evil).toBeUndefined();
	});

	it('short EXT_PALETTE still bridges a FULL 16-entry vanilla palette', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinCaps(room, 'caps');
		room.message(caps, {
			type: T0wnzAction.EXT_PALETTE,
			data: { palette: [0xff0000], id: 0 },
		});
		const late = joinEditor(room, 'late');
		const joinPalette = late.ofType(A.CONNECTED)[0].data.doc.palette;
		expect(joinPalette).toHaveLength(16);
		expect(joinPalette[0]).toEqual({ r: 0xff, g: 0, b: 0 });
	});

	it('rate-limits EXT_SYNC requests per user', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinCaps(room, 'caps');
		// the join sync consumed the first slot
		room.message(caps, { type: T0wnzAction.EXT_SYNC, data: { id: 0 } });
		room.message(caps, { type: T0wnzAction.EXT_SYNC, data: { id: 0 } });
		expect(caps.ofType(T0wnzAction.EXT_SYNC)).toHaveLength(1);
	});

	it('rebuilds mutation relays with the server-known id', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const sender = joinEditor(room, 'a');
		const peer = joinEditor(room, 'b');
		room.message(sender, {
			type: A.ICE_COLORS,
			data: { value: true, id: 42 },
		});
		room.message(sender, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 3, rows: 2, id: 42 },
		});
		expect(peer.ofType(A.ICE_COLORS)[0].data.id).toBe(0);
		expect(peer.ofType(A.SET_CANVAS_SIZE)[0].data.id).toBe(0);
	});
});

describe('convergence fuzz', () => {
	it('every peer converges on the server doc under a seeded op storm', () => {
		const mulberry32 = seed => () => {
			seed |= 0;
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const rand = mulberry32(0xc0117ab);
		const room = createRoom({ columns: 20, rows: 10 });

		// each client keeps a local replica: own ops apply locally at
		// send (apply-locally-on-send), received DRAW/RESIZE apply too
		const makeReplica = () => ({
			columns: 20,
			rows: 10,
			cells: new Map(),
		});
		const applyDraw = (replica, data) => {
			if (data.x < replica.columns && data.y < replica.rows) {
				replica.cells.set(`${data.x},${data.y}`, data.block.code);
			}
		};
		const applyResize = (replica, data) => {
			replica.columns = data.columns;
			replica.rows = data.rows;
			for (const key of [...replica.cells.keys()]) {
				const [cx, cy] = key.split(',').map(Number);
				if (cx >= data.columns || cy >= data.rows) {
					replica.cells.delete(key);
				}
			}
		};

		const replicas = [];
		const clients = [];
		for (let i = 0; i < 3; i++) {
			const replica = makeReplica();
			replicas.push(replica);
			const client = {
				send: (type, data) => {
					if (type === A.DRAW) {
						applyDraw(replica, data);
					}
					if (type === A.SET_CANVAS_SIZE) {
						applyResize(replica, data);
					}
				},
			};
			clients.push(client);
			room.connect(client, { nick: `fuzz${i}` });
		}

		for (let op = 0; op < 600; op++) {
			const who = Math.floor(rand() * 3);
			const replica = replicas[who];
			if (rand() < 0.95) {
				const data = {
					x: Math.floor(rand() * replica.columns),
					y: Math.floor(rand() * replica.rows),
					block: { code: 33 + Math.floor(rand() * 90), fg: 7, bg: 0 },
					id: who,
				};
				applyDraw(replica, data); // apply-locally-on-send
				room.message(clients[who], { type: A.DRAW, data });
			} else {
				const data = {
					columns: 10 + Math.floor(rand() * 30),
					rows: 5 + Math.floor(rand() * 15),
					id: who,
				};
				applyResize(replica, data);
				room.message(clients[who], { type: A.SET_CANVAS_SIZE, data });
			}
		}

		const serverDoc = room.toJoinDoc();
		const serverBlocks = uncompressBlocks(
			serverDoc.compressed_data,
			serverDoc.columns * serverDoc.rows,
		);
		for (const replica of replicas) {
			expect(replica.columns).toBe(serverDoc.columns);
			expect(replica.rows).toBe(serverDoc.rows);
			for (let y = 0; y < serverDoc.rows; y++) {
				for (let x = 0; x < serverDoc.columns; x++) {
					const server = serverBlocks[y * serverDoc.columns + x].code;
					const local = replica.cells.get(`${x},${y}`) ?? 32;
					expect(local, `cell ${x},${y}`).toBe(server);
				}
			}
		}
	});
});

describe('review-pass regressions', () => {
	it('repeated bad passwords open a cooldown that refuses even the right one', () => {
		vi.useFakeTimers();
		try {
			vi.setSystemTime(1_000_000);
			const room = createRoom({ password: 'pw' });
			const bad = () => {
				const c = fakeClient();
				return room.connect(c, { nick: 'x', pass: 'nope' });
			};
			expect(bad()).toBe(false);
			expect(bad()).toBe(false);
			expect(bad()).toBe(false);
			// three failures opened a 500ms window; the right password
			// still refuses inside it
			const blocked = fakeClient();
			expect(room.connect(blocked, { nick: 'x', pass: 'pw' })).toBe(false);
			vi.advanceTimersByTime(600);
			const fresh = fakeClient();
			expect(room.connect(fresh, { nick: 'x', pass: 'pw' })).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('loadState renormalizes 6-bit array join palettes from old sidecars', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const palette = Array.from({ length: 16 }, () => [0, 0, 0]);
		palette[1] = [4, 12, 32];
		room.loadState({
			columns: 2,
			rows: 1,
			data: Array.from({ length: 2 }, () => ({ code: 32, fg: 7, bg: 0 })),
			palette,
		});
		const van = joinEditor(room, 'van');
		const joined = van.ofType(A.CONNECTED)[0].data.doc;
		// expand6to8 top-two-bit replication: 4 -> 16, 12 -> 48, 32 -> 130
		expect(joined.palette[1]).toEqual({ r: 16, g: 48, b: 130 });
	});

	it('loadState rebuilds the vanilla bridge from exact ext palette words', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const words = new Array(16).fill(0);
		words[0] = 0x123456;
		room.loadState({
			columns: 2,
			rows: 1,
			data: Array.from({ length: 2 }, () => ({ code: 32, fg: 7, bg: 0 })),
			palette: Array.from({ length: 16 }, () => [0, 0, 0]),
			ext: { palette: words },
		});
		const van = joinEditor(room, 'van');
		const joined = van.ofType(A.CONNECTED)[0].data.doc;
		// the 6-bit join shape lost the low bits; the ext words did not
		expect(joined.palette[0]).toEqual({ r: 0x12, g: 0x34, b: 0x56 });
	});

	it('EXT_TIMELAPSE ops carry only the wire fields', () => {
		const room = createRoom({ columns: 2, rows: 1, syncCooldownMs: 0 });
		const caps = joinEditor(room, 'caps', { caps: [EXT_SUITE_CAP]});
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: {
				x: 0,
				y: 0,
				u: 65,
				a: 0,
				fg: paletteColor(7),
				bg: paletteColor(0),
				id: 0,
			},
		});
		room.message(caps, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 3, rows: 1, id: 0 },
		});
		room.message(caps, { type: T0wnzAction.EXT_TIMELAPSE, data: {} });
		const reply = caps.ofType(T0wnzAction.EXT_TIMELAPSE)[0];
		expect(reply.data.ops.length).toBeGreaterThanOrEqual(2);
		for (const op of reply.data.ops) {
			// weight is internal byte accounting, never wire contract
			expect(Object.keys(op).sort()).toEqual(['data', 'seq', 't', 'type']);
		}
	});

	it('isBlank sees near-black ext art as content', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinEditor(room, 'caps', { caps: [EXT_SUITE_CAP]});
		room.message(caps, {
			type: T0wnzAction.EXT_DRAW,
			data: {
				x: 0,
				y: 0,
				u: 32,
				a: 0,
				fg: paletteColor(7),
				bg: 0x0a0a0a,
				id: 0,
			},
		});
		// the vanilla mirror quantizes the bg to 0, but the rider is art
		expect(room.isBlank()).toBe(false);
	});

	it('isBlank sees an ext palette as content', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const caps = joinEditor(room, 'caps', { caps: [EXT_SUITE_CAP]});
		room.message(caps, {
			type: T0wnzAction.EXT_PALETTE,
			data: { palette: new Array(16).fill(0x101010), id: 0 },
		});
		expect(room.isBlank()).toBe(false);
	});

	it('isBlank sees sauce metadata as content', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const editor = joinEditor(room, 'e');
		room.message(editor, { type: A.SAUCE, data: { title: 't', id: 0 } });
		expect(room.isBlank()).toBe(false);
	});

	it('isBlank sees a font change as content', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const editor = joinEditor(room, 'e');
		room.message(editor, {
			type: A.CHANGE_FONT,
			data: { font_name: 'Topaz 437 8x16', id: 0 },
		});
		expect(room.isBlank()).toBe(false);
	});

	it('isBlank: draw then erase is blank again', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const editor = joinEditor(room, 'e');
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		expect(room.isBlank()).toBe(false);
		room.message(editor, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 32, fg: 7, bg: 0 }, id: 0 },
		});
		expect(room.isBlank()).toBe(true);
	});

	it('isBlank: ice and 9px toggles alone stay blank', () => {
		const room = createRoom({ columns: 2, rows: 1 });
		const editor = joinEditor(room, 'e');
		room.message(editor, { type: A.ICE_COLORS, data: { value: true, id: 0 } });
		room.message(editor, {
			type: A.USE_9PX_FONT,
			data: { value: true, id: 0 },
		});
		// one-click toggles are not content; counting them would make
		// nearly every dirty room undeletable
		expect(room.isBlank()).toBe(true);
	});

	it('a mid-session CONNECTED is never relayed (no pass leak)', () => {
		const room = createRoom();
		const a = joinEditor(room, 'a');
		const b = joinEditor(room, 'b');
		room.message(a, {
			type: A.CONNECTED,
			data: { nick: 'evil', pass: 'sniffme', id: 0 },
		});
		expect(b.ofType(A.CONNECTED)).toHaveLength(1); // only its own
		expect(JSON.stringify(b.frames)).not.toContain('sniffme');
	});

	it('DRAW broadcasts the sanitized cell with the server-known id', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const a = joinEditor(room, 'a');
		const b = joinEditor(room, 'b');
		room.message(a, {
			type: A.DRAW,
			data: { x: 1, y: 0, block: { code: -5, fg: 999, bg: 3 }, id: 42 },
		});
		const frame = b.ofType(A.DRAW)[0];
		expect(frame.data.block).toEqual({ code: 32, fg: 7, bg: 3 });
		expect(frame.data.id).toBe(0); // the server's id, never the claim
	});

	it('back-to-back resizes all apply (no throttle: a dropped resize diverges apply-locally senders, and the dialect has no resync)', () => {
		const room = createRoom({ columns: 10, rows: 10 });
		const a = joinEditor(room, 'a');
		room.message(a, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 20, rows: 20, id: 0 },
		});
		room.message(a, {
			type: A.SET_CANVAS_SIZE,
			data: { columns: 30, rows: 30, id: 0 },
		});
		expect(room.stats().columns).toBe(30);
	});

	it('markClean with a stale token keeps mutations dirty', () => {
		const room = createRoom({ columns: 4, rows: 2 });
		const a = joinEditor(room, 'a');
		room.message(a, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		const token = room.dirtyToken();
		// a mutation lands while the save is "in flight"
		room.message(a, {
			type: A.DRAW,
			data: { x: 1, y: 0, block: { code: 66, fg: 7, bg: 0 }, id: 0 },
		});
		room.markClean(token);
		expect(room.isDirty()).toBe(true);
		room.markClean(room.dirtyToken());
		expect(room.isDirty()).toBe(false);
	});
});
