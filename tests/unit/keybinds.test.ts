import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
  registerKeybind,
  unregisterKeybind,
  unregisterAllKeybinds,
  registerPaletteKeybinds,
  KEYBIND_PALETTE,
  type KeyHandler
} from '../../src/scripts/keybinds';

describe('keybinds', () => {
  let mockUpdateCallback: ReturnType<typeof vi.fn>;
  let mockPalette: {
    getForegroundColor: ReturnType<typeof vi.fn>;
    getBackgroundColor: ReturnType<typeof vi.fn>;
    setForegroundColor: ReturnType<typeof vi.fn>;
    setBackgroundColor: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    // Clean up any existing keybinds
    unregisterAllKeybinds();
    
    // Mock palette object
    mockPalette = {
      getForegroundColor: vi.fn(() => 7),
      getBackgroundColor: vi.fn(() => 0),
      setForegroundColor: vi.fn(),
      setBackgroundColor: vi.fn()
    };
    
    // Mock update callback
    mockUpdateCallback = vi.fn();
  });

  afterEach(() => {
    unregisterAllKeybinds();
  });

  describe('keybind registration and management', () => {
    it('should register and unregister keybinds correctly', () => {
      const mockHandler: KeyHandler = vi.fn();
      const context = 'test-context';

      // Register keybind
      registerKeybind(context, mockHandler);

      // Simulate keydown event
      const event = new KeyboardEvent('keydown', { key: 'a' });
      document.dispatchEvent(event);

      expect(mockHandler).toHaveBeenCalledWith(event);

      // Unregister keybind
      const unregistered = unregisterKeybind(context);
      expect(unregistered).toBe(true);

      // Handler should not be called after unregistering
      (mockHandler as ReturnType<typeof vi.fn>).mockClear();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should return false when unregistering non-existent keybind', () => {
      const result = unregisterKeybind('non-existent');
      expect(result).toBe(false);
    });

    it('should replace existing keybind when registering with same context', () => {
      const handler1: KeyHandler = vi.fn();
      const handler2: KeyHandler = vi.fn();
      const context = 'same-context';

      registerKeybind(context, handler1);
      registerKeybind(context, handler2); // Should replace handler1

      const event = new KeyboardEvent('keydown', { key: 'a' });
      document.dispatchEvent(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(event);
    });

    it('should unregister all keybinds correctly', () => {
      const handler1: KeyHandler = vi.fn();
      const handler2: KeyHandler = vi.fn();

      registerKeybind('context1', handler1);
      registerKeybind('context2', handler2);

      unregisterAllKeybinds();

      const event = new KeyboardEvent('keydown', { key: 'a' });
      document.dispatchEvent(event);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('palette keybinds', () => {
    beforeEach(() => {
      registerPaletteKeybinds(mockPalette, mockUpdateCallback);
    });

    describe('number keys 1-8 with Ctrl modifier', () => {
      it('should set foreground color on Ctrl+number', () => {
        // Test Ctrl+1 (should set foreground to 0)
        const event = new KeyboardEvent('keydown', { 
          key: '1', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(0);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should toggle between normal and bright colors with Ctrl+number', () => {
        // Initially at color 7, pressing Ctrl+1 should set to 0
        mockPalette.getForegroundColor.mockReturnValue(7);
        
        let event = new KeyboardEvent('keydown', { 
          key: '1', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);
        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(0);

        // If already at color 0, pressing Ctrl+1 should set to 8 (bright version)
        mockPalette.getForegroundColor.mockReturnValue(0);
        mockPalette.setForegroundColor.mockClear();
        
        event = new KeyboardEvent('keydown', { 
          key: '1', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);
        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(8);
      });

      it('should handle all number keys 1-8 for foreground', () => {
        for (let i = 1; i <= 8; i++) {
          (mockPalette.setForegroundColor as ReturnType<typeof vi.fn>).mockClear();
          mockPalette.getForegroundColor.mockReturnValue(15); // Different from target
          const event = new KeyboardEvent('keydown', { 
            key: i.toString(), 
            ctrlKey: true 
          });
          document.dispatchEvent(event);
          expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(i - 1);
        }
      });

      it('should prevent default on Ctrl+number keys', () => {
        const event = new KeyboardEvent('keydown', { 
          key: '1', 
          ctrlKey: true 
        });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        document.dispatchEvent(event);
        
        expect(preventDefaultSpy).toHaveBeenCalled();
      });
    });

    describe('number keys 1-8 with Alt modifier', () => {
      it('should set background color on Alt+number', () => {
        mockPalette.getBackgroundColor.mockReturnValue(15); // Different from target 0
        const event = new KeyboardEvent('keydown', { 
          key: '1', 
          altKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(0);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should toggle between normal and bright colors with Alt+number', () => {
        // Initially at color 0, pressing Alt+1 should set to 8
        mockPalette.getBackgroundColor.mockReturnValue(0);
        
        let event = new KeyboardEvent('keydown', { 
          key: '1', 
          altKey: true 
        });
        document.dispatchEvent(event);
        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(8);

        // If already at color 8, pressing Alt+1 should set to 0
        mockPalette.getBackgroundColor.mockReturnValue(8);
        mockPalette.setBackgroundColor.mockClear();
        
        event = new KeyboardEvent('keydown', { 
          key: '1', 
          altKey: true 
        });
        document.dispatchEvent(event);
        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(0);
      });

      it('should prevent default on Alt+number keys', () => {
        const event = new KeyboardEvent('keydown', { 
          key: '1', 
          altKey: true 
        });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        document.dispatchEvent(event);
        
        expect(preventDefaultSpy).toHaveBeenCalled();
      });
    });

    describe('Ctrl+arrow keys for color cycling', () => {
      it('should cycle foreground color with Ctrl+ArrowUp', () => {
        mockPalette.getForegroundColor.mockReturnValue(5);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowUp', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(4);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should wrap foreground color from 0 to 15 with Ctrl+ArrowUp', () => {
        mockPalette.getForegroundColor.mockReturnValue(0);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowUp', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(15);
      });

      it('should cycle foreground color with Ctrl+ArrowDown', () => {
        mockPalette.getForegroundColor.mockReturnValue(5);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowDown', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(6);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should wrap foreground color from 15 to 0 with Ctrl+ArrowDown', () => {
        mockPalette.getForegroundColor.mockReturnValue(15);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowDown', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(0);
      });

      it('should cycle background color with Ctrl+ArrowLeft', () => {
        mockPalette.getBackgroundColor.mockReturnValue(5);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowLeft', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(4);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should wrap background color from 0 to 15 with Ctrl+ArrowLeft', () => {
        mockPalette.getBackgroundColor.mockReturnValue(0);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowLeft', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(15);
      });

      it('should cycle background color with Ctrl+ArrowRight', () => {
        mockPalette.getBackgroundColor.mockReturnValue(5);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowRight', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(6);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should wrap background color from 15 to 0 with Ctrl+ArrowRight', () => {
        mockPalette.getBackgroundColor.mockReturnValue(15);
        
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowRight', 
          ctrlKey: true 
        });
        document.dispatchEvent(event);

        expect(mockPalette.setBackgroundColor).toHaveBeenCalledWith(0);
      });

      it('should prevent default on Ctrl+arrow keys', () => {
        const event = new KeyboardEvent('keydown', { 
          key: 'ArrowUp', 
          ctrlKey: true 
        });
        const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
        document.dispatchEvent(event);
        
        expect(preventDefaultSpy).toHaveBeenCalled();
      });
    });

    describe('keybind context isolation', () => {
      it('should use KEYBIND_PALETTE constant for context', () => {
        expect(KEYBIND_PALETTE).toBe('palette');
      });

      it('should not respond to keys without modifiers', () => {
        const event = new KeyboardEvent('keydown', { key: '1' });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).not.toHaveBeenCalled();
        expect(mockPalette.setBackgroundColor).not.toHaveBeenCalled();
        // updateCurrentColorsPreview() is called for all events, but no palette changes should occur
      });

      it('should not respond to arrow keys without Ctrl', () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp' });
        document.dispatchEvent(event);

        expect(mockPalette.setForegroundColor).not.toHaveBeenCalled();
        expect(mockPalette.setBackgroundColor).not.toHaveBeenCalled();
        // updateCurrentColorsPreview() is called for all events, but no palette changes should occur
      });

      it('should not respond to keys outside 1-8 range', () => {
        const event1 = new KeyboardEvent('keydown', { key: '9', ctrlKey: true });
        const event2 = new KeyboardEvent('keydown', { key: '0', ctrlKey: true });
        const event3 = new KeyboardEvent('keydown', { key: 'a', ctrlKey: true });
        
        document.dispatchEvent(event1);
        document.dispatchEvent(event2);
        document.dispatchEvent(event3);

        expect(mockPalette.setForegroundColor).not.toHaveBeenCalled();
        expect(mockPalette.setBackgroundColor).not.toHaveBeenCalled();
        // updateCurrentColorsPreview() is called for all events, but no palette changes should occur
      });
    });

    it('should unregister palette keybinds when context is removed', () => {
      // Verify palette keybind is working
      const event = new KeyboardEvent('keydown', { key: '1', ctrlKey: true });
      document.dispatchEvent(event);
      expect(mockPalette.setForegroundColor).toHaveBeenCalledWith(0);

      // Unregister palette keybinds
      unregisterKeybind(KEYBIND_PALETTE);
      mockPalette.setForegroundColor.mockClear();

      // Should not respond anymore
      document.dispatchEvent(event);
      expect(mockPalette.setForegroundColor).not.toHaveBeenCalled();
    });
  });
});