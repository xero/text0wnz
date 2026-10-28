/**
 * Global application state: centralizes shared state with a pub/sub
 * eventing system so components see consistent state without races.
 */

import { Storage } from './storage.js';
import { migrateV2Autosave } from '../core/index';
import magicNumbers from './magicNumbers.js';

const EditorState = {
	urlPrefix: null,
	uiDir: null,
	fontDir: null,
	fontWidth: null,
	fontHeight: null,

	// Core components
	textArtCanvas: null,
	palette: null,
	font: null,
	cursor: null,
	selectionCursor: null,
	selectionTool: null,

	// UI components
	modal: null,
	positionInfo: null,
	toolPreview: null,
	pasteTool: null,
	chat: null,
	sampleTool: null,

	// Network/collaboration
	network: null,
	worker: null,

	// Application metadata
	title: null,

	// Initialization state
	initialized: false,
	initializing: false,

	// Dependencies ready flags
	dependenciesReady: {
		palette: false,
		textArtCanvas: false,
		font: false,
		modal: false,
		cursor: false,
		selectionCursor: false,
		selectionTool: false,
		positionInfo: false,
		toolPreview: false,
		pasteTool: false,
	},
};

const dependencyWaitQueue = new Map();


/**
 * Global State Management System
 */
class StateManager {
	constructor() {
		this.state = EditorState;
		this.waitQueue = dependencyWaitQueue;
		this.loadingFromStorage = false;

		// Environment var or defaults
		this.urlPrefix = import.meta.env.BASE_URL || '';
		// vite.config normalizes VITE_UI_DIR the same way before naming
		// the emitted dirs; the runtime must derive the identical path
		// or every font fetch 404s on slashless env forms
		const dirSlash = dir => dir.replace(/^\/|\/?$/g, '') + '/';
		// parenthesized: `a + b || c` concatenates "undefined" into the
		// path (truthy), so the fallbacks could never fire
		this.uiDir = this.urlPrefix + dirSlash(import.meta.env.VITE_UI_DIR || 'ui');
		this.fontDir =
			this.uiDir + dirSlash(import.meta.env.VITE_FONT_DIR || 'fonts');

		// Bind methods to ensure `this` is preserved when passed as callbacks
		this.set = this.set.bind(this);
		this.get = this.get.bind(this);
		this.waitFor = this.waitFor.bind(this);
		this.checkDependencyQueue = this.checkDependencyQueue.bind(this);
		this.checkInitializationComplete =
			this.checkInitializationComplete.bind(this);
		this.startInitialization = this.startInitialization.bind(this);
		this.saveToLocalStorage = this.saveToLocalStorage.bind(this);
		this.saveUndoHistory = this.saveUndoHistory.bind(this);
		this.restoreStateFromLocalStorage =
			this.restoreStateFromLocalStorage.bind(this);
		this.clearLocalStorage = this.clearLocalStorage.bind(this);
		this.isDefaultState = this.isDefaultState.bind(this);
	}

	/**
	 * Set a state property and settle any dependency waits on it
	 */
	set(key, value) {
		this.state[key] = value;

		if (
			Object.prototype.hasOwnProperty.call(this.state.dependenciesReady, key)
		) {
			this.state.dependenciesReady[key] = value !== null && value !== undefined;
		}

		this.checkDependencyQueue(key);
		this.checkInitializationComplete();
		return this;
	}

	/**
	 * Get a state property
	 */
	get(key) {
		return this.state[key];
	}

	/**
	 * Wait for dependencies to be available before executing callback
	 */
	waitFor(dependencies, callback) {
		const deps = Array.isArray(dependencies) ? dependencies : [dependencies];

		const allReady = deps.every(dep => {
			const isReady = this.state[dep] !== null && this.state[dep] !== undefined;
			return isReady;
		});

		if (allReady) {
			callback(
				deps.reduce((acc, dep) => {
					acc[dep] = this.state[dep];
					return acc;
				}, {}),
			);
		} else {
			let waitId;
			if (
				typeof crypto !== 'undefined' &&
				typeof crypto.randomUUID === 'function'
			) {
				waitId = `wait_${crypto.randomUUID()}`;
			} else {
				if (!this._waitIdCounter) {
					this._waitIdCounter = 1;
				}
				waitId = `wait_${this._waitIdCounter++}`;
			}
			this.waitQueue.set(waitId, { dependencies: deps, callback });
		}
		return this;
	}

	/**
	 * Check if waiting dependencies are satisfied
	 */
	checkDependencyQueue(_key) {
		const toRemove = [];

		this.waitQueue.forEach((waiter, waitId) => {
			const allReady = waiter.dependencies.every(dep => {
				const isReady =
					this.state[dep] !== null && this.state[dep] !== undefined;
				return isReady;
			});

			if (allReady) {
				try {
					const resolvedDeps = waiter.dependencies.reduce((acc, dep) => {
						acc[dep] = this.state[dep];
						return acc;
					}, {});
					waiter.callback(resolvedDeps);
				} catch (error) {
					console.error('[State] Error in dependency wait callback:', error);
				}
				toRemove.push(waitId);
			}
		});

		toRemove.forEach(waitId => this.waitQueue.delete(waitId));
	}

	/**
	 * Check if core initialization is complete
	 */
	checkInitializationComplete() {
		const coreReady = [
			'palette',
			'textArtCanvas',
			'font',
			'modal',
			'cursor',
			'selectionCursor',
			'selectionTool',
			'positionInfo',
			'toolPreview',
			'pasteTool',
		].every(key => this.state.dependenciesReady[key]);

		if (coreReady && !this.state.initialized && this.state.initializing) {
			this.state.initialized = true;
			this.state.initializing = false;
		}
	}

	/**
	 * Mark initialization as started
	 */
	startInitialization() {
		if (this.state.initializing || this.state.initialized) {
			console.warn('[State] Initialization already in progress or complete');
			return;
		}

		this.state.initializing = true;
	}

	/**
	 * Check if current state is all defaults (blank canvas with default settings)
	 */
	isDefaultState() {
		try {
			if (this.state.textArtCanvas) {
				const columns = this.state.textArtCanvas.getColumns();
				const rows = this.state.textArtCanvas.getRows();
				if (columns !== 80 || rows !== 25) {
					return false;
				}

				const imageData = this.state.textArtCanvas.getImageData();
				const BLANK_CELL = 0;
				for (let i = 0; i < imageData.length; i++) {
					if (imageData[i] !== BLANK_CELL) {
						return false;
					}
				}

				const fontName = this.state.textArtCanvas.getCurrentFontName();
				if (fontName !== 'CP437 8x16') {
					return false;
				}

				const iceColors = this.state.textArtCanvas.getIceColors();
				if (iceColors !== false) {
					return false;
				}

				if (typeof this.state.textArtCanvas.getXBFontData === 'function') {
					const xbFontData = this.state.textArtCanvas.getXBFontData();
					if (xbFontData && xbFontData.bytes) {
						return false;
					}
				}
			}

			if (this.state.font && this.state.font.getLetterSpacing) {
				if (this.state.font.getLetterSpacing() !== false) {
					return false;
				}
			}

			if (this.state.palette && this.state.palette.getPalette) {
				const currentPalette = this.state.palette.getPalette();
				const defaultPalette = [
					[0, 0, 0, 255],
					[0, 0, 170, 255],
					[0, 170, 0, 255],
					[0, 170, 170, 255],
					[170, 0, 0, 255],
					[170, 0, 170, 255],
					[170, 85, 0, 255],
					[170, 170, 170, 255],
					[85, 85, 85, 255],
					[85, 85, 255, 255],
					[85, 255, 85, 255],
					[85, 255, 255, 255],
					[255, 85, 85, 255],
					[255, 85, 255, 255],
					[255, 255, 85, 255],
					[255, 255, 255, 255],
				];

				for (let i = 0; i < 16; i++) {
					const current = currentPalette[i];
					const defaultColor = defaultPalette[i];
					for (let j = 0; j < 4; j++) {
						if (current[j] !== defaultColor[j]) {
							return false;
						}
					}
				}
			}

			return true;
		} catch (error) {
			console.error('[State] Error checking default state:', error);
			return false; // If there's an error, assume it's not default to be safe
		}
	}

	/**
	 * Save non-default state to localStorage
	 */
	async saveToLocalStorage() {
		try {
			const scaleFactor = this.state.font?.getScaleFactor() ?? 1;
			const hasNonDefaultZoom = scaleFactor !== 1;

			// Skip saving if state is default (unless zoom changed) or connected
			// to network. The network slot is optional: a collab worker that
			// failed to construct must not cost every autosave of the session.
			if (
				!hasNonDefaultZoom &&
				(this.isDefaultState() ||
				  stateManager.state.network?.isConnected?.() === true)
			) {
				return;
			}

			// Split data between localStorage and IndexedDB

			// 1. Save heavy data to IndexedDB
			if (
				this.state.textArtCanvas &&
				typeof this.state.textArtCanvas.getImageData === 'function'
			) {
				const imageData = this.state.textArtCanvas.getImageData();
				const columns = this.state.textArtCanvas.getColumns();
				const rows = this.state.textArtCanvas.getRows();

				await Storage.saveCanvasData({
					imageData,
					columns,
					rows,
				});
			}

			if (
				this.state.textArtCanvas &&
				typeof this.state.textArtCanvas.getXBFontData === 'function'
			) {
				const xbFontData = this.state.textArtCanvas.getXBFontData();
				if (xbFontData && xbFontData.bytes) {
					await Storage.saveFontData('XBIN', xbFontData);
				}
			}

			// 2. Save lightweight settings to localStorage
			const settings = {
				fontName: this.state.textArtCanvas?.getCurrentFontName(),
				iceColors: this.state.textArtCanvas?.getIceColors(),
				letterSpacing: this.state.font?.getLetterSpacing(),
				scaleFactor: this.state.font?.getScaleFactor() ?? 1,
				paletteColors: this.state.palette
					?.getPalette()
					.map(color => [
						Math.min(color[0] >> 2, 63),
						Math.min(color[1] >> 2, 63),
						Math.min(color[2] >> 2, 63),
						color[3],
					]),
			};

			Storage.saveSettings(settings);
		} catch (error) {
			console.error('[State] Failed to save state:', error);
		}
	}

	/**
	 * Persist undo history to IndexedDB
	 * Heavy write; call on idle, visibilitychange, or pagehide only
	 */
	async saveUndoHistory() {
		try {
			if (
				!this.state.textArtCanvas ||
				typeof this.state.textArtCanvas.getUndoHistory !== 'function' ||
				this.state.network?.isConnected?.()
			) {
				return;
			}
			const undoHistory = this.state.textArtCanvas.getUndoHistory();
			if (undoHistory) {
				await Storage.saveUndoHistory(undoHistory);
			}
		} catch (error) {
			console.error('[State] Failed to save undo history:', error);
		}
	}

	/**
	 * Clear all state from localStorage
	 */
	clearLocalStorage() {
		Storage.clearAll();
	}

	/**
	 * Restore state from localStorage after components are initialized,
	 * dispatching events so the UI updates. Reads compressed,
	 * uncompressed, and legacy storage formats.
	 */
	async restoreStateFromLocalStorage() {
		const settings = Storage.loadSettings();
		if (!settings) {
			this.state.textArtCanvas?.releaseBootSnapshot?.();
			return;
		}

		stateManager.state.modal.loading('Reloading editor from local storage...');
		this.loadingFromStorage = true;

		const closeModal = () => {
			if (
				!stateManager.state.modal.current() ||
				stateManager.state.modal.current() === 'loading'
			) {
				stateManager.state.modal.close();
			}
		};

		try {
			if (settings) {
				// Temporarily enable ice colors to prevent blink timer
				const originalIceColors = settings.iceColors;
				if (this.state.textArtCanvas) {
					this.state.textArtCanvas.setIceColors(true);
				}

				if (settings.letterSpacing !== undefined && this.state.font) {
					this.state.font.setLetterSpacing(settings.letterSpacing);
				}

				// Store scale factor to pass to setFont later
				const savedScaleFactor = settings.scaleFactor ?? 1;

				if (settings.paletteColors && this.state.palette) {
					settings.paletteColors.forEach((color, index) => {
						this.state.palette.setRGBAColor(index, color);
					});
					this.state.palette.setForegroundColor(
						magicNumbers.DEFAULT_FOREGROUND,
					);
					this.state.palette.setBackgroundColor(
						magicNumbers.DEFAULT_BACKGROUND,
					);
				}

				setTimeout(async () => {
					const xbFontData = await Storage.loadFontData('XBIN');

					if (xbFontData && this.state.textArtCanvas) {
						this.state.textArtCanvas.setXBFontData(
							xbFontData.bytes,
							xbFontData.width,
							xbFontData.height,
						);
					}

					// Load canvas data: the OPFS autosave journal is the source
					// of truth and restores plane-native (frames, truecolor,
					// and unicode survive; the u16 projection flattened all
					// three and the restore's keyframe then destroyed them in
					// the journal too). The legacy IndexedDB snapshot is the
					// fallback, migrated through core/migrate so restoring it
					// re-seeds the journal via setDocData's keyframe trigger.
					setTimeout(async () => {
						const journalData =
							await this.state.textArtCanvas?.loadBootSnapshot?.();

						if (journalData?.doc && this.state.textArtCanvas) {
							this.state.textArtCanvas.setDocData(journalData.doc);
						} else if (this.state.textArtCanvas) {
							const migrated = migrateV2Autosave({
								canvasData: await Storage.loadCanvasData(),
								settings: settings,
								xbFont: xbFontData,
							});
							if (migrated) {
								this.state.textArtCanvas.setDocData(migrated.doc);
							}
						}

						const undoHistory = await Storage.loadUndoHistory();
						if (
							undoHistory &&
							this.state.textArtCanvas &&
							typeof this.state.textArtCanvas.setUndoHistory === 'function'
						) {
							this.state.textArtCanvas.setUndoHistory(undoHistory);
						}

						// Finally, set font
						setTimeout(() => {
							if (settings?.fontName && this.state.textArtCanvas) {
								this.state.textArtCanvas.setFont(
									settings.fontName,
									() => {
										// NOW restore the actual ice colors setting
										if (this.state.textArtCanvas) {
											this.state.textArtCanvas.setIceColors(originalIceColors);
										}
										this.loadingFromStorage = false;
										closeModal();
										document.dispatchEvent(
											new CustomEvent('onStateRestorationComplete'),
										);
									},
									savedScaleFactor,
								);
							} else {
								if (this.state.textArtCanvas) {
									this.state.textArtCanvas.setIceColors(originalIceColors);
								}
								this.loadingFromStorage = false;
								closeModal();
							}
						}, 0);
					}, 0);
				}, 0);
			}
		} catch (error) {
			console.error('[State] Error restoring state from localStorage:', error);
			this.loadingFromStorage = false;
			closeModal();
		}
	}
}

const stateManager = new StateManager();

const State = {
	// Direct property access for better performance and no circular references
	get textArtCanvas() {
		return stateManager.state.textArtCanvas;
	},
	set textArtCanvas(value) {
		stateManager.set('textArtCanvas', value);
	},
	get positionInfo() {
		return stateManager.state.positionInfo;
	},
	set positionInfo(value) {
		stateManager.set('positionInfo', value);
	},
	get pasteTool() {
		return stateManager.state.pasteTool;
	},
	set pasteTool(value) {
		stateManager.set('pasteTool', value);
	},
	/** @returns {ReturnType<typeof import('./palette.js').createPalette>|null} */
	get palette() {
		return stateManager.state.palette;
	},
	set palette(value) {
		stateManager.set('palette', value);
	},
	get toolPreview() {
		return stateManager.state.toolPreview;
	},
	set toolPreview(value) {
		stateManager.set('toolPreview', value);
	},
	get cursor() {
		return stateManager.state.cursor;
	},
	set cursor(value) {
		stateManager.set('cursor', value);
	},
	get selectionCursor() {
		return stateManager.state.selectionCursor;
	},
	set selectionCursor(value) {
		stateManager.set('selectionCursor', value);
	},
	get selectionTool() {
		return stateManager.state.selectionTool;
	},
	set selectionTool(value) {
		stateManager.set('selectionTool', value);
	},
	/** @returns {*} font instance (loadFontFromImage/loadFontFromXBData resolve untyped) */
	get font() {
		return stateManager.state.font;
	},
	set font(value) {
		stateManager.set('font', value);
	},
	get fontWidth() {
		return stateManager.state.fontWidth;
	},
	set fontWidth(value) {
		stateManager.set('fontWidth', value);
	},
	get fontHeight() {
		return stateManager.state.fontHeight;
	},
	set fontHeight(value) {
		stateManager.set('fontHeight', value);
	},
	get modal() {
		return stateManager.state.modal;
	},
	set modal(value) {
		stateManager.set('modal', value);
	},
	get network() {
		return stateManager.state.network;
	},
	set network(value) {
		stateManager.set('network', value);
	},
	get worker() {
		return stateManager.state.worker;
	},
	set worker(value) {
		stateManager.set('worker', value);
	},
	get title() {
		return stateManager.state.title;
	},
	set title(value) {
		stateManager.set('title', value);
		if (
			['fullscreen', 'standalone', 'minimal-ui'].some(
				displayMode =>
					window.matchMedia(`(display-mode: ${displayMode})`).matches,
			)
		) {
			document.title = value;
		} else {
			document.title = `${value} [teXt0wnz]`;
		}
	},
	// URLs
	get urlPrefix() {
		return stateManager.urlPrefix;
	},
	get uiDir() {
		return stateManager.uiDir;
	},
	get fontDir() {
		return stateManager.fontDir;
	},
	get loadingFromStorage() {
		return stateManager.loadingFromStorage;
	},

	// Utility methods
	waitFor: stateManager.waitFor,
	startInitialization: stateManager.startInitialization,

	// LocalStorage sync methods
	saveToLocalStorage: stateManager.saveToLocalStorage,
	saveUndoHistory: stateManager.saveUndoHistory,
	restoreStateFromLocalStorage: stateManager.restoreStateFromLocalStorage,
	clearLocalStorage: stateManager.clearLocalStorage,

	// Raw state access (for advanced use cases)
	_manager: stateManager,
	_state: stateManager.state,
};

export { State };
export default State;
