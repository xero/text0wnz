/**
 * Wire-auth backoff keyed by who asks, not only where. Keyed by room
 * alone, one client sending a wrong password every 30 seconds held a
 * passworded room shut for everyone, the right password included. A
 * gate (one per room) keeps a backoff per client address, two tries
 * free and then the shared doubling to a 30 second cap, plus a room
 * budget of wrong guesses a minute, so many addresses together still
 * guess slowly.
 *
 * No address enters a gate as text: the key is a hash under a salt
 * minted per process, never logged or written down. IPv6 is cut to its
 * /64 first, because one subscriber holds the whole /64 and would
 * otherwise mint a fresh backoff per address.
 *
 * (No @ts-check: Bun/node types are not in the repo's TS lib set.)
 */

import { createHmac, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';
import { authCooldownMs } from './utils.js';

const SALT = randomBytes(32);

/** wrong guesses a minute one room takes from every address together,
 * unless ROOM_MAX_GUESSES sets another */
export const AUTH_ROOM_BUDGET = 20;
/** client keys one gate holds; past it, unknown keys are refused */
export const AUTH_GATE_KEYS = 4096;
/** a settled key is forgotten this long after its last failure */
const AUTH_KEY_IDLE_MS = 60_000;

/** `[v6]:port`, `v4:port`, or a bare address, down to the address */
const stripPort = value => {
	const bracketed = (/^\[([^\]]+)\](?::\d+)?$/).exec(value);
	if (bracketed) {
		return bracketed[1];
	}
	// one colon is v4 with a port; a bare v6 has two or more
	const v4 = (/^([\d.]+):\d+$/).exec(value);
	return v4 ? v4[1] : value;
};

const unmapped = address => address.replace(/^::ffff:/i, '');

const isLoopback = address =>
	address === '::1' || (isIP(address) === 4 && address.startsWith('127.'));

/**
 * The address a request speaks for: the socket's peer, unless that peer
 * is a proxy this server trusts, whose X-Real-IP or last
 * X-Forwarded-For hop names the client. Loopback is always trusted,
 * the Docker image's own Caddy among it; TRUST_PROXY adds proxies that
 * reach the server from elsewhere. Anyone else's headers are ignored:
 * believing them would let a guesser mint a fresh backoff per forged
 * address.
 * @param {string} peer the socket's address
 * @param {{get(name: string): string | null}} headers
 * @param {string[]} [trusted] TRUST_PROXY addresses
 */
export const clientAddress = (peer, headers, trusted = []) => {
	const from = unmapped(peer);
	if (!isLoopback(from) && !trusted.includes(from)) {
		return from;
	}
	// Caddy's {remote} placeholder carries the port
	const real = stripPort((headers.get('x-real-ip') ?? '').trim());
	const hops = (headers.get('x-forwarded-for') ?? '').split(',');
	const last = stripPort((hops.at(-1) ?? '').trim());
	const named = [real, last].filter(address => isIP(address)).map(unmapped);
	// proxies differ in which header they overwrite: Caddy and Apache
	// append the true hop to X-Forwarded-For but pass a visitor's own
	// X-Real-IP through, and an nginx that sets only X-Real-IP passes a
	// forged X-Forwarded-For along. Two names that disagree mean one is
	// forged, so the request counts as the proxy's own
	if (named.length === 2 && named[0] !== named[1]) {
		return from;
	}
	return named[0] ?? from;
};

/** a v6 address expanded down to its first four groups, the /64 */
const prefix64 = address => {
	const [head, tail] = address.split('%')[0].split('::');
	const front = head ? head.split(':') : [];
	const back = tail ? tail.split(':') : [];
	const fill = tail === undefined ? 0 : 8 - front.length - back.length;
	return [...front, ...new Array(Math.max(0, fill)).fill('0'), ...back]
		.slice(0, 4)
		.map(group => (parseInt(group, 16) || 0).toString(16))
		.join(':');
};

/**
 * A gate key for an address, salted so the gate never holds one.
 * @param {string} address
 */
export const addressKey = address => {
	const plain = unmapped(address.toLowerCase());
	const who = isIP(plain) === 6 ? `${prefix64(plain)}::/64` : plain;
	return createHmac('sha256', SALT).update(who).digest('base64url')
		.slice(0, 22);
};

/**
 * One room's gate; `now` is injectable for tests.
 * @param {{budget?: number}} [options] wrong guesses a minute, all
 *   addresses together
 */
export const createAuthGate = ({ budget = AUTH_ROOM_BUDGET } = {}) => {
	/** @type {Map<string, {failures: number, cooldownUntil: number, lastAt: number}>} */
	const keys = new Map();
	const refillMs = 60_000 / budget;
	let left = budget;
	let leftAt = 0;
	const refill = now => {
		left = Math.min(budget, left + (now - leftAt) / refillMs);
		leftAt = now;
	};
	const shed = now => {
		for (const [key, entry] of keys) {
			if (now >= entry.cooldownUntil && now - entry.lastAt > AUTH_KEY_IDLE_MS) {
				keys.delete(key);
			}
		}
	};
	return {
		/** may this key try a password now?
		 * @param {string} key @param {number} [now] */
		open(key, now = Date.now()) {
			refill(now);
			if (left < 1) {
				return false;
			}
			const entry = keys.get(key);
			if (entry) {
				return now >= entry.cooldownUntil;
			}
			if (keys.size >= AUTH_GATE_KEYS) {
				shed(now);
			}
			// fail closed: a flood of fresh keys gets no fresh tries
			return keys.size < AUTH_GATE_KEYS;
		},
		/** a wrong password from this key
		 * @param {string} key @param {number} [now] */
		fail(key, now = Date.now()) {
			refill(now);
			left = Math.max(0, left - 1);
			let entry = keys.get(key);
			if (!entry) {
				entry = { failures: 0, cooldownUntil: 0, lastAt: 0 };
				keys.set(key, entry);
			}
			entry.failures++;
			entry.lastAt = now;
			entry.cooldownUntil = now + authCooldownMs(entry.failures);
		},
		/** the right password: this key starts over
		 * @param {string} key */
		pass(key) {
			keys.delete(key);
		},
		/** nothing left worth keeping, so the gate itself can go
		 * @param {number} [now] */
		idle(now = Date.now()) {
			refill(now);
			shed(now);
			return keys.size === 0 && left >= budget;
		},
	};
};
