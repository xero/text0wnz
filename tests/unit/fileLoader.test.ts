import { describe, it, expect } from 'vitest';
import { parseSauce, parseAnsiToCanvas } from '../../src/scripts/fileLoader';

describe('SAUCE Parser', () => {
  it('should return null for files without SAUCE', async () => {
    const data = new Uint8Array([65, 66, 67]); // Simple text without SAUCE
    const sauce = parseSauce(data);
    expect(sauce).toBeNull();
  });

  it('should return null for files too small to contain SAUCE', async () => {
    const data = new Uint8Array(100); // Less than 128 bytes
    const sauce = parseSauce(data);
    expect(sauce).toBeNull();
  });

  it('should extract metadata from valid SAUCE record', async () => {
    // Create a minimal file with SAUCE record
    const fileData = new Uint8Array(256); // 128 bytes file + 128 bytes SAUCE
    
    // Add some file content
    fileData.set([0x48, 0x65, 0x6C, 0x6C, 0x6F], 0); // "Hello"
    
    // Create SAUCE record at the end (last 128 bytes)
    const sauceStart = 128;
    const sauceData = new Uint8Array(128);
    
    // SAUCE ID "SAUCE"
    sauceData.set([0x53, 0x41, 0x55, 0x43, 0x45], 0);
    
    // Version "00"
    sauceData.set([0x30, 0x30], 5);
    
    // Title (35 chars) - "Test Title"
    const titleBytes = new TextEncoder().encode('Test Title');
    sauceData.set(titleBytes, 7);
    
    // Author (20 chars) - "Test Author"
    const authorBytes = new TextEncoder().encode('Test Author');
    sauceData.set(authorBytes, 42);
    
    // Group (20 chars) - "Test Group"
    const groupBytes = new TextEncoder().encode('Test Group');
    sauceData.set(groupBytes, 62);
    
    // Comments (22 chars) - "Test Comments"
    const commentsBytes = new TextEncoder().encode('Test Comments');
    sauceData.set(commentsBytes, 104);
    
    // Set SAUCE record at the end of file
    fileData.set(sauceData, sauceStart);
    
    const sauce = parseSauce(fileData);
    
    expect(sauce).toBeTruthy();
    expect(sauce?.title).toBe('Test Title');
    expect(sauce?.author).toBe('Test Author');
    expect(sauce?.group).toBe('Test Group');
    expect(sauce?.comments).toBe('Test Comments');
  });

  it('should handle SAUCE records with null terminators', async () => {
    const fileData = new Uint8Array(256);
    const sauceStart = 128;
    const sauceData = new Uint8Array(128);
    
    // SAUCE ID "SAUCE"
    sauceData.set([0x53, 0x41, 0x55, 0x43, 0x45], 0);
    // Version "00"
    sauceData.set([0x30, 0x30], 5);
    
    // Title with null terminator - "Title\0\0\0..."
    const titleBytes = new Uint8Array(35);
    titleBytes.set(new TextEncoder().encode('Title'), 0);
    // Rest filled with null bytes (default)
    sauceData.set(titleBytes, 7);
    
    fileData.set(sauceData, sauceStart);
    
    const sauce = parseSauce(fileData);
    
    expect(sauce?.title).toBe('Title'); // Should trim null terminators
  });

  it('should parse SAUCE dimensions from binary fields', () => {
    const fileData = new Uint8Array(256); // File with SAUCE record
    const sauceStart = fileData.length - 128;
    
    // Basic SAUCE header
    const sauceData = new Uint8Array(128);
    sauceData.set([0x53, 0x41, 0x55, 0x43, 0x45], 0); // "SAUCE"
    sauceData.set([0x30, 0x30], 5); // "00"
    
    // Title, author, group (minimal)
    const titleBytes = new Uint8Array(35);
    titleBytes.set(new TextEncoder().encode('Test File'), 0);
    sauceData.set(titleBytes, 7);
    
    const authorBytes = new Uint8Array(20);
    authorBytes.set(new TextEncoder().encode('Test Author'), 0);
    sauceData.set(authorBytes, 42);
    
    const groupBytes = new Uint8Array(20);
    groupBytes.set(new TextEncoder().encode('Test Group'), 0);
    sauceData.set(groupBytes, 62);
    
    const commentsBytes = new Uint8Array(22);
    commentsBytes.set(new TextEncoder().encode('IBM VGA'), 0);
    sauceData.set(commentsBytes, 104);
    
    // Binary fields:
    sauceData[94] = 1;    // DataType = 1 (Character/ANSI)
    sauceData[95] = 1;    // FileType = 1 (ANSI)
    sauceData[96] = 80;   // TInfo1 (width) low byte = 80
    sauceData[97] = 0;    // TInfo1 high byte = 0
    sauceData[98] = 132;  // TInfo2 (height) low byte = 132
    sauceData[99] = 0;    // TInfo2 high byte = 0
    
    fileData.set(sauceData, sauceStart);
    
    const sauce = parseSauce(fileData);
    
    expect(sauce?.title).toBe('Test File');
    expect(sauce?.author).toBe('Test Author');
    expect(sauce?.group).toBe('Test Group');
    expect(sauce?.comments).toBe('IBM VGA');
    expect(sauce?.width).toBe(80);
    expect(sauce?.height).toBe(132);
  });
});

describe('ANSI Parser', () => {
  it('should parse simple text without escape sequences', async () => {
    const ansiData = new Uint8Array([0x48, 0x65, 0x6C, 0x6C, 0x6F]); // "Hello"
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    expect(canvas.width).toBe(80);
    expect(canvas.height).toBe(25);
    expect(canvas.fontType).toBe('cp437');
    
    // Check first character 'H'
    expect(canvas.rawdata[0]).toBe(0x48); // 'H'
    expect(canvas.rawdata[1]).toBe(7);     // white foreground
    expect(canvas.rawdata[2]).toBe(0);     // black background
    
    // Check second character 'e'
    expect(canvas.rawdata[3]).toBe(0x65); // 'e'
    expect(canvas.rawdata[4]).toBe(7);     // white foreground
    expect(canvas.rawdata[5]).toBe(0);     // black background
  });

  it('should parse ANSI color codes correctly', async () => {
    // Test with ANSI: ESC[31m (red) + "Hello"
    const ansiData = new Uint8Array([
      0x1B, 0x5B, 0x33, 0x31, 0x6D, // ESC[31m (red foreground)
      0x48, 0x65, 0x6C, 0x6C, 0x6F   // "Hello"
    ]);
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    // Check that text is red (color 1)
    expect(canvas.rawdata[0]).toBe(0x48); // 'H'
    expect(canvas.rawdata[1]).toBe(1);     // red foreground
    expect(canvas.rawdata[2]).toBe(0);     // black background
  });

  it('should handle background color codes', async () => {
    // Test with ANSI: ESC[42m (green background) + "X"
    const ansiData = new Uint8Array([
      0x1B, 0x5B, 0x34, 0x32, 0x6D, // ESC[42m (green background)
      0x58                            // "X"
    ]);
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    expect(canvas.rawdata[0]).toBe(0x58); // 'X'
    expect(canvas.rawdata[1]).toBe(7);     // white foreground (default)
    expect(canvas.rawdata[2]).toBe(2);     // green background
  });

  it('should handle cursor positioning', async () => {
    // Test with ANSI: ESC[2;5H (move to row 2, col 5) + "X"
    const ansiData = new Uint8Array([
      0x1B, 0x5B, 0x32, 0x3B, 0x35, 0x48, // ESC[2;5H
      0x58                                  // "X"
    ]);
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    // Character should be at position (4, 1) in 0-based indexing
    // Row 2 (1-based) = row 1 (0-based), Col 5 (1-based) = col 4 (0-based)
    const pos = (1 * 80 + 4) * 3; // y=1, x=4
    expect(canvas.rawdata[pos]).toBe(0x58); // 'X'
    expect(canvas.rawdata[pos + 1]).toBe(7); // white foreground
    expect(canvas.rawdata[pos + 2]).toBe(0); // black background
  });

  it('should handle carriage return and line feed', async () => {
    // Test with "AB\r\nCD" - should create two lines
    const ansiData = new Uint8Array([
      0x41, 0x42,       // "AB"
      0x0D, 0x0A,       // CR LF
      0x43, 0x44        // "CD"
    ]);
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    // First line: "AB"
    expect(canvas.rawdata[0]).toBe(0x41); // 'A' at (0,0)
    expect(canvas.rawdata[3]).toBe(0x42); // 'B' at (1,0)
    
    // Second line: "CD"
    const secondLineStart = 80 * 3; // Start of second row
    expect(canvas.rawdata[secondLineStart]).toBe(0x43); // 'C' at (0,1)
    expect(canvas.rawdata[secondLineStart + 3]).toBe(0x44); // 'D' at (1,1)
  });

  it('should stop at EOF character', async () => {
    // Test with "AB" + EOF + "CD" - should only process "AB"
    const ansiData = new Uint8Array([
      0x41, 0x42,       // "AB"
      0x1A,             // EOF character
      0x43, 0x44        // "CD" (should be ignored)
    ]);
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    // Should have "AB" but not "CD"
    expect(canvas.rawdata[0]).toBe(0x41); // 'A'
    expect(canvas.rawdata[3]).toBe(0x42); // 'B'
    expect(canvas.rawdata[6]).toBe(32);   // Space (default), not 'C'
  });

  it('should handle SAUCE metadata in canvas state', async () => {
    const sauce = {
      title: 'Test Art',
      author: 'Test Artist',
      group: 'Test Group',
      comments: 'Test Comments'
    };
    
    const ansiData = new Uint8Array([0x48, 0x69]); // "Hi"
    
    const canvas = await parseAnsiToCanvas(ansiData, sauce);
    
    expect(canvas.name).toBe('Test Art');
    expect(canvas.sauce).toEqual(sauce);
  });

  it('should initialize canvas with proper defaults', async () => {
    const ansiData = new Uint8Array([]);
    
    const canvas = await parseAnsiToCanvas(ansiData, null);
    
    expect(canvas.width).toBe(80);
    expect(canvas.height).toBe(25);
    expect(canvas.fontType).toBe('cp437');
    expect(canvas.font).toBe('CP437 8x16'); // Should use mapped font now
    expect(canvas.spacing).toBe(0);
    expect(canvas.ice).toBe(false);
    expect(canvas.colors).toHaveLength(16);
    expect(canvas.rawdata).toHaveLength(80 * 25 * 3);
    
    // All cells should be initialized to space, white on black
    for (let i = 0; i < 80 * 25; i++) {
      expect(canvas.rawdata[i * 3]).toBe(32); // space
      expect(canvas.rawdata[i * 3 + 1]).toBe(7); // white fg
      expect(canvas.rawdata[i * 3 + 2]).toBe(0); // black bg
    }
  });

  it('should use dimensions from SAUCE metadata', async () => {
    const sauce = {
      title: 'Custom Size Art',
      author: 'Test Artist',
      group: 'Test Group',
      comments: 'IBM VGA',
      width: 100,
      height: 50
    };
    
    const ansiData = new Uint8Array([0x48, 0x69]); // "Hi"
    const canvas = await parseAnsiToCanvas(ansiData, sauce);
    
    expect(canvas.width).toBe(100);
    expect(canvas.height).toBe(50);
    expect(canvas.rawdata).toHaveLength(100 * 50 * 3);
    expect(canvas.sauce).toEqual(sauce);
  });

  describe('font mapping', () => {
    it('should map IBM VGA to CP437 8x16', async () => {
      const sauce = {
        title: 'Test Art',
        author: 'Test Artist',
        group: 'Test Group',
        comments: 'IBM VGA'
      };
      
      const ansiData = new Uint8Array([0x48, 0x69]); // "Hi"
      const canvas = await parseAnsiToCanvas(ansiData, sauce);
      
      expect(canvas.font).toBe('CP437 8x16');
      expect(canvas.fontType).toBe('cp437');
    });

    it('should map IBM EGA to CP437 8x14', async () => {
      const sauce = {
        title: 'Test Art',
        author: 'Test Artist',
        group: 'Test Group',
        comments: 'IBM EGA'
      };
      
      const ansiData = new Uint8Array([0x48, 0x69]); // "Hi"
      const canvas = await parseAnsiToCanvas(ansiData, sauce);
      
      expect(canvas.font).toBe('CP437 8x14');
      expect(canvas.fontType).toBe('cp437');
    });

    it('should map Amiga Topaz to Topaz+ 1200', async () => {
      const sauce = {
        title: 'Test Art',
        author: 'Test Artist',
        group: 'Test Group',
        comments: 'Amiga Topaz 2+'
      };
      
      const ansiData = new Uint8Array([0x48, 0x69]); // "Hi"
      const canvas = await parseAnsiToCanvas(ansiData, sauce);
      
      expect(canvas.font).toBe('Topaz+ 1200 8x16');
      expect(canvas.fontType).toBe('cp437');
    });

    it('should fallback to default font for unknown SAUCE info', async () => {
      const sauce = {
        title: 'Test Art',
        author: 'Test Artist',
        group: 'Test Group',
        comments: 'Unknown Font System'
      };
      
      const ansiData = new Uint8Array([0x48, 0x69]); // "Hi"
      const canvas = await parseAnsiToCanvas(ansiData, sauce);
      
      expect(canvas.font).toBe('CP437 8x16');
      expect(canvas.fontType).toBe('cp437');
    });
  });
});