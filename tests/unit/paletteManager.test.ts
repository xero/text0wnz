import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {
  rgb6bitToRgba,
  createPalette,
  createDefaultPalette,
  PalettePicker,
  type RGB6Bit,
  type RGBA,
  type Palette,
  type PalettePickerOptions
} from '../../src/scripts/paletteManager';
import {unregisterAllKeybinds} from '../../src/scripts/keybinds';

describe('paletteManager', () => {
  describe('rgb6bitToRgba', () => {
    it('should convert 6-bit RGB to RGBA correctly', () => {
      // Test black (0,0,0)
      const black: RGB6Bit = [0, 0, 0];
      const blackRgba = rgb6bitToRgba(black);
      expect(blackRgba).toEqual([0, 0, 0, 255]);

      // Test white (63,63,63)
      const white: RGB6Bit = [63, 63, 63];
      const whiteRgba = rgb6bitToRgba(white);
      expect(whiteRgba).toEqual([255, 255, 255, 255]);

      // Test mid-gray (32,32,32) - roughly 50% intensity
      const midGray: RGB6Bit = [32, 32, 32];
      const midGrayRgba = rgb6bitToRgba(midGray);
      expect(midGrayRgba).toEqual([130, 130, 130, 255]);

      // Test red (63,0,0)
      const red: RGB6Bit = [63, 0, 0];
      const redRgba = rgb6bitToRgba(red);
      expect(redRgba).toEqual([255, 0, 0, 255]);
    });

    it('should handle edge cases correctly', () => {
      // Test minimum values
      const min: RGB6Bit = [0, 0, 0];
      const minRgba = rgb6bitToRgba(min);
      expect(minRgba[0]).toBe(0);
      expect(minRgba[1]).toBe(0);
      expect(minRgba[2]).toBe(0);
      expect(minRgba[3]).toBe(255);

      // Test maximum values
      const max: RGB6Bit = [63, 63, 63];
      const maxRgba = rgb6bitToRgba(max);
      expect(maxRgba[0]).toBe(255);
      expect(maxRgba[1]).toBe(255);
      expect(maxRgba[2]).toBe(255);
      expect(maxRgba[3]).toBe(255);
    });
  });

  describe('createPalette', () => {
    it('should create a palette with default foreground and background', () => {
      const colors: RGB6Bit[] = [
        [0, 0, 0],    // 0: black
        [63, 0, 0],   // 1: red
        [0, 63, 0],   // 2: green
        [63, 63, 63]  // 3: white
      ];

      const palette = createPalette(colors);

      expect(palette.getForegroundColor()).toBe(7); // default fg
      expect(palette.getBackgroundColor()).toBe(0); // default bg
    });

    it('should create a palette with custom foreground and background', () => {
      const colors: RGB6Bit[] = [
        [0, 0, 0],    // 0: black
        [63, 0, 0],   // 1: red
        [0, 63, 0],   // 2: green
        [63, 63, 63]  // 3: white
      ];

      const palette = createPalette(colors, 1, 2);

      expect(palette.getForegroundColor()).toBe(1);
      expect(palette.getBackgroundColor()).toBe(2);
    });

    it('should return correct RGBA colors', () => {
      const colors: RGB6Bit[] = [
        [0, 0, 0],    // 0: black
        [63, 0, 0],   // 1: red
        [0, 63, 0],   // 2: green
        [63, 63, 63]  // 3: white
      ];

      const palette = createPalette(colors);

      expect(palette.getRGBAColor(0)).toEqual([0, 0, 0, 255]);
      expect(palette.getRGBAColor(1)).toEqual([255, 0, 0, 255]);
      expect(palette.getRGBAColor(2)).toEqual([0, 255, 0, 255]);
      expect(palette.getRGBAColor(3)).toEqual([255, 255, 255, 255]);
    });

    it('should allow setting and getting foreground/background colors', () => {
      const colors: RGB6Bit[] = [
        [0, 0, 0],    // 0: black
        [63, 0, 0],   // 1: red
        [0, 63, 0],   // 2: green
        [63, 63, 63]  // 3: white
      ];

      const palette = createPalette(colors);

      palette.setForegroundColor(2);
      palette.setBackgroundColor(1);

      expect(palette.getForegroundColor()).toBe(2);
      expect(palette.getBackgroundColor()).toBe(1);
    });

    it('should return a copy of the 6-bit color array', () => {
      const colors: RGB6Bit[] = [
        [0, 0, 0],    // 0: black
        [63, 0, 0],   // 1: red
        [0, 63, 0],   // 2: green
        [63, 63, 63]  // 3: white
      ];

      const palette = createPalette(colors);
      const returned6Bit = palette.to6BitArray();

      expect(returned6Bit).toEqual(colors);
      expect(returned6Bit).not.toBe(colors); // Should be a copy

      // Modifying the returned array should not affect the original
      returned6Bit[0] = [42, 42, 42];
      expect(palette.getRGBAColor(0)).toEqual([0, 0, 0, 255]); // Should still be black
    });
  });

  describe('createDefaultPalette', () => {
    it('should create a 16-color ANSI palette', () => {
      const palette = createDefaultPalette();
      const colors = palette.to6BitArray();

      expect(colors).toHaveLength(16);

      // Test some specific ANSI colors
      expect(colors[0]).toEqual([0, 0, 0]);      // Black
      expect(colors[1]).toEqual([0, 0, 42]);     // Blue
      expect(colors[2]).toEqual([0, 42, 0]);     // Green
      expect(colors[4]).toEqual([42, 0, 0]);     // Red
      expect(colors[15]).toEqual([63, 63, 63]);  // White
    });

    it('should have default foreground and background colors', () => {
      const palette = createDefaultPalette();

      expect(palette.getForegroundColor()).toBe(7); // Light gray
      expect(palette.getBackgroundColor()).toBe(0); // Black
    });

    it('should return correct RGBA for default colors', () => {
      const palette = createDefaultPalette();

      // Test black
      expect(palette.getRGBAColor(0)).toEqual([0, 0, 0, 255]);
      
      // Test white
      expect(palette.getRGBAColor(15)).toEqual([255, 255, 255, 255]);
      
      // Test red
      const redRgba = palette.getRGBAColor(4);
      expect(redRgba[0]).toBeGreaterThan(150); // Should be reddish
      expect(redRgba[1]).toBeLessThan(50);     // Low green
      expect(redRgba[2]).toBeLessThan(50);     // Low blue
      expect(redRgba[3]).toBe(255);            // Full alpha
    });

    it('should allow color modifications', () => {
      const palette = createDefaultPalette();

      palette.setForegroundColor(15); // White
      palette.setBackgroundColor(4);  // Red

      expect(palette.getForegroundColor()).toBe(15);
      expect(palette.getBackgroundColor()).toBe(4);
    });

    describe('ANSI color specification compliance', () => {
      // Standard ANSI color palette as specified
      const ansiColors = [
        {r: 0, g: 0, b: 0},       // 0: black
        {r: 0, g: 0, b: 42},      // 1: blue
        {r: 0, g: 42, b: 0},      // 2: green
        {r: 0, g: 42, b: 42},     // 3: cyan
        {r: 42, g: 0, b: 0},      // 4: red
        {r: 42, g: 0, b: 42},     // 5: magenta
        {r: 42, g: 21, b: 0},     // 6: yellow/brown
        {r: 42, g: 42, b: 42},    // 7: white/light gray
        {r: 21, g: 21, b: 21},    // 8: bright black/dark gray
        {r: 21, g: 21, b: 63},    // 9: bright blue
        {r: 21, g: 63, b: 21},    // 10: bright green
        {r: 21, g: 63, b: 63},    // 11: bright cyan
        {r: 63, g: 21, b: 21},    // 12: bright red
        {r: 63, g: 21, b: 63},    // 13: bright magenta
        {r: 63, g: 63, b: 21},    // 14: bright yellow
        {r: 63, g: 63, b: 63},    // 15: bright white
      ];

      const colorNames = [
        'black', 'blue', 'green', 'cyan', 'red', 'magenta', 'yellow', 'white',
        'bright_black', 'bright_blue', 'bright_green', 'bright_cyan', 
        'bright_red', 'bright_magenta', 'bright_yellow', 'bright_white'
      ];

      it('should match the ANSI specification for all 16 colors in 6-bit RGB', () => {
        const palette = createDefaultPalette();
        const colors = palette.to6BitArray();

        ansiColors.forEach((expectedColor, index) => {
          expect(colors[index], `Color ${index} (${colorNames[index]}) should match ANSI spec`).toEqual([
            expectedColor.r,
            expectedColor.g,
            expectedColor.b
          ]);
        });
      });

      it('should convert ANSI colors to correct RGBA values', () => {
        const palette = createDefaultPalette();

        ansiColors.forEach((expectedColor, index) => {
          const actualRgba = palette.getRGBAColor(index);
          
          // Convert expected 6-bit values to 8-bit using the same formula as rgb6bitToRgba
          const expectedR = (expectedColor.r << 2) | (expectedColor.r >> 4);
          const expectedG = (expectedColor.g << 2) | (expectedColor.g >> 4);
          const expectedB = (expectedColor.b << 2) | (expectedColor.b >> 4);
          
          expect(actualRgba, `RGBA for color ${index} (${colorNames[index]}) should match converted ANSI spec`).toEqual([
            expectedR,
            expectedG,
            expectedB,
            255
          ]);
        });
      });

      it('should provide correct RGB values for standard color drawing', () => {
        const palette = createDefaultPalette();

        // Test key colors that are commonly used in drawing
        
        // Basic colors (0-7)
        expect(palette.getRGBAColor(0)).toEqual([0, 0, 0, 255]); // Black
        expect(palette.getRGBAColor(1)).toEqual([0, 0, 170, 255]); // Blue  
        expect(palette.getRGBAColor(2)).toEqual([0, 170, 0, 255]); // Green
        expect(palette.getRGBAColor(3)).toEqual([0, 170, 170, 255]); // Cyan
        expect(palette.getRGBAColor(4)).toEqual([170, 0, 0, 255]); // Red
        expect(palette.getRGBAColor(5)).toEqual([170, 0, 170, 255]); // Magenta
        expect(palette.getRGBAColor(6)).toEqual([170, 85, 0, 255]); // Yellow/Brown
        expect(palette.getRGBAColor(7)).toEqual([170, 170, 170, 255]); // Light Gray

        // Bright colors (8-15)
        expect(palette.getRGBAColor(8)).toEqual([85, 85, 85, 255]); // Dark Gray
        expect(palette.getRGBAColor(9)).toEqual([85, 85, 255, 255]); // Bright Blue
        expect(palette.getRGBAColor(10)).toEqual([85, 255, 85, 255]); // Bright Green
        expect(palette.getRGBAColor(11)).toEqual([85, 255, 255, 255]); // Bright Cyan
        expect(palette.getRGBAColor(12)).toEqual([255, 85, 85, 255]); // Bright Red
        expect(palette.getRGBAColor(13)).toEqual([255, 85, 255, 255]); // Bright Magenta
        expect(palette.getRGBAColor(14)).toEqual([255, 255, 85, 255]); // Bright Yellow
        expect(palette.getRGBAColor(15)).toEqual([255, 255, 255, 255]); // White
      });

      it('should handle edge cases in color specification', () => {
        const palette = createDefaultPalette();

        // Test minimum intensity colors
        expect(palette.getRGBAColor(0)).toEqual([0, 0, 0, 255]); // Pure black
        
        // Test maximum intensity colors  
        expect(palette.getRGBAColor(15)).toEqual([255, 255, 255, 255]); // Pure white
        
        // Test colors with mixed intensities (like yellow/brown)
        const yellowBrown = palette.getRGBAColor(6);
        expect(yellowBrown[0]).toBe(170); // Red component
        expect(yellowBrown[1]).toBe(85);  // Green component  
        expect(yellowBrown[2]).toBe(0);   // Blue component
        expect(yellowBrown[3]).toBe(255); // Alpha
      });
    });
  });

  describe('PalettePicker', () => {
    let mockCanvas: HTMLCanvasElement;
    let mockCtx: CanvasRenderingContext2D;
    let mockPalette: Palette;
    let mockInitCanvas: ReturnType<typeof vi.fn>;
    let mockUpdateCallback: ReturnType<typeof vi.fn>;
    let palettePicker: PalettePicker;

    beforeEach(() => {
      // Clean up any existing keybinds
      unregisterAllKeybinds();

      // Mock canvas and context
      mockCanvas = {
        width: 160,
        height: 40,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: vi.fn(() => ({
          left: 0,
          top: 0,
          width: 160,
          height: 40
        }))
      } as unknown as HTMLCanvasElement;

      mockCtx = {
        createImageData: vi.fn((w, h) => ({
          width: w,
          height: h,
          data: new Uint8ClampedArray(w * h * 4)
        })),
        putImageData: vi.fn(),
        clearRect: vi.fn()
      } as unknown as CanvasRenderingContext2D;

      mockInitCanvas = vi.fn(() => mockCtx);
      mockUpdateCallback = vi.fn();
      mockPalette = createDefaultPalette();
    });

    afterEach(() => {
      if (palettePicker) {
        palettePicker.destroy();
      }
      unregisterAllKeybinds();
    });

    it('should initialize with correct properties', () => {
      const options: PalettePickerOptions = {
        canvas: mockCanvas,
        palette: mockPalette,
        initCanvas: mockInitCanvas,
        updateCurrentColorsPreview: mockUpdateCallback
      };

      palettePicker = new PalettePicker(options);

      expect(mockInitCanvas).toHaveBeenCalledWith(mockCanvas, 'paletteColors');
      expect(mockCtx.createImageData).toHaveBeenCalledTimes(16); // For all 16 colors
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('touchend', expect.any(Function), {passive: false});
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('touchcancel', expect.any(Function), {passive: false});
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function), {passive: false});
      expect(mockCanvas.addEventListener).toHaveBeenCalledWith('contextmenu', expect.any(Function));
    });

    it('should render palette swatches on initialization', () => {
      const options: PalettePickerOptions = {
        canvas: mockCanvas,
        palette: mockPalette,
        initCanvas: mockInitCanvas,
        updateCurrentColorsPreview: mockUpdateCallback
      };

      palettePicker = new PalettePicker(options);

      // Should call putImageData for each of the 16 colors
      expect(mockCtx.putImageData).toHaveBeenCalledTimes(16);
      expect(mockUpdateCallback).toHaveBeenCalled();
    });

    it('should update all swatches when updatePalette is called', () => {
      const options: PalettePickerOptions = {
        canvas: mockCanvas,
        palette: mockPalette,
        initCanvas: mockInitCanvas,
        updateCurrentColorsPreview: mockUpdateCallback
      };

      palettePicker = new PalettePicker(options);
      
      // Clear the mock calls from initialization
      (mockCtx.putImageData as ReturnType<typeof vi.fn>).mockClear();
      mockUpdateCallback.mockClear();

      palettePicker.updatePalette();

      expect(mockCtx.putImageData).toHaveBeenCalledTimes(16);
      expect(mockUpdateCallback).toHaveBeenCalled();
    });

    describe('mouse interactions', () => {
      beforeEach(() => {
        const options: PalettePickerOptions = {
          canvas: mockCanvas,
          palette: mockPalette,
          initCanvas: mockInitCanvas,
          updateCurrentColorsPreview: mockUpdateCallback
        };
        palettePicker = new PalettePicker(options);
        mockUpdateCallback.mockClear();
      });

      it('should set foreground color on normal mouse click', () => {
        const mouseEvent = new MouseEvent('mouseup', {
          clientX: 40, // Second column (40/20 = 2, but floor(40/20) = 2)
          clientY: 10  // First row
        });

        // Mock getBoundingClientRect to return proper values
        mockCanvas.getBoundingClientRect = vi.fn(() => ({
          left: 0,
          top: 0,
          width: 160,
          height: 40
        })) as any;

        // Simulate the mouseEnd event
        const addEventListener = mockCanvas.addEventListener as ReturnType<typeof vi.fn>;
        const mouseUpHandler = addEventListener.mock.calls.find(call => call[0] === 'mouseup')?.[1];
        
        expect(mouseUpHandler).toBeDefined();
        mouseUpHandler(mouseEvent);

        // Should set foreground color (colorIndex = row * 8 + col = 0 * 8 + 2 = 2)
        expect(mockPalette.getForegroundColor()).toBe(2);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should set background color on Ctrl+click', () => {
        const mouseEvent = new MouseEvent('mouseup', {
          clientX: 60, // Third column  
          clientY: 10, // First row
          ctrlKey: true
        });

        mockCanvas.getBoundingClientRect = vi.fn(() => ({
          left: 0,
          top: 0,
          width: 160,
          height: 40
        })) as any;

        const addEventListener = mockCanvas.addEventListener as ReturnType<typeof vi.fn>;
        const mouseUpHandler = addEventListener.mock.calls.find(call => call[0] === 'mouseup')?.[1];
        
        mouseUpHandler(mouseEvent);

        // Should set background color (colorIndex = 0 * 8 + 3 = 3)
        expect(mockPalette.getBackgroundColor()).toBe(3);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should set background color on Alt+click', () => {
        const mouseEvent = new MouseEvent('mouseup', {
          clientX: 80, // Fourth column
          clientY: 10, // First row
          altKey: true
        });

        mockCanvas.getBoundingClientRect = vi.fn(() => ({
          left: 0,
          top: 0,
          width: 160,
          height: 40
        })) as any;

        const addEventListener = mockCanvas.addEventListener as ReturnType<typeof vi.fn>;
        const mouseUpHandler = addEventListener.mock.calls.find(call => call[0] === 'mouseup')?.[1];
        
        mouseUpHandler(mouseEvent);

        // Should set background color (colorIndex = 0 * 8 + 4 = 4)
        expect(mockPalette.getBackgroundColor()).toBe(4);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should calculate correct color index for bottom row', () => {
        const mouseEvent = new MouseEvent('mouseup', {
          clientX: 20, // First column
          clientY: 30  // Second row
        });

        mockCanvas.getBoundingClientRect = vi.fn(() => ({
          left: 0,
          top: 0,
          width: 160,
          height: 40
        })) as any;

        const addEventListener = mockCanvas.addEventListener as ReturnType<typeof vi.fn>;
        const mouseUpHandler = addEventListener.mock.calls.find(call => call[0] === 'mouseup')?.[1];
        
        mouseUpHandler(mouseEvent);

        // Should set foreground color (colorIndex = 1 * 8 + 1 = 9)
        expect(mockPalette.getForegroundColor()).toBe(9);
      });
    });

    describe('touch interactions', () => {
      beforeEach(() => {
        const options: PalettePickerOptions = {
          canvas: mockCanvas,
          palette: mockPalette,
          initCanvas: mockInitCanvas,
          updateCurrentColorsPreview: mockUpdateCallback
        };
        palettePicker = new PalettePicker(options);
        mockUpdateCallback.mockClear();
      });

      it('should set foreground color on touch', () => {
        const touchEvent = new TouchEvent('touchend', {
          changedTouches: [
            { pageX: 40, pageY: 10 }
          ] as any
        });

        mockCanvas.getBoundingClientRect = vi.fn(() => ({
          left: 0,
          top: 0,
          width: 160,
          height: 40
        })) as any;

        const addEventListener = mockCanvas.addEventListener as ReturnType<typeof vi.fn>;
        const touchEndHandler = addEventListener.mock.calls.find(call => call[0] === 'touchend')?.[1];
        
        expect(touchEndHandler).toBeDefined();
        const preventDefaultSpy = vi.spyOn(touchEvent, 'preventDefault');
        touchEndHandler(touchEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
        // Should set foreground color (colorIndex = 0 * 8 + 2 = 2)
        expect(mockPalette.getForegroundColor()).toBe(2);
        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should calculate correct color index with offset canvas position', () => {
        const touchEvent = new TouchEvent('touchend', {
          changedTouches: [
            { pageX: 60, pageY: 30 } // Touch on position that maps to bottom row
          ] as any
        });

        mockCanvas.getBoundingClientRect = vi.fn(() => ({
          left: 20,
          top: 10,
          width: 160,
          height: 40
        })) as any;

        const addEventListener = mockCanvas.addEventListener as ReturnType<typeof vi.fn>;
        const touchEndHandler = addEventListener.mock.calls.find(call => call[0] === 'touchend')?.[1];
        
        touchEndHandler(touchEvent);

        // pageX 60, rect.left 20, so relative X = 40
        // pageY 30, rect.top 10, so relative Y = 20
        // swatchWidth = 160/8 = 20, so x = floor(40/20) = 2
        // swatchHeight = 40/2 = 20, so y = floor(20/20) = 1
        // colorIndex = 1 * 8 + 2 = 10
        expect(mockPalette.getForegroundColor()).toBe(10);
      });
    });

    describe('cleanup', () => {
      it('should remove event listeners and unregister keybinds on destroy', () => {
        const options: PalettePickerOptions = {
          canvas: mockCanvas,
          palette: mockPalette,
          initCanvas: mockInitCanvas,
          updateCurrentColorsPreview: mockUpdateCallback
        };

        palettePicker = new PalettePicker(options);
        palettePicker.destroy();

        expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('touchend', expect.any(Function));
        expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('touchcancel', expect.any(Function));
        expect(mockCanvas.removeEventListener).toHaveBeenCalledWith('mouseup', expect.any(Function));
      });
    });

    describe('integration with keybinds', () => {
      beforeEach(() => {
        const options: PalettePickerOptions = {
          canvas: mockCanvas,
          palette: mockPalette,
          initCanvas: mockInitCanvas,
          updateCurrentColorsPreview: mockUpdateCallback
        };
        palettePicker = new PalettePicker(options);
        mockUpdateCallback.mockClear();
      });

      it('should register palette keybinds during initialization', () => {
        // Test that palette keybinds are working by simulating a key event
        const event = new KeyboardEvent('keydown', { key: '1', ctrlKey: true });
        document.dispatchEvent(event);

        expect(mockUpdateCallback).toHaveBeenCalled();
      });

      it('should update preview callback when palette keybinds are triggered', () => {
        const event = new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true });
        document.dispatchEvent(event);

        expect(mockUpdateCallback).toHaveBeenCalled();
      });
    });
  });
});