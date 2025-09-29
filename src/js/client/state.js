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

/**
 * Global State Management System
 */
class StateManager {
	constructor() {
		// Use direct references to the shared state objects
		this.state = EditorState;
		this.listeners = stateListeners;
		this.waitQueue = dependencyWaitQueue;

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
		document.title = `${value} :teXt.0w.nz`;
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

	// Raw state access (for advanced use cases)
	_manager: stateManager,
	_state: stateManager.state,
};

// Export the state system
export { State };
// Default export
export default State;
