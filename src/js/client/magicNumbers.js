/* ≈ Magic Numbers ≈ shared application constants */

// Fonts
const DEFAULT_FONT = 'CP437 8x16';
const DEFAULT_FONT_WIDTH = 8;
const DEFAULT_FONT_HEIGHT = 16;
const NFO_FONT = 'Topaz-437 8x16';
// ANSI & XBIN files
const COLOR_WHITE = 7;
const COLOR_BLACK = 0;
const DEFAULT_FOREGROUND = 7;
const DEFAULT_BACKGROUND = 0;
const BLANK_CELL = (32 << 8) + 7;
const LIGHT_BLOCK = 176; // (░)
const MEDIUM_BLOCK = 177; // (▒)
const DARK_BLOCK = 178; // (▓)
const FULL_BLOCK = 219; // (█)
const LOWER_HALFBLOCK = 223; // (▄)
const UPPER_HALFBLOCK = 220; // (▀)
const LEFT_HALFBLOCK = 221; // (▌)
const RIGHT_HALFBLOCK = 222; // (▐)
const MIDDLE_BLOCK = 254; // (■)
const MIDDLE_DOT = 249; // (·)
const CHAR_BELL = 7; // (BEL)
const CHAR_NULL = 0; // (NUL)
const CHAR_SPACE = 32;
const CHAR_NBSP = 255;
// Browser clipboard limiter
const MAX_COPY_LINES = 3;
// Multiplier to calculate panel width
const PANEL_WIDTH_MULTIPLIER = 20;

export default {
	DEFAULT_FONT,
	DEFAULT_FONT_WIDTH,
	DEFAULT_FONT_HEIGHT,
	NFO_FONT,
	COLOR_WHITE,
	COLOR_BLACK,
	DEFAULT_FOREGROUND,
	DEFAULT_BACKGROUND,
	BLANK_CELL,
	LIGHT_BLOCK,
	MEDIUM_BLOCK,
	DARK_BLOCK,
	FULL_BLOCK,
	LOWER_HALFBLOCK,
	UPPER_HALFBLOCK,
	LEFT_HALFBLOCK,
	RIGHT_HALFBLOCK,
	MIDDLE_BLOCK,
	MIDDLE_DOT,
	CHAR_BELL,
	CHAR_NULL,
	CHAR_NBSP,
	CHAR_SPACE,
	MAX_COPY_LINES,
	PANEL_WIDTH_MULTIPLIER,
};
