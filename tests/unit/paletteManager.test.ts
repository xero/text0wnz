import {describe, it, expect} from 'vitest';
import {
  rgb6bitToRgba,
  createPalette,
  createDefaultPalette,
  type RGB6Bit,
  type RGBA,
  type Palette
} from '../../src/scripts/paletteManager';

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
  });
});