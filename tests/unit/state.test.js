import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';

// test-local isolation for the shared singleton: production never
// resets state
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
		network: null,
		worker: null,
		title: null,
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
			expect(State._state.title).toBe('Test Title');
		});

		it('should return null for non-existent keys initially', () => {
			expect(State._state.nonExistentKey).toBeUndefined();
		});

		it('should update existing values', () => {
			State._manager.set('title', 'Original Title');
			State._manager.set('title', 'Updated Title');
			expect(State._state.title).toBe('Updated Title');
		});

		it('should handle null and undefined values', () => {
			State._manager.set('title', null);
			State._manager.set('worker', undefined);

			expect(State._state.title).toBeNull();
			expect(State._state.worker).toBeUndefined();
		});

		it('should support method chaining for set operations', () => {
			const result = State._manager.set('title', 'Test').set('palette', {});

			expect(result).toBe(State._manager);
			expect(State._state.title).toBe('Test');
			expect(State._state.palette).toEqual({});
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
			expect(State._state.customProperty).toBe('value');
		});

		it('runs a dependency check with an empty queue', () => {
			expect(() => State._manager.checkDependencyQueue()).not.toThrow();
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
			expect(typeof State.waitFor).toBe('function');
		});

		it('should properly bind StateManager methods', () => {
			const { waitFor } = State;
			const callback = vi.fn();

			waitFor('title', callback);
			State._manager.set('title', 'Bound Test');
			expect(callback).toHaveBeenCalledWith({ title: 'Bound Test' });
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
