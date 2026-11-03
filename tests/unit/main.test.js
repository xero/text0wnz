import {
	describe,
	it,
	expect,
	beforeAll,
	beforeEach,
	afterEach,
	vi,
} from 'vitest';
import { createTextArtCanvas } from '../../src/js/client/canvas.js';
import magicNumbers from '../../src/js/client/magicNumbers.js';

const mockState = {
	startInitialization: vi.fn(),
	// records only: running the tier 3 callback boots every lazy tool,
	// far past what these mocks can stand in for
	waitFor: vi.fn(),
	// never settles: the update re-offer it chains wants a service worker
	restoreStateFromLocalStorage: vi.fn(() => new Promise(() => {})),
	clearLocalStorage: vi.fn(),
	title: { value: 'untitled' },
	fontDir: 'ui/fonts/',
	textArtCanvas: {
		clearXBData: vi.fn(callback => callback && callback()),
		clear: vi.fn(),
		resize: vi.fn(),
		setImageData: vi.fn(),
		setIceColors: vi.fn(),
		getIceColors: vi.fn(() => false),
		setFont: vi.fn((fontName, callback) => callback && callback()),
		getCurrentFontName: vi.fn(() => 'CP437 8x16'),
		getColumns: vi.fn(() => 80),
		getRows: vi.fn(() => 25),
		undo: vi.fn(),
		redo: vi.fn(),
		setMirrorMode: vi.fn(),
		getMirrorMode: vi.fn(() => false),
	},
	palette: {
		setForegroundColor: vi.fn(),
		setBackgroundColor: vi.fn(),
		getForegroundColor: vi.fn(() => 7),
		getBackgroundColor: vi.fn(() => 0),
	},
	font: {
		setLetterSpacing: vi.fn(),
		getLetterSpacing: vi.fn(() => false),
		getWidth: vi.fn(() => 8),
		getHeight: vi.fn(() => 16),
		draw: vi.fn(),
	},
	pasteTool: {
		cut: vi.fn(),
		copy: vi.fn(),
		paste: vi.fn(),
		systemPaste: vi.fn(),
		deleteSelection: vi.fn(),
	},
};

const createMockElement = (overrides = {}) => ({
	style: { display: 'block' },
	classList: { add: vi.fn(), remove: vi.fn() },
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	click: vi.fn(),
	appendChild: vi.fn(),
	focus: vi.fn(),
	insertBefore: vi.fn(),
	setAttribute: vi.fn(),
	value: 'mock',
	innerText: 'mock',
	textContent: 'mock',
	files: null,
	getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })),
	width: 100,
	height: 100,
	...overrides,
});

const mockCreateFunctions = {
	createPasteTool: vi.fn(() => mockState.pasteTool),
	createPositionInfo: vi.fn(() => ({ update: vi.fn() })),
	createSelectionCursor: vi.fn(() => ({
		hide: vi.fn(),
		setStart: vi.fn(),
		setEnd: vi.fn(),
	})),
	createCursor: vi.fn(() => ({
		getX: vi.fn(() => 0),
		getY: vi.fn(() => 0),
		left: vi.fn(),
		right: vi.fn(),
		up: vi.fn(),
		down: vi.fn(),
	})),
	createToolPreview: vi.fn(() => ({ clear: vi.fn() })),
	createModalController: vi.fn(() => ({
		isOpen: vi.fn(() => false),
		open: vi.fn(),
		close: vi.fn(),
		error: vi.fn(),
	})),
	createDefaultPalette: vi.fn(() => mockState.palette),
	createPalettePreview: vi.fn(() => ({ updatePreview: vi.fn() })),
	createPalettePicker: vi.fn(() => ({ updatePalette: vi.fn() })),
	createKeyboardController: vi.fn(() => ({
		enable: vi.fn(),
		disable: vi.fn(),
		ignore: vi.fn(),
		unignore: vi.fn(),
		insertRow: vi.fn(),
		deleteRow: vi.fn(),
		insertColumn: vi.fn(),
		deleteColumn: vi.fn(),
		eraseRow: vi.fn(),
		eraseToStartOfRow: vi.fn(),
		eraseToEndOfRow: vi.fn(),
		eraseColumn: vi.fn(),
		eraseToStartOfColumn: vi.fn(),
		eraseToEndOfColumn: vi.fn(),
	})),
	createSettingToggle: vi.fn(() => ({
		update: vi.fn(),
		sync: vi.fn(),
	})),
	createZoomControl: vi.fn(() => createMockElement()),
};

// the stub below hides jsdom, which the SAUCE dialog tests still need
// for a real textarea
const jsdom = document;

// Set up global document BEFORE any imports
vi.stubGlobal('document', {
	getElementById: vi.fn(id => {
		const mockElement = createMockElement();
		if (id === 'open-file') {
			return { ...mockElement, files: [{ name: 'test.ans' }]};
		}
		if (id === 'columns-input' || id === 'rows-input') {
			return { ...mockElement, value: '80' };
		}
		return mockElement;
	}),
	querySelector: vi.fn(() => ({ textContent: 'mock' })),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	dispatchEvent: vi.fn(),
	title: 'test',
	createElement: vi.fn(() => createMockElement()),
});

global.alert = vi.fn();
global.confirm = vi.fn();

vi.mock('../../src/js/client/state.js', () => ({ default: mockState }));
vi.mock('../../src/js/client/ui.js', () => ({
	$: global.document.getElementById,
	$$: global.document.querySelector,
	createCanvas: vi.fn(() => createMockElement()),
	...mockCreateFunctions,
	onClick: vi.fn(),
	onReturn: vi.fn(),
	onFileChange: vi.fn(),
	onSelectChange: vi.fn(),
	undoAndRedo: vi.fn(),
	createPaintShortcuts: vi.fn(() => ({
		enable: vi.fn(),
		disable: vi.fn(),
		ignore: vi.fn(),
		unignore: vi.fn(),
	})),
	createGrid: vi.fn(() => ({ isShown: vi.fn(() => false), show: vi.fn() })),
	menuHover: vi.fn(),
	enforceMaxBytes: vi.fn(),
	createResolutionController: vi.fn(),
	createDragDropController: vi.fn(),
}));
// the UI modules initializeAppComponents wires up before the resize
// dialog; each stands in with just enough surface for the boot
vi.mock('../../src/js/client/palette.js', async importOriginal => ({
	...(await importOriginal()),
	createPalettePreview: mockCreateFunctions.createPalettePreview,
	createPalettePicker: mockCreateFunctions.createPalettePicker,
}));
vi.mock('../../src/js/client/keyboard.js', async importOriginal => ({
	...(await importOriginal()),
	createKeyboardController: mockCreateFunctions.createKeyboardController,
}));
vi.mock('../../src/js/client/sixteenColors.js', () => ({ createSixteenColors: vi.fn(() => ({})) }));
vi.mock('../../src/js/client/asciiArena.js', () => ({ createAsciiArena: vi.fn(() => ({})) }));
vi.mock('../../src/js/client/artpacks.js', () => ({ createArtpacksLanding: vi.fn(() => ({})) }));
vi.mock('../../src/js/client/archiveOpen.js', () => ({
	createArchiveOpener: vi.fn(() => ({})),
	isArchiveFile: vi.fn(() => false),
}));
vi.mock('../../src/js/client/plugins.js', () => ({ createPluginManager: vi.fn(() => ({})) }));
vi.mock('../../src/js/client/referenceImage.js', () => ({ createReferenceImage: vi.fn(() => null) }));
vi.mock('../../src/js/client/charsetPicker.js', () => ({ createCharsetPicker: vi.fn(() => ({ show: vi.fn() })) }));
vi.mock('../../src/js/client/colorPanel.js', () => ({ createColorPanel: vi.fn() }));
vi.mock('../../src/js/client/frames.js', () => ({ createFramesPanel: vi.fn(() => null) }));
vi.mock('../../src/js/client/minimap.js', () => ({ createMinimap: vi.fn(() => null) }));
vi.mock('../../src/js/client/toolSettings.js', () => ({ createToolSettings: vi.fn(() => ({ show: vi.fn(), hide: vi.fn() })) }));
vi.mock('../../src/js/client/selectionBar.js', () => ({ createSelectionBar: vi.fn(() => ({})) }));
vi.mock('../../src/js/client/toolbar.js', () => ({
	default: {
		add: vi.fn(() => ({ enable: vi.fn() })),
		getCurrentTool: vi.fn(() => 'keyboard'),
		switchTool: vi.fn(),
	},
}));
vi.mock('../../src/js/client/file.js', () => ({
	Load: {
		file: vi.fn(),
		sauceToAppFont: vi.fn(),
		resetSauceFlags: vi.fn(),
	},
	Save: {
		ans: vi.fn(),
		utf8: vi.fn(),
		bin: vi.fn(),
		xb: vi.fn(),
		png: vi.fn(),
	},
}));

vi.mock('../../src/js/client/font.js', () => ({
	loadFontFromImage: vi.fn((_name, _spacing, _palette) => {
		return Promise.resolve({
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		});
	}),
	loadFontFromXBData: vi.fn((_data, _width, _height, _spacing, _palette) => {
		return Promise.resolve({
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			setLetterSpacing: vi.fn(),
			getLetterSpacing: vi.fn(() => false),
		});
	}),
}));

vi.mock('../../src/js/client/canvas.js', () => ({
	createTextArtCanvas: vi.fn((container, callback) => {
		// simulate a successful creation
		if (callback) {
			callback();
		}
		return {
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			resize: vi.fn(),
			clear: vi.fn(),
			draw: vi.fn(),
			undo: vi.fn(),
			redo: vi.fn(),
			setFont: vi.fn(),
			getCurrentFontName: vi.fn(() => 'CP437 8x16'),
			setIceColors: vi.fn(),
			getIceColors: vi.fn(() => false),
			setMirrorMode: vi.fn(),
			getMirrorMode: vi.fn(() => false),
		};
	}),
}));

vi.mock('../../src/js/client/fontCache.js', () => ({
	FontCache: {
		preloadCommonFonts: vi.fn(() => Promise.resolve()),
		loadFont: vi.fn(() => Promise.resolve()),
		_hasCacheAPI: vi.fn(() => false),
	},
}));

describe('Main Application Module', () => {
	let ready;
	let domReady;

	beforeAll(async () => {
		await import('../../src/js/client/main.js');
		// the module evaluates once per file, so its registrations have
		// to be captured before beforeEach clears the mock's call log
		ready = global.document.addEventListener.mock.calls.filter(
			call => call[0] === 'DOMContentLoaded',
		);
		domReady = ready[0]?.[1];
	});

	beforeEach(() => {
		vi.clearAllMocks();
		// every boot arms tier 2 and 3 timers: fake ones die with their
		// test instead of firing into a later test's assertions
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		delete global.requestIdleCallback;
	});

	it('registers one DOMContentLoaded handler on import', () => {
		expect(ready).toHaveLength(1);
		expect(typeof domReady).toBe('function');
	});

	describe('tier 1 boot', () => {
		it('starts State, preloads fonts, and builds the core controllers', async () => {
			const { FontCache } = await import('../../src/js/client/fontCache.js');
			await domReady();

			expect(mockState.startInitialization).toHaveBeenCalledTimes(1);
			expect(FontCache.preloadCommonFonts).toHaveBeenCalledTimes(1);
			expect(mockState.modal).toBe(
				mockCreateFunctions.createModalController.mock.results[0].value,
			);
			expect(mockState.textArtCanvas).toBe(
				vi.mocked(createTextArtCanvas).mock.results[0].value,
			);
			expect(global.alert).not.toHaveBeenCalled();
		});

		it('drops the loading class once the canvas reports ready', async () => {
			const body = createMockElement();
			const $ = global.document.getElementById;
			const lookup = $.getMockImplementation();
			$.mockImplementation(id => (id === 'bodyContainer' ? body : lookup(id)));
			try {
				await domReady();
			} finally {
				$.mockImplementation(lookup);
			}
			expect(body.classList.remove).toHaveBeenCalledWith('loading');
		});

		it('turns a startup throw into the init alert', async () => {
			mockState.startInitialization.mockImplementationOnce(() => {
				throw new Error('Initialization failed');
			});
			await expect(domReady()).resolves.toBeUndefined();
			expect(global.alert).toHaveBeenCalledWith(
				'Failed to initialize the application. Please refresh the page.',
			);
		});

		it('turns a canvas creation throw into the init alert', async () => {
			vi.mocked(createTextArtCanvas).mockImplementationOnce(() => {
				throw new Error('Canvas creation failed');
			});
			await expect(domReady()).resolves.toBeUndefined();
			expect(global.alert).toHaveBeenCalledWith(
				'Failed to initialize the application. Please refresh the page.',
			);
		});
	});

	describe('tiers 2 and 3', () => {
		const tier3Deps = [
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
		];

		it('builds tier 2 a macrotask after the canvas is ready', async () => {
			await domReady();
			expect(mockCreateFunctions.createPositionInfo).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(0);
			expect(mockCreateFunctions.createPositionInfo).toHaveBeenCalledTimes(1);
		});

		it('waits on the tier 3 dependencies from requestIdleCallback', async () => {
			global.requestIdleCallback = vi.fn(cb => cb());
			await domReady();
			await vi.advanceTimersByTimeAsync(0);
			expect(global.requestIdleCallback).toHaveBeenCalledTimes(1);
			expect(mockState.waitFor).toHaveBeenCalledWith(
				tier3Deps,
				expect.any(Function),
			);
		});

		it('falls back to a 100ms timeout without requestIdleCallback', async () => {
			await domReady();
			await vi.advanceTimersByTimeAsync(99);
			expect(mockState.waitFor).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(mockState.waitFor).toHaveBeenCalledWith(
				tier3Deps,
				expect.any(Function),
			);
		});
	});

	describe('canvas size', () => {
		// initializeAppComponents wires far more than these mocks stand in
		// for, so the boot halts on purpose right after the resize dialog
		// is wired; any earlier failure rejects with a different error
		const halt = new Error('halt after the resize dialog');

		const bootToResizeDialog = async () => {
			// imported late: the ui.js mock factory reads test-file consts
			const { onClick, onReturn } = await import('../../src/js/client/ui.js');
			const els = {
				warningYes: createMockElement(),
				resizeApply: createMockElement(),
				columnsInput: createMockElement(),
				rowsInput: createMockElement(),
			};
			const $ = global.document.getElementById;
			const lookup = $.getMockImplementation();
			$.mockImplementation(id => els[id] ?? lookup(id));
			vi.mocked(onReturn).mockImplementation(el => {
				if (el === els.rowsInput) {
					throw halt;
				}
			});
			let boot;
			mockState.waitFor.mockImplementationOnce((_deps, ready) => {
				boot = ready().then(() => null, error => error);
			});
			try {
				await domReady();
				await vi.advanceTimersByTimeAsync(100);
				expect(await boot).toBe(halt);
			} finally {
				$.mockImplementation(lookup);
				vi.mocked(onReturn).mockReset();
			}
			const handler = el =>
				vi.mocked(onClick).mock.calls.find(([target]) => target === el)[1];
			const apply = handler(els.resizeApply);
			return {
				resize: (columns, rows) => {
					els.columnsInput.value = String(columns);
					els.rowsInput.value = String(rows);
					apply();
				},
				confirmNew: handler(els.warningYes),
			};
		};

		beforeEach(() => {
			mockState.network = { sendResize: vi.fn() };
		});

		afterEach(() => {
			delete mockState.network;
		});

		it('resizes the canvas and sends the new size to the session', async () => {
			const { resize: apply } = await bootToResizeDialog();
			apply(100, 30);
			expect(mockState.textArtCanvas.resize).toHaveBeenCalledWith(100, 30);
			expect(mockState.network.sendResize).toHaveBeenCalledWith(100, 30);
			expect(mockState.modal.close).toHaveBeenCalled();
			expect(global.alert).not.toHaveBeenCalled();
			expect(global.confirm).not.toHaveBeenCalled();
		});

		it('New returns to 80x25 without recording an undo step', async () => {
			const { confirmNew } = await bootToResizeDialog();
			Object.assign(mockState.textArtCanvas, {
				clearXBData: vi.fn(callback => callback()),
				setFont: vi.fn((_name, callback) => callback()),
			});
			await confirmNew();
			// clear() wipes the history right after, so a step would only
			// capture every cut cell for nothing
			expect(mockState.textArtCanvas.resize).toHaveBeenCalledWith(80, 25, { undoable: false });
			expect(mockState.textArtCanvas.clear).toHaveBeenCalled();
		});

		it('alerts and keeps the size past the column or row limit', async () => {
			const { resize: apply } = await bootToResizeDialog();
			const { MAX_COLUMNS, MAX_ROWS } = magicNumbers;
			apply(MAX_COLUMNS + 1, 25);
			apply(80, MAX_ROWS + 1);
			expect(global.alert).toHaveBeenCalledTimes(2);
			expect(global.alert).toHaveBeenCalledWith(
				`Canvas too large. Maximum size is ${MAX_COLUMNS} columns by ${MAX_ROWS} rows.`,
			);
			expect(mockState.textArtCanvas.resize).not.toHaveBeenCalled();
			expect(mockState.network.sendResize).not.toHaveBeenCalled();
		});

		it('asks before a canvas past the large canvas warning', async () => {
			const { resize: apply } = await bootToResizeDialog();
			const columns = magicNumbers.MAX_COLUMNS;
			const rows = magicNumbers.RESIZE_WARN_CELLS / columns;
			// exactly at the threshold resizes without asking
			apply(columns, rows);
			expect(global.confirm).not.toHaveBeenCalled();
			expect(mockState.textArtCanvas.resize).toHaveBeenCalledWith(columns, rows);

			global.confirm.mockReturnValueOnce(false);
			apply(columns, rows + 1);
			expect(global.confirm).toHaveBeenCalledWith(
				expect.stringContaining(`A ${columns}x${rows + 1} canvas is very large`),
			);
			expect(mockState.textArtCanvas.resize).toHaveBeenCalledTimes(1);
			expect(mockState.network.sendResize).toHaveBeenCalledTimes(1);

			global.confirm.mockReturnValueOnce(true);
			apply(columns, rows + 1);
			expect(mockState.textArtCanvas.resize).toHaveBeenLastCalledWith(
				columns,
				rows + 1,
			);
			expect(mockState.network.sendResize).toHaveBeenLastCalledWith(
				columns,
				rows + 1,
			);
		});
	});

	describe('SAUCE dialog', () => {
		const halt = new Error('halt after the SAUCE dialog');

		// the real onReturn takes the Comments binding main.js made, on a
		// jsdom textarea, with Done standing in for the button
		const bootToSauceDialog = async () => {
			const { onClick, onReturn } = await import('../../src/js/client/ui.js');
			// ui.js binds its query helpers to the document at load
			const stub = global.document;
			vi.stubGlobal('document', jsdom);
			const real = await vi.importActual('../../src/js/client/ui.js');
			vi.stubGlobal('document', stub);
			const comments = jsdom.createElement('textarea');
			const els = { sauceComments: comments, sauceDone: createMockElement() };
			const $ = global.document.getElementById;
			const lookup = $.getMockImplementation();
			$.mockImplementation(id => els[id] ?? lookup(id));
			let binding;
			vi.mocked(onReturn).mockImplementation((...args) => {
				if (args[0] === comments) {
					binding = args;
					throw halt;
				}
			});
			let boot;
			mockState.waitFor.mockImplementationOnce((_deps, ready) => {
				boot = ready().then(() => null, error => error);
			});
			try {
				await domReady();
				await vi.advanceTimersByTimeAsync(100);
				expect(await boot).toBe(halt);
			} finally {
				$.mockImplementation(lookup);
				vi.mocked(onReturn).mockReset();
			}
			const done = vi.mocked(onClick).mock.calls.find(
				([target]) => target === els.sauceDone,
			)[1];
			els.sauceDone.click = () => done();
			real.onReturn(...binding);
			comments.value = 'greets';
			comments.setSelectionRange(6, 6);
			return comments;
		};

		// jsdom runs no default actions: a keydown nobody cancels goes on
		// to beforeinput and then the textarea's own line break, as in a
		// browser
		const pressEnter = (el, init) => {
			const down = new window.KeyboardEvent('keydown', {
				key: 'Enter',
				cancelable: true,
				...init,
			});
			el.dispatchEvent(down);
			if (!down.defaultPrevented) {
				const before = new window.InputEvent('beforeinput', {
					inputType: 'insertLineBreak',
					cancelable: true,
				});
				el.dispatchEvent(before);
				if (!before.defaultPrevented) {
					el.setRangeText('\n', el.selectionStart, el.selectionEnd, 'end');
					el.dispatchEvent(new window.Event('input'));
				}
			}
			return down;
		};

		beforeEach(() => {
			mockState.network = { sendSauce: vi.fn() };
		});

		afterEach(() => {
			delete mockState.network;
		});

		it('Shift+Enter in Comments types a line break and keeps the dialog open', async () => {
			const { enforceMaxBytes } = await import('../../src/js/client/ui.js');
			const comments = await bootToSauceDialog();
			pressEnter(comments, { shiftKey: true });
			expect(comments.value).toBe('greets\n');
			expect(enforceMaxBytes).toHaveBeenCalled();
			expect(mockState.network.sendSauce).not.toHaveBeenCalled();
			expect(mockState.modal.close).not.toHaveBeenCalled();
		});

		it('plain Enter in Comments saves and closes', async () => {
			const comments = await bootToSauceDialog();
			pressEnter(comments);
			expect(comments.value).toBe('greets');
			expect(mockState.network.sendSauce).toHaveBeenCalledWith(
				expect.objectContaining({ comments: 'greets' }),
			);
			expect(mockState.modal.close).toHaveBeenCalled();
		});
	});
});
