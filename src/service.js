import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { trustedMessage } from './js/client/messageGuard.js';

const CACHE_ID = 'text0wnz-shared-files';
const CACHE_DATA = '/shared-file-data';
// the v2 worker's runtime caches, never versioned or purged; their
// presence marks a wedged install serving stale HTML
const LEGACY_CACHES = ['html-cache', 'app-cache', 'style-cache', 'asset-cache'];
// install-time flag cache so the recovery decision survives the worker
// being killed between the install and activate events
const RECOVERY_FLAG = 'text0wnz-recovery';

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// clients that answer the recovery ping are healthy pages whose work
// must not be yanked; wedged pages have no running JS and stay silent
const ponged = new Set();

self.addEventListener('message', event => {
	if (!trustedMessage(event)) {
		return;
	}
	// the page picks the moment: an accepted update, or no live session
	// whose lazy-loaded assets activation could evict
	if (event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
	if (event.data.type === 'RECOVERY_PONG' && event.source) {
		ponged.add(event.source.id);
	}
});

// the legacy worker precaches index.html with revision:null (immutable
// to workbox), so its installs serve stale HTML referencing deleted
// hashed assets. Detecting one (or its runtime caches) lets install
// take over immediately and activation repair it.
const detectLegacy = async () => {
	const names = await caches.keys();
	if (names.some(name => LEGACY_CACHES.includes(name))) {
		return true;
	}
	for (const name of names.filter(name => name.includes('precache'))) {
		const keys = await (await caches.open(name)).keys();
		if (
			keys.some(
				request =>
					request.url.includes('index.html') &&
					!request.url.includes('__WB_REVISION__'),
			)
		) {
			return true;
		}
	}
	return false;
};

self.addEventListener('install', event => {
	event.waitUntil(
		(async () => {
			try {
				if (await detectLegacy()) {
					await (await caches.open(RECOVERY_FLAG)).put(
						'/recovery-flag',
						new Response('1'),
					);
					self.skipWaiting();
				}
			} catch (error) {
				console.error('[ServiceWorker] Legacy detection failed:', error);
			}
		})(),
	);
});

self.addEventListener('activate', event => {
	event.waitUntil(
		(async () => {
			try {
				const recovering = await caches.has(RECOVERY_FLAG);
				const names = await caches.keys();
				await Promise.all(
					names
						.filter(name => LEGACY_CACHES.includes(name))
						.map(name => caches.delete(name)),
				);
				if (!recovering) {
					return;
				}
				await caches.delete(RECOVERY_FLAG);
				await self.clients.claim();
				// ping every window; pages that answer are healthy and keep
				// their session, silent ones are wedged and get reloaded into
				// the repaired precache
				const clients = await self.clients.matchAll({ type: 'window' });
				ponged.clear();
				clients.forEach(client => {
					client.postMessage({ type: 'RECOVERY_PING' });
				});
				await new Promise(resolve => setTimeout(resolve, 2500));
				// fire and forget: a navigation waits for this activation to
				// finish, so awaiting it here would deadlock the worker and
				// stall every fetch behind it
				clients
					.filter(client => !ponged.has(client.id))
					.forEach(client => {
						client.navigate(client.url).catch(() => {});
					});
			} catch (error) {
				console.error('[ServiceWorker] Recovery failed:', error);
			}
		})(),
	);
});

self.addEventListener('fetch', event => {
	const url = new URL(event.request.url);
	if (url.pathname === '/open' && event.request.method === 'POST') {
		event.respondWith(handleShareTarget(event.request));
	}
});

async function handleShareTarget(request) {
	try {
		// Sec-Fetch-Site never reaches a worker (fetch adds it after handle
		// fetch), but Chromium sets Origin on a POST navigation first. The
		// share sheet posts as the app itself; a hostile page posts its own
		// origin or "null" and must not force bytes into every open tab
		if (request.headers.get('origin') !== self.location.origin) {
			return Response.redirect('/', 303);
		}
		const formData = await request.formData();
		const file = formData.get('file');

		if (file && file.size > 0) {
			const cache = await caches.open(CACHE_ID);
			await cache.put(
				new Request(CACHE_DATA),
				new Response(file, {
					headers: {
						'Content-Type': file.type || 'application/octet-stream',
						'X-Filename': file.name || 'untitled.txt',
						'X-File-Size': file.size.toString(),
						'X-Shared-At': Date.now().toString(),
						'X-Source': 'share-target',
					},
				}),
			);
			const clients = await self.clients.matchAll({ type: 'window' });
			clients.forEach(client => {
				client.postMessage({
					type: 'SHARED_FILE_READY',
					filename: file.name,
					size: file.size,
				});
			});
		}
		return Response.redirect('/?source=share', 303);
	} catch (error) {
		console.error('[ServiceWorker] Error handling share target:', error);
		return Response.redirect('/', 303);
	}
}

// escaped: uiDir interpolates into the RegExp below; normalized like
// vite.config so slashless env forms still match the emitted tree
const uiDir = (import.meta.env.VITE_UI_DIR || 'ui')
	.replace(/^\/|\/?$/g, '')
	.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Everything hash-named lives in the precache; the only runtime cache
// left is for the unhashed reference images, served stale-while-
// revalidate so an in-place change still propagates. No path anchor:
// the app also deploys under a sub path (github pages preview).
registerRoute(
	({ url }) =>
		url.pathname.match(new RegExp(`/${uiDir}/img/.*\\.(png|svg|ico)$`)),
	new StaleWhileRevalidate({ cacheName: 'img-cache' }),
);

// stale shared files are worthless after activation; drop them
self.addEventListener('activate', event => {
	event.waitUntil(
		(async () => {
			try {
				const cache = await caches.open(CACHE_ID);
				const keys = await cache.keys();
				if (keys.length > 0) {
					console.log(
						`[ServiceWorker] Found ${keys.length} stale shared file(s), clearing cache`,
					);
					await caches.delete(CACHE_ID);
				}
			} catch (error) {
				console.error(
					'[ServiceWorker] Failed to cleanup shared file cache:',
					error,
				);
			}
		})(),
	);
});
