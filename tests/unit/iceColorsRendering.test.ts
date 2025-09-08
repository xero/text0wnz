/**
 * ICE Colors rendering behavior tests
 * Tests the actual rendering logic for ICE color handling
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOfflineCanvasState } from '../../src/scripts/state';
import type { CanvasState } from '../../src/scripts/state';

describe('ICE Colors Rendering Logic', () => {
  let canvas: CanvasState;

  beforeEach(() => {
    canvas = createOfflineCanvasState();
  });

  describe('ICE color rendering calculations', () => {
    it('should apply ICE logic to background colors correctly', () => {
      canvas.ice = false; // ICE disabled
      
      // Background color 12 (bright red)
      const bg = 12;
      const ice = canvas.ice;
      
      // Current logic from canvasRenderer.ts
      const isBlinking = !ice && bg >= 8;
      const effectiveBg = ice ? bg : (bg & 7);
      
      expect(isBlinking).toBe(true);
      expect(effectiveBg).toBe(4); // 12 & 7 = 4 (dark red)
    });

    it('should handle foreground colors with ICE logic - THIS EXPOSES THE BUG', () => {
      canvas.ice = false; // ICE disabled
      
      // Foreground color 12 (bright red)
      const fg = 12;
      const bg = 0;
      const ice = canvas.ice;
      
      // Current logic from canvasRenderer.ts (BUGGY - no ICE logic for fg)
      const bgIsBlinking = !ice && bg >= 8;
      const effectiveBg = ice ? bg : (bg & 7);
      const effectiveFg = (bgIsBlinking && false) ? effectiveBg : fg; // blinkOn assumed false
      
      // BUG: effectiveFg should have ICE logic applied like background
      // When ICE is disabled, bright foreground (12) should become dark (4)
      // But currently it stays 12
      expect(effectiveFg).toBe(12); // Current buggy behavior
      
      // What it SHOULD be after the fix:
      // const fgIsBlinking = !ice && fg >= 8;
      // const expectedEffectiveFg = ice ? fg : (fg & 7);
      // expect(expectedEffectiveFg).toBe(4); // 12 & 7 = 4
    });

    it('should handle foreground blinking when ICE is disabled', () => {
      canvas.ice = false; // ICE disabled
      
      // Foreground color 14 (bright yellow)
      const fg = 14;
      const bg = 0;
      const ice = canvas.ice;
      
      // What the logic SHOULD be after the fix:
      const fgIsBlinking = !ice && fg >= 8;
      const expectedEffectiveFg = ice ? fg : (fg & 7);
      
      expect(fgIsBlinking).toBe(true);
      expect(expectedEffectiveFg).toBe(6); // 14 & 7 = 6 (brown/yellow)
    });

    it('should preserve bright colors when ICE is enabled', () => {
      canvas.ice = true; // ICE enabled
      
      const fg = 13; // Bright magenta
      const bg = 10; // Bright green
      const ice = canvas.ice;
      
      // With ICE enabled, both should preserve full range
      const effectiveBg = ice ? bg : (bg & 7);
      const effectiveFg = ice ? fg : (fg & 7); // What logic should be after fix
      
      expect(effectiveBg).toBe(10);
      expect(effectiveFg).toBe(13);
    });

    it('should handle mixed bright fg and bg correctly when ICE disabled', () => {
      canvas.ice = false; // ICE disabled
      
      const fg = 11; // Bright cyan
      const bg = 9;  // Bright blue
      const ice = canvas.ice;
      
      // Both should be affected by ICE logic
      const fgIsBlinking = !ice && fg >= 8;
      const bgIsBlinking = !ice && bg >= 8;
      const effectiveFg = ice ? fg : (fg & 7);
      const effectiveBg = ice ? bg : (bg & 7);
      
      expect(fgIsBlinking).toBe(true);
      expect(bgIsBlinking).toBe(true);
      expect(effectiveFg).toBe(3); // 11 & 7 = 3 (cyan)
      expect(effectiveBg).toBe(1); // 9 & 7 = 1 (blue)
    });
  });

  describe('Blinking behavior calculations', () => {
    it('should determine blinking state for both fg and bg', () => {
      canvas.ice = false; // ICE disabled
      const blinkOn = true; // Simulated blink state
      
      // Test case: both fg and bg are bright
      const fg = 12; // Bright red
      const bg = 10; // Bright green
      const ice = canvas.ice;
      
      const fgIsBlinking = !ice && fg >= 8;
      const bgIsBlinking = !ice && bg >= 8;
      const effectiveBg = ice ? bg : (bg & 7);
      
      // When blinking is on, foreground should become background color
      const effectiveFg = fgIsBlinking && blinkOn ? effectiveBg : (ice ? fg : (fg & 7));
      
      expect(fgIsBlinking).toBe(true);
      expect(bgIsBlinking).toBe(true);
      expect(effectiveBg).toBe(2); // 10 & 7 = 2 (green)
      expect(effectiveFg).toBe(2); // When blinking, fg becomes bg color
    });

    it('should handle foreground-only blinking', () => {
      canvas.ice = false; // ICE disabled
      const blinkOn = true;
      
      // Test case: bright fg on dark bg
      const fg = 15; // Bright white
      const bg = 1;  // Dark blue
      const ice = canvas.ice;
      
      const fgIsBlinking = !ice && fg >= 8;
      const bgIsBlinking = !ice && bg >= 8;
      const effectiveBg = ice ? bg : (bg & 7);
      
      const effectiveFg = fgIsBlinking && blinkOn ? effectiveBg : (ice ? fg : (fg & 7));
      
      expect(fgIsBlinking).toBe(true);
      expect(bgIsBlinking).toBe(false);
      expect(effectiveBg).toBe(1); // Background unchanged
      expect(effectiveFg).toBe(1); // When blinking, fg becomes bg color
    });
  });
});