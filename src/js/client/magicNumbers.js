// @ts-check
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
// CP437 Characters
const LIGHT_BLOCK = 176; // ░
const MEDIUM_BLOCK = 177; // ▒
const DARK_BLOCK = 178; // ▓
const MIDDLE_BLOCK = 254; // ■
const MIDDLE_DOT = 249; // ∙
const CHAR_BELL = 7; // (BEL)
const CHAR_NULL = 0; // (NUL)
const CHAR_SPACE = 32; // ( )
const CHAR_NBSP = 255; // (NBSP)
const CHAR_SLASH = 47; // /
const CHAR_PIPE = 124; // |
const CHAR_CAPITAL_X = 88; // X
const CHAR_RIGHT_PARENTHESIS = 41; // )
const CHAR_LEFT_PARENTHESIS = 40; // (
const CHAR_RIGHT_SQUARE_BRACKET = 93; // ]
const CHAR_LEFT_SQUARE_BRACKET = 91; // [
const CHAR_RIGHT_CURLY_BRACE = 125; // }
const CHAR_LEFT_CURLY_BRACE = 123; // {
const CHAR_BACKSLASH = 92; // \
const CHAR_FORWARD_SLASH = 47; // /
const CHAR_APOSTROPHE = 39; // '
const CHAR_GRAVE_ACCENT = 96; // `
const CHAR_GREATER_THAN = 62; // >
const CHAR_LESS_THAN = 60; // <
const CHAR_CAPITAL_P = 80; // P
const CHAR_DIGIT_9 = 57; // 9
// Browser clipboard limiter (multiplier of canvas columns/rows)
const PASTE_LIMIT_MULTIPLIER = 3;
// Canvas resize limits
const MAX_COLUMNS = 1000;
const MAX_ROWS = 10000;
const RESIZE_WARN_CELLS = 300000;
// undo depth is byte-capped in core/patchArena.ts, DEFAULT_UNDO_BYTE_CAP
// Trailing debounce for autosave journal keyframe rewrites
const JOURNAL_KEYFRAME_DEBOUNCE_MS = 500;
// Touch gesture tuning, dialed in on real devices. Hold =
// single-finger stroke disambiguation delay; slop = max travel for a
// tap; window = all-fingers-lift deadline for undo/redo taps; palm
// grace = how long after a pen lifts touch stays rejected.
const GESTURE_TAP_WINDOW_MS = 250;
const GESTURE_SLOP_PX = 10;
const GESTURE_STROKE_HOLD_MS = 70;
const PEN_PALM_GRACE_MS = 500;
// iOS Safari refuses canvases above ~16.7 megapixels
const MAX_CANVAS_AREA = 16777216;

export default {
	DEFAULT_FONT,
	DEFAULT_FONT_WIDTH,
	DEFAULT_FONT_HEIGHT,
	NFO_FONT,
	COLOR_WHITE,
	COLOR_BLACK,
	DEFAULT_FOREGROUND,
	DEFAULT_BACKGROUND,
	LIGHT_BLOCK,
	MEDIUM_BLOCK,
	DARK_BLOCK,
	MIDDLE_BLOCK,
	MIDDLE_DOT,
	CHAR_BELL,
	CHAR_NULL,
	CHAR_NBSP,
	CHAR_SPACE,
	CHAR_SLASH,
	CHAR_PIPE,
	CHAR_CAPITAL_X,
	CHAR_RIGHT_PARENTHESIS,
	CHAR_LEFT_PARENTHESIS,
	CHAR_RIGHT_SQUARE_BRACKET,
	CHAR_LEFT_SQUARE_BRACKET,
	CHAR_RIGHT_CURLY_BRACE,
	CHAR_LEFT_CURLY_BRACE,
	CHAR_BACKSLASH,
	CHAR_FORWARD_SLASH,
	CHAR_APOSTROPHE,
	CHAR_GRAVE_ACCENT,
	CHAR_GREATER_THAN,
	CHAR_LESS_THAN,
	CHAR_CAPITAL_P,
	CHAR_DIGIT_9,
	PASTE_LIMIT_MULTIPLIER,
	MAX_COLUMNS,
	MAX_ROWS,
	RESIZE_WARN_CELLS,
	JOURNAL_KEYFRAME_DEBOUNCE_MS,
	GESTURE_TAP_WINDOW_MS,
	GESTURE_SLOP_PX,
	GESTURE_STROKE_HOLD_MS,
	PEN_PALM_GRACE_MS,
	MAX_CANVAS_AREA,
};
