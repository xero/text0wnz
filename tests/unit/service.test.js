/**
 * Service worker SKIP_WAITING listener: main.js posts SKIP_WAITING to
 * a waiting worker at registration time; the worker must call
 * skipWaiting() in response (this path was dead until the postMessage
 * audit found service.js had no message listener at all). Workbox and
 * the worker global are stubbed; jsdom has no service worker scope.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('workbox-precaching', () => ({
	precacheAndRoute: vi.fn(),
	cleanupOutdatedCaches: vi.fn(),
}));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn() }));
vi.mock('workbox-strategies', () => ({ CacheFirst: class {} }));

const fakeSelf = {
	__WB_MANIFEST: [],
	addEventListener: vi.fn(),
	skipWaiting: vi.fn(),
	location: { origin: 'http://localhost:3000' },
	clients: { matchAll: vi.fn() },
};

let onMessage;

beforeAll(async () => {
	vi.stubGlobal('self', fakeSelf);
	await import('../../src/service.js');
	const call = fakeSelf.addEventListener.mock.calls.find(
		c => c[0] === 'message',
	);
	onMessage = call && call[1];
});

afterAll(() => {
	vi.unstubAllGlobals();
});

describe('service worker message listener', () => {
	it('registers a message listener', () => {
		expect(typeof onMessage).toBe('function');
	});

	it('skips waiting on a same-origin SKIP_WAITING message', () => {
		onMessage({
			origin: 'http://localhost:3000',
			data: { type: 'SKIP_WAITING' },
		});
		expect(fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);
	});

	it('ignores foreign origins and other payloads', () => {
		fakeSelf.skipWaiting.mockClear();
		onMessage({
			origin: 'https://evil.example',
			data: { type: 'SKIP_WAITING' },
		});
		onMessage({ origin: 'http://localhost:3000', data: { type: 'OTHER' } });
		onMessage({ origin: 'http://localhost:3000', data: 'SKIP_WAITING' });
		onMessage({ origin: 'http://localhost:3000', data: null });
		expect(fakeSelf.skipWaiting).not.toHaveBeenCalled();
	});
});
