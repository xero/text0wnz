/**
 * Service worker unit coverage. The SKIP_WAITING listener: main.js
 * posts it when the user accepts the update modal; the worker must call
 * skipWaiting() in response (this path was dead until the postMessage
 * audit found service.js had no message listener at all). The recovery
 * path: a worker generation precached index.html with revision:null and
 * wedged returning browsers on stale HTML, so install must detect that
 * generation (legacy runtime caches or a revisionless precached
 * index.html), flag it, and skip waiting; activate must then purge the
 * legacy caches and reload only the wedged (non-answering) clients.
 * Workbox and the worker global are stubbed; jsdom has no service
 * worker scope.
 */
import {
	describe,
	it,
	expect,
	vi,
	beforeAll,
	beforeEach,
	afterAll,
} from 'vitest';

vi.mock('workbox-precaching', () => ({
	precacheAndRoute: vi.fn(),
	cleanupOutdatedCaches: vi.fn(),
}));
vi.mock('workbox-routing', () => ({ registerRoute: vi.fn() }));
vi.mock('workbox-strategies', () => ({ StaleWhileRevalidate: class {} }));

const fakeSelf = {
	__WB_MANIFEST: [],
	addEventListener: vi.fn(),
	skipWaiting: vi.fn(),
	location: { origin: 'http://localhost:3000' },
	clients: { matchAll: vi.fn(), claim: vi.fn() },
};

// name -> array of {url} request-likes; shared backing for the caches stub
let cacheStore;
const fakeCaches = {
	keys: vi.fn(async () => [...cacheStore.keys()]),
	has: vi.fn(async name => cacheStore.has(name)),
	delete: vi.fn(async name => cacheStore.delete(name)),
	open: vi.fn(async name => {
		if (!cacheStore.has(name)) {
			cacheStore.set(name, []);
		}
		const entries = cacheStore.get(name);
		return {
			keys: async () => entries,
			put: async request => {
				entries.push(typeof request === 'string' ? { url: request } : request);
			},
		};
	}),
};

let onMessage;
let onInstall;
let activateHandlers;

const runEvent = async handler => {
	let settled;
	handler({
		waitUntil: promise => {
			settled = promise;
		},
	});
	await settled;
};

beforeAll(async () => {
	vi.stubGlobal('self', fakeSelf);
	vi.stubGlobal('caches', fakeCaches);
	vi.stubGlobal('Response', class {});
	await import('../../src/service.js');
	const calls = fakeSelf.addEventListener.mock.calls;
	onMessage = calls.find(c => c[0] === 'message')?.[1];
	onInstall = calls.find(c => c[0] === 'install')?.[1];
	activateHandlers = calls.filter(c => c[0] === 'activate').map(c => c[1]);
});

beforeEach(() => {
	cacheStore = new Map();
	fakeSelf.skipWaiting.mockClear();
	fakeSelf.clients.claim.mockClear();
	fakeCaches.delete.mockClear();
});

afterAll(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('service worker message listener', () => {
	it('registers message, install, and activate listeners', () => {
		expect(typeof onMessage).toBe('function');
		expect(typeof onInstall).toBe('function');
		expect(activateHandlers.length).toBeGreaterThanOrEqual(2);
	});

	it('skips waiting on a same-origin SKIP_WAITING message', () => {
		onMessage({
			origin: 'http://localhost:3000',
			data: { type: 'SKIP_WAITING' },
		});
		expect(fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);
	});

	it('ignores foreign origins and other payloads', () => {
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

describe('wedged-generation recovery', () => {
	it('fresh install with no caches stays on the normal update path', async () => {
		await runEvent(onInstall);
		expect(fakeSelf.skipWaiting).not.toHaveBeenCalled();
		expect(cacheStore.has('text0wnz-recovery')).toBe(false);
	});

	it('a healthy revisioned precache stays on the normal update path', async () => {
		cacheStore.set('workbox-precache-v2-https://x/', [
			{ url: 'https://x/index.html?__WB_REVISION__=abc123' },
			{ url: 'https://x/ui/js/editor-HASH.js' },
		]);
		await runEvent(onInstall);
		expect(fakeSelf.skipWaiting).not.toHaveBeenCalled();
	});

	it('legacy runtime caches trigger the takeover', async () => {
		cacheStore.set('html-cache', []);
		await runEvent(onInstall);
		expect(fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);
		expect(cacheStore.has('text0wnz-recovery')).toBe(true);
	});

	it('a revisionless precached index.html triggers the takeover', async () => {
		cacheStore.set('workbox-precache-v2-https://x/', [{ url: 'https://x/index.html' }]);
		await runEvent(onInstall);
		expect(fakeSelf.skipWaiting).toHaveBeenCalledTimes(1);
	});

	it('activate purges legacy caches and reloads only silent clients', async () => {
		vi.useFakeTimers();
		cacheStore.set('html-cache', []);
		cacheStore.set('app-cache', []);
		cacheStore.set('text0wnz-recovery', [{ url: '/recovery-flag' }]);
		const healthy = {
			id: 'healthy',
			url: 'http://localhost:3000/',
			postMessage: vi.fn(),
			navigate: vi.fn(async () => {}),
		};
		const wedged = {
			id: 'wedged',
			url: 'http://localhost:3000/',
			postMessage: vi.fn(),
			navigate: vi.fn(async () => {}),
		};
		healthy.postMessage.mockImplementation(() => {
			// a live page answers the ping through the message listener
			onMessage({
				origin: 'http://localhost:3000',
				data: { type: 'RECOVERY_PONG' },
				source: { id: 'healthy' },
			});
		});
		fakeSelf.clients.matchAll.mockResolvedValue([healthy, wedged]);
		let settled;
		activateHandlers[0]({
			waitUntil: promise => {
				settled = promise;
			},
		});
		await vi.advanceTimersByTimeAsync(3000);
		await settled;
		vi.useRealTimers();
		expect(cacheStore.has('html-cache')).toBe(false);
		expect(cacheStore.has('app-cache')).toBe(false);
		expect(cacheStore.has('text0wnz-recovery')).toBe(false);
		expect(fakeSelf.clients.claim).toHaveBeenCalledTimes(1);
		expect(healthy.navigate).not.toHaveBeenCalled();
		expect(wedged.navigate).toHaveBeenCalledTimes(1);
	});

	it('activate without the flag only sweeps legacy caches', async () => {
		cacheStore.set('style-cache', []);
		await runEvent(activateHandlers[0]);
		expect(cacheStore.has('style-cache')).toBe(false);
		expect(fakeSelf.clients.claim).not.toHaveBeenCalled();
	});
});
