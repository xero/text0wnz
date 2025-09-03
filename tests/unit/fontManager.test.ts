import {describe, it, expect, vi, beforeEach} from 'vitest';
import {setFont, loadFontFromImage, type FontType, type FontRenderer} from '../../src/scripts/fontManager';
import {createDefaultPalette, type Palette} from '../../src/scripts/paletteManager';

// Mock Canvas and CanvasRenderingContext2D for jsdom environment
class MockCanvasRenderingContext2D {
  font = '';
  textBaseline = '';
  fillStyle = '';

  fillText = vi.fn();
  drawImage = vi.fn();
  getImageData = vi.fn();
  putImageData = vi.fn();
}

// Mock ImageData
class MockImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

describe('fontManager', () => {
  let mockPalette: Palette;
  let mockCtx: MockCanvasRenderingContext2D;
  let mockCanvas: HTMLCanvasElement;
  let mockImage: any;

  beforeEach(() => {
    mockPalette = createDefaultPalette();
    mockCtx = new MockCanvasRenderingContext2D();

    // Mock document.createElement for canvas
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn().mockReturnValue(mockCtx)
    } as any;

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas;
      }
      return {} as any;
    });

    // Mock Image globally, with src setter firing onload for any value
    mockImage = {
      width: 0,
      height: 0,
      _src: '',
      onload: null,
      onerror: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };
    Object.defineProperty(mockImage, "src", {
      get() { return this._src; },
      set(v: string) {
        this._src = v;
        // Simulate async image load after src set
        setTimeout(() => {
          if (this.onload) this.onload(new Event('load'));
        }, 0);
      },
      configurable: true,
      enumerable: true
    });
    (global as any).Image = vi.fn(() => mockImage);

    vi.clearAllMocks();
  });

  describe('setFont', () => {
    it('should handle system utf8 font', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      expect(fontRenderer.width).toBe(16);
      expect(fontRenderer.height).toBe(16);
      expect(fontRenderer.fontType).toBe('utf8');
      expect(fontRenderer.getLetterSpacing()).toBe(false);
    });

    it('should handle system utf8 font with letter spacing', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, true);

      expect(fontRenderer.getLetterSpacing()).toBe(true);
    });

    it('should parse font dimensions from name for system font', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette);

      expect(fontRenderer.width).toBe(16);
      expect(fontRenderer.height).toBe(16);
    });

    it('should use default dimensions when not parseable', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette);

      expect(fontRenderer.width).toBe(16);
      expect(fontRenderer.height).toBe(16);
    });

    it('should allow setting and getting letter spacing', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      expect(fontRenderer.getLetterSpacing()).toBe(false);

      fontRenderer.setLetterSpacing(true);
      expect(fontRenderer.getLetterSpacing()).toBe(true);

      fontRenderer.setLetterSpacing(false);
      expect(fontRenderer.getLetterSpacing()).toBe(false);
    });

    it('should create a drawing function for system font', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      expect(fontRenderer.draw).toBeTypeOf('function');

      // Test the draw function
      fontRenderer.draw(65, 7, 0, mockCtx as any, 5, 10); // Draw 'A' at position (5,10)

      expect(mockCtx.font).toBe('16px monospace');
      expect(mockCtx.textBaseline).toBe('top');
      expect(mockCtx.fillStyle).toContain('rgba(');
      expect(mockCtx.fillText).toHaveBeenCalledWith('A', 80, 160); // x=5*16, y=10*16
    });

    it('should handle letter spacing in draw function', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, true);

      fontRenderer.draw(65, 7, 0, mockCtx as any, 5, 10);

      expect(mockCtx.fillText).toHaveBeenCalledWith('A', 85, 160);
    });

    it('should use palette colors for foreground', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      // Test with different foreground colors
      fontRenderer.draw(65, 4, 0, mockCtx as any, 0, 0); // Red foreground
      const redCall = mockCtx.fillStyle;

      mockCtx.fillStyle = ''; // Reset
      fontRenderer.draw(65, 2, 0, mockCtx as any, 0, 0); // Green foreground
      const greenCall = mockCtx.fillStyle;

      expect(redCall).not.toBe(greenCall);
      expect(redCall).toContain('rgba(');
      expect(greenCall).toContain('rgba(');
    });

    it('should handle custom font dimensions correctly for system font', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      expect(fontRenderer.width).toBe(16);
      expect(fontRenderer.height).toBe(16);

      fontRenderer.draw(65, 7, 0, mockCtx as any, 2, 3);

      expect(mockCtx.font).toBe('16px monospace');
      expect(mockCtx.fillText).toHaveBeenCalledWith('A', 32, 48); // x=2*16, y=3*16
    });

    it('should handle character codes correctly', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      fontRenderer.draw(32, 7, 0, mockCtx as any, 0, 0); // Space
      expect(mockCtx.fillText).toHaveBeenCalledWith(' ', 0, 0);

      fontRenderer.draw(64, 7, 0, mockCtx as any, 0, 0); // @
      expect(mockCtx.fillText).toHaveBeenCalledWith('@', 0, 0);

      fontRenderer.draw(126, 7, 0, mockCtx as any, 0, 0); // ~
      expect(mockCtx.fillText).toHaveBeenCalledWith('~', 0, 0);
    });
  });

  describe('image-based font loading', () => {

    beforeEach(() => {
      // Setup mock image data for font sheets
      const mockImageData = new MockImageData(8, 16);
      for (let i = 0; i < mockImageData.data.length; i += 4) {
        const isOn = Math.floor(i / 4) % 2 === 1;
        const intensity = isOn ? 255 : 0;
        mockImageData.data[i] = intensity;     // R
        mockImageData.data[i + 1] = intensity; // G
        mockImageData.data[i + 2] = intensity; // B
        mockImageData.data[i + 3] = 255;       // A
      }
      mockCtx.getImageData.mockReturnValue(mockImageData);
    });

    it('should load image font with correct dimensions', async () => {
      mockImage.width = 128;  // 16 * 8
      mockImage.height = 256; // 16 * 16

      const promise = setFont('Topaz437 8x16', 'cp437', mockPalette);

      const fontRenderer = await promise;

      expect(fontRenderer.width).toBe(8);
      expect(fontRenderer.height).toBe(16);
      expect(fontRenderer.fontType).toBe('cp437');
      expect(mockImage.src).toBe('./ui/fontz/Topaz437 8x16.png');
    });

    it('should load different font sizes correctly', async () => {
      const testCases = [
        { name: 'C64-PETSCII shifted 8x8', width: 8, height: 8, sheetWidth: 128, sheetHeight: 128 },
        { name: 'CP437 8x19', width: 8, height: 19, sheetWidth: 128, sheetHeight: 304 },
        { name: 'Custom 16x16', width: 16, height: 16, sheetWidth: 256, sheetHeight: 256 }
      ];

      for (const testCase of testCases) {
        // -- create a NEW mock image and patch global Image for this iteration
        let imageInstance: any = {
          width: testCase.sheetWidth,
          height: testCase.sheetHeight,
          _src: '',
          onload: null,
          onerror: null,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn()
        };
        Object.defineProperty(imageInstance, "src", {
          get() { return this._src; },
          set(v: string) {
            this._src = v;
            setTimeout(() => {
              if (imageInstance.onload) imageInstance.onload(new Event('load'));
            }, 0);
          },
          configurable: true,
          enumerable: true
        });
        (global as any).Image = vi.fn(() => imageInstance);

        // Now run setFont (which will create an Image, which will call onload!)
        const fontRenderer = await setFont(testCase.name, 'cp437', mockPalette);

        expect(fontRenderer.width).toBe(testCase.width);
        expect(fontRenderer.height).toBe(testCase.height);
        expect(imageInstance.src).toBe(`./ui/fontz/${testCase.name}.png`);
      }
    }, 10000);

    it('should handle letter spacing for image fonts', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const promise = setFont('Topaz437 8x16', 'cp437', mockPalette, true);

      const fontRenderer = await promise;

      expect(fontRenderer.getLetterSpacing()).toBe(true);

      fontRenderer.setLetterSpacing(false);
      expect(fontRenderer.getLetterSpacing()).toBe(false);
    });

    it('should reject when image fails to load', async () => {
      // Override src setter to fire onerror instead of onload
      Object.defineProperty(mockImage, "src", {
        set(v: string) {
          this._src = v;
          setTimeout(() => {
            if (this.onerror) this.onerror(new Event('error'));
          }, 0);
        },
        get() { return this._src; },
        configurable: true,
        enumerable: true
      });

      const promise = setFont('Topaz437 8x16', 'cp437', mockPalette);

      await expect(promise)
        .rejects.toThrow();
    });

    it('should create drawing function that handles glyph rendering', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const fontRenderer = await setFont('Topaz437 8x16', 'cp437', mockPalette);

      expect(fontRenderer.draw).toBeTypeOf('function');

      fontRenderer.draw(65, 7, 0, mockCtx as any, 5, 10); // Draw 'A' at position (5,10)

      expect(mockCtx.putImageData).toHaveBeenCalledWith(
        expect.any(Object),
        40,
        160
      );
    });

    it('should handle letter spacing in image font drawing', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const fontRenderer = await setFont('Topaz437 8x16', 'cp437', mockPalette, true);

      fontRenderer.draw(65, 7, 0, mockCtx as any, 5, 10);

      expect(mockCtx.putImageData).toHaveBeenCalledWith(
        expect.any(Object),
        45,
        160
      );
    });

    it('should handle invalid glyph parameters gracefully', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const fontRenderer = await setFont('Topaz437 8x16', 'cp437', mockPalette);

      fontRenderer.draw(65, 16, 0, mockCtx as any, 0, 0); // Invalid fg color (>15)
      fontRenderer.draw(65, 7, 16, mockCtx as any, 0, 0);  // Invalid bg color (>15)
      fontRenderer.draw(256, 7, 0, mockCtx as any, 0, 0);  // Invalid char code (>255)

      expect(mockCtx.putImageData).not.toHaveBeenCalled();
    });

    it('should process font sheet with threshold-based coloring', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      mockCtx.getImageData.mockImplementation((sx, sy, width, height) => {
        const imageData = new MockImageData(width, height);
        // Create test pattern: first half of pixels are white (>120), second half are black (<=120)
        for (let i = 0; i < imageData.data.length; i += 4) {
          const pixelIndex = Math.floor(i / 4);
          const isWhite = pixelIndex < (width * height / 2);
          const intensity = isWhite ? 255 : 0;
          imageData.data[i] = intensity;
          imageData.data[i + 1] = intensity;
          imageData.data[i + 2] = intensity;
          imageData.data[i + 3] = 255;
        }
        return imageData;
      });

      const fontRenderer = await setFont('Topaz437 8x16', 'cp437', mockPalette);

      expect(fontRenderer).toBeDefined();
      expect(fontRenderer.width).toBe(8);
      expect(fontRenderer.height).toBe(16);

      expect(mockCtx.getImageData).toHaveBeenCalled();
    });

    it('should implement FontRenderer interface correctly for image fonts', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const fontRenderer = await setFont('Topaz437 8x16', 'cp437', mockPalette);

      expect(fontRenderer).toHaveProperty('width');
      expect(fontRenderer).toHaveProperty('height');
      expect(fontRenderer).toHaveProperty('fontType');
      expect(fontRenderer).toHaveProperty('setLetterSpacing');
      expect(fontRenderer).toHaveProperty('getLetterSpacing');
      expect(fontRenderer).toHaveProperty('draw');

      expect(typeof fontRenderer.width).toBe('number');
      expect(typeof fontRenderer.height).toBe('number');
      expect(typeof fontRenderer.fontType).toBe('string');
      expect(typeof fontRenderer.setLetterSpacing).toBe('function');
      expect(typeof fontRenderer.getLetterSpacing).toBe('function');
      expect(typeof fontRenderer.draw).toBe('function');
      expect(fontRenderer.fontType).toBe('cp437');
    });
  });

  describe('loadFontFromImage direct function tests', () => {
    beforeEach(() => {
      const mockImageData = new MockImageData(8, 16);
      mockCtx.getImageData.mockReturnValue(mockImageData);
    });

    it('should load font image with correct parameters', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const fontRenderer = await loadFontFromImage('Topaz437 8x16', false, mockPalette, 'cp437');

      expect(fontRenderer.width).toBe(8);
      expect(fontRenderer.height).toBe(16);
      expect(fontRenderer.fontType).toBe('cp437');
      expect(fontRenderer.getLetterSpacing()).toBe(false);
    });

    it('should handle utf8 font type for image fonts', async () => {
      mockImage.width = 128;
      mockImage.height = 256;

      const fontRenderer = await loadFontFromImage('Topaz437 8x16', true, mockPalette, 'utf8');

      expect(fontRenderer.fontType).toBe('utf8');
      expect(fontRenderer.getLetterSpacing()).toBe(true);
    });
  });

  describe('FontRenderer interface compliance', () => {
    it('should implement all required FontRenderer methods', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette);

      expect(fontRenderer).toHaveProperty('width');
      expect(fontRenderer).toHaveProperty('height');
      expect(fontRenderer).toHaveProperty('fontType');
      expect(fontRenderer).toHaveProperty('setLetterSpacing');
      expect(fontRenderer).toHaveProperty('getLetterSpacing');
      expect(fontRenderer).toHaveProperty('draw');

      expect(typeof fontRenderer.width).toBe('number');
      expect(typeof fontRenderer.height).toBe('number');
      expect(typeof fontRenderer.fontType).toBe('string');
      expect(typeof fontRenderer.setLetterSpacing).toBe('function');
      expect(typeof fontRenderer.getLetterSpacing).toBe('function');
      expect(typeof fontRenderer.draw).toBe('function');
    });

    it('should have correct fontType property', async () => {
      const utf8Font = await setFont('system', 'utf8', mockPalette);
      expect(utf8Font.fontType).toBe('utf8');
    });
  });
});
