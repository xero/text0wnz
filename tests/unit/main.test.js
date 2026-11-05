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
		loading: vi.fn(),
		onClose: vi.fn(),
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
	createSettingToggle: vi.fn(() => ({ update: vi.fn() })),
	createZoomControl: vi.fn(() => createMockElement()),
	createFontSelect: vi.fn(() => ({
		setValue: vi.fn(),
		isFavorite: vi.fn(() => false),
	})),
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
	armFullscreenIcon: vi.fn(),
	toggleFullscreen: vi.fn(),
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
// the comment box helpers stay real: the SAUCE dialog tests read and
// fill a jsdom textarea through them
vi.mock('../../src/js/client/file.js', async importOriginal => {
	const { Load } = await importOriginal();
	return {
		Load: {
			file: vi.fn(),
			sauceToAppFont: vi.fn(),
			resetSauceFlags: vi.fn(),
			fillComments: Load.fillComments,
			commentsOf: Load.commentsOf,
		},
		Save: {
			ans: vi.fn(),
			utf8: vi.fn(),
			bin: vi.fn(),
			xb: vi.fn(),
			png: vi.fn(),
		},
	};
});

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
		it('preloads fonts and builds the core controllers', async () => {
			const { FontCache } = await import('../../src/js/client/fontCache.js');
			await domReady();

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
			mockCreateFunctions.createModalController.mockImplementationOnce(() => {
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

		it('New covers the warning with the loading veil before it starts', async () => {
			const { confirmNew } = await bootToResizeDialog();
			let veiled = false;
			Object.assign(mockState.textArtCanvas, {
				clearXBData: vi.fn(() => {
					veiled = mockState.modal.loading.mock.calls.length > 0;
				}),
			});
			await confirmNew();
			expect(veiled).toBe(true);
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

		// the real onReturn takes the Comments binding main.js made, on
		// jsdom fields, with Done standing in for the button
		const bootToSauceDialog = async () => {
			const { onClick, onReturn } = await import('../../src/js/client/ui.js');
			// ui.js binds its query helpers to the document at load
			const stub = global.document;
			vi.stubGlobal('document', jsdom);
			const real = await vi.importActual('../../src/js/client/ui.js');
			vi.stubGlobal('document', stub);
			const comments = jsdom.createElement('textarea');
			const fields = {
				sauceTitle: jsdom.createElement('input'),
				sauceAuthor: jsdom.createElement('input'),
				sauceGroup: jsdom.createElement('input'),
				sauceComments: comments,
			};
			const els = { ...fields, sauceDone: createMockElement(), navSauce: createMockElement() };
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
			const handler = el =>
				vi.mocked(onClick).mock.calls.find(([target]) => target === el)[1];
			const done = handler(els.sauceDone);
			els.sauceDone.click = () => done();
			real.onReturn(...binding);
			comments.value = 'greets';
			comments.setSelectionRange(6, 6);
			const { Load } = await import('../../src/js/client/file.js');
			return { comments, fields, done, openEditor: handler(els.navSauce), Load };
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
			mockState.network = {
				sendSauce: vi.fn(),
				holdSauce: vi.fn(),
				releaseSauce: vi.fn(),
			};
		});

		afterEach(() => {
			delete mockState.network;
		});

		it('Shift+Enter in Comments types a line break and keeps the dialog open', async () => {
			const { enforceMaxBytes } = await import('../../src/js/client/ui.js');
			const { comments } = await bootToSauceDialog();
			pressEnter(comments, { shiftKey: true });
			expect(comments.value).toBe('greets\n');
			expect(enforceMaxBytes).toHaveBeenCalled();
			expect(mockState.network.sendSauce).not.toHaveBeenCalled();
			expect(mockState.modal.close).not.toHaveBeenCalled();
		});

		it('plain Enter in Comments saves and closes', async () => {
			const { comments } = await bootToSauceDialog();
			pressEnter(comments);
			expect(comments.value).toBe('greets');
			expect(mockState.network.sendSauce).toHaveBeenCalledWith(
				expect.objectContaining({ comments: 'greets' }),
			);
			expect(mockState.modal.close).toHaveBeenCalled();
		});

		// the modal runs its onClose handler on any close: Cancel, the
		// backdrop, Escape, and Done's own close
		const closeEditor = () => mockState.modal.onClose.mock.lastCall[0]();
		const typeIn = fields => {
			fields.sauceTitle.value = 'typed title';
			fields.sauceAuthor.value = 'typed author';
			fields.sauceComments.value = 'typed comments';
			fields.sauceComments.dispatchEvent(new window.Event('input'));
		};

		it('a close without Done puts back what the editor opened with, then lets the room SAUCE land', async () => {
			const { fields, openEditor, Load } = await bootToSauceDialog();
			fields.sauceTitle.value = 'opened title';
			Load.fillComments(fields.sauceComments, ' ');
			openEditor();
			expect(mockState.network.holdSauce).toHaveBeenCalledTimes(1);
			typeIn(fields);
			let landedOver;
			mockState.network.releaseSauce.mockImplementation(() => {
				landedOver = [
					fields.sauceTitle.value,
					fields.sauceAuthor.value,
					Load.commentsOf(fields.sauceComments),
				];
			});
			closeEditor();
			expect(landedOver).toEqual(['opened title', '', ' ']);
			expect(fields.sauceComments.value).toBe('');
			expect(mockState.network.sendSauce).not.toHaveBeenCalled();
		});

		it('Done keeps what the editor holds, and its close lets the room SAUCE go', async () => {
			const { fields, openEditor, done } = await bootToSauceDialog();
			openEditor();
			typeIn(fields);
			done();
			closeEditor();
			expect(mockState.network.sendSauce).toHaveBeenCalledWith({
				title: 'typed title',
				author: 'typed author',
				group: '',
				comments: 'typed comments',
			});
			expect(fields.sauceTitle.value).toBe('typed title');
			expect(mockState.network.releaseSauce).toHaveBeenCalledTimes(1);
		});

		it('a document that opens under the editor is what a close puts back', async () => {
			const { fields, openEditor } = await bootToSauceDialog();
			openEditor();
			fields.sauceTitle.value = 'opened file';
			for (const [type, listener] of global.document.addEventListener.mock.calls) {
				if (type === 'onNewDocument') {
					listener();
				}
			}
			typeIn(fields);
			closeEditor();
			expect(fields.sauceTitle.value).toBe('opened file');
			expect(fields.sauceAuthor.value).toBe('');
			expect(mockState.network.releaseSauce).toHaveBeenCalledTimes(1);
		});

		it('Done sends a kept blank comment line as one blank line', async () => {
			const { fields, done, Load } = await bootToSauceDialog();
			Load.fillComments(fields.sauceComments, ' ');
			done();
			expect(mockState.network.sendSauce).toHaveBeenCalledWith(
				expect.objectContaining({ comments: ' ' }),
			);
		});
	});

	describe('share target', () => {
		// boots with ?source=share over a share cache holding the given
		// response; the restore choice comes first, so wherever the mocks
		// end the boot is late enough
		const bootShared = async (
			response,
			open = async () => ({ match: async () => response, delete: async () => true }),
		) => {
			globalThis.caches = { open: vi.fn(open) };
			window.history.replaceState(null, '', '/?source=share');
			let boot;
			mockState.waitFor.mockImplementationOnce((_deps, ready) => {
				boot = ready().then(() => null, error => error);
			});
			try {
				await domReady();
				await vi.advanceTimersByTimeAsync(100);
				await boot;
			} finally {
				window.history.replaceState(null, '', '/');
				delete globalThis.caches;
			}
		};

		it('a shared file wins over the autosave restore, as a launch file does', async () => {
			await bootShared({
				headers: { get: name => (name === 'X-Filename' ? 'shared.ans' : null) },
				blob: async () => new Blob(['HI']),
			});
			expect(mockState.restoreStateFromLocalStorage).not.toHaveBeenCalled();
		});

		it('a share launch with nothing cached restores the autosave', async () => {
			await bootShared(undefined);
			expect(mockState.restoreStateFromLocalStorage).toHaveBeenCalledTimes(1);
		});

		it('a share launch whose lookup fails restores the autosave', async () => {
			await bootShared(undefined, async () => {
				throw new Error('storage blocked');
			});
			expect(mockState.restoreStateFromLocalStorage).toHaveBeenCalledTimes(1);
		});
	});

	describe('update prompt', () => {
		// a worker already waiting when the page registers, under
		// whatever modal the test says is showing
		let showing;
		let reg;
		const bootWaiting = async () => {
			reg = { waiting: { postMessage: vi.fn() } };
			navigator.serviceWorker = {
				controller: {},
				register: vi.fn(async () => reg),
				addEventListener: vi.fn(),
			};
			const base = mockCreateFunctions.createModalController.getMockImplementation();
			mockCreateFunctions.createModalController.mockImplementationOnce(() => ({
				...base(),
				current: vi.fn(() => showing),
			}));
			await domReady();
			await vi.advanceTimersByTimeAsync(0);
		};
		const offered = () =>
			mockState.modal.open.mock.calls.filter(([name]) => name === 'update').length;

		afterEach(() => {
			reg.waiting = null;
			delete navigator.serviceWorker;
		});

		it('opens at once when no modal is showing', async () => {
			showing = false;
			await bootWaiting();
			expect(offered()).toBe(1);
		});

		it('waits out every modal the user opens first, then opens once', async () => {
			showing = 'sauce';
			await bootWaiting();
			await vi.advanceTimersByTimeAsync(3000);
			expect(offered()).toBe(0);
			showing = 'charset';
			await vi.advanceTimersByTimeAsync(3000);
			showing = 'resize';
			await vi.advanceTimersByTimeAsync(3000);
			expect(offered()).toBe(0);
			showing = false;
			await vi.advanceTimersByTimeAsync(1000);
			expect(offered()).toBe(1);
			await vi.advanceTimersByTimeAsync(5000);
			expect(offered()).toBe(1);
		});

		it('an update question already showing is not asked again once dismissed', async () => {
			showing = 'update';
			await bootWaiting();
			await vi.advanceTimersByTimeAsync(2000);
			showing = false;
			await vi.advanceTimersByTimeAsync(5000);
			expect(offered()).toBe(0);
		});

		it('takes the collab invitation\'s place, which the modal hands back', async () => {
			showing = 'choice';
			await bootWaiting();
			expect(offered()).toBe(1);
		});
	});

	describe('recovery reset', () => {
		const halt = new Error('halt after the reset button');

		it('reloads once its bound runs out, even when storage never answers', async () => {
			const { onClick, onReturn } = await import('../../src/js/client/ui.js');
			const button = createMockElement();
			const $ = global.document.getElementById;
			const lookup = $.getMockImplementation();
			$.mockImplementation(id => (id === 'updateReload' ? button : lookup(id)));
			vi.mocked(onReturn).mockImplementation(el => {
				if (el === button) {
					throw halt;
				}
			});
			let boot;
			mockState.waitFor.mockImplementationOnce((_deps, ready) => {
				boot = ready().then(() => null, error => error);
			});
			const page = globalThis.window;
			const reload = vi.fn();
			try {
				await domReady();
				await vi.advanceTimersByTimeAsync(100);
				expect(await boot).toBe(halt);
				const reset = vi.mocked(onClick).mock.calls.find(([el]) => el === button)[1];
				mockState.clearLocalStorage.mockReturnValueOnce(new Promise(() => {}));
				mockState.textArtCanvas.stopJournal = vi.fn(async () => {});
				vi.stubGlobal('window', { location: { reload } });
				reset();
				await vi.advanceTimersByTimeAsync(2999);
				expect(reload).not.toHaveBeenCalled();
				await vi.advanceTimersByTimeAsync(1);
				expect(reload).toHaveBeenCalledTimes(1);
			} finally {
				vi.stubGlobal('window', page);
				$.mockImplementation(lookup);
				vi.mocked(onReturn).mockReset();
			}
		});
	});

	describe('9pt chip', () => {
		const halt = new Error('halt after the font display is wired');

		// boots past the font display wiring with a real toggle on a jsdom
		// chip and returns the onFontChange listener main.js registered
		const bootToFontDisplay = async () => {
			const { onClick, createSettingToggle } = await import('../../src/js/client/ui.js');
			const stub = global.document;
			vi.stubGlobal('document', jsdom);
			const real = await vi.importActual('../../src/js/client/ui.js');
			vi.stubGlobal('document', stub);
			const chip = jsdom.createElement('div');
			const changeFont = createMockElement();
			const els = { nav9pt: chip, changeFont };
			const $ = global.document.getElementById;
			const lookup = $.getMockImplementation();
			$.mockImplementation(id => els[id] ?? lookup(id));
			vi.mocked(createSettingToggle).mockImplementation((el, get, set) =>
				el === chip
					? real.createSettingToggle(el, get, set)
					: { update: vi.fn() });
			vi.mocked(onClick).mockImplementation(el => {
				if (el === changeFont) {
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
				vi.mocked(onClick).mockReset();
				vi.mocked(createSettingToggle).mockReset();
			}
			const fontChange = global.document.addEventListener.mock.calls.findLast(
				([type]) => type === 'onFontChange',
			)[1];
			return { chip, fontChange };
		};

		const font = mockState.font;

		beforeEach(() => {
			mockState.network = { sendLetterSpacingChange: vi.fn() };
		});

		afterEach(() => {
			delete mockState.network;
			mockState.font = font;
		});

		it('a click after a font change still sends the spacing to the session', async () => {
			const { chip, fontChange } = await bootToFontDisplay();
			mockState.font = { ...font, setLetterSpacing: vi.fn(), getLetterSpacing: vi.fn(() => false) };
			fontChange();
			chip.dispatchEvent(new jsdom.defaultView.Event('click'));
			expect(mockState.font.setLetterSpacing).toHaveBeenCalledWith(true);
			expect(mockState.network.sendLetterSpacingChange).toHaveBeenCalledWith(true);
		});

		it('reads the spacing from the font that replaced the old one', async () => {
			const { chip, fontChange } = await bootToFontDisplay();
			mockState.font = { ...font, getLetterSpacing: vi.fn(() => true) };
			fontChange();
			expect(chip.classList.contains('enabled')).toBe(true);
		});
	});
});
