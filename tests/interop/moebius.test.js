// @vitest-environment node
/**
 * Interop against the PINNED vanilla Moebius server (1.0.29, the one
 * the scene runs): our codec and client semantics versus the vendored
 * blocktronics/moebius server under node. Pins the handshake, the
 * 6-bit object palette the join doc carries, DRAW fanout without self
 * echo, the registered-only blind relay, SET_CANVAS_SIZE and SAUCE
 * round trips, the path-keyed joint, and the upstream quirks our own
 * server deliberately diverges from (nickless password bypass,
 * nickless drawing). Everything spawns locally; never a shared server.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
	MoebiusAction as A,
	joinDocToDoc,
	expand6to8,
} from '../../src/js/core/index';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const fixture = path.join(repoRoot, 'tests/interop/fixtures/moebius/start.js');

const PASS = 'gatekeeper';
let plain = null;
let gated = null;
let plainPort = 0;
let gatedPort = 0;

const bootFixture = (port, pass) =>
	new Promise((resolve, reject) => {
		const child = spawn('node', [fixture, String(port), pass ?? ''], { stdio: ['ignore', 'pipe', 'pipe']});
		const timer = setTimeout(
			() => reject(new Error('fixture did not boot')),
			15000,
		);
		child.stdout.on('data', chunk => {
			if (String(chunk).includes('FIXTURE_READY')) {
				clearTimeout(timer);
				resolve(child);
			}
		});
		child.on('exit', code => {
			clearTimeout(timer);
			reject(new Error(`fixture exited ${code}`));
		});
	});

beforeAll(async () => {
	plainPort = 34000 + Math.floor(Math.random() * 8000);
	gatedPort = plainPort + 1;
	[plain, gated] = await Promise.all([
		bootFixture(plainPort, ''),
		bootFixture(gatedPort, PASS),
	]);
}, 30000);

afterAll(() => {
	plain?.kill('SIGKILL');
	gated?.kill('SIGKILL');
});

const send = (ws, type, data = {}) => ws.send(JSON.stringify({ type, data }));

const nextFrame = (ws, wantType, timeoutMs = 5000) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`timed out waiting for type ${wantType}`)),
			timeoutMs,
		);
		const onMessage = event => {
			const frame = JSON.parse(event.data);
			if (wantType === undefined || frame.type === wantType) {
				clearTimeout(timer);
				ws.removeEventListener('message', onMessage);
				resolve(frame);
			}
		};
		ws.addEventListener('message', onMessage);
	});

const connect = async (port, data, room = 'fixture') => {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/${room}`);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', reject, { once: true });
	});
	const replyPromise = nextFrame(ws);
	send(ws, A.CONNECTED, data);
	const reply = await replyPromise;
	return { ws, reply };
};

const collectTypes = ws => {
	const seen = [];
	ws.addEventListener('message', event => {
		seen.push(JSON.parse(event.data).type);
	});
	return seen;
};

const settle = (ms = 250) => new Promise(r => setTimeout(r, ms));

describe('upstream vanilla Moebius server interop', () => {
	it('handshakes and the 6-bit object palette decodes through our codec', async () => {
		const { ws, reply } = await connect(plainPort, {
			nick: 'codec',
			group: 'impure',
			pass: '',
		});
		expect(reply.type).toBe(A.CONNECTED);
		expect(reply.data.chat_history).toEqual([]);
		expect(reply.data.status).toBe(0);
		// the wire shape itself: sixteen {r,g,b} objects, 6-bit values
		expect(reply.data.doc.palette).toHaveLength(16);
		expect(reply.data.doc.palette[1]).toEqual({ r: 0, g: 0, b: 42 });
		expect(reply.data.doc.font_bytes).toBeUndefined();
		const result = joinDocToDoc(reply.data.doc);
		expect(result.doc.getColumns()).toBe(80);
		expect(result.doc.getRows()).toBe(25);
		expect(result.fontName).toBe('IBM VGA');
		expect(result.fontBytes).toBeNull();
		expect(result.doc.palette[1] & 0xff).toBe(expand6to8(42));
		ws.close();
		await settle(100);
	});

	it('caps in CONNECTED are ignored, not fatal', async () => {
		const { ws, reply } = await connect(plainPort, {
			nick: 'caps',
			pass: '',
			caps: ['t0wnz-ext-1'],
		});
		expect(reply.type).toBe(A.CONNECTED);
		expect(reply.data.caps).toBeUndefined();
		ws.close();
		await settle(100);
	});

	it('a nickless CONNECTED gets the spectator reply and peers see a JOIN', async () => {
		const peer = await connect(plainPort, { nick: 'peer', pass: '' });
		const peerJoin = nextFrame(peer.ws, A.JOIN);
		const spectator = await connect(plainPort, {});
		expect(spectator.reply.type).toBe(A.CONNECTED);
		expect(spectator.reply.data.users).toBeUndefined();
		expect(spectator.reply.data.chat_history).toBeUndefined();
		// our silent probe is exactly this shape: peers see a guest blip
		const join = await peerJoin;
		expect(join.data.nick).toBeUndefined();
		expect(join.data.status).toBe(3); // WEB
		const peerLeave = nextFrame(peer.ws, A.LEAVE);
		spectator.ws.close();
		expect((await peerLeave).data.id).toBe(spectator.reply.data.id);
		peer.ws.close();
		await settle(100);
	});

	it('DRAW fans out to peers and spectators, never echoes the sender', async () => {
		const artist = await connect(plainPort, { nick: 'artist', pass: '' });
		const peer = await connect(plainPort, { nick: 'peer', pass: '' });
		const spectator = await connect(plainPort, {});
		const artistTypes = collectTypes(artist.ws);
		const peerDraw = nextFrame(peer.ws, A.DRAW);
		const spectatorDraw = nextFrame(spectator.ws, A.DRAW);
		send(artist.ws, A.DRAW, {
			x: 3,
			y: 2,
			block: { code: 219, fg: 12, bg: 4 },
			id: artist.reply.data.id,
		});
		const [peerFrame, spectatorFrame] = await Promise.all([
			peerDraw,
			spectatorDraw,
		]);
		expect(peerFrame.data.block.code).toBe(219);
		expect(spectatorFrame.data.block.code).toBe(219);
		await settle();
		expect(artistTypes).not.toContain(A.DRAW);
		const late = await connect(plainPort, { nick: 'late', pass: '' });
		const lateDoc = joinDocToDoc(late.reply.data.doc);
		expect(lateDoc.doc.getCell(0, 3, 2).glyph & 0xffff).toBe(219);
		for (const c of [artist, peer, spectator, late]) {
			c.ws.close();
		}
		await settle(100);
	});

	it('the blind relay (CURSOR) reaches registered users only', async () => {
		const a = await connect(plainPort, { nick: 'a', pass: '' });
		const b = await connect(plainPort, { nick: 'b', pass: '' });
		const spectator = await connect(plainPort, {});
		const spectatorTypes = collectTypes(spectator.ws);
		const bCursor = nextFrame(b.ws, A.CURSOR);
		send(a.ws, A.CURSOR, { x: 1, y: 2, id: a.reply.data.id });
		expect((await bCursor).data.x).toBe(1);
		await settle();
		expect(spectatorTypes).not.toContain(A.CURSOR);
		for (const c of [a, b, spectator]) {
			c.ws.close();
		}
		await settle(100);
	});

	it('SET_CANVAS_SIZE and SAUCE persist and relay with the sender id', async () => {
		const a = await connect(plainPort, { nick: 'resizer', pass: '' });
		const b = await connect(plainPort, { nick: 'watcher', pass: '' });
		const bResize = nextFrame(b.ws, A.SET_CANVAS_SIZE);
		send(a.ws, A.SET_CANVAS_SIZE, {
			columns: 100,
			rows: 30,
			id: a.reply.data.id,
		});
		const frame = await bResize;
		expect(frame.data.columns).toBe(100);
		expect(frame.data.id).toBe(a.reply.data.id);
		const bSauce = nextFrame(b.ws, A.SAUCE);
		send(a.ws, A.SAUCE, {
			title: 'jam',
			author: 'xero',
			group: 'impure',
			comments: '',
			id: a.reply.data.id,
		});
		expect((await bSauce).data.author).toBe('xero');
		const late = await connect(plainPort, { nick: 'afterwards', pass: '' });
		expect(late.reply.data.doc.columns).toBe(100);
		expect(late.reply.data.doc.title).toBe('jam');
		expect(late.reply.data.doc.group).toBe('impure');
		for (const c of [a, b, late]) {
			c.ws.close();
		}
		await settle(100);
	});

	it('only the started joint path answers; any other path is dropped', async () => {
		const dropped = new WebSocket(`ws://127.0.0.1:${plainPort}/server`);
		const outcome = await new Promise(resolve => {
			dropped.addEventListener('open', () => resolve('open'), { once: true });
			dropped.addEventListener('error', () => resolve('error'), { once: true });
			dropped.addEventListener('close', () => resolve('closed'), { once: true });
		});
		expect(outcome).not.toBe('open');
	});

	it('REFUSED on a bad password; upstream lets nickless users BYPASS it and draw', async () => {
		const wrong = await connect(gatedPort, { nick: 'x', pass: 'nope' });
		expect(wrong.reply.type).toBe(A.REFUSED);
		wrong.ws.close();
		const right = await connect(gatedPort, { nick: 'x', pass: PASS });
		expect(right.reply.type).toBe(A.CONNECTED);
		// the two quirks our server refuses to copy: no nick means no
		// password check, and a nickless socket may still DRAW
		const bypass = await connect(gatedPort, {});
		expect(bypass.reply.type).toBe(A.CONNECTED);
		const rightDraw = nextFrame(right.ws, A.DRAW);
		send(bypass.ws, A.DRAW, {
			x: 0,
			y: 0,
			block: { code: 65, fg: 7, bg: 0 },
			id: bypass.reply.data.id,
		});
		expect((await rightDraw).data.block.code).toBe(65);
		right.ws.close();
		bypass.ws.close();
		await settle(100);
	});
});
