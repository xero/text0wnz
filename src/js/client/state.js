/**
 * Global Application State Machine
 *
 * Centralizes all shared state management
 * Implements pub/sub eventing system to eliminate race conditions and
 * provide consistent state access across all components.
 */

// State object to hold all application state
const EditorState = {
	// Core components
	textArtCanvas: null,
	palette: null,
	font: null,
	cursor: null,
	selectionCursor: null,

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
		positionInfo: false,
		toolPreview: false,
		pasteTool: false,
	},
};

// Event listeners storage
const stateListeners = new Map();
const dependencyWaitQueue = new Map();

// Keys to sync to localStorage
const STATE_SYNC_KEYS = {
	CANVAS_DATA: 'canvasData',
	FONT_NAME: 'fontName',
	PALETTE_COLORS: 'paletteColors',
	FOREGROUND_COLOR: 'foregroundColor',
	BACKGROUND_COLOR: 'backgroundColor',
	ICE_COLORS: 'iceColors',
	LETTER_SPACING: 'letterSpacing',
	TITLE: 'title',
};

/**
 * Global State Management System
 */
class StateManager {
	constructor() {
		// Use direct references to the shared state objects
		this.state = EditorState;
		this.listeners = stateListeners;
		this.waitQueue = dependencyWaitQueue;
		this.loadingFromStorage = false;

		// Bind methods to ensure `this` is preserved when passed as callbacks
		this.set = this.set.bind(this);
		this.get = this.get.bind(this);
		this.on = this.on.bind(this);
		this.off = this.off.bind(this);
		this.emit = this.emit.bind(this);
		this.waitFor = this.waitFor.bind(this);
		this.checkDependencyQueue = this.checkDependencyQueue.bind(this);
		this.checkInitializationComplete = this.checkInitializationComplete.bind(this);
		this.startInitialization = this.startInitialization.bind(this);
		this.reset = this.reset.bind(this);
		this.getInitializationStatus = this.getInitializationStatus.bind(this);
		this.safely = this.safely.bind(this);
		this.saveToLocalStorage = this.saveToLocalStorage.bind(this);
		this.loadFromLocalStorage = this.loadFromLocalStorage.bind(this);
		this.restoreStateFromLocalStorage = this.restoreStateFromLocalStorage.bind(this);
	}

	/**
	 * Set a state property and notify listeners
	 */
	set(key, value) {
		const oldValue = this.state[key];
		this.state[key] = value;

		if (Object.prototype.hasOwnProperty.call(this.state.dependenciesReady, key)) {
			this.state.dependenciesReady[key] = value !== null && value !== undefined;
		}

		this.emit(`${key}:changed`, { key, value, oldValue });
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
	 * Subscribe to state changes
	 */
	on(event, callback) {
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event).push(callback);
		return this;
	}

	/**
	 * Unsubscribe from state changes
	 */
	off(event, callback) {
		if (this.listeners.has(event)) {
			const callbacks = this.listeners.get(event);
			const index = callbacks.indexOf(callback);
			if (index > -1) {
				callbacks.splice(index, 1);
			}
		}
		return this;
	}

	/**
	 * Emit an event to all listeners
	 */
	emit(event, data) {
		if (this.listeners.has(event)) {
			const callbacks = this.listeners.get(event);
			callbacks.forEach((callback, idx) => {
				try {
					callback(data);
				} catch (error) {
					const callbackName = callback.name || 'anonymous';
					console.error(
						`[State] Error in state listener for event "${event}" (listener ${idx + 1}/${callbacks.length}, function: ${callbackName}):`,
						error,
					);
				}
			});
		}
		return this;
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
			if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
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
				const isReady = this.state[dep] !== null && this.state[dep] !== undefined;
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
			'positionInfo',
			'toolPreview',
			'pasteTool',
		].every(key => this.state.dependenciesReady[key]);

		if (coreReady && !this.state.initialized && this.state.initializing) {
			this.state.initialized = true;
			this.state.initializing = false;
			this.emit('app:initialized', { state: this.state });
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
		this.emit('app:initializing', { state: this.state });
	}

	/**
	 * Reset the entire state (for testing or new files)
	 */
	reset() {
		// Reset core application state
		Object.assign(this.state, {
			textArtCanvas: null,
			palette: null,
			font: null,
			modal: null,
			cursor: null,
			selectionCursor: null,
			positionInfo: null,
			toolPreview: null,
			pasteTool: null,
			chat: null,
			sampleTool: null,
			network: null,
			worker: null,
			title: null,
			initialized: false,
			initializing: false,
			dependenciesReady: {
				palette: false,
				textArtCanvas: false,
				font: false,
				modal: false,
				cursor: false,
				selectionCursor: false,
				positionInfo: false,
				toolPreview: false,
				pasteTool: false,
			},
		});
		this.emit('app:reset', { state: this.state });
	}

	/**
	 * Get current initialization status
	 */
	getInitializationStatus() {
		return {
			initialized: this.state.initialized,
			initializing: this.state.initializing,
			dependenciesReady: { ...this.state.dependenciesReady },
			readyCount: Object.values(this.state.dependenciesReady).filter(Boolean).length,
			totalCount: Object.keys(this.state.dependenciesReady).length,
		};
	}

	/**
	 * Helper method to safely access nested properties
	 */
	safely(callback) {
		try {
			return callback(this.state);
		} catch (error) {
			console.error('[State] Error accessing:', error);
			return null;
		}
	}

	/**
	 * Serialize application state to a plain object for localStorage
	 */
	serializeState() {
		const serialized = {};

		try {
			// Save title
			if (this.state.title) {
				serialized[STATE_SYNC_KEYS.TITLE] = this.state.title;
			}

			// Save canvas data
			if (this.state.textArtCanvas && typeof this.state.textArtCanvas.getImageData === 'function') {
				const imageData = this.state.textArtCanvas.getImageData();
				const columns = this.state.textArtCanvas.getColumns();
				const rows = this.state.textArtCanvas.getRows();
				const iceColors = this.state.textArtCanvas.getIceColors();

				serialized[STATE_SYNC_KEYS.CANVAS_DATA] = {
					imageData: Array.from(imageData), // Convert Uint16Array to regular array
					columns: columns,
					rows: rows,
				};
				serialized[STATE_SYNC_KEYS.ICE_COLORS] = iceColors;
			}

			// Save font name
			if (this.state.textArtCanvas && typeof this.state.textArtCanvas.getCurrentFontName === 'function') {
				serialized[STATE_SYNC_KEYS.FONT_NAME] = this.state.textArtCanvas.getCurrentFontName();
			}

			// Save letter spacing
			if (this.state.font && typeof this.state.font.getLetterSpacing === 'function') {
				serialized[STATE_SYNC_KEYS.LETTER_SPACING] = this.state.font.getLetterSpacing();
			}

			// Save palette colors and selection
			if (this.state.palette) {
				if (typeof this.state.palette.getPalette === 'function') {
					const paletteColors = this.state.palette.getPalette();
					// Convert 8-bit RGBA to 6-bit RGB for storage (more efficient and correct)
					serialized[STATE_SYNC_KEYS.PALETTE_COLORS] = paletteColors.map(color => {
						// color is Uint8Array [r, g, b, a] in 8-bit (0-255)
						// Convert to 6-bit (0-63) for consistency with XBIN format
						return [Math.min(color[0] >> 2, 63), Math.min(color[1] >> 2, 63), Math.min(color[2] >> 2, 63), color[3]];
					});
				}
				if (typeof this.state.palette.getForegroundColor === 'function') {
					serialized[STATE_SYNC_KEYS.FOREGROUND_COLOR] = this.state.palette.getForegroundColor();
				}
				if (typeof this.state.palette.getBackgroundColor === 'function') {
					serialized[STATE_SYNC_KEYS.BACKGROUND_COLOR] = this.state.palette.getBackgroundColor();
				}
			}
		} catch (error) {
			console.error('[State] Error serializing state:', error);
		}

		return serialized;
	}

	/**
	 * Save state to localStorage
	 */
	saveToLocalStorage() {
		try {
			const serialized = this.serializeState();
			localStorage.setItem('moebiusAppState', JSON.stringify(serialized));
		} catch (error) {
			console.error('[State] Failed to save state to localStorage:', error);
		}
	}

	/**
	 * Load state from localStorage (returns the raw data, doesn't apply it)
	 */
	loadFromLocalStorage() {
		try {
			const raw = localStorage.getItem('moebiusAppState');
			if (raw) {
				return JSON.parse(raw);
			}
		} catch (error) {
			console.error('[State] Failed to load state from localStorage:', error);
		}
		return null;
	}

	/**
	 * Restore state from localStorage after components are initialized
	 * This dispatches events to ensure UI updates properly
	 */
	restoreStateFromLocalStorage() {
		const savedState = this.loadFromLocalStorage();
		if (!savedState) {
			return;
		}
		stateManager.state.modal.open('loading');
		this.loadingFromStorage = true;

		try {
			// Restore title
			if (savedState[STATE_SYNC_KEYS.TITLE]) {
				this.state.title = savedState[STATE_SYNC_KEYS.TITLE];
				document.title = `${savedState[STATE_SYNC_KEYS.TITLE]} [teXt0wnz]`;
			}

			// Restore ice colors first (before canvas data)
			if (savedState[STATE_SYNC_KEYS.ICE_COLORS] !== undefined && this.state.textArtCanvas) {
				// Ice colors will be set when we restore canvas data
			}

			// Restore canvas data
			if (savedState[STATE_SYNC_KEYS.CANVAS_DATA] && this.state.textArtCanvas) {
				const { imageData, columns, rows } = savedState[STATE_SYNC_KEYS.CANVAS_DATA];
				const iceColors = savedState[STATE_SYNC_KEYS.ICE_COLORS] || false;

				// Convert array back to Uint16Array
				const uint16Data = new Uint16Array(imageData);

				// Use setImageData to restore canvas
				if (typeof this.state.textArtCanvas.setImageData === 'function') {
					this.state.textArtCanvas.setImageData(columns, rows, uint16Data, iceColors);
				}
			}

			// Restore letter spacing
			if (savedState[STATE_SYNC_KEYS.LETTER_SPACING] !== undefined && this.state.font) {
				if (typeof this.state.font.setLetterSpacing === 'function') {
					this.state.font.setLetterSpacing(savedState[STATE_SYNC_KEYS.LETTER_SPACING]);
				}
			}

			// Restore palette colors
			if (savedState[STATE_SYNC_KEYS.PALETTE_COLORS] && this.state.palette) {
				const paletteColors = savedState[STATE_SYNC_KEYS.PALETTE_COLORS];
				if (typeof this.state.palette.setRGBAColor === 'function') {
					paletteColors.forEach((color, index) => {
						// color is [r, g, b, a] in 6-bit format (0-63)
						// setRGBAColor expects 6-bit and will expand to 8-bit
						this.state.palette.setRGBAColor(index, color);
					});
				}
			}

			// Restore foreground/background colors
			if (savedState[STATE_SYNC_KEYS.FOREGROUND_COLOR] !== undefined && this.state.palette) {
				if (typeof this.state.palette.setForegroundColor === 'function') {
					this.state.palette.setForegroundColor(savedState[STATE_SYNC_KEYS.FOREGROUND_COLOR]);
				}
			}
			if (savedState[STATE_SYNC_KEYS.BACKGROUND_COLOR] !== undefined && this.state.palette) {
				if (typeof this.state.palette.setBackgroundColor === 'function') {
					this.state.palette.setBackgroundColor(savedState[STATE_SYNC_KEYS.BACKGROUND_COLOR]);
				}
			}

			// Restore font (must be done last and async)
			if (savedState[STATE_SYNC_KEYS.FONT_NAME] && this.state.textArtCanvas) {
				if (typeof this.state.textArtCanvas.setFont === 'function') {
					// Font loading is async, so we need to handle it carefully
					this.state.textArtCanvas.setFont(savedState[STATE_SYNC_KEYS.FONT_NAME], () => {
						// After font loads, emit that state was restored
						this.emit('app:state-restored', { state: savedState });
					});
				}
			} else {
				// No font to restore, emit event immediately
				this.emit('app:state-restored', { state: savedState });
			}
		} catch (error) {
			console.error('[State] Error restoring state from localStorage:', error);
			stateManager.state.modal.close();
		} finally {
			this.loadingFromStorage = false;
			const w8 = setTimeout(_ => {
				stateManager.state.modal.close();
				clearTimeout(w8);
			}, 1500);
		}
	}
}

// Create the global state manager instance
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
	get font() {
		return stateManager.state.font;
	},
	set font(value) {
		stateManager.set('font', value);
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
		document.title = `${value} [teXt0wnz]`;
	},

	// Utility methods
	waitFor: stateManager.waitFor,
	on: stateManager.on,
	off: stateManager.off,
	emit: stateManager.emit,
	reset: stateManager.reset,
	startInitialization: stateManager.startInitialization,
	getInitializationStatus: stateManager.getInitializationStatus,
	safely: stateManager.safely,

	// LocalStorage sync methods
	saveToLocalStorage: stateManager.saveToLocalStorage,
	loadFromLocalStorage: stateManager.loadFromLocalStorage,
	restoreStateFromLocalStorage: stateManager.restoreStateFromLocalStorage,

	// Raw state access (for advanced use cases)
	_manager: stateManager,
	_state: stateManager.state,
};

// Export the state system
export { State };
// Default export
export default State;
