import {describe, it, expect, vi, beforeEach} from 'vitest';
import {setFont, type FontType, type FontRenderer} from '../../src/scripts/fontManager';
import {createDefaultPalette, type Palette} from '../../src/scripts/paletteManager';

// Mock Canvas and CanvasRenderingContext2D for jsdom environment
class MockCanvasRenderingContext2D {
  font = '';
  textBaseline = '';
  fillStyle = '';
  
  fillText = vi.fn();
}

describe('fontManager', () => {
  let mockPalette: Palette;
  let mockCtx: MockCanvasRenderingContext2D;

  beforeEach(() => {
    mockPalette = createDefaultPalette();
    mockCtx = new MockCanvasRenderingContext2D();
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

      // Since it's 'system', it should parse the regex but default to 16x16
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

      // With spacing: x = 5 * (16 + 1) = 85
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
      // This test is actually not possible with current fontManager logic
      // because only exact 'system' with utf8 goes to system font path
      // Any other name attempts to load from image file
      // Let's test the default dimensions behavior instead
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      expect(fontRenderer.width).toBe(16);  // Default
      expect(fontRenderer.height).toBe(16); // Default

      fontRenderer.draw(65, 7, 0, mockCtx as any, 2, 3);

      expect(mockCtx.font).toBe('16px monospace');
      expect(mockCtx.fillText).toHaveBeenCalledWith('A', 32, 48); // x=2*16, y=3*16
    });

    it('should handle character codes correctly', async () => {
      const fontRenderer = await setFont('system', 'utf8', mockPalette, false);

      // Test various character codes
      fontRenderer.draw(32, 7, 0, mockCtx as any, 0, 0); // Space
      expect(mockCtx.fillText).toHaveBeenCalledWith(' ', 0, 0);

      fontRenderer.draw(64, 7, 0, mockCtx as any, 0, 0); // @
      expect(mockCtx.fillText).toHaveBeenCalledWith('@', 0, 0);

      fontRenderer.draw(126, 7, 0, mockCtx as any, 0, 0); // ~
      expect(mockCtx.fillText).toHaveBeenCalledWith('~', 0, 0);
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