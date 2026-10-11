/**
 * trustedMessage: the shared postMessage receiver guard (CodeQL
 * js/missing-origin-check). Same-origin and origin-less (dedicated
 * worker) messages with object payloads pass; foreign origins and
 * non-object payloads are dropped. websocket.js carries an inline
 * copy of this logic; its behavior is pinned by the same cases here
 * via direct import of the worker script in journalWorker.test.js.
 */
import { describe, it, expect } from 'vitest';
import { trustedMessage } from '../../src/js/client/messageGuard.js';

const msg = (origin, data) => ({ origin, data });

describe('trustedMessage', () => {
	it('accepts origin-less messages (dedicated worker channel)', () => {
		expect(trustedMessage(msg('', { op: 'read' }))).toBe(true);
		expect(trustedMessage(msg(undefined, { cmd: 'init' }))).toBe(true);
	});

	it('accepts same-origin messages (service worker channel)', () => {
		expect(trustedMessage(msg(self.location.origin, { type: 'x' }))).toBe(
			true,
		);
	});

	it('rejects foreign origins', () => {
		expect(trustedMessage(msg('https://evil.example', { op: 'read' }))).toBe(
			false,
		);
	});

	it('rejects non-object payloads', () => {
		expect(trustedMessage(msg('', 'string'))).toBe(false);
		expect(trustedMessage(msg('', 42))).toBe(false);
		expect(trustedMessage(msg('', null))).toBe(false);
		expect(trustedMessage(msg('', undefined))).toBe(false);
	});
});
