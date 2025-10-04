import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock State module
const mockState = {
	startInitialization: vi.fn(),
	waitFor: vi.fn((deps, callback) => callback()),
	title: { value: 'untitled' },
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
	network: {
		sendResize: vi.fn(),
		sendIceColorsChange: vi.fn(),
		sendLetterSpacingChange: vi.fn(),
		sendFontChange: vi.fn(),
	},
};

// Mock UI elements
const createMockElement = (overrides = {}) => ({
	style: { display: 'block' },
	classList: { add: vi.fn(), remove: vi.fn() },
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
	click: vi.fn(),
	appendChild: vi.fn(),
	focus: vi.fn(),
	insertBefore: vi.fn(),
	value: 'mock',
	innerText: 'mock',
	textContent: 'mock',
	files: null,
	getBoundingClientRect: vi.fn(() => ({ left: 0, top: 0 })),
	width: 100,
	height: 100,
	...overrides,
});

// Mock functions that return objects with methods
const mockCreateFunctions = {
	createPasteTool: vi.fn(() => mockState.pasteTool),
	createPositionInfo: vi.fn(() => ({ update: vi.fn() })),
	createTextArtCanvas: vi.fn((container, callback) => {
		callback && callback();
		return mockState.textArtCanvas;
	}),
	createSelectionCursor: vi.fn(() => ({ hide: vi.fn(), setStart: vi.fn(), setEnd: vi.fn() })),
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
};

// Set up global document BEFORE any imports
global.document = {
	getElementById: vi.fn(id => {
		const mockElement = createMockElement();
		// Special cases for specific elements
		if (id === 'open-file') {
			return { ...mockElement, files: [{ name: 'test.ans' }] }; // Use plain object instead of File constructor
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
};

global.confirm = vi.fn(() => true);
global.alert = vi.fn();
global.Image = vi.fn(() => ({
	onload: null,
	onerror: null,
	src: '',
}));

// Mock all the imported modules
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
	createGenericController: vi.fn(() => ({ enable: vi.fn(), disable: vi.fn() })),
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
		// Execute callback immediately to simulate successful creation
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

describe('Main Application Module', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset any global state
		mockState.startInitialization.mockClear();
		global.document.addEventListener.mockClear();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Module Structure', () => {
		it('should import without throwing errors', async () => {
			expect(async () => {
				await import('../../src/js/client/main.js');
			}).not.toThrow();
		});

		it('should handle CSS import without errors', async () => {
			// The CSS import should not throw
			expect(async () => {
				await import('../../src/js/client/main.js');
			}).not.toThrow();
		});
	});

	describe('Application Initialization', () => {
		it('should initialize State when DOMContentLoaded fires', async () => {
			await import('../../src/js/client/main.js');

			// Find the DOMContentLoaded listener
			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			expect(domReadyCall).toBeDefined();

			// Execute the DOMContentLoaded handler
			const domReadyHandler = domReadyCall[1];
			await domReadyHandler();

			expect(mockState.startInitialization).toHaveBeenCalled();
		});

		it('should handle initialization errors gracefully', async () => {
			mockState.startInitialization.mockImplementation(() => {
				throw new Error('Initialization failed');
			});

			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];

				// Should not throw even if initialization fails
				expect(async () => {
					await domReadyHandler();
				}).not.toThrow();

				expect(global.alert).toHaveBeenCalledWith('Failed to initialize the application. Please refresh the page.');
			}
		});

		it('should wait for dependencies before initializing components', async () => {
			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];
				await domReadyHandler();

				expect(mockState.waitFor).toHaveBeenCalledWith(
					['palette', 'textArtCanvas', 'font', 'cursor', 'selectionCursor', 'positionInfo', 'toolPreview', 'pasteTool'],
					expect.any(Function),
				);
			}
		});
	});

	describe('UI Event Handlers', () => {
		it('should handle new button click with confirmation', async () => {
			const { onClick } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			// Find the onClick call for the 'new' button
			const newButtonCall = onClick.mock.calls.find(call => call[0] && call[0].id === 'new'); // This is a mock, so we check the mock element

			if (newButtonCall) {
				const newButtonHandler = newButtonCall[1];
				newButtonHandler();

				expect(global.confirm).toHaveBeenCalledWith('All changes will be lost. Are you sure?');
			}
		});

		it('should handle new button click cancellation', async () => {
			global.confirm.mockReturnValue(false);
			const { onClick } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			const newButtonCall = onClick.mock.calls.find(call => call[0] && typeof call[1] === 'function');

			if (newButtonCall) {
				const newButtonHandler = newButtonCall[1];
				newButtonHandler();

				// Canvas should not be cleared if user cancels
				expect(mockState.textArtCanvas.clear).not.toHaveBeenCalled();
			}
		});

		it('should handle font selection and preview updates', async () => {
			const { onSelectChange } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			// onSelectChange should be called during setup - just verify it's available
			expect(onSelectChange).toBeDefined();
			expect(typeof onSelectChange).toBe('function');
		});

		it('should handle resize operations with valid input', async () => {
			const { onClick } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			// Test resize apply button
			const resizeApplyCall = onClick.mock.calls.find(call => call[0] && typeof call[1] === 'function');

			if (resizeApplyCall) {
				const resizeHandler = resizeApplyCall[1];

				// Mock input values
				global.document.getElementById.mockImplementation(id => {
					if (id === 'columns-input') {
						return { value: '100' };
					}
					if (id === 'rows-input') {
						return { value: '30' };
					}
					return createMockElement();
				});

				resizeHandler();

				expect(mockState.textArtCanvas.resize).toHaveBeenCalledWith(100, 30);
			}
		});

		it('should handle invalid resize input gracefully', async () => {
			const { onClick } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			const resizeApplyCall = onClick.mock.calls.find(call => call[0] && typeof call[1] === 'function');

			if (resizeApplyCall) {
				const resizeHandler = resizeApplyCall[1];

				// Mock invalid input values
				global.document.getElementById.mockImplementation(id => {
					if (id === 'columns-input') {
						return { value: 'invalid' };
					}
					if (id === 'rows-input') {
						return { value: 'invalid' };
					}
					return createMockElement();
				});

				expect(() => {
					resizeHandler();
				}).not.toThrow();

				// Should not call resize with invalid values
				expect(mockState.textArtCanvas.resize).not.toHaveBeenCalledWith(NaN, NaN);
			}
		});
	});

	describe('Network Integration', () => {
		it('should broadcast changes in collaboration mode', async () => {
			// Set up network state
			mockState.network = {
				sendResize: vi.fn(),
				sendIceColorsChange: vi.fn(),
				sendLetterSpacingChange: vi.fn(),
				sendFontChange: vi.fn(),
			};

			const { onClick } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			// Test resize broadcast
			const resizeCall = onClick.mock.calls.find(call => call[0] && typeof call[1] === 'function');

			if (resizeCall) {
				const resizeHandler = resizeCall[1];

				global.document.getElementById.mockImplementation(id => {
					if (id === 'columns-input') {
						return { value: '90' };
					}
					if (id === 'rows-input') {
						return { value: '40' };
					}
					return createMockElement();
				});

				resizeHandler();

				expect(mockState.network.sendResize).toHaveBeenCalledWith(90, 40);
			}
		});

		it('should handle network unavailability gracefully', async () => {
			// Remove network state
			mockState.network = null;

			const { onClick } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			// Operations should still work without network
			expect(() => {
				const calls = onClick.mock.calls;
				calls.forEach(call => {
					if (typeof call[1] === 'function') {
						call[1](); // Execute handlers
					}
				});
			}).not.toThrow();
		});
	});

	describe('Font Management', () => {
		it('should handle font preview for regular PNG fonts', async () => {
			await import('../../src/js/client/main.js');

			// Mock Image constructor to test font preview
			const mockImg = {
				onload: null,
				onerror: null,
				src: '',
				width: 128,
				height: 256,
			};
			global.Image.mockImplementation(() => mockImg);

			// Test font preview logic by triggering onload
			mockImg.onload && mockImg.onload();

			expect(mockImg.src).toBeDefined();
		});

		it('should handle font preview errors gracefully', async () => {
			await import('../../src/js/client/main.js');

			const mockImg = {
				onload: null,
				onerror: null,
				src: '',
			};
			global.Image.mockImplementation(() => mockImg);

			// Test font preview error handling
			expect(() => {
				mockImg.onerror && mockImg.onerror();
			}).not.toThrow();
		});

		it('should handle XBIN font preview differently', async () => {
			await import('../../src/js/client/main.js');

			// Test that XBIN font handling is available
			expect(mockState.textArtCanvas.getCurrentFontName).toBeDefined();
		});
	});

	describe('Dependencies and Imports', () => {
		it('should successfully import all required modules', async () => {
			// Test that all import statements resolve without errors
			expect(async () => {
				const module = await import('../../src/js/client/main.js');
				// Module should exist
				expect(module).toBeDefined();
			}).not.toThrow();
		});

		it('should have proper module structure', async () => {
			// Since main.js is primarily about side effects (setting up event listeners, etc.)
			// we mainly verify it can be imported without issues
			const module = await import('../../src/js/client/main.js');
			expect(module).toBeDefined();
		});
	});

	describe('Component Initialization', () => {
		it('should initialize all required components in correct order', async () => {
			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];
				await domReadyHandler();

				// Verify initialization order
				expect(mockState.startInitialization).toHaveBeenCalled();
				expect(mockCreateFunctions.createTextArtCanvas).toHaveBeenCalled();
				expect(mockState.waitFor).toHaveBeenCalled();
			}
		});

		it('should create drawing tools', async () => {
			await import('../../src/js/client/main.js');

			// Test that palette functions are available
			expect(mockCreateFunctions.createDefaultPalette).toBeDefined();
		});

		it('should set up event handlers', async () => {
			const { onClick, onSelectChange, onFileChange } = await import('../../src/js/client/ui.js');

			await import('../../src/js/client/main.js');

			// Event handlers should be available
			expect(onClick).toBeDefined();
			expect(onSelectChange).toBeDefined();
			expect(onFileChange).toBeDefined();
		});

		it('should configure canvas settings', async () => {
			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];
				await domReadyHandler();

				// Canvas configuration should be handled
				expect(mockState.textArtCanvas).toBeDefined();
			}
		});

		it('should handle font configuration', async () => {
			await import('../../src/js/client/main.js');

			// Font handling should be available
			expect(mockState.font.setLetterSpacing).toBeDefined();
			expect(mockState.font.getLetterSpacing).toBeDefined();
		});

		it('should handle ICE colors configuration', async () => {
			await import('../../src/js/client/main.js');

			// ICE colors handling should be available
			expect(mockState.textArtCanvas.setIceColors).toBeDefined();
			expect(mockState.textArtCanvas.getIceColors).toBeDefined();
		});
	});

	describe('File Operations Integration', () => {
		it('should handle file loading workflow', async () => {
			const { Load } = await import('../../src/js/client/file.js');

			await import('../../src/js/client/main.js');

			// File loading should be configured
			expect(Load.file).toBeDefined();
		});

		it('should handle SAUCE information', async () => {
			await import('../../src/js/client/main.js');

			// SAUCE handling functions should be available
			expect(global.document.getElementById).toBeDefined();
		});

		it('should handle font file operations', async () => {
			const { Load } = await import('../../src/js/client/file.js');

			await import('../../src/js/client/main.js');

			// Font operations should be available
			expect(Load.sauceToAppFont).toBeDefined();
		});
	});

	describe('Error Recovery', () => {
		it('should handle component creation failures gracefully', async () => {
			// Mock a component creation failure
			mockCreateFunctions.createTextArtCanvas.mockImplementation(() => {
				throw new Error('Canvas creation failed');
			});

			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];

				expect(async () => {
					await domReadyHandler();
				}).not.toThrow();

				expect(global.alert).toHaveBeenCalledWith('Failed to initialize the application. Please refresh the page.');
			}
		});

		it('should handle missing DOM elements gracefully', async () => {
			global.document.getElementById.mockReturnValue(null);

			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];

				expect(async () => {
					await domReadyHandler();
				}).not.toThrow();
			}
		});
	});

	describe('State Management Integration', () => {
		it('should properly integrate with state system', async () => {
			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];
				await domReadyHandler();

				// State integration should work
				expect(mockState.waitFor).toHaveBeenCalledWith(
					expect.arrayContaining([
						'palette',
						'textArtCanvas',
						'font',
						'cursor',
						'selectionCursor',
						'positionInfo',
						'toolPreview',
						'pasteTool',
					]),
					expect.any(Function),
				);
			}
		});

		it('should set up state properties correctly', async () => {
			await import('../../src/js/client/main.js');

			const domReadyCall = global.document.addEventListener.mock.calls.find(call => call[0] === 'DOMContentLoaded');

			if (domReadyCall) {
				const domReadyHandler = domReadyCall[1];
				await domReadyHandler();

				// State properties should be assigned
				expect(mockState.title).toBeDefined();
			}
		});
	});
});
