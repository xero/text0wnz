/**
 * Room protocol semantics (PLAN §3.6.3): vanilla Moebius behavior
 * transcribed from upstream plus our policy deltas, driven through
 * fake clients so the whole surface tests without sockets. Policy
 * pins: D12 (password gates spectators), O14 (spectators cannot draw,
 * CAN chat and hear chat), landmine 2 (SET_CANVAS_SIZE relays the
 * sender's id), the do-not-diverge rule (default relay never
 * persisted), and the row-aware resize that fixes v2's scramble.
 */
import { describe, it, expect, vi } from 'vitest';
import { createRoom, SERVER_CAPS, ROOM_DEFAULTS } from '../../../src/js/server/room.js';
import {
	MoebiusAction as A,
	MoebiusStatus,
	uncompressBlocks,
} from '../../../src/js/core/index';

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

	it('D12: the password gates spectators too', () => {
		const room = createRoom({ password: 'hunter2' });
		const spectator = fakeClient();
		expect(room.connect(spectator, {})).toBe(false);
		expect(spectator.last().type).toBe(A.REFUSED);
		const editor = fakeClient();
		expect(room.connect(editor, { nick: 'x', pass: 'wrong' })).toBe(false);
		const ok = fakeClient();
		expect(room.connect(ok, { nick: 'x', pass: 'hunter2' })).toBe(true);
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

	it('O14: spectators cannot draw by default', () => {
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

describe('chat (O14: spectators chat and hear chat)', () => {
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

	it('SET_CANVAS_SIZE resizes row-aware and relays the id (landmine 2)', () => {
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

	it('extension frames only flow from caps-aware clients', () => {
		const room = createRoom();
		const vanilla = joinEditor(room, 'v');
		const capsy = fakeClient();
		room.connect(capsy, { nick: 'c', caps: []});
		room.message(vanilla, { type: 42, data: { id: 0 } });
		expect(capsy.ofType(42)).toHaveLength(0); // vanilla sender dropped
		room.message(capsy, { type: 42, data: { id: 1 } });
		expect(vanilla.ofType(42)).toHaveLength(1); // caps sender relays
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
