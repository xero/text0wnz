// @vitest-environment node
/**
 * Interop against the PINNED upstream server: our codec and
 * client semantics versus the vendored moebiusXBIN v2.2.0 server
 * running under node. Pins the handshake, join-doc decode through
 * joinDocToDoc, no-self-echo DRAW fanout, the registered-only blind
 * relay (CHANGE_PALETTE included), SET_CANVAS_SIZE round trip, and the
 * upstream spectator quirks our own server deliberately diverges from
 * (password bypass). Everything spawns locally; never a shared
 * server.
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
const fixture = path.join(
	repoRoot,
	'tests/interop/fixtures/moebiusxbin/start.js',
);

const PASS = 'gatekeeper';
let plainPort = 0;
let gatedPort = 0;
let fontedPort = 0;

/** every child ever spawned, resolved or not */
const spawned = [];

const bootFixture = (port, pass, env = {}) =>
	new Promise((resolve, reject) => {
		const child = spawn('node', [fixture, String(port), pass ?? ''], {
			stdio: ['ignore', 'pipe', 'inherit'],
			env: { ...process.env, ...env },
		});
		// tracked from the spawn: a boot that times out, or a sibling that
		// fails inside Promise.all, must still be killed in afterAll
		spawned.push(child);
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			reject(new Error('fixture did not boot'));
		}, 15000);
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
	plainPort = 24000 + Math.floor(Math.random() * 8000);
	gatedPort = plainPort + 1;
	fontedPort = plainPort + 2;
	await Promise.all([
		bootFixture(plainPort, ''),
		bootFixture(gatedPort, PASS),
		bootFixture(fontedPort, '', { FIXTURE_FONT_BYTES: '1' }),
	]);
}, 30000);

afterAll(() => {
	for (const child of spawned) {
		child.kill('SIGKILL');
	}
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

const connect = async (port, data) => {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/fixture`);
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

describe('upstream moebiusXBIN server interop', () => {
	it('handshakes and the join doc decodes through our codec', async () => {
		const { ws, reply } = await connect(plainPort, {
			nick: 'codec',
			group: 'impure',
			pass: '',
		});
		expect(reply.type).toBe(A.CONNECTED);
		expect(reply.data.chat_history).toEqual([]);
		const result = joinDocToDoc(reply.data.doc);
		expect(result.doc.getColumns()).toBe(80);
		expect(result.doc.getRows()).toBe(25);
		expect(result.fontName).toBe('IBM VGA');
		// the fork ships 8-bit {r,g,b} objects (vanilla sends 6-bit);
		// the receiver must detect that and NOT expand them again
		expect(reply.data.doc.palette[1]).toEqual({ r: 0, g: 0, b: 0xaa });
		expect(result.doc.palette[1] & 0xff).toBe(0xaa);
		expect(result.doc.palette[9] & 0xff).toBe(0xff);
		expect(expand6to8(0x2a)).toBe(0xaa); // the two spellings agree
		ws.close();
		await settle(100);
	});

	it('an embedded font arrives as Buffer JSON and revives to bytes', async () => {
		// an .xb server file with its font flag set: the fork's own
		// clients throw on this shape (bytes.length is undefined)
		const { ws, reply } = await connect(fontedPort, { nick: 'xb', pass: '' });
		expect(reply.type).toBe(A.CONNECTED);
		expect(reply.data.doc.font_bytes).toMatchObject({ type: 'Buffer' });
		expect(reply.data.doc.font_bytes.data).toHaveLength(4096);
		const result = joinDocToDoc(reply.data.doc);
		expect(result.fontBytes).toBeInstanceOf(Uint8Array);
		expect(result.fontBytes).toHaveLength(4096);
		expect(result.fontBytes[4095]).toBe(0xff);
		ws.close();
		await settle(100);
	});

	it('caps in CONNECTED are ignored, not fatal (negotiation is safe)', async () => {
		const { ws, reply } = await connect(plainPort, {
			nick: 'caps',
			pass: '',
			caps: ['t0wnz-batch'],
		});
		expect(reply.type).toBe(A.CONNECTED);
		expect(reply.data.caps).toBeUndefined();
		ws.close();
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

		// late joiner sees the mutated doc
		const late = await connect(plainPort, { nick: 'late', pass: '' });
		const lateDoc = joinDocToDoc(late.reply.data.doc);
		expect(lateDoc.doc.getCell(0, 3, 2).glyph & 0xffff).toBe(219);
		for (const c of [artist, peer, spectator, late]) {
			c.ws.close();
		}
		await settle(100);
	});

	it('the blind relay (CURSOR, CHANGE_PALETTE) reaches registered users only', async () => {
		const a = await connect(plainPort, { nick: 'a', pass: '' });
		const b = await connect(plainPort, { nick: 'b', pass: '' });
		const spectator = await connect(plainPort, {});
		const spectatorTypes = collectTypes(spectator.ws);
		const bCursor = nextFrame(b.ws, A.CURSOR);
		send(a.ws, A.CURSOR, { x: 1, y: 2, id: a.reply.data.id });
		expect((await bCursor).data.x).toBe(1);
		const bPalette = nextFrame(b.ws, A.CHANGE_PALETTE);
		send(a.ws, A.CHANGE_PALETTE, {
			lospec_palette_name: 'vga',
			id: a.reply.data.id,
		});
		expect((await bPalette).data.lospec_palette_name).toBe('vga');
		await settle();
		expect(spectatorTypes).not.toContain(A.CURSOR);
		expect(spectatorTypes).not.toContain(A.CHANGE_PALETTE);
		for (const c of [a, b, spectator]) {
			c.ws.close();
		}
		await settle(100);
	});

	it('SET_CANVAS_SIZE resizes and relays with the sender id', async () => {
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
		const late = await connect(plainPort, { nick: 'afterwards', pass: '' });
		expect(late.reply.data.doc.columns).toBe(100);
		for (const c of [a, b, late]) {
			c.ws.close();
		}
		await settle(100);
	});

	it('REFUSED on a bad password; upstream lets nickless users BYPASS it', async () => {
		const wrong = await connect(gatedPort, { nick: 'x', pass: 'nope' });
		expect(wrong.reply.type).toBe(A.REFUSED);
		wrong.ws.close();
		const right = await connect(gatedPort, { nick: 'x', pass: PASS });
		expect(right.reply.type).toBe(A.CONNECTED);
		right.ws.close();
		// the upstream quirk our server deliberately refuses to copy:
		// no nick means the password check is skipped entirely
		const bypass = await connect(gatedPort, {});
		expect(bypass.reply.type).toBe(A.CONNECTED);
		bypass.ws.close();
		await settle(100);
	});
});
