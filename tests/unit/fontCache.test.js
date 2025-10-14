import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FontCache } from '../../src/js/client/fontCache.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({ default: { fontDir: '/ui/fonts/' } }));

// Mock magicNumbers module
vi.mock('../../src/js/client/magicNumbers.js', () => ({
	default: {
		DEFAULT_FONT: 'CP437 8x16',
		NFO_FONT: 'Topaz-437 8x16',
	},
}));

describe('FontCache Module', () => {
	let mockCache;
	let originalCaches;
	let originalFetch;
	let mockFetch;

	beforeEach(() => {
		// Reset the memory cache
		FontCache.memoryCache.clear();

		// Mock Cache API
		mockCache = {
			match: vi.fn(),
			add: vi.fn(),
			put: vi.fn(),
			delete: vi.fn(),
		};

		originalCaches = globalThis.caches;
		originalFetch = globalThis.fetch;

		globalThis.caches = {
			open: vi.fn().mockResolvedValue(mockCache),
			delete: vi.fn().mockResolvedValue(true),
		};

		// Mock fetch
		mockFetch = vi.fn();
		globalThis.fetch = mockFetch;

		// Clear console methods to reduce noise
		vi.spyOn(console, 'log').mockImplementation(() => {});
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});

	afterEach(() => {
		globalThis.caches = originalCaches;
		globalThis.fetch = originalFetch;
		vi.clearAllMocks();
		vi.restoreAllMocks();
	});

	describe('preloadCommonFonts', () => {
		it('should preload common fonts using Cache API', async () => {
			mockCache.match.mockResolvedValue(null); // Font not in cache
			mockCache.add.mockResolvedValue(undefined);

			await FontCache.preloadCommonFonts();

			expect(globalThis.caches.open).toHaveBeenCalledWith('text0wnz-fonts-v1');
			expect(mockCache.match).toHaveBeenCalledWith('/ui/fonts/CP437 8x16.png');
			expect(mockCache.match).toHaveBeenCalledWith(
				'/ui/fonts/Topaz-437 8x16.png',
			);
			expect(mockCache.add).toHaveBeenCalledTimes(2);
		});

		it('should skip preloading if font is already cached', async () => {
			mockCache.match.mockResolvedValue(new globalThis.Response('cached'));
			mockCache.add.mockResolvedValue(undefined);

			await FontCache.preloadCommonFonts();

			expect(mockCache.match).toHaveBeenCalledTimes(2);
			expect(mockCache.add).not.toHaveBeenCalled();
		});

		it('should handle cache.add failures gracefully', async () => {
			mockCache.match.mockResolvedValue(null);
			mockCache.add.mockRejectedValue(new Error('Network error'));

			await FontCache.preloadCommonFonts();

			expect(console.warn).toHaveBeenCalled();
		});

		it('should use memory cache when Cache API is not available', async () => {
			// Temporarily remove caches API
			const tempCaches = globalThis.caches;
			delete globalThis.caches;

			const mockBlob = new Blob(['font data']);
			mockFetch.mockResolvedValue({ blob: vi.fn().mockResolvedValue(mockBlob) });

			FontCache.preloadCommonFonts();

			// Wait for async operations
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(mockFetch).toHaveBeenCalledWith('/ui/fonts/CP437 8x16.png');
			expect(mockFetch).toHaveBeenCalledWith('/ui/fonts/Topaz-437 8x16.png');

			// Restore caches
			globalThis.caches = tempCaches;
		});

		it('should handle fetch failures in memory cache mode', async () => {
			const tempCaches = globalThis.caches;
			delete globalThis.caches;

			mockFetch.mockRejectedValue(new Error('Network error'));

			FontCache.preloadCommonFonts();

			// Wait for async operations
			await new Promise(resolve => setTimeout(resolve, 10));

			expect(console.warn).toHaveBeenCalled();

			globalThis.caches = tempCaches;
		});
	});

	describe('getFont', () => {
		it('should retrieve font from Cache API', async () => {
			const mockResponse = new globalThis.Response('font data');
			mockCache.match.mockResolvedValue(mockResponse);

			const result = await FontCache.getFont('CP437 8x16');

			expect(globalThis.caches.open).toHaveBeenCalledWith('text0wnz-fonts-v1');
			expect(mockCache.match).toHaveBeenCalledWith('/ui/fonts/CP437 8x16.png');
			expect(result).toBe(mockResponse);
		});

		it('should fetch and cache font if not in Cache API', async () => {
			mockCache.match.mockResolvedValue(null);
			const mockResponse = new globalThis.Response('font data');
			mockResponse.clone = vi.fn().mockReturnValue(mockResponse);
			mockFetch.mockResolvedValue(mockResponse);

			const result = await FontCache.getFont('TestFont');

			expect(mockFetch).toHaveBeenCalledWith('/ui/fonts/TestFont.png');
			expect(mockCache.put).toHaveBeenCalledWith(
				'/ui/fonts/TestFont.png',
				mockResponse,
			);
			expect(result).toBe(mockResponse);
		});

		it('should retrieve font from memory cache', async () => {
			const tempCaches = globalThis.caches;
			delete globalThis.caches;

			const mockBlob = new Blob(['font data']);
			FontCache.memoryCache.set('TestFont', mockBlob);

			const result = await FontCache.getFont('TestFont');

			expect(result).toBeInstanceOf(globalThis.Response);

			globalThis.caches = tempCaches;
		});

		it('should fetch and store in memory cache when not cached', async () => {
			const tempCaches = globalThis.caches;
			delete globalThis.caches;

			const mockBlob = new Blob(['font data']);
			const mockResponse = new globalThis.Response(mockBlob);
			mockResponse.clone = vi
				.fn()
				.mockReturnValue({ blob: vi.fn().mockResolvedValue(mockBlob) });
			mockFetch.mockResolvedValue(mockResponse);

			const result = await FontCache.getFont('NewFont');

			expect(mockFetch).toHaveBeenCalledWith('/ui/fonts/NewFont.png');
			expect(result).toBe(mockResponse);

			globalThis.caches = tempCaches;
		});

		it('should return null on fetch error', async () => {
			mockCache.match.mockResolvedValue(null);
			mockFetch.mockRejectedValue(new Error('Network error'));

			const result = await FontCache.getFont('MissingFont');

			expect(result).toBeNull();
			expect(console.error).toHaveBeenCalled();
		});

		it('should return null on non-ok response', async () => {
			mockCache.match.mockResolvedValue(null);
			const mockResponse = {
				ok: false,
				status: 404,
				clone: vi.fn(),
			};
			mockFetch.mockResolvedValue(mockResponse);

			const result = await FontCache.getFont('MissingFont');

			expect(result).toBeNull();
		});

		it('should handle cache API errors gracefully', async () => {
			mockCache.match.mockRejectedValue(new Error('Cache error'));
			const mockResponse = new globalThis.Response('font data');
			mockFetch.mockResolvedValue(mockResponse);

			const result = await FontCache.getFont('TestFont');

			expect(console.warn).toHaveBeenCalled();
			expect(result).toBe(mockResponse);
		});
	});

	describe('clearCache', () => {
		it('should clear Cache API', async () => {
			await FontCache.clearCache();

			expect(globalThis.caches.delete).toHaveBeenCalledWith(
				'text0wnz-fonts-v1',
			);
		});

		it('should handle Cache API delete errors', async () => {
			globalThis.caches.delete.mockRejectedValue(new Error('Delete error'));

			await FontCache.clearCache();

			expect(console.error).toHaveBeenCalled();
		});

		it('should clear memory cache when Cache API is not available', async () => {
			const tempCaches = globalThis.caches;
			delete globalThis.caches;

			FontCache.memoryCache.set('TestFont', new Blob(['data']));
			expect(FontCache.memoryCache.size).toBe(1);

			await FontCache.clearCache();

			expect(FontCache.memoryCache.size).toBe(0);

			globalThis.caches = tempCaches;
		});
	});

	describe('Edge Cases', () => {
		it('should handle concurrent preload calls', async () => {
			mockCache.match.mockResolvedValue(null);
			mockCache.add.mockResolvedValue(undefined);

			await Promise.all([
				FontCache.preloadCommonFonts(),
				FontCache.preloadCommonFonts(),
			]);

			expect(globalThis.caches.open).toHaveBeenCalled();
		});

		it('should handle special characters in font names', async () => {
			const mockResponse = new globalThis.Response('font data');
			mockCache.match.mockResolvedValue(mockResponse);

			const result = await FontCache.getFont('Font-With-Dashes');

			expect(mockCache.match).toHaveBeenCalledWith(
				'/ui/fonts/Font-With-Dashes.png',
			);
			expect(result).toBe(mockResponse);
		});
	});
});
