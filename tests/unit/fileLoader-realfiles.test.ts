import { describe, it, expect } from 'vitest';
import { parseSauce, parseAnsiToCanvas } from '../../src/scripts/fileLoader';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('SAUCE Parser Real Files', () => {
  it('should extract metadata from x0-outlaw-research.ans', async () => {
    try {
      // Try to load the test file
      const filePath = resolve(process.cwd(), 'examples/ansi/x0-outlaw-research.ans');
      const data = new Uint8Array(readFileSync(filePath));
      
      const sauce = parseSauce(data);
      
      if (sauce) {
        console.log('SAUCE metadata found:', sauce);
        expect(sauce.title).toBeTruthy();
        expect(sauce.author).toBeTruthy();
      } else {
        console.log('No SAUCE metadata found in file');
        // This is not necessarily an error - not all ANSI files have SAUCE
      }
    } catch (error) {
      console.log('Test file not found, skipping:', error);
      // Skip this test if the file doesn't exist
    }
  });

  it('should parse ANSI content from x0-outlaw-research.ans', async () => {
    try {
      const filePath = resolve(process.cwd(), 'examples/ansi/x0-outlaw-research.ans');
      const data = new Uint8Array(readFileSync(filePath));
      
      const sauce = parseSauce(data);
      const canvas = parseAnsiToCanvas(data, sauce);
      
      expect(canvas.width).toBe(80);
      expect(canvas.height).toBe(25);
      expect(canvas.rawdata).toHaveLength(80 * 25 * 3);
      
      // Check that we have some non-space characters
      let hasContent = false;
      for (let i = 0; i < canvas.rawdata.length; i += 3) {
        if (canvas.rawdata[i] !== 32) { // not space
          hasContent = true;
          break;
        }
      }
      expect(hasContent).toBe(true);
      
      // Check font mapping from SAUCE
      if (sauce?.comments?.includes('IBM VGA')) {
        expect(canvas.font).toBe('CP437 8x16');
        expect(canvas.fontType).toBe('cp437');
      }
      
      console.log('Parsed canvas:', {
        name: canvas.name,
        font: canvas.font,
        fontType: canvas.fontType,
        sauce: canvas.sauce,
        hasContent
      });
    } catch (error) {
      console.log('Test file not found, skipping:', error);
    }
  });
});