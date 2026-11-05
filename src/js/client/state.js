/**
 * Global application state. waitFor() queues callbacks until their
 * dependencies are set, so the init tiers can land in any order.
 */

import { Storage } from './storage.js';
import { migrateV2Autosave } from '../core/index';
import magicNumbers from './magicNumbers.js';

const EditorState = {
	fontWidth: null,
	fontHeight: null,

	textArtCanvas: null,
	palette: null,
	font: null,
	cursor: null,
	selectionCursor: null,
	selectionTool: null,

	modal: null,
	positionInfo: null,
	toolPreview: null,
	pasteTool: null,

	network: null,
	worker: null,

	title: null,
};

const dependencyWaitQueue = new Map();


class StateManager {
	constructor() {
		this.state = EditorState;
		this.waitQueue = dependencyWaitQueue;
		this.loadingFromStorage = false;

		// vite.config normalizes VITE_UI_DIR the same way before naming
		// the emitted dirs; the runtime must derive the identical path
		// or every font fetch 404s on slashless env forms
		const dirSlash = dir => dir.replace(/^\/|\/?$/g, '') + '/';
		// parenthesized: `a + b || c` concatenates "undefined" into the
		// path (truthy), so the fallbacks would never fire
		this.uiDir =
			(import.meta.env.BASE_URL || '') +
			dirSlash(import.meta.env.VITE_UI_DIR || 'ui');
		this.fontDir =
			this.uiDir + dirSlash(import.meta.env.VITE_FONT_DIR || 'fonts');

		// bound: State re-exports these as bare function references
		this.waitFor = this.waitFor.bind(this);
		this.saveToLocalStorage = this.saveToLocalStorage.bind(this);
		this.restoreStateFromLocalStorage =
			this.restoreStateFromLocalStorage.bind(this);
		this.clearLocalStorage = this.clearLocalStorage.bind(this);
	}

	set(key, value) {
		this.state[key] = value;
		this.checkDependencyQueue();
		return this;
	}

	/** run callback now if every dependency is set, else once they all are */
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

	checkDependencyQueue() {
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

	/** a blank canvas on default settings: nothing worth autosaving */
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
			return false; // unknown counts as non-default so the autosave runs
		}
	}

	async saveToLocalStorage() {
		try {
			const scaleFactor = this.state.font?.getScaleFactor() ?? 1;
			const hasNonDefaultZoom = scaleFactor !== 1;

			// a live session's canvas, font, and settings describe the
			// session doc and never reach the local autosave; the zoom is
			// the viewer's own, so it alone merges into the stored record.
			// A blank doc back at 1x has only that zoom to say, or the
			// last stored zoom returns on reload. The network slot is
			// optional: a collab worker that failed to construct must not
			// cost every autosave of the session
			if (
				stateManager.state.network?.isConnected?.() === true ||
				(!hasNonDefaultZoom && this.isDefaultState())
			) {
				if ((Storage.loadSettings()?.scaleFactor ?? 1) !== scaleFactor) {
					Storage.mergeSettings({ scaleFactor });
				}
				return;
			}

			// heavy data goes to IndexedDB, light settings to localStorage
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
	 * The journal lives outside Storage, in OPFS or its own IndexedDB
	 * database, and the restore prefers it, so a clear that left it would
	 * bring the cleared doc back with the next settings save.
	 * @returns {Promise<unknown>}
	 */
	clearLocalStorage() {
		return Promise.allSettled([
			Storage.clearAll(),
			this.state.textArtCanvas?.wipeJournal?.(),
		]);
	}

	/** restore the autosave once every component exists */
	async restoreStateFromLocalStorage() {
		const settings = Storage.loadSettings();
		if (!settings) {
			return;
		}
		// a session zoom saved over an empty store: there is no local doc
		// to reload, and the full restore below applies the zoom only
		// through a stored font name
		if (Object.keys(settings).every(key => key === 'scaleFactor')) {
			this.state.font?.setScaleFactor?.(settings.scaleFactor);
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
		// set once the canvas holds the saved doc; before that, a keyframe
		// would write the blank canvas over the art the next reload needs
		let adopted = false;
		const fail = error => {
			console.error('[State] Error restoring state from localStorage:', error);
			this.loadingFromStorage = false;
			closeModal();
			if (!adopted) {
				this.state.textArtCanvas?.stopJournal?.();
			}
			this.state.textArtCanvas?.setIceColors?.(settings.iceColors);
		};
		// the timer bodies run outside the try below; a throw there would
		// leave the flag set, and the journal holds every keyframe while
		// it is, so autosave would stop for the session
		const guard = fn => async () => {
			try {
				await fn();
			} catch (error) {
				fail(error);
			}
		};

		try {
			// ice colors stay on until the font lands, so no blink timer
			// starts mid-restore
			const originalIceColors = settings.iceColors;
			if (this.state.textArtCanvas) {
				this.state.textArtCanvas.setIceColors(true);
			}

			if (settings.letterSpacing !== undefined && this.state.font) {
				this.state.font.setLetterSpacing(settings.letterSpacing);
			}

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

			setTimeout(guard(async () => {
				const xbFontData = await Storage.loadFontData('XBIN');

				if (xbFontData && this.state.textArtCanvas) {
					this.state.textArtCanvas.setXBFontData(
						xbFontData.bytes,
						xbFontData.width,
						xbFontData.height,
					);
				}

				// the OPFS autosave journal is the source of truth and
				// restores plane-native: a u16 restore would flatten
				// frames, truecolor, and unicode, and its keyframe would
				// then destroy them in the journal too. The legacy
				// IndexedDB snapshot is the fallback, migrated through
				// core/migrate so restoring it re-seeds the journal via
				// setDocData's keyframe trigger.
				setTimeout(guard(async () => {
					const journalData =
						await this.state.textArtCanvas?.loadJournalSnapshot?.();

					if (journalData?.doc && this.state.textArtCanvas) {
						this.state.textArtCanvas.setDocData(journalData.doc);
					} else if (this.state.textArtCanvas) {
						const migrated = migrateV2Autosave({
							canvasData: await Storage.loadCanvasData(),
							settings: settings,
						});
						if (migrated) {
							this.state.textArtCanvas.setDocData(migrated.doc);
						}
					}
					adopted = true;

					setTimeout(guard(() => {
						if (settings?.fontName && this.state.textArtCanvas) {
							this.state.textArtCanvas.setFont(
								settings.fontName,
								() => {
									// setFont reruns a callback that throws, so the flag
									// clears before anything here can
									this.loadingFromStorage = false;
									closeModal();
									if (this.state.textArtCanvas) {
										this.state.textArtCanvas.setIceColors(originalIceColors);
									}
									document.dispatchEvent(
										new CustomEvent('onStateRestorationComplete'),
									);
								},
								savedScaleFactor,
							);
						} else {
							this.loadingFromStorage = false;
							closeModal();
							if (this.state.textArtCanvas) {
								this.state.textArtCanvas.setIceColors(originalIceColors);
							}
						}
					}), 0);
				}), 0);
			}), 0);
		} catch (error) {
			fail(error);
		}
	}
}

const stateManager = new StateManager();

const State = {
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
	get uiDir() {
		return stateManager.uiDir;
	},
	get fontDir() {
		return stateManager.fontDir;
	},
	get loadingFromStorage() {
		return stateManager.loadingFromStorage;
	},

	waitFor: stateManager.waitFor,

	saveToLocalStorage: stateManager.saveToLocalStorage,
	restoreStateFromLocalStorage: stateManager.restoreStateFromLocalStorage,
	clearLocalStorage: stateManager.clearLocalStorage,

	_manager: stateManager,
	_state: stateManager.state,
};

export { State };
export default State;
