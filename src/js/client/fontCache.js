/**
 * Font Cache System
 * Preloads and caches fonts for faster switching
 */
import State from './state.js';
import magicNumbers from './magicNumbers.js';

export const FontCache = {
	// In-memory cache for browsers without Cache API
	memoryCache: new Map(),

	/**
	 * Check if Cache API is available
	 */
	_hasCacheAPI() {
		return 'caches' in globalThis && globalThis.caches !== undefined;
	},

	/**
	 * Preload common fonts
	 */
	async preloadCommonFonts() {
		// Read default fonts from magicNumbers.js
		const commonFonts = [
			magicNumbers.DEFAULT_FONT, // CP437 8x16 - ANSI/CBIN Default
			magicNumbers.NFO_FONT, // Topaz-437 8x16 - NFO default
		];

		if (this._hasCacheAPI()) {
			try {
				const cache = await globalThis.caches.open('text0wnz-fonts-v1');

				// Preload all common fonts
				await Promise.all(
					commonFonts.map(async fontName => {
						const fontUrl = `${State.fontDir}${fontName}.png`;

						// Check if already cached
						if (!(await cache.match(fontUrl))) {
							try {
								await cache.add(fontUrl);
								console.log(`[FontCache] Preloaded ${fontName}`);
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
			// For browsers without Cache API, use fetch and store in memory
			commonFonts.forEach(fontName => {
				const fontUrl = `${State.fontDir}${fontName}.png`;

				if (!this.memoryCache.has(fontName)) {
					globalThis
						.fetch(fontUrl)
						.then(response => response.blob())
						.then(blob => {
							this.memoryCache.set(fontName, blob);
							console.log(`[FontCache] Preloaded ${fontName} to memory`);
						})
						.catch(error => {
							console.warn(`[FontCache] Failed to preload ${fontName}:`, error);
						});
				}
			});
		}
	},

	/**
	 * Get a font from cache
	 */
	async getFont(fontName) {
		const fontUrl = `${State.fontDir}${fontName}.png`;

		if (this._hasCacheAPI()) {
			try {
				const cache = await globalThis.caches.open('text0wnz-fonts-v1');
				const response = await cache.match(fontUrl);

				if (response) {
					return response;
				}
			} catch (error) {
				console.warn('[FontCache] Error fetching from cache:', error);
			}
		} else if (this.memoryCache.has(fontName)) {
			// Return from memory cache
			return new globalThis.Response(this.memoryCache.get(fontName));
		}

		// Not in cache, fetch and store
		try {
			const response = await globalThis.fetch(fontUrl);

			if (response.ok) {
				if (this._hasCacheAPI()) {
					const cache = await globalThis.caches.open('text0wnz-fonts-v1');
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

	/**
	 * Clear the font cache
	 */
	async clearCache() {
		if (this._hasCacheAPI()) {
			try {
				await globalThis.caches.delete('text0wnz-fonts-v1');
			} catch (error) {
				console.error('[FontCache] Error clearing cache:', error);
			}
		} else {
			this.memoryCache.clear();
		}
	},
};
