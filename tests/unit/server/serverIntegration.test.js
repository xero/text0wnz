// @vitest-environment node
/**
 * Real-socket integration: spawns the bun server on an ephemeral port
 * in a scratch cwd and talks actual websockets through the global
 * WebSocket client (node >= 22). Pins the Bun.serve layer: upgrade
 * routing, 426 for plain HTTP, path rooms isolation, password refusal,
 * caps reply, and the no-self-echo draw fanout end to end.
 * Never points at a shared server (PLAN §3.6.2 #4): everything local.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const PASS = 'hunter2';

const hasBun = (() => {
	try {
		execSync('bun --version', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

const canRun = hasBun && typeof WebSocket === 'function';

let child = null;
let scratch = null;
let port = 0;

const send = (ws, type, data) => ws.send(JSON.stringify({ type, data }));

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
		ws.addEventListener('error', () => {
			clearTimeout(timer);
			reject(new Error('socket error'));
		});
	});

const connectClient = async (room, data) => {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/${room}`);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', reject, { once: true });
	});
	const replyPromise = nextFrame(ws);
	send(ws, 0, data);
	const reply = await replyPromise;
	return { ws, reply };
};

beforeAll(async () => {
	if (!canRun) {
		return;
	}
	scratch = mkdtempSync(path.join(tmpdir(), 't0wnz-srv-'));
	port = 20000 + Math.floor(Math.random() * 20000);
	child = spawn(
		'bun',
		[path.join(repoRoot, 'src/js/server/main.js'), String(port), '--pass', PASS],
		{ cwd: scratch, stdio: ['ignore', 'pipe', 'pipe']},
	);
	// readiness: poll the http endpoint for the 426
	const deadline = Date.now() + 15000;
	for (;;) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/`);
			if (res.status === 426) {
				break;
			}
		} catch {
			// not up yet
		}
		if (Date.now() > deadline) {
			throw new Error('server did not come up');
		}
		await new Promise(r => setTimeout(r, 150));
	}
}, 20000);

afterAll(() => {
	child?.kill('SIGKILL');
	if (scratch) {
		rmSync(scratch, { recursive: true, force: true });
	}
});

describe.skipIf(!canRun)('bun server over real sockets', () => {
	it('answers plain http with 426 upgrade required', async () => {
		const res = await fetch(`http://127.0.0.1:${port}/`);
		expect(res.status).toBe(426);
	});

	it('refuses a bad password and unknown room paths', async () => {
		const { ws, reply } = await connectClient('server', {
			nick: 'x',
			pass: 'wrong',
		});
		expect(reply.type).toBe(1); // REFUSED
		ws.close();
		const res = await fetch(`http://127.0.0.1:${port}/bad%20name!!`);
		expect(res.status).toBe(404);
	});

	it('joins, decodes the doc, and fans out draws without self-echo', async () => {
		const a = await connectClient('server', { nick: 'a', pass: PASS });
		expect(a.reply.type).toBe(0);
		expect(a.reply.data.doc.columns).toBe(80);
		expect(a.reply.data.doc.compressed_data).toBeDefined();

		const b = await connectClient('server', { nick: 'b', pass: PASS });
		const drawAtB = nextFrame(b.ws, 9);
		let selfEcho = false;
		a.ws.addEventListener('message', e => {
			if (JSON.parse(e.data).type === 9) {
				selfEcho = true;
			}
		});
		send(a.ws, 9, {
			x: 2,
			y: 1,
			block: { code: 219, fg: 12, bg: 4 },
			id: a.reply.data.id,
		});
		const frame = await drawAtB;
		expect(frame.data.block).toEqual({ code: 219, fg: 12, bg: 4 });
		await new Promise(r => setTimeout(r, 150));
		expect(selfEcho).toBe(false);
		a.ws.close();
		b.ws.close();
	});

	it('path rooms are isolated', async () => {
		const main = await connectClient('server', { nick: 'm', pass: PASS });
		const lounge = await connectClient('lounge', { nick: 'l', pass: PASS });
		let leaked = false;
		main.ws.addEventListener('message', e => {
			if (JSON.parse(e.data).type === 9) {
				leaked = true;
			}
		});
		send(lounge.ws, 9, {
			x: 0,
			y: 0,
			block: { code: 65, fg: 7, bg: 0 },
			id: lounge.reply.data.id,
		});
		await new Promise(r => setTimeout(r, 200));
		expect(leaked).toBe(false);
		main.ws.close();
		lounge.ws.close();
	});

	it('caps-aware clients get a caps reply field', async () => {
		const { ws, reply } = await connectClient('server', {
			nick: 'c',
			pass: PASS,
			caps: ['anything'],
		});
		expect(Array.isArray(reply.data.caps)).toBe(true);
		ws.close();
	});
});
