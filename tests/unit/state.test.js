import { describe, it, expect, beforeEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';

describe('State Management System', () => {
	beforeEach(() => {
		// Reset state before each test
		State.reset();
		// Clear all listeners to avoid interference between tests
		State._manager.listeners.clear();
		State._manager.waitQueue.clear();
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

	describe('Event System', () => {
		it('should register and call event listeners', () => {
			const listener = vi.fn();

			State.on('title:changed', listener);
			State._manager.set('title', 'New Title');

			expect(listener).toHaveBeenCalledWith({
				key: 'title',
				value: 'New Title',
				oldValue: null,
			});
		});

		it('should call multiple listeners for the same event', () => {
			const listener1 = vi.fn();
			const listener2 = vi.fn();

			State.on('title:changed', listener1);
			State.on('title:changed', listener2);
			State._manager.set('title', 'New Title');

			expect(listener1).toHaveBeenCalled();
			expect(listener2).toHaveBeenCalled();
		});

		it('should pass old value to listeners', () => {
			const listener = vi.fn();

			State._manager.set('title', 'Original');
			State.on('title:changed', listener);
			State._manager.set('title', 'Updated');

			expect(listener).toHaveBeenCalledWith({
				key: 'title',
				value: 'Updated',
				oldValue: 'Original',
			});
		});

		it('should remove event listeners', () => {
			const listener = vi.fn();

			State.on('title:changed', listener);
			State.off('title:changed', listener);
			State._manager.set('title', 'New Title');

			expect(listener).not.toHaveBeenCalled();
		});

		it('should support method chaining for event operations', () => {
			const listener = vi.fn();

			const result = State.on('test', listener).emit('test', {}).off('test', listener);

			expect(result).toBe(State._manager);
		});

		it('should emit custom events', () => {
			const listener = vi.fn();

			State.on('customEvent', listener);
			State.emit('customEvent', { message: 'test' });

			expect(listener).toHaveBeenCalledWith({ message: 'test' });
		});

		it('should handle listener errors gracefully', () => {
			const errorListener = vi.fn(() => {
				throw new Error('Test error');
			});
			const goodListener = vi.fn();

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			State.on('title:changed', errorListener);
			State.on('title:changed', goodListener);
			State._manager.set('title', 'Test');

			expect(consoleSpy).toHaveBeenCalled();
			expect(goodListener).toHaveBeenCalled();

			consoleSpy.mockRestore();
		});

		it('should handle removing non-existent listeners gracefully', () => {
			const listener = vi.fn();
			expect(() => {
				State.off('nonExistentEvent', listener);
			}).not.toThrow();
		});

		it('should create event listener arrays lazily', () => {
			expect(State._manager.listeners.has('newEvent')).toBe(false);

			State.on('newEvent', vi.fn());

			expect(State._manager.listeners.has('newEvent')).toBe(true);
			expect(Array.isArray(State._manager.listeners.get('newEvent'))).toBe(true);
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

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			State.waitFor('palette', errorCallback);
			State.palette = { test: 'palette' };

			expect(consoleSpy).toHaveBeenCalledWith('Error in dependency wait callback:', expect.any(Error));
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
			const listener = vi.fn();
			State.on('app:initializing', listener);

			State.startInitialization();

			expect(State._state.initializing).toBe(true);
			expect(State._state.initialized).toBe(false);
			expect(listener).toHaveBeenCalledWith({ state: State._state });
		});

		it('should warn when trying to start initialization multiple times', () => {
			const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			State.startInitialization();
			State.startInitialization();

			expect(consoleSpy).toHaveBeenCalledWith('Initialization already in progress or complete');
			consoleSpy.mockRestore();
		});

		it('should complete initialization when all dependencies are ready', () => {
			const initListener = vi.fn();
			State.on('app:initialized', initListener);

			State.startInitialization();

			// Set all required dependencies
			State.palette = { test: 'palette' };
			State.textArtCanvas = { test: 'canvas' };
			State.font = { test: 'font' };
			State.cursor = { test: 'cursor' };
			State.selectionCursor = { test: 'selectionCursor' };
			State.positionInfo = { test: 'positionInfo' };
			State.toolPreview = { test: 'toolPreview' };
			State.pasteTool = { test: 'pasteTool' };

			expect(State._state.initialized).toBe(true);
			expect(State._state.initializing).toBe(false);
			expect(initListener).toHaveBeenCalledWith({ state: State._state });
		});

		it('should not complete initialization if not all dependencies are ready', () => {
			State.startInitialization();

			// Set only some dependencies
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

		it('should provide initialization status', () => {
			const status = State.getInitializationStatus();

			expect(status).toHaveProperty('initialized');
			expect(status).toHaveProperty('initializing');
			expect(status).toHaveProperty('dependenciesReady');
			expect(status).toHaveProperty('readyCount');
			expect(status).toHaveProperty('totalCount');

			expect(typeof status.initialized).toBe('boolean');
			expect(typeof status.initializing).toBe('boolean');
			expect(typeof status.readyCount).toBe('number');
			expect(typeof status.totalCount).toBe('number');
		});

		it('should calculate ready count correctly', () => {
			State.palette = { test: 'palette' };
			State.font = { test: 'font' };

			const status = State.getInitializationStatus();
			expect(status.readyCount).toBe(2);
			expect(status.totalCount).toBe(8);
		});

		it('should return deep copy of dependencies ready in status', () => {
			State.palette = { test: 'palette' };

			const status = State.getInitializationStatus();
			status.dependenciesReady.palette = false; // Try to modify

			expect(State._state.dependenciesReady.palette).toBe(true); // Should remain unchanged
		});
	});

	describe('State Reset', () => {
		it('should reset all state to initial values', () => {
			const resetListener = vi.fn();
			State.on('app:reset', resetListener);

			// Set some values
			State._manager.set('title', 'Test Title');
			State.palette = { test: 'palette' };
			State.startInitialization();

			State.reset();

			expect(State._manager.get('title')).toBeNull();
			expect(State.palette).toBeNull();
			expect(State._state.initialized).toBe(false);
			expect(State._state.initializing).toBe(false);
			expect(resetListener).toHaveBeenCalledWith({ state: State._state });
		});

		it('should reset all dependency ready flags', () => {
			// Set some dependencies
			State.palette = { test: 'palette' };
			State.font = { test: 'font' };

			expect(State._state.dependenciesReady.palette).toBe(true);
			expect(State._state.dependenciesReady.font).toBe(true);

			State.reset();

			Object.values(State._state.dependenciesReady).forEach(ready => {
				expect(ready).toBe(false);
			});
		});

		it('should reset all core components to null', () => {
			const components = [
				'textArtCanvas',
				'palette',
				'font',
				'cursor',
				'selectionCursor',
				'positionInfo',
				'toolPreview',
				'pasteTool',
				'chat',
				'sampleTool',
				'worker',
				'title',
			];

			// Set components
			components.forEach(component => {
				State._manager.set(component, { test: component });
			});

			State.reset();

			components.forEach(component => {
				expect(State._manager.get(component)).toBeNull();
			});
		});
	});

	describe('Safe Operations', () => {
		it('should execute callback safely when no errors occur', () => {
			const callback = vi.fn(state => {
				return state.title || 'default';
			});

			State._manager.set('title', 'Test Title');
			const result = State.safely(callback);

			expect(callback).toHaveBeenCalledWith(State._state);
			expect(result).toBe('Test Title');
		});

		it('should handle errors in safe callbacks gracefully', () => {
			const errorCallback = vi.fn(() => {
				throw new Error('Test error');
			});

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

			const result = State.safely(errorCallback);

			expect(consoleSpy).toHaveBeenCalledWith('Error accessing state:', expect.any(Error));
			expect(result).toBeNull();

			consoleSpy.mockRestore();
		});

		it('should return callback result when successful', () => {
			const result = State.safely(state => {
				return { computed: 'value', stateKeys: Object.keys(state) };
			});

			expect(result).toEqual({
				computed: 'value',
				stateKeys: expect.arrayContaining(['textArtCanvas', 'palette', 'font']),
			});
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

		it('should handle invalid event names', () => {
			expect(() => {
				State.on('', vi.fn());
				State.emit('', {});
			}).not.toThrow();
		});

		it('should handle setting non-tracked properties', () => {
			State._manager.set('customProperty', 'value');
			expect(State._manager.get('customProperty')).toBe('value');
		});

		it('should handle dependency checks for non-existent properties', () => {
			// This should not crash
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

		it('should implement proper event-driven architecture', () => {
			expect(State._manager.listeners instanceof Map).toBe(true);
			expect(State._manager.waitQueue instanceof Map).toBe(true);
		});

		it('should have all expected utility methods', () => {
			const expectedMethods = [
				'waitFor',
				'on',
				'off',
				'emit',
				'reset',
				'startInitialization',
				'getInitializationStatus',
				'safely',
			];

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
});
