// @ts-check
/**
 * Collab transport worker: owns the websocket and speaks Moebius
 * frames through the shared core codec. A MODULE worker bundled by
 * vite (like journalWorker.js), which is what lets it import the codec.
 *
 * Client-first handshake (Moebius server.js, the CONNECTED case of
 * Joint.message()): we send CONNECTED {nick, group, pass, caps}; the
 * server replies CONNECTED {id, doc, ...} or REFUSED. Nothing joins
 * and no remote state reaches the page until the user consents.
 *
 * Page RPC (trustedMessage-guarded both ways):
 *   page -> worker: {cmd:'init'} | {cmd:'probe', url} |
 *     {cmd:'connect', nick, group, pass, caps, url} |
 *     {cmd:'send', type, data} | {cmd:'draw', cells:[{x,y,block}]} |
 *     {cmd:'disconnect'}
 *   worker -> page: {cmd:'initialized'} | {cmd:'probeResult', found} |
 *     {cmd:'connected', id, data} | {cmd:'refused'} |
 *     {cmd:'frame', type, data} | {cmd:'closed', wasConnected, bridged} |
 *     {cmd:'error', error, bridged}
 *
 * Every outbound frame is stamped with our id: vanilla Moebius clients
 * crash on SET_CANVAS_SIZE broadcasts without it.
 */

import { decodeFrame, encodeFrame, MoebiusAction } from '../core/index';
import { trustedMessage } from './messageGuard.js';
import { resolveTransport } from './collabTarget.js';

/** @type {WebSocket | null} */
let socket = null;
let myId = -1;
let connected = false;
// whether the live socket rides the host's bridge: the page words a
// dead dial differently when the host, not the server, may be at fault
let bridged = false;
// a black-holed host would hold the Joining modal until the OS gives
// up on the TCP attempt; the probe caps itself, the dial must too
const DIAL_TIMEOUT_MS = 15000;

/**
 * Same-origin default server, or the page's explicit target routed
 * for THIS origin.
 * @param {unknown} explicit
 */
const serverUrl = explicit => resolveTransport(self.location, explicit);

/** @param {object} msg */
const toPage = msg => self.postMessage(msg);

const closeSocket = () => {
	if (socket) {
		try {
			socket.close();
		} catch {
			// already closing
		}
		socket = null;
	}
	connected = false;
	myId = -1;
};

/**
 * One-shot nickless probe: any reply (CONNECTED or REFUSED) proves a
 * server exists; the socket closes either way and the page decides.
 */
const probe = (explicitUrl = undefined) => {
	const route = serverUrl(explicitUrl);
	if (route.bridged) {
		// a probe runs before consent: it must never make the host dial
		// out on a visitor's behalf (and log that visitor) on the
		// strength of a link someone else wrote; the Connect form is
		// the consenting path for a bridged target
		toPage({ cmd: 'probeResult', found: false });
		return;
	}
	let ws;
	try {
		ws = new WebSocket(route.url);
	} catch {
		toPage({ cmd: 'probeResult', found: false });
		return;
	}
	let settled = false;
	/** @param {boolean} found */
	const settle = found => {
		if (!settled) {
			settled = true;
			toPage({ cmd: 'probeResult', found });
		}
		try {
			ws.close();
		} catch {
			// gone already
		}
	};
	ws.addEventListener('open', () => {
		ws.send(encodeFrame(MoebiusAction.CONNECTED, {}));
	});
	ws.addEventListener('message', () => settle(true));
	ws.addEventListener('error', () => settle(false));
	ws.addEventListener('close', () => settle(false));
	setTimeout(() => settle(false), 4000);
};

/** @param {{nick?: string, group?: string, pass?: string, caps?: string[], url?: string}} options */
const connect = options => {
	closeSocket();
	const route = serverUrl(options.url);
	let ws;
	try {
		ws = new WebSocket(route.url);
	} catch (error) {
		toPage({ cmd: 'error', error: String(error), bridged: route.bridged });
		return;
	}
	socket = ws;
	bridged = route.bridged;
	const dialTimer = setTimeout(() => {
		if (socket === ws && !connected) {
			try {
				ws.close();
			} catch {
				// gone already
			}
		}
	}, DIAL_TIMEOUT_MS);
	ws.addEventListener('open', () => {
		ws.send(
			encodeFrame(MoebiusAction.CONNECTED, {
				nick: options.nick,
				group: options.group ?? '',
				pass: options.pass ?? '',
				caps: options.caps,
			}),
		);
	});
	ws.addEventListener('message', event => {
		if (socket !== ws) {
			return; // stale socket: a newer connection owns the state
		}
		let frame;
		try {
			frame = decodeFrame(event.data);
		} catch {
			return;
		}
		if (!connected) {
			if (frame.type === MoebiusAction.CONNECTED) {
				clearTimeout(dialTimer);
				connected = true;
				myId = typeof frame.data.id === 'number' ? frame.data.id : -1;
				toPage({ cmd: 'connected', id: myId, data: frame.data });
			} else if (frame.type === MoebiusAction.REFUSED) {
				toPage({ cmd: 'refused' });
				closeSocket();
			}
			return;
		}
		toPage({ cmd: 'frame', type: frame.type, data: frame.data });
	});
	ws.addEventListener('close', () => {
		clearTimeout(dialTimer);
		// a stale socket's close must not clobber a newer connection
		if (socket !== ws) {
			return;
		}
		const wasConnected = connected;
		connected = false;
		socket = null;
		toPage({ cmd: 'closed', wasConnected, bridged });
	});
	ws.addEventListener('error', () => {
		// browsers fire error before close on every failed handshake,
		// so this is the message the page ends a dial on: it must carry
		// the route, or the bridged wording never shows
		if (socket === ws) {
			toPage({ cmd: 'error', error: 'websocket error', bridged });
		}
	});
};

/** @param {number} type @param {object} data */
const sendFrame = (type, data) => {
	if (!socket || !connected) {
		return;
	}
	try {
		socket.send(encodeFrame(type, { ...data, id: myId }));
	} catch {
		// socket died between checks; close event will notify the page
	}
};

self.onmessage = event => {
	if (!trustedMessage(event) || typeof event.data.cmd !== 'string') {
		return;
	}
	const msg = event.data;
	switch (msg.cmd) {
		case 'init':
			toPage({ cmd: 'initialized' });
			break;
		case 'probe':
			probe(msg.url);
			break;
		case 'connect':
			connect(msg);
			break;
		case 'send':
			if (Number.isInteger(msg.type)) {
				sendFrame(msg.type, msg.data ?? {});
			}
			break;
		case 'draw':
			if (Array.isArray(msg.cells)) {
				for (const cell of msg.cells) {
					sendFrame(MoebiusAction.DRAW, cell);
				}
			}
			break;
		case 'disconnect':
			closeSocket();
			break;
		default:
			break;
	}
};
