import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Storage } from '../../src/js/client/storage.js';

// Note: These tests are limited because IndexedDB is not fully available in jsdom
// Full integration tests would need to run in a real browser environment
describe('Storage Utilities', () => {
	beforeEach(() => {
		// Clear localStorage before each test
		localStorage.clear();
	});

	describe('Settings Storage (localStorage)', () => {
		it('should save settings to localStorage', () => {
			const settings = {
				fontName: 'CP437 8x16',
				iceColors: true,
				letterSpacing: false,
				paletteColors: [
					[0, 0, 0, 255],
					[0, 0, 42, 255],
				],
			};

			const result = Storage.saveSettings(settings);
			expect(result).toBe(true);

			// Verify it was saved
			const raw = localStorage.getItem('text0wnz-settings');
			expect(raw).not.toBeNull();
			const parsed = JSON.parse(raw);
			expect(parsed.fontName).toBe('CP437 8x16');
			expect(parsed.iceColors).toBe(true);
		});

		it('should load settings from localStorage', () => {
			const settings = {
				fontName: 'Topaz 8x16',
				iceColors: false,
				letterSpacing: true,
			};

			localStorage.setItem('text0wnz-settings', JSON.stringify(settings));

			const loaded = Storage.loadSettings();
			expect(loaded).not.toBeNull();
			expect(loaded.fontName).toBe('Topaz 8x16');
			expect(loaded.iceColors).toBe(false);
			expect(loaded.letterSpacing).toBe(true);
		});

		it('should return null when no settings exist', () => {
			const loaded = Storage.loadSettings();
			expect(loaded).toBeNull();
		});

		it('should handle invalid JSON gracefully', () => {
			localStorage.setItem('text0wnz-settings', 'invalid json{');

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});
			const loaded = Storage.loadSettings();

			expect(loaded).toBeNull();
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('IndexedDB Operations', () => {
		// These tests are limited because IndexedDB is not fully available in jsdom
		it('should have canvas data methods', () => {
			expect(typeof Storage.saveCanvasData).toBe('function');
			expect(typeof Storage.loadCanvasData).toBe('function');
		});

		it('should have font data methods', () => {
			expect(typeof Storage.saveFontData).toBe('function');
			expect(typeof Storage.loadFontData).toBe('function');
		});

		it('should have clearAll method', () => {
			expect(typeof Storage.clearAll).toBe('function');
		});

		// Basic test to ensure methods don't crash
		it('should handle saveCanvasData without crashing', async () => {
			const canvasData = {
				imageData: new Uint16Array([1, 2, 3]),
				columns: 80,
				rows: 25,
			};

			// This will likely fail due to IndexedDB not being available in jsdom
			// but we test that it handles the error gracefully
			const result = await Storage.saveCanvasData(canvasData);
			// Result could be true or false depending on environment
			expect(typeof result).toBe('boolean');
		});

		it('should handle loadCanvasData without crashing', async () => {
			// This will likely fail due to IndexedDB not being available in jsdom
			// but we test that it handles the error gracefully
			const result = await Storage.loadCanvasData();
			// Result could be null or an object depending on environment
			expect(result === null || typeof result === 'object').toBe(true);
		});

		it('should handle saveFontData without crashing', async () => {
			const fontData = {
				bytes: new Uint8Array([1, 2, 3, 4]),
				width: 8,
				height: 16,
			};

			const result = await Storage.saveFontData('XBIN', fontData);
			expect(typeof result).toBe('boolean');
		});

		it('should handle loadFontData without crashing', async () => {
			const result = await Storage.loadFontData('XBIN');
			expect(result === null || typeof result === 'object').toBe(true);
		});
	});

	describe('Clear All Storage', () => {
		it('should clear localStorage items', async () => {
			// Set up some localStorage data
			localStorage.setItem('text0wnz-settings', 'test data');
			localStorage.setItem('editorState', 'legacy data');

			await Storage.clearAll();

			// Verify localStorage was cleared
			expect(localStorage.getItem('text0wnz-settings')).toBeNull();
			expect(localStorage.getItem('editorState')).toBeNull();
		});
	});
});
