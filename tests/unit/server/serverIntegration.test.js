// @vitest-environment node
/**
 * Real-socket integration: spawns the bun server on an ephemeral port
 * in a scratch cwd and talks actual websockets through the global
 * WebSocket client (node >= 22). Pins the Bun.serve layer: upgrade
 * routing, 426 for plain HTTP, path rooms isolation, password refusal,
 * caps reply, and the no-self-echo draw fanout end to end.
 * Never points at a shared server: everything local.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { MoebiusAction as A } from '../../../src/js/core/index';

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

	it('serves /healthz liveness', async () => {
		const res = await fetch(`http://127.0.0.1:${port}/healthz`);
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.ok).toBe(true);
		expect(typeof body.uptime).toBe('number');
	});

	it('static mode serves the PWA, guards traversal, keeps ws rooms', async () => {
		const staticDir = mkdtempSync(path.join(tmpdir(), 't0wnz-static-'));
		writeFileSync(path.join(staticDir, 'index.html'), '<html>t0wnz</html>');
		const staticPort = 20000 + Math.floor(Math.random() * 20000);
		const staticChild = spawn(
			'bun',
			[path.join(repoRoot, 'src/js/server/main.js'), String(staticPort)],
			{
				cwd: scratch,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, STATIC_DIR: staticDir },
			},
		);
		try {
			const deadline = Date.now() + 15000;
			for (;;) {
				try {
					const res = await fetch(`http://127.0.0.1:${staticPort}/healthz`);
					if (res.ok) {
						break;
					}
				} catch {
					// not up yet
				}
				if (Date.now() > deadline) {
					throw new Error('static server did not come up');
				}
				await new Promise(r => setTimeout(r, 150));
			}
			const page = await fetch(`http://127.0.0.1:${staticPort}/`);
			expect(page.status).toBe(200);
			expect(await page.text()).toContain('t0wnz');
			const missing = await fetch(`http://127.0.0.1:${staticPort}/nope.js`);
			expect(missing.status).toBe(404);
			const sneaky = await fetch(
				`http://127.0.0.1:${staticPort}/%2e%2e/%2e%2e/etc/passwd`,
			);
			expect([400, 403, 404]).toContain(sneaky.status);
			// websocket rooms still answer on the same listener
			const ws = new WebSocket(`ws://127.0.0.1:${staticPort}/server`);
			await new Promise((resolve, reject) => {
				ws.addEventListener('open', resolve, { once: true });
				ws.addEventListener('error', reject, { once: true });
			});
			const replyPromise = nextFrame(ws);
			send(ws, 0, { nick: 'static-test' });
			const reply = await replyPromise;
			expect(reply.type).toBe(A.CONNECTED);
			ws.close();
		} finally {
			staticChild.kill('SIGKILL');
			rmSync(staticDir, { recursive: true, force: true });
		}
	}, 20000);

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

	it('/server/<room> lands in the same room as /<room>', async () => {
		// the deployed proxies forward /server* only; this spelling
		// reaches named rooms without a rule per room
		const bare = await connectClient('annex', { nick: 'bare', pass: PASS });
		const viaProxy = await connectClient('server/annex', {
			nick: 'proxied',
			pass: PASS,
		});
		const seen = nextFrame(bare.ws, 9);
		send(viaProxy.ws, 9, {
			x: 1,
			y: 1,
			block: { code: 66, fg: 7, bg: 0 },
			id: viaProxy.reply.data.id,
		});
		expect((await seen).data.block.code).toBe(66);
		bare.ws.close();
		viaProxy.ws.close();
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

	it(
		'the pre-room gate cools down after repeated bad passwords',
		{ timeout: 15000 },
		async () => {
			// a dedicated room path keeps the long-lived server's other
			// rooms clean
			for (let i = 0; i < 3; i++) {
				const { ws, reply } = await connectClient('gatecool', {
					nick: 'g',
					pass: 'wrong',
				});
				expect(reply.type).toBe(A.REFUSED);
				ws.close();
			}
			// inside the window even the right password refuses
			const blocked = await connectClient('gatecool', {
				nick: 'g',
				pass: PASS,
			});
			expect(blocked.reply.type).toBe(A.REFUSED);
			blocked.ws.close();
			// blocked attempts do not extend the window; poll until in
			const deadline = Date.now() + 10_000;
			for (;;) {
				const { ws, reply } = await connectClient('gatecool', {
					nick: 'g',
					pass: PASS,
				});
				ws.close();
				if (reply.type === A.CONNECTED) {
					break;
				}
				expect(Date.now()).toBeLessThan(deadline);
				await new Promise(r => setTimeout(r, 200));
			}
		},
	);

	it('an empty password refuses without counting toward the gate', async () => {
		// the client's silent probe (nickless, no password) lands on a
		// protected room at every page load; it must never open the
		// cooldown that refuses the right password
		for (let i = 0; i < 4; i++) {
			const { ws, reply } = await connectClient('probegate', {});
			expect(reply.type).toBe(A.REFUSED);
			ws.close();
		}
		const { ws, reply } = await connectClient('probegate', {
			nick: 'p',
			pass: PASS,
		});
		expect(reply.type).toBe(A.CONNECTED);
		ws.close();
	});

	it(
		'a mixed case --session-name lands clients in one room and lowercase files',
		{ timeout: 30000 },
		async () => {
			const cwd = mkdtempSync(path.join(tmpdir(), 't0wnz-case-'));
			const casePort = 20000 + Math.floor(Math.random() * 20000);
			const caseChild = spawn(
				'bun',
				[
					path.join(repoRoot, 'src/js/server/main.js'),
					String(casePort),
					'--session-name',
					'ArtJam',
				],
				{ cwd, stdio: ['ignore', 'pipe', 'pipe']},
			);
			try {
				const deadline = Date.now() + 15000;
				for (;;) {
					try {
						const res = await fetch(`http://127.0.0.1:${casePort}/healthz`);
						if (res.ok) {
							break;
						}
					} catch {
						// not up yet
					}
					if (Date.now() > deadline) {
						throw new Error('case server did not come up');
					}
					await new Promise(r => setTimeout(r, 150));
				}
				const ws = new WebSocket(`ws://127.0.0.1:${casePort}/`);
				await new Promise((resolve, reject) => {
					ws.addEventListener('open', resolve, { once: true });
					ws.addEventListener('error', reject, { once: true });
				});
				const joined = nextFrame(ws, A.CONNECTED);
				send(ws, A.CONNECTED, { nick: 'c', pass: '' });
				await joined;
				// one normalized room, not a mixed-case orphan plus a twin
				const health = await (
					await fetch(`http://127.0.0.1:${casePort}/healthz`)
				).json();
				expect(health.rooms).toBe(1);
				send(ws, A.DRAW, {
					x: 0,
					y: 0,
					block: { code: 65, fg: 7, bg: 0 },
					id: 0,
				});
				await new Promise(r => setTimeout(r, 100));
				ws.close();
				const fileDeadline = Date.now() + 5000;
				const saved = path.join(cwd, 'sessions', 'artjam.0wnz');
				for (;;) {
					if (existsSync(saved)) {
						break;
					}
					if (Date.now() > fileDeadline) {
						throw new Error('lowercase session file never appeared');
					}
					await new Promise(r => setTimeout(r, 150));
				}
				// case-insensitive filesystems alias the two names, so the
				// absence check only means something on case-sensitive ones
				if (process.platform !== 'darwin') {
					expect(
						existsSync(path.join(cwd, 'sessions', 'ArtJam.0wnz')),
					).toBe(false);
				}
			} finally {
				caseChild.kill('SIGKILL');
				rmSync(cwd, { recursive: true, force: true });
			}
		},
	);

	it(
		'ALLOWED_ORIGINS gates browser upgrades and leaves desktop clients open',
		{ timeout: 30000 },
		async () => {
			const cwd = mkdtempSync(path.join(tmpdir(), 't0wnz-origin-'));
			const originPort = 20000 + Math.floor(Math.random() * 20000);
			const originChild = spawn(
				'bun',
				[path.join(repoRoot, 'src/js/server/main.js'), String(originPort)],
				{
					cwd,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: {
						...process.env,
						ALLOWED_ORIGINS: 'http://ok.example',
						// the bridge must sit behind the same gate
						BRIDGE: 'local',
					},
				},
			);
			try {
				const deadline = Date.now() + 15000;
				for (;;) {
					try {
						const res = await fetch(
							`http://127.0.0.1:${originPort}/healthz`,
						);
						if (res.ok) {
							break;
						}
					} catch {
						// not up yet
					}
					if (Date.now() > deadline) {
						throw new Error('origin server did not come up');
					}
					await new Promise(r => setTimeout(r, 150));
				}
				// raw requests: fetch strips the forbidden upgrade headers.
				// No sec-websocket-key, so a PASSING origin falls through
				// the failed upgrade to the 426, which is the point: the
				// gate ran and let it by
				const rawStatus = (origin, path = '/') =>
					new Promise((resolve, reject) => {
						const req = http.request(
							{
								host: '127.0.0.1',
								port: originPort,
								path,
								headers: {
									connection: 'Upgrade',
									upgrade: 'websocket',
									...(origin ? { origin } : {}),
								},
							},
							res => resolve(res.statusCode),
						);
						req.on('error', reject);
						req.end();
					});
				expect(await rawStatus('http://evil.example')).toBe(403);
				expect(await rawStatus('http://ok.example')).toBe(426);
				expect(await rawStatus(null)).toBe(426);
				// a foreign page dialing OUT through the bridge is refused
				// by the origin gate, not merely by the bridge's own vet
				expect(await rawStatus('http://evil.example', '/bridge')).toBe(403);
				expect(await rawStatus('http://ok.example', '/bridge')).toBe(426);
			} finally {
				originChild.kill('SIGKILL');
				rmSync(cwd, { recursive: true, force: true });
			}
		},
	);
});

describe.skipIf(!canRun)('bridge over real sockets', () => {
	let target = null;
	let front = null;
	let targetPort = 0;
	let frontPort = 0;
	let bridgeScratch = null;

	beforeAll(async () => {
		bridgeScratch = mkdtempSync(path.join(tmpdir(), 't0wnz-bridge-'));
		targetPort = 22000 + Math.floor(Math.random() * 10000);
		frontPort = 33000 + Math.floor(Math.random() * 10000);
		target = spawn(
			'bun',
			[path.join(repoRoot, 'src/js/server/main.js'), String(targetPort)],
			{ cwd: bridgeScratch, stdio: ['ignore', 'pipe', 'pipe']},
		);
		front = spawn(
			'bun',
			[path.join(repoRoot, 'src/js/server/main.js'), String(frontPort)],
			{
				cwd: bridgeScratch,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: {
					...process.env,
					BRIDGE: 'local',
					BRIDGE_TARGET: `ws://127.0.0.1:${targetPort}/bridged`,
				},
			},
		);
		const deadline = Date.now() + 15000;
		for (const checkPort of [targetPort, frontPort]) {
			for (;;) {
				try {
					const res = await fetch(`http://127.0.0.1:${checkPort}/`);
					if (res.status === 426) {
						break;
					}
				} catch {
					// not up yet
				}
				if (Date.now() > deadline) {
					throw new Error('bridge servers did not come up');
				}
				await new Promise(r => setTimeout(r, 150));
			}
		}
	}, 25000);

	afterAll(() => {
		target?.kill('SIGKILL');
		front?.kill('SIGKILL');
		if (bridgeScratch) {
			rmSync(bridgeScratch, { recursive: true, force: true });
		}
	});

	it('local mode pipes frames verbatim to the fixed target', async () => {
		const ws = new WebSocket(`ws://127.0.0.1:${frontPort}/bridge`);
		await new Promise((resolve, reject) => {
			ws.addEventListener('open', resolve, { once: true });
			ws.addEventListener('error', reject, { once: true });
		});
		const reply = nextFrame(ws);
		send(ws, 0, { nick: 'piped' });
		const frame = await reply;
		// the TARGET server answered through the pipe with the join doc
		expect(frame.type).toBe(0);
		expect(frame.data.doc.columns).toBe(80);
		ws.close();
	});

	it('requests cannot steer the local-mode destination', async () => {
		const open = async url => {
			const ws = new WebSocket(url);
			await new Promise((resolve, reject) => {
				ws.addEventListener('open', resolve, { once: true });
				ws.addEventListener('error', reject, { once: true });
			});
			return ws;
		};
		// first user joins through the plain bridge path and STAYS
		const anchor = await open(`ws://127.0.0.1:${frontPort}/bridge`);
		const anchorReply = nextFrame(anchor);
		send(anchor, 0, { nick: 'anchor' });
		expect((await anchorReply).type).toBe(0);
		// second user asks for a different host/port/room; local mode
		// must land them in the SAME fixed room regardless
		const steer = await open(
			`ws://127.0.0.1:${frontPort}/bridge?host=127.0.0.1&port=${targetPort}&room=elsewhere`,
		);
		const steerReply = nextFrame(steer);
		send(steer, 0, { nick: 'steer' });
		const frame = await steerReply;
		expect(frame.type).toBe(0);
		expect(Array.isArray(frame.data.users)).toBe(true);
		expect(frame.data.users.some(u => u.nick === 'anchor')).toBe(true);
		anchor.close();
		steer.close();
	});

	it('off mode (the default server) refuses /bridge, and a plain GET gets no further than 426', async () => {
		// no upgrade, no resolution: the bridge is a socket or nothing
		const res = await fetch(`http://127.0.0.1:${port}/bridge?host=a.example`);
		expect(res.status).toBe(426);
		const refused = await new Promise((resolve, reject) => {
			const req = http.request(
				{
					host: '127.0.0.1',
					port,
					path: '/bridge?host=a.example',
					headers: { connection: 'Upgrade', upgrade: 'websocket' },
				},
				res => {
					let body = '';
					res.on('data', chunk => (body += chunk));
					res.on('end', () => resolve({ status: res.statusCode, body }));
				},
			);
			req.on('error', reject);
			req.end();
		});
		expect(refused.status).toBe(403);
		expect(refused.body).toBe('bridge refused');
	});

	it(
		'the stock server (bridge off) records no address for a bridge poke',
		{ timeout: 30000 },
		async () => {
			// docs/privacy.md: by default no IP addresses are logged; the
			// bridge's audit trail exists only once an operator turns it on
			const cwd = mkdtempSync(path.join(tmpdir(), 't0wnz-quiet-'));
			const quietPort = 20000 + Math.floor(Math.random() * 20000);
			let logged = '';
			const child = spawn(
				'bun',
				[path.join(repoRoot, 'src/js/server/main.js'), String(quietPort)],
				{ cwd, stdio: ['ignore', 'pipe', 'pipe']},
			);
			child.stdout.on('data', chunk => (logged += chunk));
			child.stderr.on('data', chunk => (logged += chunk));
			try {
				const deadline = Date.now() + 15000;
				for (;;) {
					try {
						const res = await fetch(`http://127.0.0.1:${quietPort}/healthz`);
						if (res.ok) {
							break;
						}
					} catch {
						// not up yet
					}
					if (Date.now() > deadline) {
						throw new Error('quiet server did not come up');
					}
					await new Promise(r => setTimeout(r, 150));
				}
				const refused = await new Promise((resolve, reject) => {
					const req = http.request(
						{
							host: '127.0.0.1',
							port: quietPort,
							path: '/bridge?host=localhost&port=8000',
							headers: { connection: 'Upgrade', upgrade: 'websocket' },
						},
						res => resolve(res.statusCode),
					);
					req.on('error', reject);
					req.end();
				});
				expect(refused).toBe(403);
				await new Promise(r => setTimeout(r, 200));
				expect(logged).not.toMatch(/bridge/);
				expect(logged).not.toMatch(/127\.0\.0\.1/);
			} finally {
				child.kill('SIGKILL');
				rmSync(cwd, { recursive: true, force: true });
			}
		},
	);

	it(
		'port mode never echoes what the host resolver knows',
		{ timeout: 30000 },
		async () => {
			const cwd = mkdtempSync(path.join(tmpdir(), 't0wnz-oracle-'));
			const oraclePort = 20000 + Math.floor(Math.random() * 20000);
			let logged = '';
			const child = spawn(
				'bun',
				[path.join(repoRoot, 'src/js/server/main.js'), String(oraclePort)],
				{
					cwd,
					stdio: ['ignore', 'pipe', 'pipe'],
					env: { ...process.env, BRIDGE: 'port', BRIDGE_PORT: '8000' },
				},
			);
			child.stdout.on('data', chunk => (logged += chunk));
			try {
				const deadline = Date.now() + 15000;
				for (;;) {
					try {
						const res = await fetch(`http://127.0.0.1:${oraclePort}/healthz`);
						if (res.ok) {
							break;
						}
					} catch {
						// not up yet
					}
					if (Date.now() > deadline) {
						throw new Error('oracle server did not come up');
					}
					await new Promise(r => setTimeout(r, 150));
				}
				const refused = await new Promise((resolve, reject) => {
					const req = http.request(
						{
							host: '127.0.0.1',
							port: oraclePort,
							path: '/bridge?host=localhost&port=8000',
							headers: {
								'connection': 'Upgrade',
								'upgrade': 'websocket',
								'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
								'sec-websocket-version': '13',
							},
						},
						res => {
							let body = '';
							res.on('data', chunk => (body += chunk));
							res.on('end', () => resolve({ status: res.statusCode, body }));
						},
					);
					req.on('error', reject);
					req.end();
				});
				// localhost resolves to loopback: refused, but the body must
				// not say what it resolved to
				expect(refused.status).toBe(403);
				expect(refused.body).toBe('bridge refused');
				await new Promise(r => setTimeout(r, 200));
				// the operator's log carries the requester, the ask, and
				// the reason
				expect(logged).toMatch(
					/bridge refused 127\.0\.0\.1 asking localhost:8000\/: private address/,
				);
				// a handshake with no key never reaches the resolver and
				// leaves no line: the 426 says nothing about the name
				const keyless = await new Promise((resolve, reject) => {
					const req = http.request(
						{
							host: '127.0.0.1',
							port: oraclePort,
							path: '/bridge?host=localhost&port=8000',
							headers: { connection: 'Upgrade', upgrade: 'websocket' },
						},
						res => resolve(res.statusCode),
					);
					req.on('error', reject);
					req.end();
				});
				expect(keyless).toBe(426);
				await new Promise(r => setTimeout(r, 200));
				expect(logged.match(/bridge refused/g)).toHaveLength(1);
			} finally {
				child.kill('SIGKILL');
				rmSync(cwd, { recursive: true, force: true });
			}
		},
	);
});
