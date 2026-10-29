/* global __BUILD_STAMP__ */
/**
 * Font cache: preloads and caches font PNGs for faster switching.
 */
import State from './state.js';
import magicNumbers from './magicNumbers.js';

// the build stamp in the name retires stale atlases: this cache sits
// outside every SW cache route, so a deploy that fixes an existing
// font would otherwise never reach returning users
const FONT_CACHE_NAME = `text0wnz-fonts-${
	typeof __BUILD_STAMP__ === 'undefined' ? 'dev' : __BUILD_STAMP__
}`;
let stalePurged = false;
const openFontCache = async () => {
	const cache = await globalThis.caches.open(FONT_CACHE_NAME);
	if (!stalePurged) {
		stalePurged = true;
		const names = await globalThis.caches.keys();
		for (const name of names) {
			if (name.startsWith('text0wnz-fonts') && name !== FONT_CACHE_NAME) {
				globalThis.caches.delete(name);
			}
		}
	}
	return cache;
};

export const FontCache = {
	// In-memory cache for browsers without Cache API
	memoryCache: new Map(),

	_hasCacheAPI() {
		return 'caches' in globalThis && globalThis.caches !== undefined;
	},

	async preloadCommonFonts() {
		const commonFonts = [
			magicNumbers.DEFAULT_FONT, // CP437 8x16 - ANSI/CBIN Default
			magicNumbers.NFO_FONT, // Topaz-437 8x16 - NFO default
		];

		if (this._hasCacheAPI()) {
			try {
				const cache = await openFontCache();

				await Promise.all(
					commonFonts.map(async fontName => {
						const fontUrl = `${State.fontDir}${fontName}.png`;

						if (!(await cache.match(fontUrl))) {
							try {
								await cache.add(fontUrl);
							} catch (err) {
								console.warn(`[FontCache] Failed to preload ${fontName}:`, err);
							}
						}
					}),
				);
			} catch (error) {
				console.error('[FontCache] Error preloading fonts:', error);
			}
		} else {
			commonFonts.forEach(fontName => {
				const fontUrl = `${State.fontDir}${fontName}.png`;

				if (!this.memoryCache.has(fontName)) {
					globalThis
						.fetch(fontUrl)
						.then(response => response.blob())
						.then(blob => {
							this.memoryCache.set(fontName, blob);
						})
						.catch(error => {
							console.warn(`[FontCache] Failed to preload ${fontName}:`, error);
						});
				}
			});
		}
	},

	async getFont(fontName) {
		const fontUrl = `${State.fontDir}${fontName}.png`;

		if (this._hasCacheAPI()) {
			try {
				const cache = await openFontCache();
				const response = await cache.match(fontUrl);

				if (response) {
					return response;
				}
			} catch (error) {
				console.warn('[FontCache] Error fetching from cache:', error);
			}
		} else if (this.memoryCache.has(fontName)) {
			return new globalThis.Response(this.memoryCache.get(fontName));
		}

		try {
			const response = await globalThis.fetch(fontUrl);

			if (response.ok) {
				if (this._hasCacheAPI()) {
					const cache = await openFontCache();
					cache.put(fontUrl, response.clone());
				} else {
					response
						.clone()
						.blob()
						.then(blob => {
							this.memoryCache.set(fontName, blob);
						});
				}
				return response;
			}
		} catch (error) {
			console.error('[FontCache] Error fetching font:', error);
		}

		return null;
	},

	async clearCache() {
		if (this._hasCacheAPI()) {
			try {
				await globalThis.caches.delete(FONT_CACHE_NAME);
			} catch (error) {
				console.error('[FontCache] Error clearing cache:', error);
			}
		} else {
			this.memoryCache.clear();
		}
	},
};
