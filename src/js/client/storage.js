/**
 * Optimized storage system using IndexedDB for binary data and
 * localStorage for small configuration
 */

// IndexedDB setup
const dbPromise = () => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('text0wnz', 2);

		request.onupgradeneeded = e => {
			const db = e.target.result;

			// Create object stores if they don't exist
			if (!db.objectStoreNames.contains('canvasData')) {
				db.createObjectStore('canvasData');
			}

			if (!db.objectStoreNames.contains('fontData')) {
				db.createObjectStore('fontData');
			}
		};

		request.onsuccess = e => resolve(e.target.result);
		request.onerror = e => reject(e.target.error);
	});
};

// Storage API
export const Storage = {
	/**
	 * Save canvas state to IndexedDB
	 */
	async saveCanvasData(data) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('canvasData', 'readwrite');
			const store = tx.objectStore('canvasData');

			// Store canvas data directly as Uint16Array - more efficient than conversion
			await new Promise((resolve, reject) => {
				const request = store.put(data, 'currentCanvas');
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});

			return true;
		} catch (error) {
			console.error('[Storage] Error saving canvas data:', error);
			return false;
		}
	},

	/**
	 * Load canvas state from IndexedDB
	 */
	async loadCanvasData() {
		try {
			const db = await dbPromise();
			const tx = db.transaction('canvasData', 'readonly');
			const store = tx.objectStore('canvasData');

			return await new Promise((resolve, reject) => {
				const request = store.get('currentCanvas');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		} catch (error) {
			console.error('[Storage] Error loading canvas data:', error);
			return null;
		}
	},

	/**
	 * Save font data to IndexedDB
	 */
	async saveFontData(fontName, fontData) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('fontData', 'readwrite');
			const store = tx.objectStore('fontData');

			await new Promise((resolve, reject) => {
				const request = store.put(fontData, fontName);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			});

			return true;
		} catch (error) {
			console.error('[Storage] Error saving font data:', error);
			return false;
		}
	},

	/**
	 * Load font data from IndexedDB
	 */
	async loadFontData(fontName) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('fontData', 'readonly');
			const store = tx.objectStore('fontData');

			return await new Promise((resolve, reject) => {
				const request = store.get(fontName);
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		} catch (error) {
			console.error('[Storage] Error loading font data:', error);
			return null;
		}
	},

	/**
	 * Save lightweight settings to localStorage
	 */
	saveSettings(settings) {
		try {
			localStorage.setItem('text0wnz-settings', JSON.stringify(settings));
			return true;
		} catch (error) {
			console.error('[Storage] Error saving settings:', error);
			return false;
		}
	},

	/**
	 * Load lightweight settings from localStorage
	 */
	loadSettings() {
		try {
			const settings = localStorage.getItem('text0wnz-settings');
			return settings ? JSON.parse(settings) : null;
		} catch (error) {
			console.error('[Storage] Error loading settings:', error);
			return null;
		}
	},

	/**
	 * Clear all storage
	 */
	async clearAll() {
		// Clear localStorage
		localStorage.removeItem('text0wnz-settings');
		localStorage.removeItem('editorState'); // Clear legacy data

		// Clear IndexedDB
		try {
			const db = await dbPromise();
			const tx1 = db.transaction('canvasData', 'readwrite');
			const store1 = tx1.objectStore('canvasData');
			store1.clear();

			const tx2 = db.transaction('fontData', 'readwrite');
			const store2 = tx2.objectStore('fontData');
			store2.clear();

			return true;
		} catch (error) {
			console.error('[Storage] Error clearing storage:', error);
			return false;
		}
	},
};
