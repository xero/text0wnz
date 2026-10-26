import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';

// test-local isolation for the shared singleton: production never
// resets state (the deleted reset() had no callers outside this file)
const resetState = () => {
	Object.assign(State._manager.state, {
		textArtCanvas: null,
		palette: null,
		font: null,
		fontWidth: null,
		fontHeight: null,
		modal: null,
		cursor: null,
		selectionCursor: null,
		selectionTool: null,
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
			selectionTool: false,
			positionInfo: false,
			toolPreview: false,
			pasteTool: false,
		},
	});
};

describe('State Management System', () => {
	beforeEach(() => {
		resetState();
		State.modal = { close: vi.fn(), open: vi.fn() };
		State._manager.waitQueue.clear();
	});

	afterEach(() => {
		resetState();
		State._manager.waitQueue.clear();
		vi.restoreAllMocks();
	});

	describe('Basic State Operations', () => {
		it('should set and get state values', () => {
			State._manager.set('title', 'Test Title');
			expect(State._manager.get('title')).toBe('Test Title');
		});

		it('should return null for non-existent keys initially', () => {
			expect(State._manager.get('nonExistentKey')).toBeUndefined();
		});

		it('should update existing values', () => {
			State._manager.set('title', 'Original Title');
			State._manager.set('title', 'Updated Title');
			expect(State._manager.get('title')).toBe('Updated Title');
		});

		it('should handle null and undefined values', () => {
			State._manager.set('title', null);
			State._manager.set('worker', undefined);

			expect(State._manager.get('title')).toBeNull();
			expect(State._manager.get('worker')).toBeUndefined();
		});

		it('should support method chaining for set operations', () => {
			const result = State._manager.set('title', 'Test').set('palette', {});

			expect(result).toBe(State._manager);
			expect(State._manager.get('title')).toBe('Test');
			expect(State._manager.get('palette')).toEqual({});
		});
	});

	describe('Property Getters and Setters', () => {
		it('should provide getters and setters for all core components', () => {
			const components = [
				'textArtCanvas',
				'positionInfo',
				'pasteTool',
				'palette',
				'toolPreview',
				'cursor',
				'selectionCursor',
				'font',
				'worker',
			];

			components.forEach(component => {
				const testValue = { test: component };
				State[component] = testValue;
				expect(State[component]).toEqual(testValue);
			});
		});

		it('should update dependency readiness when setting tracked components', () => {
			const trackedComponents = [
				'palette',
				'textArtCanvas',
				'font',
				'cursor',
				'selectionCursor',
				'positionInfo',
				'toolPreview',
				'pasteTool',
			];

			trackedComponents.forEach(component => {
				State[component] = { test: component };
				expect(State._state.dependenciesReady[component]).toBe(true);
			});
		});

		it('should mark dependencies as not ready when set to null or undefined', () => {
			State.palette = { test: 'palette' };
			expect(State._state.dependenciesReady.palette).toBe(true);

			State.palette = null;
			expect(State._state.dependenciesReady.palette).toBe(false);

			State.font = { test: 'font' };
			expect(State._state.dependenciesReady.font).toBe(true);

			State.font = undefined;
			expect(State._state.dependenciesReady.font).toBe(false);
		});
	});

	describe('Dependency Management', () => {
		it('should execute callback when single dependency is ready', () => {
			const callback = vi.fn();

			State.waitFor('palette', callback);
			expect(callback).not.toHaveBeenCalled();

			State.palette = { test: 'palette' };
			expect(callback).toHaveBeenCalledWith({ palette: { test: 'palette' } });
		});

		it('should execute callback when multiple dependencies are ready', () => {
			const callback = vi.fn();

			State.waitFor(['palette', 'font'], callback);

			State.palette = { test: 'palette' };
			expect(callback).not.toHaveBeenCalled();

			State.font = { test: 'font' };
			expect(callback).toHaveBeenCalledWith({
				palette: { test: 'palette' },
				font: { test: 'font' },
			});
		});

		it('should execute callback immediately if dependencies are already ready', () => {
			const callback = vi.fn();

			State.palette = { test: 'palette' };
			State.waitFor('palette', callback);

			expect(callback).toHaveBeenCalledWith({ palette: { test: 'palette' } });
		});

		it('should handle multiple dependency wait queues', () => {
			const callback1 = vi.fn();
			const callback2 = vi.fn();

			State.waitFor(['palette', 'font'], callback1);
			State.waitFor(['textArtCanvas'], callback2);

			State.palette = { test: 'palette' };
			State.textArtCanvas = { test: 'canvas' };

			expect(callback1).not.toHaveBeenCalled(); // Still waiting for font
			expect(callback2).toHaveBeenCalledWith({ textArtCanvas: { test: 'canvas' } });

			State.font = { test: 'font' };
			expect(callback1).toHaveBeenCalledWith({
				palette: { test: 'palette' },
				font: { test: 'font' },
			});
		});

		it('should handle dependency wait callback errors gracefully', () => {
			const errorCallback = vi.fn(() => {
				throw new Error('Dependency callback error');
			});

			const consoleSpy = vi
				.spyOn(console, 'error')
				.mockImplementation(() => {});

			State.waitFor('palette', errorCallback);
			State.palette = { test: 'palette' };

			expect(consoleSpy).toHaveBeenCalledWith(
				'[State] Error in dependency wait callback:',
				expect.any(Error),
			);
			consoleSpy.mockRestore();
		});

		it('should clean up completed wait queue entries', () => {
			const callback = vi.fn();

			State.waitFor('palette', callback);
			expect(State._manager.waitQueue.size).toBe(1);

			State.palette = { test: 'palette' };
			expect(State._manager.waitQueue.size).toBe(0);
		});

		it('should support method chaining for waitFor', () => {
			const result = State.waitFor('palette', vi.fn());
			expect(result).toBe(State._manager);
		});
	});

	describe('Initialization System', () => {
		it('should track initialization state', () => {
			expect(State._state.initialized).toBe(false);
			expect(State._state.initializing).toBe(false);
		});

		it('should start initialization', () => {
			State.startInitialization();

			expect(State._state.initializing).toBe(true);
			expect(State._state.initialized).toBe(false);
		});

		it('should warn when trying to start initialization multiple times', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			State.startInitialization();
			State.startInitialization();

			expect(consoleSpy).toHaveBeenCalledWith(
				'[State] Initialization already in progress or complete',
			);
			consoleSpy.mockRestore();
		});

		it('should complete initialization when all dependencies are ready', () => {
			State.startInitialization();

			State.palette = { test: 'palette' };
			State.textArtCanvas = { test: 'canvas' };
			State.font = { test: 'font' };
			State.modal = { test: 'modal' };
			State.cursor = { test: 'cursor' };
			State.selectionCursor = { test: 'selectionCursor' };
			State.selectionTool = { test: 'selectionTool' };
			State.positionInfo = { test: 'positionInfo' };
			State.toolPreview = { test: 'toolPreview' };
			State.pasteTool = { test: 'pasteTool' };

			expect(State._state.initialized).toBe(true);
			expect(State._state.initializing).toBe(false);
		});

		it('should not complete initialization if not all dependencies are ready', () => {
			State.startInitialization();

			State.palette = { test: 'palette' };
			State.font = { test: 'font' };

			expect(State._state.initialized).toBe(false);
			expect(State._state.initializing).toBe(true);
		});

		it('should not initialize if not started', () => {
			// Set all dependencies without starting initialization
			State.palette = { test: 'palette' };
			State.textArtCanvas = { test: 'canvas' };
			State.font = { test: 'font' };
			State.cursor = { test: 'cursor' };
			State.selectionCursor = { test: 'selectionCursor' };
			State.positionInfo = { test: 'positionInfo' };
			State.toolPreview = { test: 'toolPreview' };
			State.pasteTool = { test: 'pasteTool' };

			expect(State._state.initialized).toBe(false);
			expect(State._state.initializing).toBe(false);
		});
	});

	describe('Edge Cases and Error Handling', () => {
		it('should handle undefined dependencies gracefully', () => {
			expect(() => {
				State.waitFor(undefined, vi.fn());
			}).not.toThrow();
		});

		it('should handle empty dependency arrays', () => {
			const callback = vi.fn();
			State.waitFor([], callback);
			expect(callback).toHaveBeenCalledWith({});
		});

		it('should handle setting non-tracked properties', () => {
			State._manager.set('customProperty', 'value');
			expect(State._manager.get('customProperty')).toBe('value');
		});

		it('should handle dependency checks for non-existent properties', () => {
			State._manager.checkDependencyQueue('nonExistentProperty');
		});

		it('should handle initialization completion checks when not initializing', () => {
			// Set all dependencies without starting initialization
			State.palette = { test: 'palette' };
			State.textArtCanvas = { test: 'canvas' };
			State.font = { test: 'font' };
			State.cursor = { test: 'cursor' };
			State.selectionCursor = { test: 'selectionCursor' };
			State.positionInfo = { test: 'positionInfo' };
			State.toolPreview = { test: 'toolPreview' };
			State.pasteTool = { test: 'pasteTool' };

			// Should not initialize since initializing flag is false
			expect(State._state.initialized).toBe(false);
		});
	});

	describe('State Architecture', () => {
		it('should provide raw state access for advanced use cases', () => {
			expect(State._state).toBeDefined();
			expect(State._manager).toBeDefined();
			expect(typeof State._state).toBe('object');
			expect(State._manager.constructor.name).toBe('StateManager');
		});

		it('should maintain state consistency through direct access', () => {
			State._manager.set('title', 'Test');
			expect(State._state.title).toBe('Test');
		});

		it('keeps the dependency wait queue as its coordination surface', () => {
			expect(State._manager.waitQueue instanceof Map).toBe(true);
		});

		it('should have all expected utility methods', () => {
			// the pub/sub surface (on/off/emit/reset/safely/status) is gone:
			// nothing in production ever subscribed
			const expectedMethods = ['waitFor', 'startInitialization'];

			expectedMethods.forEach(method => {
				expect(typeof State[method]).toBe('function');
			});
		});

		it('should properly bind StateManager methods', () => {
			// Test that methods maintain proper context when destructured
			const { set, get } = State._manager;

			set('title', 'Bound Test');
			expect(get('title')).toBe('Bound Test');
		});
	});

	describe('environment path derivation', () => {
		afterEach(() => {
			vi.unstubAllEnvs();
			vi.resetModules();
		});

		const freshState = async () => {
			vi.resetModules();
			return (await import('../../src/js/client/state.js')).default;
		};

		it.each(['assets', '/assets', 'assets/'])(
			'uiDir normalizes VITE_UI_DIR form %s like the build',
			async form => {
				vi.stubEnv('BASE_URL', './');
				vi.stubEnv('VITE_UI_DIR', form);
				const S = await freshState();
				expect(S.uiDir).toBe('./assets/');
				expect(S.fontDir).toBe('./assets/fonts/');
			},
		);

		it('fontDir normalizes VITE_FONT_DIR the same way', async () => {
			vi.stubEnv('BASE_URL', './');
			vi.stubEnv('VITE_UI_DIR', 'ui/');
			vi.stubEnv('VITE_FONT_DIR', 'bitmapfonts');
			const S = await freshState();
			expect(S.fontDir).toBe('./ui/bitmapfonts/');
		});

		it('empty vars fall back to ui/ and fonts/', async () => {
			vi.stubEnv('BASE_URL', './');
			vi.stubEnv('VITE_UI_DIR', '');
			vi.stubEnv('VITE_FONT_DIR', '');
			const S = await freshState();
			expect(S.uiDir).toBe('./ui/');
			expect(S.fontDir).toBe('./ui/fonts/');
		});
	});
});
