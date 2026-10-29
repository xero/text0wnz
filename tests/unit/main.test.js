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

const mockState = {
	startInitialization: vi.fn(),
	// records only: running the tier 3 callback boots every lazy tool,
	// far past what these mocks can stand in for
	waitFor: vi.fn(),
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
}));
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
});
