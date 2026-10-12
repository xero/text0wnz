/**
 * Bun.serve websocket layer: path rooms, hardened frame intake,
 * ws-level heartbeat (the protocol has none), and
 * the dual-listener story: the main listener sits behind Caddy (wss
 * for browsers) and an optional plaintext listener on another port
 * serves desktop clients (Moebius, icy_draw) directly, which solves
 * hosting-side mixed content without TLS in-process.
 *
 * Protocol semantics live in room.js; this file only routes.
 * (No @ts-check: Bun's types are not in the repo's TS lib set, same
 * reasoning as journalWorker.js.)
 */
/* global Bun */

import path from 'node:path';
import { decodeFrame, ProtocolError } from '../core/index';
import { createRoom } from './room.js';
import { resolveBridgeTarget, createBridgePipe } from './bridge.js';

export const SERVER_LIMITS = Object.freeze({
	maxPayloadBytes: 1024 * 1024,
	idleTimeoutSeconds: 120,
	heartbeatMs: 30000,
	maxClientsPerRoom: 64,
	maxRooms: 64,
});

const ROOM_NAME_RE = /^[a-z0-9_-]{1,32}$/i;

/** @param {string} pathname @param {string} defaultRoom */
export const roomNameFromPath = (pathname, defaultRoom) => {
	// '/' and '/server' (the deployed Caddy proxy path) hit the default
	const trimmed = pathname.replace(/^\/+|\/+$/g, '');
	if (trimmed === '' || trimmed === 'server') {
		return defaultRoom;
	}
	return ROOM_NAME_RE.test(trimmed) ? trimmed.toLowerCase() : null;
};

/**
 * @param {object} config
 * @param {number} config.port
 * @param {number} [config.plainPort]
 * @param {string} [config.sessionName]
 * @param {string} [config.pass]
 * @param {Record<string, string>} [config.roomPasswords]
 * @param {number} [config.maxColumns] resize wall override (0/absent = room default)
 * @param {number} [config.maxRows] resize wall override (0/absent = room default)
 * @param {string} [config.staticDir] serve the built PWA from here ('' = ws-only)
 * @param {{mode: string, target: string, port: number, allow: string[], maxConnections: number}} [config.bridge]
 * @param {(room: ReturnType<typeof createRoom>) => void} [config.onRoomCreate]
 * @param {(room: ReturnType<typeof createRoom>) => void | Promise<void>} [config.onRoomEmpty]
 * @param {boolean} [config.debug]
 * @param {{cert: string, key: string} | undefined} [config.tls]
 * @param {(line: string) => void} [config.log]
 */
export const createMoebiusServer = config => {
	const log = config.log ?? (config.debug ? console.log : () => {});
	const defaultRoom = config.sessionName ?? 'joint';
	/** @type {Map<string, ReturnType<typeof createRoom>>} */
	const rooms = new Map();
	/** sockets per room INCLUDING ones that never sent CONNECTED */
	const socketCounts = new Map();

	const getRoom = name => {
		let room = rooms.get(name);
		if (!room) {
			if (rooms.size >= SERVER_LIMITS.maxRooms) {
				return null;
			}
			room = createRoom({
				name,
				password: config.roomPasswords?.[name] ?? config.pass ?? '',
				maxColumns: config.maxColumns || undefined,
				maxRows: config.maxRows || undefined,
				log,
			});
			rooms.set(name, room);
			// lazy restore hook: the host loads any persisted doc for this
			// room; without it a named room boots blank and its next
			// autosave overwrites the saved art
			config.onRoomCreate?.(room);
		}
		return room;
	};

	/**
	 * per-socket state rides Bun's ws.data
	 * @param {import('bun').ServerWebSocket<any>} ws
	 */
	const clientFor = ws => {
		if (!ws.data.client) {
			ws.data.client = {
				send: (type, data) => {
					ws.send(JSON.stringify({ type, data }));
				},
			};
		}
		return ws.data.client;
	};

	/** @type {Set<import('bun').ServerWebSocket<any>>} */
	const sockets = new Set();
	const bridgeConfig = config.bridge ?? { mode: 'off' };
	let bridgeCount = 0;
	let bridgePending = 0;

	/** resolveBridgeTarget, but a throw releases the pending slot */
	const resolveBridgeTargetSafe = async (cfg, requested) => {
		try {
			return await resolveBridgeTarget(cfg, requested);
		} catch (error) {
			return { ok: false, reason: String(error) };
		}
	};

	const websocket = {
		maxPayloadLength: SERVER_LIMITS.maxPayloadBytes,
		idleTimeout: SERVER_LIMITS.idleTimeoutSeconds,
		/** @param {import('bun').ServerWebSocket<any>} ws */
		open: ws => {
			ws.data.alive = true;
			if (ws.data.kind === 'bridge') {
				bridgeCount++;
				log(`bridge open -> ${ws.data.targetUrl}`);
				ws.data.pipe = createBridgePipe(ws, ws.data.targetUrl, log);
				return;
			}
			// cap on SOCKETS, not registered members: idle pre-CONNECTED
			// sockets count too
			const open = socketCounts.get(ws.data.roomName) ?? 0;
			const room =
				open < SERVER_LIMITS.maxClientsPerRoom
					? getRoom(ws.data.roomName)
					: null;
			if (!room) {
				ws.close(1013, 'room full');
				return;
			}
			socketCounts.set(ws.data.roomName, open + 1);
			ws.data.counted = true;
			ws.data.room = room;
			sockets.add(ws);
		},
		/** @param {import('bun').ServerWebSocket<any>} ws @param {string | Buffer} raw */
		message: (ws, raw) => {
			if (ws.data.kind === 'bridge') {
				// pure byte pipe: frames relay verbatim, text or binary
				ws.data.pipe?.fromBrowser(
					typeof raw === 'string' ? raw : new Uint8Array(raw),
				);
				return;
			}
			const room = ws.data.room;
			if (!room) {
				return;
			}
			let frame;
			try {
				frame = decodeFrame(typeof raw === 'string' ? raw : raw.toString());
			} catch (error) {
				if (error instanceof ProtocolError) {
					log(`dropped frame: ${error.message}`);
					return;
				}
				throw error;
			}
			const client = clientFor(ws);
			if (!ws.data.connected) {
				// first frame must be CONNECTED (type 0); anything else drops
				if (frame.type !== 0) {
					return;
				}
				ws.data.connected = room.connect(client, frame.data);
				if (!ws.data.connected) {
					// a refused socket closes: no wire-speed password
					// brute force on a held connection
					ws.close(1008, 'refused');
				}
				return;
			}
			room.message(client, frame);
		},
		/** @param {import('bun').ServerWebSocket<any>} ws */
		close: ws => {
			sockets.delete(ws);
			if (ws.data.kind === 'bridge') {
				bridgeCount = Math.max(0, bridgeCount - 1);
				ws.data.pipe?.close();
				return;
			}
			if (ws.data.counted) {
				const open = (socketCounts.get(ws.data.roomName) ?? 1) - 1;
				if (open > 0) {
					socketCounts.set(ws.data.roomName, open);
				} else {
					socketCounts.delete(ws.data.roomName);
				}
			}
			if (ws.data.room && ws.data.connected) {
				ws.data.room.disconnect(clientFor(ws));
			}
			// empty rooms are garbage-collected (64 throwaway names must
			// not wedge maxRooms forever); the host persists dirty ones
			// through onRoomEmpty first
			const room = ws.data.room;
			if (room && !socketCounts.has(room.name) && rooms.get(room.name) === room) {
				const finish = () => {
					if (!socketCounts.has(room.name) && rooms.get(room.name) === room) {
						rooms.delete(room.name);
					}
				};
				if (room.isDirty() && config.onRoomEmpty) {
					Promise.resolve(config.onRoomEmpty(room)).then(finish, finish);
				} else if (!room.isDirty()) {
					finish();
				}
				// dirty room without a persistence hook: keep it resident
			}
		},
		/** @param {import('bun').ServerWebSocket<any>} ws */
		pong: ws => {
			ws.data.alive = true;
		},
	};

	// single-binary / distroless mode serves the built PWA itself;
	// '' = ws-only, a proxy owns static
	const staticRoot = config.staticDir ? path.resolve(config.staticDir) : null;
	/** @param {string} pathname */
	const serveStatic = async pathname => {
		let clean;
		try {
			clean = decodeURIComponent(pathname);
		} catch {
			return new Response('bad path', { status: 400 });
		}
		if (clean.endsWith('/')) {
			clean += 'index.html';
		}
		const resolved = path.resolve(staticRoot, `.${clean}`);
		// traversal guard: everything served lives under the static root
		if (
			resolved !== staticRoot &&
			!resolved.startsWith(staticRoot + path.sep)
		) {
			return new Response('forbidden', { status: 403 });
		}
		const file = Bun.file(resolved);
		if (await file.exists()) {
			return new Response(file);
		}
		return new Response('not found', { status: 404 });
	};

	/** @param {Request} req @param {import('bun').Server} server */
	const fetchHandler = async (req, server) => {
		const url = new URL(req.url);
		if (url.pathname === '/healthz') {
			// liveness for the Docker HEALTHCHECK: cheap, no room state leaks
			return Response.json({
				ok: true,
				rooms: rooms.size,
				uptime: Math.floor(process.uptime()),
			});
		}
		if (url.pathname === '/bridge') {
			// reserve BEFORE the async DNS await: parallel requests in
			// flight must not all pass the cap check
			if (
				bridgeCount + bridgePending >=
				(bridgeConfig.maxConnections ?? 16)
			) {
				return new Response('bridge busy', { status: 503 });
			}
			bridgePending++;
			const vet = await resolveBridgeTargetSafe(bridgeConfig, {
				host: url.searchParams.get('host'),
				port: url.searchParams.get('port'),
				room: url.searchParams.get('room'),
			});
			bridgePending = Math.max(0, bridgePending - 1);
			if (!vet.ok) {
				log(`bridge refused: ${vet.reason}`);
				return new Response(vet.reason, { status: 403 });
			}
			if (
				server.upgrade(req, { data: { kind: 'bridge', targetUrl: vet.url, alive: true } })
			) {
				return undefined;
			}
			return new Response('upgrade required', { status: 426 });
		}
		// plain HTTP serves the PWA in static mode; websocket upgrades
		// (and ws-only deployments) take the room path below
		const wantsUpgrade =
			req.headers.get('upgrade')?.toLowerCase() === 'websocket';
		if (!wantsUpgrade && staticRoot) {
			return serveStatic(url.pathname);
		}
		const roomName = roomNameFromPath(url.pathname, defaultRoom);
		if (roomName === null) {
			return new Response('no such room', { status: 404 });
		}
		if (
			server.upgrade(req, { data: { roomName, connected: false, alive: true } })
		) {
			return undefined;
		}
		// the static app is served by Caddy/nginx; plain HTTP here means
		// a misconfigured proxy
		return new Response('upgrade required', {
			status: 426,
			headers: { upgrade: 'websocket', connection: 'upgrade' },
		});
	};

	const main = Bun.serve({
		port: config.port,
		tls: config.tls,
		fetch: fetchHandler,
		websocket,
	});
	const plain =
		config.plainPort && config.plainPort !== config.port
			? Bun.serve({
					port: config.plainPort,
					fetch: fetchHandler,
					websocket,
				})
			: null;

	// the Moebius dialect has no heartbeat: ws-level pings
	// keep quiet-but-alive clients (pure spectators) clear of the idle
	// reaper, and a missed pong since the last sweep marks a ghost
	const heartbeat = setInterval(() => {
		for (const ws of sockets) {
			if (!ws.data.alive) {
				try {
					ws.close(1001, 'heartbeat lost');
				} catch {
					sockets.delete(ws);
				}
				continue;
			}
			ws.data.alive = false;
			try {
				ws.ping();
			} catch {
				sockets.delete(ws);
			}
		}
	}, SERVER_LIMITS.heartbeatMs);

	return {
		rooms,
		getRoom,
		port: main.port,
		plainPort: plain?.port ?? null,
		stop: async () => {
			clearInterval(heartbeat);
			await main.stop(true);
			await plain?.stop(true);
		},
	};
};
