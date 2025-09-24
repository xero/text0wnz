/* ≈ Magic Numbers ≈ shared application constants */

// Editor
const DEFAULT_FONT = 'CP437 8x16';
const DEFAULT_FONT_WIDTH = 8;
const DEFAULT_FONT_HEIGHT = 16;
// ANSI & XBIN files
const DEFAULT_FOREGROUND = 7;
const DEFAULT_BACKGROUND = 0;
const BLANK_CELL = (32 << 8) + 7;
const CHAR_NULL = 0;
const CHAR_SPACE = 32;
const COLOR_WHITE = 7;
const COLOR_BLACK = 0;
// Browser clipboard limiter
const MAX_COPY_LINES = 3;
// Multiplier to calculate panel width
const PANEL_WIDTH_MULTIPLIER = 20;

export default {
	DEFAULT_FONT,
	DEFAULT_FONT_WIDTH,
	DEFAULT_FONT_HEIGHT,
	DEFAULT_FOREGROUND,
	DEFAULT_BACKGROUND,
	BLANK_CELL,
	CHAR_NULL,
	CHAR_SPACE,
	COLOR_WHITE,
	COLOR_BLACK,
	MAX_COPY_LINES,
	PANEL_WIDTH_MULTIPLIER,
};
