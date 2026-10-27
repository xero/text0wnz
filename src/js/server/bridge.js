/**
 * Collab bridge: a pure byte pipe from a browser's
 * wss connection to a plaintext ws desktop server (Moebius, icy_draw),
 * frames relayed verbatim both ways. The bridge dials from the
 * SERVER's network position, so the lockdown is the feature:
 *
 * - BRIDGE=off    (default) every bridge request is refused.
 * - BRIDGE=local  only the preconfigured BRIDGE_TARGET is dialed
 *                 (default ws://127.0.0.1:8000); the request cannot
 *                 steer the destination at all: zero SSRF surface.
 * - BRIDGE=port   the host is caller-chosen but the port is pinned to
 *                 BRIDGE_PORT (default 8000, never the app port), the
 *                 host resolves BEFORE connecting, every resolved
 *                 address must be public (loopback, RFC1918, CGNAT,
 *                 link-local incl. 169.254.169.254, and the v6
 *                 equivalents are denied), and the connection dials
 *                 the vetted IP, which also defeats DNS rebinding.
 * - BRIDGE=allow  only targets on the explicit BRIDGE_ALLOW list
 *                 (comma-separated host:port); private entries are
 *                 informed consent and dial as given.
 *
 * Always on, whatever the mode: a connection cap (BRIDGE_MAX), a
 * backpressure bound in both directions, an idle reaper, a dial
 * timeout, a lookup timeout, the frame-size limit (the browser side
 * rides Bun's maxPayloadLength), and an audit line per open, close,
 * and refusal carrying the requester's address, since `port` mode is
 * by design a relay from this host's IP to any public server on one
 * port and an abuse report has to be answerable. Refusals reach the
 * caller as a bare 403: the reason (which names resolved addresses)
 * is for the log only, or the bridge doubles as a DNS oracle. The
 * protocol is plaintext past the bridge, passwords included; the docs
 * say so.
 *
 * (No @ts-check: Bun/node types are not in the repo's TS lib set.)
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const BRIDGE_DEFAULTS = Object.freeze({
	mode: 'off',
	target: 'ws://127.0.0.1:8000',
	port: 8000,
	maxConnections: 16,
});

/**
 * Private, loopback, link-local, CGNAT, and unspecified addresses, v4
 * and v6 (including v4-mapped v6): everything the `port` mode denies.
 * @param {string} ip
 */
export const isPrivateAddress = ip => {
	let addr = ip.toLowerCase();
	if (addr.startsWith('::ffff:')) {
		addr = addr.slice(7); // v4-mapped v6
	}
	if (isIP(addr) === 4) {
		const parts = addr.split('.').map(Number);
		const [a, b, c, d] = parts;
		if (a === 0 || a === 10 || a === 127) {
			return true;
		}
		if (a >= 224) {
			return true; // multicast 224/4, reserved 240/4, broadcast
		}
		if (a === 192 && b === 0 && c === 0) {
			return true; // IETF protocol assignments 192.0.0/24
		}
		if (a === 198 && (b === 18 || b === 19)) {
			return true; // benchmarking 198.18/15
		}
		if (a === 168 && b === 63 && c === 129 && d === 16) {
			return true; // Azure wireserver, the other metadata classic
		}
		if (a === 100 && b >= 64 && b <= 127) {
			return true; // CGNAT 100.64/10
		}
		if (a === 169 && b === 254) {
			return true; // link-local incl. 169.254.169.254
		}
		if (a === 172 && b >= 16 && b <= 31) {
			return true;
		}
		if (a === 192 && b === 168) {
			return true;
		}
		return false;
	}
	// v6: only global unicast 2000::/3 counts as public. Everything
	// else is denied, which closes the encodings the dotted check
	// misses: hex v4-mapped (::ffff:7f00:1), v4-compatible (::7f00:1),
	// NAT64 (64:ff9b::/96), ULA, link-local, loopback.
	if (isIP(addr) === 6) {
		const first = addr.split(':', 1)[0] || '0';
		const firstGroup = parseInt(first, 16) || 0;
		if (firstGroup === 0x2002) {
			return true; // 6to4 wraps a v4 address this check cannot see
		}
		return !(firstGroup >= 0x2000 && firstGroup <= 0x3fff);
	}
	// not a recognizable address at all: never dial it
	return true;
};

/**
 * Pure vet of already-resolved addresses (unit-tested without DNS):
 * ALL addresses must be public or the target is refused, so a name
 * that round-robins one public and one private record cannot slip by.
 * @param {string[]} addresses
 */
export const vetResolvedAddresses = addresses => {
	if (!Array.isArray(addresses) || addresses.length === 0) {
		return { ok: false, reason: 'unresolvable host' };
	}
	for (const address of addresses) {
		if (isPrivateAddress(address)) {
			return { ok: false, reason: `private address ${address}` };
		}
	}
	return { ok: true, address: addresses[0] };
};

/**
 * Decide the upstream url for a bridge request. Pure except for DNS
 * in `port` mode (injectable for tests).
 *
 * @param {{mode: string, target: string, port: number, allow: string[]}} config
 * @param {{host?: string | null, port?: string | number | null, room?: string | null}} requested
 * @param {(host: string) => Promise<string[]>} [resolveHost]
 * @param {number} [lookupTimeoutMs] a stalled resolver must not pin a slot
 * @returns {Promise<{ok: true, url: string} | {ok: false, reason: string}>}
 */
export const resolveBridgeTarget = async (
	config,
	requested,
	resolveHost = async host =>
		(await lookup(host, { all: true })).map(r => r.address),
	lookupTimeoutMs = BRIDGE_LOOKUP_TIMEOUT_MS,
) => {
	const mode = config.mode ?? 'off';
	if (mode === 'off') {
		return { ok: false, reason: 'bridge disabled' };
	}
	if (mode === 'local') {
		// fixed target; the request cannot steer anything
		return { ok: true, url: config.target || BRIDGE_DEFAULTS.target };
	}
	const host = typeof requested.host === 'string' ? requested.host.trim() : '';
	if (!(/^[a-z0-9.-]{1,253}$/i).test(host)) {
		return { ok: false, reason: 'bad host' };
	}
	const room = typeof requested.room === 'string' ? requested.room : '';
	if (!(/^[a-z0-9_-]{0,32}$/i).test(room)) {
		// refused, not swapped for the default joint: a silent swap
		// lands the caller in the wrong room or blames the server
		return { ok: false, reason: 'bad room' };
	}
	// a port is digits or nothing: anything else is refused before it
	// can reach a log line or a dial (log injection rode a raw echo)
	const askedRaw =
		requested.port === null || requested.port === undefined
			? ''
			: String(requested.port).trim();
	if (askedRaw !== '' && !(/^\d{1,5}$/).test(askedRaw)) {
		return { ok: false, reason: 'bad port' };
	}
	const asked = askedRaw === '' ? null : Number(askedRaw);
	if (mode === 'port') {
		const port = config.port || BRIDGE_DEFAULTS.port;
		if (asked !== null && asked !== port) {
			// dialing a port the caller never asked for only sends them a
			// wrong-sounding failure
			return { ok: false, reason: `port ${asked} not allowed (pinned to ${port})` };
		}
		const addresses = isIP(host)
			? [host]
			: await boundedLookup(resolveHost, host, lookupTimeoutMs);
		const vet = vetResolvedAddresses(addresses);
		if (!vet.ok) {
			return { ok: false, reason: vet.reason };
		}
		// dial the VETTED ip: resolution happens once, rebinding is moot
		const dialHost = vet.address.includes(':')
			? `[${vet.address}]`
			: vet.address;
		return { ok: true, url: `ws://${dialHost}:${port}/${room}` };
	}
	if (mode === 'allow') {
		const entry = `${host}:${asked ?? ''}`;
		if (asked === null || !config.allow.includes(entry)) {
			return { ok: false, reason: `${entry} not on the allow list` };
		}
		return { ok: true, url: `ws://${host}:${asked}/${room}` };
	}
	return { ok: false, reason: `unknown bridge mode ${mode}` };
};

export const BRIDGE_LOOKUP_TIMEOUT_MS = 3000;

/** a resolver that never answers used to hold a pending slot for as
 * long as the OS cared to wait; past the bound it reads as unresolvable
 * @param {(host: string) => Promise<string[]>} resolveHost
 * @param {string} host @param {number} timeoutMs */
const boundedLookup = (resolveHost, host, timeoutMs) => {
	let timer;
	const expiry = new Promise(resolve => {
		timer = setTimeout(() => resolve([]), timeoutMs);
	});
	return Promise.race([resolveHost(host).catch(() => []), expiry]).finally(
		() => clearTimeout(timer),
	);
};

/**
 * Boot-time sanity for the parsed env: a misconfiguration here is the
 * operator's, and it should stop the server with a sentence, not run
 * a bridge that dials the app itself or chains into its own /bridge.
 * @param {{mode: string, target: string, port: number, allow: string[]}} config
 * @param {{port: number, plainPort?: number}} app the listeners
 */
export const validateBridgeConfig = (config, app) => {
	if (!['off', 'local', 'port', 'allow'].includes(config.mode)) {
		throw new Error(`BRIDGE=${config.mode} is not off, local, port, or allow`);
	}
	if (config.mode === 'port' && [app.port, app.plainPort].includes(config.port)) {
		throw new Error(
			`BRIDGE_PORT=${config.port} is one of this server's own listeners`,
		);
	}
	if (config.mode === 'local') {
		let target;
		try {
			target = new URL(config.target);
		} catch {
			throw new Error(`BRIDGE_TARGET=${config.target} is not a url`);
		}
		if (!['ws:', 'wss:'].includes(target.protocol)) {
			throw new Error(`BRIDGE_TARGET=${config.target} must be ws:// or wss://`);
		}
		if ((/^\/bridge(\/|$)/).test(target.pathname)) {
			throw new Error('BRIDGE_TARGET must not point at a /bridge path');
		}
	}
};

/** parse BRIDGE* env into bridge config */
export const bridgeConfigFromEnv = (env = process.env) => ({
	mode: (env.BRIDGE ?? BRIDGE_DEFAULTS.mode).toLowerCase(),
	target: env.BRIDGE_TARGET ?? BRIDGE_DEFAULTS.target,
	port: Number(env.BRIDGE_PORT) || BRIDGE_DEFAULTS.port,
	allow: (env.BRIDGE_ALLOW ?? '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean),
	maxConnections: Number(env.BRIDGE_MAX) || BRIDGE_DEFAULTS.maxConnections,
});

/**
 * Runtime piping state for one bridged browser socket. The upstream
 * dial happens on open; browser frames queue until it connects.
 */
export const BRIDGE_QUEUE_LIMIT_BYTES = 256 * 1024;
export const BRIDGE_CONNECT_TIMEOUT_MS = 10000;
// unsent bytes a slow side may pile up before the pipe closes: a
// fast sender into a stalled reader used to buffer without bound, and
// sixteen of those shared the process with every collab room
export const BRIDGE_BACKPRESSURE_LIMIT_BYTES = 16 * 1024 * 1024;
// a quiet pipe is a held slot: half an hour of silence both ways is a
// dead jam, not a watcher
export const BRIDGE_IDLE_MS = 30 * 60 * 1000;

/**
 * @param {object} browserWs the server-side socket (close, send, getBufferedAmount)
 * @param {string} targetUrl
 * @param {(line: string) => void} [log]
 * @param {{idleMs?: number, backpressureLimit?: number}} [options]
 */
export const createBridgePipe = (browserWs, targetUrl, log = () => {}, options = {}) => {
	const idleMs = options.idleMs ?? BRIDGE_IDLE_MS;
	const backpressureLimit =
		options.backpressureLimit ?? BRIDGE_BACKPRESSURE_LIMIT_BYTES;
	/** @type {(string | Uint8Array)[]} */
	const queue = [];
	let queuedBytes = 0;
	let upstream = null;
	let closed = false;
	let lastActivity = Date.now();
	let connectTimer;
	const idleTimer = setInterval(() => {
		if (Date.now() - lastActivity >= idleMs) {
			log('bridge idle');
			closeBoth();
		}
	}, Math.min(idleMs, 60_000));

	const closeBoth = () => {
		if (closed) {
			return;
		}
		closed = true;
		clearTimeout(connectTimer);
		clearInterval(idleTimer);
		queue.length = 0;
		queuedBytes = 0;
		try {
			browserWs.close();
		} catch {
			// gone
		}
		try {
			upstream?.close();
		} catch {
			// gone
		}
	};

	/** @param {number | undefined} buffered */
	const overLimit = buffered =>
		typeof buffered === 'number' && buffered > backpressureLimit;

	try {
		upstream = new WebSocket(targetUrl);
	} catch (error) {
		log(`bridge dial failed: ${String(error)}`);
		closeBoth();
		return { fromBrowser: () => {}, close: closeBoth };
	}
	upstream.binaryType = 'arraybuffer';
	// a blackholed dial must not hold the pipe (and its queue) forever
	connectTimer = setTimeout(() => {
		if (upstream.readyState === 0) {
			log('bridge dial timed out');
			closeBoth();
		}
	}, BRIDGE_CONNECT_TIMEOUT_MS);
	upstream.addEventListener('open', () => {
		clearTimeout(connectTimer);
		for (const frame of queue) {
			upstream.send(frame);
		}
		queue.length = 0;
		queuedBytes = 0;
	});
	upstream.addEventListener('message', event => {
		lastActivity = Date.now();
		try {
			browserWs.send(
				typeof event.data === 'string' ? event.data : new Uint8Array(event.data),
			);
		} catch {
			closeBoth();
			return;
		}
		if (overLimit(browserWs.getBufferedAmount?.())) {
			log('bridge backpressure toward the browser');
			closeBoth();
		}
	});
	upstream.addEventListener('close', closeBoth);
	upstream.addEventListener('error', closeBoth);

	return {
		/** @param {string | Uint8Array} frame */
		fromBrowser: frame => {
			if (closed) {
				return;
			}
			lastActivity = Date.now();
			if (upstream.readyState === 1) {
				upstream.send(frame);
				if (overLimit(upstream.bufferedAmount)) {
					log('bridge backpressure toward the server');
					closeBoth();
				}
			} else if (upstream.readyState === 0) {
				// bounded pre-connect buffer
				queuedBytes += typeof frame === 'string' ? frame.length : frame.byteLength;
				if (queuedBytes > BRIDGE_QUEUE_LIMIT_BYTES) {
					log('bridge queue overflow');
					closeBoth();
					return;
				}
				queue.push(frame);
			} else {
				closeBoth();
			}
		},
		close: closeBoth,
	};
};
