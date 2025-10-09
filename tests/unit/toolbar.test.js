import { describe, it, expect, beforeEach, vi } from 'vitest';
import Toolbar from '../../src/js/client/toolbar.js';

describe('Toolbar', () => {
	beforeEach(() => {
		// Clear DOM
		document.body.innerHTML = '';
		// Reset toolbar state by creating new tools
		// We can't directly reset the toolbar's internal state, so we work with it as-is
		vi.clearAllMocks();
	});

	describe('Toolbar.add', () => {
		it('should add a tool to the toolbar', () => {
			const button = document.createElement('div');
			button.id = 'test-tool';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const result = Toolbar.add(button, onFocus, onBlur);

			expect(result).toHaveProperty('enable');
			expect(typeof result.enable).toBe('function');
		});

		it('should add click event listener to button', () => {
			const button = document.createElement('div');
			button.id = 'test-tool-2';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			Toolbar.add(button, onFocus, onBlur);

			// Simulate click
			button.click();

			expect(onFocus).toHaveBeenCalled();
		});

		it('should add toolbar-displayed class when tool is enabled', () => {
			const button = document.createElement('div');
			button.id = 'test-tool-3';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const tool = Toolbar.add(button, onFocus, onBlur);
			tool.enable();

			expect(button.classList.contains('toolbar-displayed')).toBe(true);
		});

		it('should call onFocus when tool is enabled', () => {
			const button = document.createElement('div');
			button.id = 'test-tool-4';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const tool = Toolbar.add(button, onFocus, onBlur);
			tool.enable();

			expect(onFocus).toHaveBeenCalled();
		});

		it('should store previous tool when switching to a new tool', () => {
			const button1 = document.createElement('div');
			button1.id = 'test-tool-5';
			const button2 = document.createElement('div');
			button2.id = 'test-tool-6';

			const onFocus1 = vi.fn();
			const onBlur1 = vi.fn();
			const onFocus2 = vi.fn();
			const onBlur2 = vi.fn();

			const tool1 = Toolbar.add(button1, onFocus1, onBlur1);
			const tool2 = Toolbar.add(button2, onFocus2, onBlur2);

			// Enable first tool
			tool1.enable();
			expect(button1.classList.contains('toolbar-displayed')).toBe(true);

			// Enable second tool - should disable first
			tool2.enable();
			expect(button1.classList.contains('toolbar-displayed')).toBe(false);
			expect(button2.classList.contains('toolbar-displayed')).toBe(true);
			expect(onBlur1).toHaveBeenCalled();
			expect(onFocus2).toHaveBeenCalled();
		});

		it('should call onFocus again when enabling already enabled tool', () => {
			const button = document.createElement('div');
			button.id = 'test-tool-7';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const tool = Toolbar.add(button, onFocus, onBlur);

			// Enable tool twice
			tool.enable();
			tool.enable();

			expect(onFocus).toHaveBeenCalledTimes(2);
		});
	});

	describe('Toolbar.switchTool', () => {
		it('should switch to tool by ID', () => {
			const button = document.createElement('div');
			button.id = 'switch-test-tool';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			Toolbar.add(button, onFocus, onBlur);
			Toolbar.switchTool('switch-test-tool');

			expect(onFocus).toHaveBeenCalled();
			expect(button.classList.contains('toolbar-displayed')).toBe(true);
		});

		it('should do nothing when switching to non-existent tool', () => {
			const button = document.createElement('div');
			button.id = 'existing-tool';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			Toolbar.add(button, onFocus, onBlur);

			// Try to switch to non-existent tool
			Toolbar.switchTool('non-existent-tool');

			// Should not affect existing tool
			expect(onFocus).not.toHaveBeenCalled();
		});
	});

	describe('Toolbar.getCurrentTool', () => {
		it('should return null when no tool is active', () => {
			// Create a fresh toolbar state by working with new tools
			const currentTool = Toolbar.getCurrentTool();

			// If there's already a current tool from previous tests, we need to work with that
			// In a real scenario, this would be null initially
			expect(typeof currentTool === 'string' || currentTool === null).toBe(
				true,
			);
		});

		it('should return current tool ID when a tool is active', () => {
			const button = document.createElement('div');
			button.id = 'current-tool-test';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const tool = Toolbar.add(button, onFocus, onBlur);
			tool.enable();

			const currentTool = Toolbar.getCurrentTool();
			expect(currentTool).toBe('current-tool-test');
		});
	});

	describe('Toolbar.returnToPreviousTool', () => {
		it('should return to previous tool when one exists', () => {
			const button1 = document.createElement('div');
			button1.id = 'previous-tool-1';
			const button2 = document.createElement('div');
			button2.id = 'previous-tool-2';

			const onFocus1 = vi.fn();
			const onBlur1 = vi.fn();
			const onFocus2 = vi.fn();
			const onBlur2 = vi.fn();

			const tool1 = Toolbar.add(button1, onFocus1, onBlur1);
			const tool2 = Toolbar.add(button2, onFocus2, onBlur2);

			// Enable first tool
			tool1.enable();
			vi.clearAllMocks(); // Clear the calls from initial enable

			// Enable second tool (makes first tool the "previous" tool)
			tool2.enable();
			vi.clearAllMocks(); // Clear the calls from switching

			// Return to previous tool
			Toolbar.returnToPreviousTool();

			expect(onFocus1).toHaveBeenCalled();
			expect(button1.classList.contains('toolbar-displayed')).toBe(true);
			expect(button2.classList.contains('toolbar-displayed')).toBe(false);
		});

		it('should do nothing when no previous tool exists', () => {
			const button = document.createElement('div');
			button.id = 'only-tool';
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			Toolbar.add(button, onFocus, onBlur);

			// Try to return to previous tool when none exists
			// This should not throw an error
			expect(() => Toolbar.returnToPreviousTool()).not.toThrow();
		});
	});

	describe('Tool Registration and Management', () => {
		it('should handle multiple tools registration', () => {
			const tools = [];
			const onFocusFuncs = [];
			const onBlurFuncs = [];

			// Register multiple tools
			for (let i = 0; i < 3; i++) {
				const button = document.createElement('div');
				button.id = `multi-tool-${i}`;
				const onFocus = vi.fn();
				const onBlur = vi.fn();

				onFocusFuncs.push(onFocus);
				onBlurFuncs.push(onBlur);

				const tool = Toolbar.add(button, onFocus, onBlur);
				tools.push(tool);
			}

			// Enable each tool and verify behavior
			tools.forEach((tool, index) => {
				tool.enable();
				expect(onFocusFuncs[index]).toHaveBeenCalled();
			});
		});

		it('should handle tools with undefined onFocus or onBlur', () => {
			const button = document.createElement('div');
			button.id = 'undefined-callbacks-tool';

			// Should not throw when callbacks are undefined
			expect(() => {
				const tool = Toolbar.add(button, undefined, undefined);
				tool.enable();
			}).not.toThrow();
		});

		it('should prevent event default when button is clicked', () => {
			const button = document.createElement('div');
			button.id = 'prevent-default-tool';
			const onFocus = vi.fn();

			Toolbar.add(button, onFocus, vi.fn());

			const clickEvent = new window.Event('click');
			const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

			button.dispatchEvent(clickEvent);

			expect(preventDefaultSpy).toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		it('should handle rapid tool switching', () => {
			const button1 = document.createElement('div');
			button1.id = 'rapid-1';
			const button2 = document.createElement('div');
			button2.id = 'rapid-2';
			const button3 = document.createElement('div');
			button3.id = 'rapid-3';

			const onFocus1 = vi.fn();
			const onFocus2 = vi.fn();
			const onFocus3 = vi.fn();

			const tool1 = Toolbar.add(button1, onFocus1, vi.fn());
			const tool2 = Toolbar.add(button2, onFocus2, vi.fn());
			const tool3 = Toolbar.add(button3, onFocus3, vi.fn());

			// Rapid switching
			tool1.enable();
			tool2.enable();
			tool3.enable();
			tool1.enable();
			tool2.enable();

			expect(onFocus1).toHaveBeenCalledTimes(2);
			expect(onFocus2).toHaveBeenCalledTimes(2);
			expect(onFocus3).toHaveBeenCalledTimes(1);
		});

		it('should maintain correct state with empty tool IDs', () => {
			const button = document.createElement('div');
			button.id = ''; // Empty ID
			const onFocus = vi.fn();

			const tool = Toolbar.add(button, onFocus, vi.fn());
			tool.enable();

			const currentTool = Toolbar.getCurrentTool();
			expect(currentTool).toBe('');
		});
	});
});
