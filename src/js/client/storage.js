// @ts-check
/**
 * Optimized storage system using IndexedDB for binary data and
 * localStorage for small configuration
 */

// IndexedDB setup
/** @type {Promise<IDBDatabase> | null} */
let sharedDb = null;

/** @returns {Promise<IDBDatabase>} */
const openDb = () => {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('text0wnz', 4);

		request.onupgradeneeded = _e => {
			const db = request.result;

			if (!db.objectStoreNames.contains('canvasData')) {
				db.createObjectStore('canvasData');
			}

			if (!db.objectStoreNames.contains('fontData')) {
				db.createObjectStore('fontData');
			}

			if (!db.objectStoreNames.contains('undoHistory')) {
				db.createObjectStore('undoHistory');
			}

			if (!db.objectStoreNames.contains('refImage')) {
				db.createObjectStore('refImage');
			}
		};

		request.onsuccess = _e => {
			const db = request.result;
			// close when a newer version opens elsewhere, or that tab's
			// upgrade blocks forever on this connection; drop the shared
			// handle so the next op reopens instead of using a dead one
			db.onversionchange = () => {
				db.close();
				sharedDb = null;
			};
			// abnormal closes only (script close() never fires it)
			db.onclose = () => {
				sharedDb = null;
			};
			resolve(db);
		};
		request.onerror = _e => reject(request.error);
		// an old-version tab without the close hook above wedges this
		// open: settle the promise so callers degrade instead of hanging
		request.onblocked = _e =>
			reject(new Error('text0wnz db held open by an older tab'));
	});
};

/**
 * One shared connection for every op: the old per-call open never
 * closed its connection, leaking one handle per storage call.
 * @returns {Promise<IDBDatabase>}
 */
const dbPromise = () => {
	if (!sharedDb) {
		sharedDb = openDb().catch(error => {
			sharedDb = null;
			throw error;
		});
	}
	return sharedDb;
};

// Storage API
export const Storage = {
	/**
	 * Save canvas state to IndexedDB
	 * @param {unknown} data canvas snapshot (Uint16Array plus metadata)
	 */
	async saveCanvasData(data) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('canvasData', 'readwrite');
			const store = tx.objectStore('canvasData');

			// Store canvas data directly as Uint16Array - more efficient than conversion
			await /** @type {Promise<void>} */(new Promise((resolve, reject) => {
				const request = store.put(data, 'currentCanvas');
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			}));

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
	 * @param {string} fontName
	 * @param {unknown} fontData
	 */
	async saveFontData(fontName, fontData) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('fontData', 'readwrite');
			const store = tx.objectStore('fontData');

			await /** @type {Promise<void>} */(new Promise((resolve, reject) => {
				const request = store.put(fontData, fontName);
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			}));

			return true;
		} catch (error) {
			console.error('[Storage] Error saving font data:', error);
			return false;
		}
	},

	/**
	 * Load font data from IndexedDB
	 * @param {string} fontName
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
	 * Save undo history to IndexedDB
	 * @param {unknown} undoHistory
	 */
	async saveUndoHistory(undoHistory) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('undoHistory', 'readwrite');
			const store = tx.objectStore('undoHistory');

			await /** @type {Promise<void>} */(new Promise((resolve, reject) => {
				const request = store.put(undoHistory, 'currentUndoHistory');
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			}));

			return true;
		} catch (error) {
			console.error('[Storage] Error saving undo history:', error);
			return false;
		}
	},

	/**
	 * Load undo history from IndexedDB
	 */
	async loadUndoHistory() {
		try {
			const db = await dbPromise();
			const tx = db.transaction('undoHistory', 'readonly');
			const store = tx.objectStore('undoHistory');

			return await new Promise((resolve, reject) => {
				const request = store.get('currentUndoHistory');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		} catch (error) {
			console.error('[Storage] Error loading undo history:', error);
			return null;
		}
	},

	/**
	 * Save the reference image to IndexedDB. Raw bytes, never a Blob or
	 * File: Safari drops those in a structured clone.
	 * @param {{buffer: ArrayBuffer, type: string}} image
	 */
	async saveRefImage(image) {
		try {
			const db = await dbPromise();
			const tx = db.transaction('refImage', 'readwrite');
			const store = tx.objectStore('refImage');

			await /** @type {Promise<void>} */(new Promise((resolve, reject) => {
				const request = store.put(image, 'currentRef');
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			}));

			return true;
		} catch (error) {
			console.error('[Storage] Error saving reference image:', error);
			return false;
		}
	},

	/**
	 * Load the reference image from IndexedDB
	 * @returns the stored record, undefined when nothing is stored, or
	 * null when the read itself failed (callers treat these differently:
	 * a failure must not be mistaken for an empty store)
	 */
	async loadRefImage() {
		try {
			const db = await dbPromise();
			const tx = db.transaction('refImage', 'readonly');
			const store = tx.objectStore('refImage');

			return await new Promise((resolve, reject) => {
				const request = store.get('currentRef');
				request.onsuccess = () => resolve(request.result);
				request.onerror = () => reject(request.error);
			});
		} catch (error) {
			console.error('[Storage] Error loading reference image:', error);
			return null;
		}
	},

	/**
	 * Drop the stored reference image blob
	 */
	async clearRefImage() {
		try {
			const db = await dbPromise();
			const tx = db.transaction('refImage', 'readwrite');
			const store = tx.objectStore('refImage');

			await /** @type {Promise<void>} */(new Promise((resolve, reject) => {
				const request = store.clear();
				request.onsuccess = () => resolve();
				request.onerror = () => reject(request.error);
			}));

			return true;
		} catch (error) {
			console.error('[Storage] Error clearing reference image:', error);
			return false;
		}
	},

	/**
	 * Save lightweight settings to localStorage
	 * @param {object} settings
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
		localStorage.removeItem('text0wnz-settings');
		localStorage.removeItem('refImage');
		localStorage.removeItem('editorState'); // legacy key

		try {
			const db = await dbPromise();
			const tx1 = db.transaction('canvasData', 'readwrite');
			const store1 = tx1.objectStore('canvasData');
			store1.clear();

			const tx2 = db.transaction('fontData', 'readwrite');
			const store2 = tx2.objectStore('fontData');
			store2.clear();

			const tx3 = db.transaction('undoHistory', 'readwrite');
			const store3 = tx3.objectStore('undoHistory');
			store3.clear();

			const tx4 = db.transaction('refImage', 'readwrite');
			const store4 = tx4.objectStore('refImage');
			store4.clear();

			return true;
		} catch (error) {
			console.error('[Storage] Error clearing storage:', error);
			return false;
		}
	},
};
