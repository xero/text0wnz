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
const CHAR_NULL = 0; // (NUL)
const CHAR_SPACE = 32; // ( )
const CHAR_SLASH = 47; // /
const CHAR_PIPE = 124; // |
const CHAR_CAPITAL_X = 88; // X
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

export default Object.freeze({
	DEFAULT_FONT,
	DEFAULT_FONT_WIDTH,
	DEFAULT_FONT_HEIGHT,
	NFO_FONT,
	COLOR_WHITE,
	COLOR_BLACK,
	DEFAULT_FOREGROUND,
	DEFAULT_BACKGROUND,
	CHAR_NULL,
	CHAR_SPACE,
	CHAR_SLASH,
	CHAR_PIPE,
	CHAR_CAPITAL_X,
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
});
