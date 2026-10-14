/**
 * Ascii line stamp engine: turns a freehand cell path into classic
 * ascii line art glyphs (BRUSH.md thin style). Pure and renderer free
 * so goldens can pin every slope class without a browser, and so the
 * same engine carries into v3 unchanged.
 *
 * Shape of the problem: pointer samples arrive sparsely; Bresenham
 * fills the gaps; each path cell then needs a glyph chosen by the
 * LOCAL slope class, not the instantaneous step, because single steps
 * flicker between classes on hand drawn input. Direction is estimated
 * over a trailing window and normalized, so a stroke drawn right to
 * left stamps the same glyphs as one drawn left to right.
 *
 * Emission is incremental but revisable: a cell may be emitted again
 * with a better glyph once more of the stroke is known (steep column
 * steps, shallow runs growing under the pointer). Downstream writes
 * are last wins inside one undo group, which the editor already
 * supports, so live drawing stays fully live with no preview phase.
 */

export interface StampOut {
	x: number;
	y: number;
	charCode: number;
	/** set on the final cell of a thin stroke: terminal join context */
	tip?: TipInfo;
	/**
	 * set on the first cell of a thin stroke: departure direction, so a
	 * stroke STARTING against a line can join it too (a departure at
	 * dx,dy is geometrically a tip arriving at -dx,-dy)
	 */
	root?: TipInfo;
}

export type SlopeClass =
	| 'vertical'
	| 'steep'
	| 'diag'
	| 'shallow'
	| 'horizontal';

const VBAR = 124; // |
const SLASH = 47; // /
const BACKSLASH = 92; // \
const DASH = 45; // -
const UNDERSCORE = 95; // _
const DQUOTE = 34; // "
const CARET = 94; // ^
const PERIOD = 46; // .
const COMMA = 44; // ,
const APOSTROPHE = 39; // '
const BACKTICK = 96; // `
const FILL = 36; // $
const X_JUNCTION = 88; // X
const COLON = 58; // :
const SEMICOLON = 59; // ;
const EQUALS = 61; // =
const TILDE = 126; // ~
const PLUS = 43; // +
const PERCENT = 37; // %
const SEVEN = 55; // 7
const TEE = 84; // T
const AR = 114; // r
const EL = 76; // L
const JAY = 74; // J
const EDGE_D = 100; // d
const EDGE_B = 98; // b
const EDGE_P = 80; // P
const EDGE_Y = 89; // Y

/**
 * Same stroke collision ranks: stems beat run bodies beat AA pebbles,
 * so a scribble crossing itself keeps its skeleton readable. Equal
 * rank resolves to the newest write (the hand knows best).
 */
const RANK = new Map<number, number>([
	// roman fill outranks everything so crossing strokes union solid
	[FILL, 4],
	[EDGE_D, 3],
	[EDGE_B, 3],
	[EDGE_P, 3],
	[EDGE_Y, 3],
	[VBAR, 3],
	[SLASH, 3],
	[BACKSLASH, 3],
	[X_JUNCTION, 3],
	[PLUS, 3],
	[PERCENT, 3],
	[DASH, 2],
	[UNDERSCORE, 2],
	[DQUOTE, 2],
	[PERIOD, 1],
	[COMMA, 1],
	[APOSTROPHE, 1],
	[BACKTICK, 1],
	[CARET, 1],
	[COLON, 1],
	[SEMICOLON, 1],
]);

/** Long shallow runs band by position: low to high for rising rows. */
const LONG_RAMP_RISING = [UNDERSCORE, PERIOD, DASH, DQUOTE];

// ------------------------------------------------- additive merging

/**
 * Ink weight for cross stroke contact: a touch never carves a heavier
 * mark, and equal weights densify instead of replacing.
 */
const WEIGHT = new Map<number, number>([
	[PERIOD, 1],
	[COMMA, 1],
	[APOSTROPHE, 1],
	[BACKTICK, 1],
	[CARET, 1],
	[COLON, 2],
	[SEMICOLON, 2],
	[DASH, 2],
	[UNDERSCORE, 2],
	[DQUOTE, 2],
	[EQUALS, 2],
	[TILDE, 2],
	[VBAR, 3],
	[SLASH, 3],
	[BACKSLASH, 3],
	[X_JUNCTION, 3],
	[PLUS, 3],
	[PERCENT, 3],
	[SEVEN, 3],
	[TEE, 3],
	[AR, 3],
	[EL, 3],
	[JAY, 3],
	[EDGE_D, 4],
	[EDGE_B, 4],
	[EDGE_P, 4],
	[EDGE_Y, 4],
	[FILL, 5],
]);

const PROMOTE: Record<number, number> = {
	1: COLON,
	2: EQUALS,
	3: X_JUNCTION,
	4: FILL,
	5: FILL,
};

/**
 * Junction vocabulary for pass-through crossings (BRUSH.md, Rowan
 * Crawford): a line crossing another line voices the shared cell with
 * a glyph that points along both, instead of the heavier mark simply
 * punching through. Bars crossing horizontals read as plus, diagonals
 * crossing horizontals as percent, diagonals crossing bars or each
 * other as X. Junction glyphs are sticky: repeat contact keeps them.
 */
const HORIZ_INK = [DASH, UNDERSCORE, EQUALS, DQUOTE, TILDE];

const joinKey = (a: number, b: number) => (a < b ? (a << 8) | b : (b << 8) | a);

const JOIN = new Map<number, number>();
for (const h of HORIZ_INK) {
	JOIN.set(joinKey(VBAR, h), PLUS);
	JOIN.set(joinKey(SLASH, h), PERCENT);
	JOIN.set(joinKey(BACKSLASH, h), PERCENT);
	JOIN.set(joinKey(PLUS, h), PLUS);
	JOIN.set(joinKey(PERCENT, h), PERCENT);
}
JOIN.set(joinKey(SLASH, BACKSLASH), X_JUNCTION);
JOIN.set(joinKey(VBAR, SLASH), X_JUNCTION);
JOIN.set(joinKey(VBAR, BACKSLASH), X_JUNCTION);
JOIN.set(joinKey(PLUS, VBAR), PLUS);
JOIN.set(joinKey(PERCENT, SLASH), PERCENT);
JOIN.set(joinKey(PERCENT, BACKSLASH), PERCENT);
JOIN.set(joinKey(X_JUNCTION, VBAR), X_JUNCTION);
JOIN.set(joinKey(X_JUNCTION, SLASH), X_JUNCTION);
JOIN.set(joinKey(X_JUNCTION, BACKSLASH), X_JUNCTION);

/**
 * Light ramp ink carries shallow lines between their dash and
 * underscore bands, so a line crossing a bar or diagonal on a dot
 * band cell deserves the same junction the heavier bands get.
 * Cross stroke contact only: a stroke grazing its own light ink mid
 * curve must not voice junctions, so the engine's self crossing path
 * keeps consulting JOIN alone.
 */
const LIGHT_RAMP_INK = [
	PERIOD,
	COMMA,
	APOSTROPHE,
	BACKTICK,
	CARET,
	COLON,
	SEMICOLON,
];
const CROSS_JOIN = new Map<number, number>();
for (const l of LIGHT_RAMP_INK) {
	CROSS_JOIN.set(joinKey(VBAR, l), PLUS);
	CROSS_JOIN.set(joinKey(SLASH, l), PERCENT);
	CROSS_JOIN.set(joinKey(BACKSLASH, l), PERCENT);
	CROSS_JOIN.set(joinKey(PLUS, l), PLUS);
	CROSS_JOIN.set(joinKey(PERCENT, l), PERCENT);
	CROSS_JOIN.set(joinKey(X_JUNCTION, l), X_JUNCTION);
}

/** Junction glyphs a crossing can voice, for the painter's stub sweep. */
export const isJunctionGlyph = (c: number): boolean =>
	c === PLUS || c === PERCENT || c === X_JUNCTION;

/** The axis a line glyph runs along, for stub sweeps at junctions. */
export const lineAxis = (c: number): { dx: number; dy: number } | null => {
	if (HORIZ_INK.includes(c)) {
		return { dx: 1, dy: 0 };
	}
	if (c === VBAR) {
		return { dx: 0, dy: 1 };
	}
	if (c === SLASH) {
		return { dx: 1, dy: -1 };
	}
	if (c === BACKSLASH) {
		return { dx: 1, dy: 1 };
	}
	return null;
};

/** Ink light enough for a junction stub sweep to clear. */
export const isLightInk = (c: number): boolean => (WEIGHT.get(c) ?? 0) <= 2;

/**
 * Additive contact between strokes (shading brush spirit): same glyph
 * holds, the heavier mark survives a lighter touch, and two different
 * marks of equal weight merge to a denser one (two pebbles to a
 * colon, crossing slashes to an X, meeting chisels to fill). Existing
 * ink outside the brush vocabulary is painted over, a brush still
 * paints.
 */
export const mergeGlyphs = (existing: number, incoming: number): number => {
	if (existing === incoming) {
		return incoming;
	}
	const joined =
		JOIN.get(joinKey(existing, incoming)) ??
		CROSS_JOIN.get(joinKey(existing, incoming));
	if (joined !== undefined) {
		return joined;
	}
	const we = WEIGHT.get(existing);
	if (we === undefined) {
		return incoming;
	}
	const wi = WEIGHT.get(incoming) ?? 0;
	if (we > wi) {
		return existing;
	}
	if (wi > we) {
		return incoming;
	}
	return PROMOTE[wi];
};

/** Which line family a glyph belongs to, for terminal joins. */
const lineInk = (c: number): 'h' | 'v' | null => {
	if (HORIZ_INK.includes(c)) {
		return 'h';
	}
	return c === VBAR ? 'v' : null;
};

export interface TipInfo {
	/** approach direction signs over the closing window */
	dx: number;
	dy: number;
	cls: SlopeClass;
}

/**
 * Terminal joins (BRUSH.md intersections): a stroke ENDING against an
 * existing line wants a glyph whose bar continues the line and whose
 * leg continues the stroke, Rowan's "7" fix. Rising tips hang their
 * leg below the bar (7 leaning right, r leaning left, T dead
 * vertical); falling tips point the leg up and hook toward where the
 * line continues (L right, J left, + both ways). A tip running
 * parallel to the ink it touched is a graze, not a join; the additive
 * merge already handles it. Returns 0 when no junction applies.
 */
export const junctionForTip = (
	tip: TipInfo,
	contact: number,
	left: number,
	right: number,
): number => {
	const ink = lineInk(contact);
	if (ink === 'v') {
		// a sideways tip against a bar: the bar continues both ways
		return tip.cls === 'shallow' || tip.cls === 'horizontal' ? PLUS : 0;
	}
	if (ink !== 'h') {
		return 0;
	}
	if (tip.cls === 'shallow' || tip.cls === 'horizontal') {
		return 0;
	}
	if (contact === UNDERSCORE && tip.dy < 0) {
		// underscore ink hugs the cell bottom; a top barred 7, r, or T
		// floats above it, while a period knots the stem to the
		// baseline it already touches
		return PERIOD;
	}
	if (tip.dy < 0) {
		if (tip.dx === 0) {
			// a dead vertical leg under a line end leans its bar along
			// the line; mid line the T carries both sides
			const l = lineInk(left) === 'h';
			const r = lineInk(right) === 'h';
			if (l && !r) {
				return SEVEN;
			}
			if (r && !l) {
				return AR;
			}
			return TEE;
		}
		return tip.dx > 0 ? SEVEN : AR;
	}
	if (tip.dy > 0) {
		if (tip.dx === 0) {
			const l = lineInk(left) === 'h';
			const r = lineInk(right) === 'h';
			if (l && !r) {
				return JAY;
			}
			if (r && !l) {
				return EL;
			}
			return PLUS;
		}
		return tip.dx > 0 ? JAY : EL;
	}
	return 0;
};

// direction window: long enough to ride out one noisy step, short
// enough that cursive letterforms a handful of cells tall still get
// local tangents rather than half a letter ago
const WINDOW = 5;

interface Cell {
	x: number;
	y: number;
}

export interface AsciiStampEngine {
	/** Start a stroke at a pointer sample. subY: 0 upper half, 1 lower. */
	begin: (x: number, y: number, subY: number) => StampOut[];
	/** Next pointer sample; interpolates from the previous one. */
	move: (x: number, y: number, subY: number) => StampOut[];
	/** Stroke end; flushes any provisional state. */
	end: () => StampOut[];
	/** Stroke width in cells; 1 is the thin style, more is roman. */
	setWidth: (width: number) => void;
	getWidth: () => number;
}

export interface AsciiStampOptions {
	width?: number;
}

export const createAsciiStampEngine = (
	options: AsciiStampOptions = {},
): AsciiStampEngine => {
	const clampWidth = (w: number) =>
		Math.max(1, Math.min(9, Math.round(w) || 1));
	let width = clampWidth(options.width ?? 1);
	let last: Cell | null = null;
	let trail: Cell[] = [];
	/** newest path cell, held until its successor resolves it */
	let pending: { c: Cell; prev: Cell | null } | null = null;
	let activeClass: SlopeClass | null = null;
	/** consecutive windows disagreeing with activeClass */
	let dissent = 0;
	let subYNow = 1;
	/** y changes seen this stroke; zero means a genuinely flat stroke. */
	let rowSteps = 0;
	/** lengths of the last few closed rows, the stroke's rhythm. */
	let recentLens: number[] = [];
	/** charCode already emitted this stroke, by cell key. */
	const stamped = new Map<number, number>();
	/**
	 * The shallow run growing on the current row. xs is in arrival
	 * order; dir is the sign of its x movement so a reversal (a valley
	 * or apex revisiting the row) can split into two ramps instead of
	 * sorting into one false monotone.
	 */
	let run: {
		y: number;
		xs: number[];
		dir: number;
		/** vertical direction entering the row: +1 from above, -1 below */
		entry: number;
	} | null = null;
	/** same row cells already merged for the pending cell */
	let mergeStreak = 0;
	/** last few successfully emitted cell keys, the revisable frontier */
	let recentKeys: number[] = [];
	/** the stroke's first cell, held for the begin side join */
	let strokeStart: Cell | null = null;
	/** departure direction, frozen once the window first settles */
	let rootDir: TipInfo | null = null;

	const key = (x: number, y: number) => y * 65536 + x;

	const emit = (
		out: StampOut[],
		x: number,
		y: number,
		charCode: number,
		force = false,
	) => {
		const k = key(x, y);
		const prev = stamped.get(k);
		// self crossing: the path returning to a cell it inked long ago
		// (outside the revisable frontier) is a genuine crossing, so the
		// shared cell takes the junction voice; frontier revisits are the
		// stroke revising itself and keep the newest-wins rules below
		let joined = false;
		if (prev !== undefined && prev !== charCode && !recentKeys.includes(k)) {
			const j = JOIN.get(joinKey(prev, charCode));
			if (j !== undefined) {
				charCode = j;
				joined = true;
			}
		}
		if (prev === charCode) {
			return;
		}
		const prevRank = prev === undefined ? -1 : (RANK.get(prev) ?? 0);
		const newRank = RANK.get(charCode) ?? 0;
		// rank guards cross path collisions only; run restamps must be
		// free to demote a cell as its row grows and rebands
		if (!force && prevRank > newRank) {
			return;
		}
		// even forced, a stem only yields to a lesser glyph at the
		// stroke's frontier (the upstroke pair revising the bar it just
		// laid); an old stem a run crosses later stays a stem
		if (force && prevRank >= 3 && newRank < 3 && !recentKeys.includes(k)) {
			return;
		}
		stamped.set(k, charCode);
		// a junction cell never rejoins the revisable frontier: the run
		// that crossed it would reband it back down to a ramp glyph
		if (!joined) {
			recentKeys.push(k);
			if (recentKeys.length > 4) {
				recentKeys.shift();
			}
		}
		out.push({ x, y, charCode });
	};

	const windowDelta = (): Cell => {
		const a = trail[0];
		const b = trail[trail.length - 1];
		return { x: b.x - a.x, y: b.y - a.y };
	};

	const classify = (): SlopeClass => {
		const d = windowDelta();
		const ax = Math.abs(d.x);
		const ay = Math.abs(d.y);
		// horizontal means NO row change in the window; any drift makes
		// it a shallow run, whose banded ramp handles arbitrary lengths
		if (ay === 0) {
			return ax === 0 ? 'vertical' : 'horizontal';
		}
		if (ax === 0) {
			return 'vertical';
		}
		const r = ax / ay;
		if (r < 0.75) {
			return 'steep';
		}
		if (r <= 1.5) {
			return 'diag';
		}
		return 'shallow';
	};

	/** True when the stroke falls to the right (y grows as x grows). */
	const falling = (): boolean => {
		const d = windowDelta();
		return d.x === 0 ? false : d.x * d.y > 0;
	};

	/**
	 * The row vocabulary follows the STROKE's rhythm, not each row's
	 * own length: Bresenham hands adjacent rows of a 3.5 cells per row
	 * line lengths 3 and 4, and per row alphabets would zigzag between
	 * pebbles and the banded ramp. The median of recent closed rows
	 * keeps one voice along a straight stroke while still following a
	 * curve as its rhythm genuinely changes.
	 */
	const rowRhythm = (len: number): number => {
		if (recentLens.length === 0) {
			return len;
		}
		const sorted = [...recentLens].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	};

	/**
	 * Reassign the whole current run each cell: the diff against
	 * already stamped cells keeps live rewrites minimal. True
	 * horizontal dress (plain underscores or dashes by sub cell band)
	 * is reserved for strokes that never left their row; a sloped
	 * stroke's long rows always ramp.
	 */
	const restampRun = (out: StampOut[], exit = 0) => {
		if (!run) {
			return;
		}
		const xs = [...run.xs].sort((a, b) => a - b);
		const len = xs.length;
		// the direction window flattens inside a long final row, since
		// no step out ever follows it, and a flat window reads as
		// rising: the closing restamp then mirrors the ramp into a
		// hook. the row's entry step and x direction still know the
		// true slope, so they break the tie
		const wd = windowDelta();
		const fall =
			wd.y !== 0 || run.entry === 0
				? falling()
				: run.entry * (run.dir || wd.x || 1) > 0;
		const banded = rowRhythm(len) >= 5;
		// a row entered rising and left falling is a cap, the reverse a
		// bowl; left to right turns never reverse x, so only the
		// vertical context can voice them (ends low and middle high for
		// caps, ends high and middle low for bowls)
		const cap = run.entry === -1 && exit === 1;
		const bowl = run.entry === 1 && exit === -1;
		const half = Math.max(len / 2, 1);
		for (let i = 0; i < len; i++) {
			// position measured low to high within the row: rising rows
			// climb left to right, falling rows climb right to left
			const pos = fall ? len - 1 - i : i;
			const edge = Math.min(i, len - 1 - i);
			let charCode: number;
			if (rowSteps === 0) {
				charCode = subYNow === 1 ? UNDERSCORE : DASH;
			} else if (cap) {
				if (len === 1) {
					charCode = CARET;
				} else if (edge === 0) {
					charCode = PERIOD;
				} else {
					charCode = Math.floor((edge * 4) / half) >= 2 ? DQUOTE : DASH;
				}
			} else if (bowl) {
				if (len === 1) {
					charCode = COMMA;
				} else if (edge === 0) {
					charCode = i === 0 ? BACKTICK : APOSTROPHE;
				} else {
					charCode = Math.floor((edge * 4) / half) >= 2 ? UNDERSCORE : DASH;
				}
			} else if (len === 1) {
				// a lone cell row is a turning point or a slope near two
				// cells per row; a dash reads as debris there, a pebble
				// continues the line
				charCode = fall ? BACKTICK : APOSTROPHE;
			} else if (banded) {
				charCode = LONG_RAMP_RISING[Math.floor((pos * 4) / len)];
			} else if (pos === 0) {
				charCode = fall ? PERIOD : COMMA;
			} else if (pos === len - 1) {
				charCode = fall ? BACKTICK : APOSTROPHE;
			} else {
				charCode = DASH;
			}
			emit(out, xs[i], run.y, charCode, true);
		}
	};

	/**
	 * Close the current run. Rows born under a too-short window freeze
	 * with the wrong glyphs otherwise (two same-row cells always read
	 * horizontal), so a closing run restamps under the class the window
	 * knows NOW before it is abandoned.
	 */
	const finishRun = (out: StampOut[], exit = 0) => {
		restampRun(out, exit);
		if (run && run.xs.length > 0) {
			// a row entered by a vertical step is a full band and votes
			// its length; the entry row and reversal splits are partial
			// bands (the pen lands or turns mid row), half the true
			// rhythm on average, so they vote doubled, or a long second
			// row starves into the unbanded dash blob
			recentLens.push(run.entry !== 0 ? run.xs.length : run.xs.length * 2);
			if (recentLens.length > 3) {
				recentLens.shift();
			}
		}
		run = null;
	};

	/** Glyph choice for one path cell under a known slope class. */
	const emitCell = (
		out: StampOut[],
		c: Cell,
		prev: Cell | null,
		cls: SlopeClass,
	) => {
		if (cls === 'shallow' || cls === 'horizontal') {
			if (!run || run.y !== c.y) {
				const entry =
					run && prev
						? Math.sign(c.y - run.y)
						: prev
							? Math.sign(c.y - prev.y)
							: 0;
				finishRun(out, run ? Math.sign(c.y - run.y) : 0);
				run = { y: c.y, xs: [], dir: 0, entry };
			} else if (run.xs.length > 0) {
				const step = Math.sign(c.x - run.xs[run.xs.length - 1]);
				if (step !== 0 && run.dir !== 0 && step !== run.dir) {
					// a valley or apex re-enters the row going the other
					// way; two ramps read right, one sorted monotone lies
					finishRun(out);
					run = { y: c.y, xs: [], dir: 0, entry: 0 };
				} else if (step !== 0) {
					run.dir = step;
				}
			}
			run.xs.push(c.x);
			restampRun(out);
			return;
		}
		finishRun(out);
		if (cls === 'vertical') {
			emit(out, c.x, c.y, VBAR);
			return;
		}
		if (cls === 'diag') {
			emit(out, c.x, c.y, falling() ? BACKSLASH : SLASH);
			return;
		}
		// steep: straight rows take the bar; a column step row takes a
		// pebble ramp on the lower row so the jog reads as a curve. The
		// ramp is defined geometrically, low pebble under the lower
		// row's column climbing to the high pebble under the upper
		// row's column, bar on the upper cell itself, so an upstroke
		// stamps exactly what a downstroke does, and a merged jitter
		// cell widening the step to two columns ramps across the gap
		// instead of leaving a hole. The low cell is forced because an
		// upstroke has already barred it before the step is known.
		if (prev && prev.x !== c.x && prev.y !== c.y) {
			const upper = prev.y < c.y ? prev : c;
			const lower = prev.y < c.y ? c : prev;
			const dir = upper.x > lower.x ? 1 : -1;
			const span = Math.abs(upper.x - lower.x);
			for (let i = 0; i <= span; i++) {
				let glyph: number;
				if (i === 0) {
					glyph = span === 1 ? PERIOD : COMMA;
				} else if (i === span) {
					glyph = dir > 0 ? APOSTROPHE : BACKTICK;
				} else {
					glyph = DASH;
				}
				emit(out, lower.x + i * dir, lower.y, glyph, i === 0);
			}
			emit(out, upper.x, upper.y, VBAR);
			return;
		}
		emit(out, c.x, c.y, VBAR);
	};

	const isStem = (cls: SlopeClass): boolean =>
		cls === 'vertical' || cls === 'steep' || cls === 'diag';

	// ------------------------------------------------- roman ribbon mode

	/**
	 * Width above 1 trades the thin glyph vocabulary for the roman
	 * ribbon: every skeleton cell widens into a horizontal span of fill
	 * with one chisel glyph per side, the corpus anatomy (lead, $ fill,
	 * trail; thickness scales fill only, never the edges). A row can
	 * hold several spans, so a loop's two sides stay two strokes until
	 * the ribbons genuinely touch, where fill rank unions them solid.
	 */
	interface Span {
		min: number;
		max: number;
		cls: SlopeClass;
		fall: boolean;
		/** entry taper: max width frozen when the span was born */
		cap: number;
	}
	const spans = new Map<number, Span[]>();
	/** the newest spans, frontier first: the stroke's living tip */
	let tipSpans: Array<{ y: number; s: Span }> = [];

	/** chisel glyphs by class and lean: [left, right] */
	const ribbonEdges = (cls: SlopeClass, fall: boolean): [number, number] => {
		if (cls === 'diag' || cls === 'shallow') {
			// rising strokes lead low left with d and trail high right
			// with P; falling strokes mirror through Y and b
			return fall ? [EDGE_Y, EDGE_B] : [EDGE_D, EDGE_P];
		}
		// verticals in the corpus run mostly bare; flat bars read as
		// solid fill too, their dress is a later refinement
		return [FILL, FILL];
	};

	/**
	 * SAUNA entry taper: a stroke never opens at full weight; the cap
	 * frozen at each span's birth ramps 1, 3, 5... over the first row
	 * advances like the corpus tendril ladders.
	 */
	const entryCap = () => Math.min(width, 1 + rowSteps * 2);

	/**
	 * SAUNA exit taper, live: the tip's newest rows render narrow and
	 * widen as the stroke pulls away, so stopping anywhere leaves an
	 * already tapered tail with no retroactive erasing. Distance 0 is
	 * the frontier row.
	 */
	const tipWidth = (distance: number) =>
		Math.max(1, Math.ceil((width * (distance + 1)) / 3));

	const restampSpan = (out: StampOut[], y: number, s: Span, maxW = width) => {
		const w = Math.max(1, Math.min(s.cap, maxW));
		const lext = Math.floor((w - 1) / 2);
		const rext = Math.ceil((w - 1) / 2);
		const lo = s.min - lext;
		const hi = s.max + rext;
		const [left, right] = ribbonEdges(s.cls, s.fall);
		for (let x = lo; x <= hi; x++) {
			emit(out, x, y, x === lo ? left : x === hi ? right : FILL);
		}
		// corpus row AA: sloped rows wear pebbles just outside the
		// chisels (,d$$$P' rising, `Y$$$b. falling); rank one keeps them
		// deferential, any neighboring row's fill overwrites them
		if (s.cls === 'diag' || s.cls === 'shallow') {
			if (s.fall) {
				emit(out, lo - 1, y, BACKTICK);
				emit(out, hi + 1, y, PERIOD);
			} else {
				emit(out, lo - 1, y, COMMA);
				emit(out, hi + 1, y, APOSTROPHE);
			}
		}
	};

	const ribbonCell = (out: StampOut[], c: Cell, cls: SlopeClass) => {
		let row = spans.get(c.y);
		if (!row) {
			row = [];
			spans.set(c.y, row);
		}
		let s = row.find(r => c.x >= r.min - 1 && c.x <= r.max + 1);
		if (!s) {
			s = { min: c.x, max: c.x, cls, fall: falling(), cap: entryCap() };
			row.push(s);
		} else {
			s.min = Math.min(s.min, c.x);
			s.max = Math.max(s.max, c.x);
			s.cls = cls;
			s.fall = falling();
			// a revisited span rejoins the stroke at the current entry cap
			s.cap = Math.max(s.cap, entryCap());
		}
		if (tipSpans[0]?.s !== s) {
			tipSpans = [{ y: c.y, s }, ...tipSpans.filter(t => t.s !== s)];
			tipSpans.length = Math.min(tipSpans.length, 3);
		}
		// the tip renders narrow and trailing rows widen toward full,
		// so the stroke carries a living tapered point
		for (let i = 0; i < tipSpans.length; i++) {
			restampSpan(out, tipSpans[i].y, tipSpans[i].s, tipWidth(i));
		}
	};

	/**
	 * One Bresenham path cell entering the stroke, resolved with one
	 * cell of lookahead: a cell is only inked once its successor is
	 * known. That buys two things hand input needs. Same row jitter
	 * under a stem class merges away instead of doubling columns, and
	 * the stroke's first cell inherits a real direction. Hysteresis on
	 * the class kills the lone dash or slash a single noisy window
	 * would otherwise drop at every transition.
	 */
	const consume = (out: StampOut[], c: Cell, prev: Cell | null) => {
		trail.push(c);
		if (trail.length > WINDOW) {
			trail.shift();
		}
		if (prev && prev.y !== c.y) {
			rowSteps++;
		}
		const cls = classify();
		if (activeClass === null || cls === activeClass) {
			activeClass = cls;
			dissent = 0;
		} else if (++dissent >= 2) {
			activeClass = cls;
			dissent = 0;
		}
		if (!rootDir && trail.length >= 3) {
			const d = windowDelta();
			if (d.x !== 0 || d.y !== 0) {
				rootDir = {
					dx: Math.sign(d.x),
					dy: Math.sign(d.y),
					cls: activeClass,
				};
			}
		}
		if (pending && isStem(activeClass) && pending.c.y === c.y) {
			if (mergeStreak === 0 && Math.abs(c.x - pending.c.x) === 1) {
				// wobble: one adjacent column on the same row under a stem
				// class; the newer cell wins, the jittered one never inks
				pending = { c, prev: pending.prev };
				mergeStreak = 1;
				return;
			}
			// a second same row cell is the stroke genuinely flattening,
			// a valley or a bowl; eating it would cut the line, so the
			// class switches now rather than waiting out the hysteresis
			activeClass = 'shallow';
			dissent = 0;
		}
		mergeStreak = 0;
		if (pending) {
			resolveCell(out, pending.c, pending.prev, activeClass);
		}
		pending = { c, prev };
	};

	/** Route a resolved cell to the active style. */
	const resolveCell = (
		out: StampOut[],
		c: Cell,
		prev: Cell | null,
		cls: SlopeClass,
	) => {
		if (width > 1) {
			ribbonCell(out, c, cls);
			return;
		}
		emitCell(out, c, prev, cls);
	};

	/**
	 * Resolve whatever is still uninked at stroke end. A stroke that
	 * never moved has no class and keeps its tap mark.
	 */
	const drain = (out: StampOut[]) => {
		if (pending && activeClass !== null) {
			resolveCell(out, pending.c, pending.prev, activeClass);
		}
		pending = null;
	};

	const bresenham = (a: Cell, b: Cell, visit: (c: Cell) => void) => {
		let x0 = a.x;
		let y0 = a.y;
		const dx = Math.abs(b.x - x0);
		const sx = x0 < b.x ? 1 : -1;
		const dy = Math.abs(b.y - y0);
		const sy = y0 < b.y ? 1 : -1;
		let err = (dx > dy ? dx : -dy) / 2;
		let e2;
		while (true) {
			visit({ x: x0, y: y0 });
			if (x0 === b.x && y0 === b.y) {
				break;
			}
			e2 = err;
			if (e2 > -dx) {
				err -= dy;
				x0 += sx;
			}
			if (e2 < dy) {
				err += dx;
				y0 += sy;
			}
		}
	};

	/** advance the consumed path to target, Bresenham filling the gap */
	const walkTo = (out: StampOut[], target: Cell) => {
		if (!last || (last.x === target.x && last.y === target.y)) {
			last = target;
			return;
		}
		let prev: Cell | null = last;
		let first = true;
		bresenham(last, target, c => {
			// the first visited cell is last itself, already consumed
			if (first) {
				first = false;
				return;
			}
			consume(out, c, prev);
			prev = c;
		});
		last = target;
	};

	/**
	 * Fast writing delivers pointer samples many cells apart; straight
	 * chords between them turn curves into kinked segments, which is
	 * why slow deliberate strokes rendered better than normal writing
	 * speed. Each segment is therefore drawn one sample late as a
	 * Catmull Rom arc through its neighbors; one pointer event of lag
	 * is imperceptible and buys the chord the curvature the hand
	 * actually made. Dense samples degrade to the straight walk.
	 */
	const drawSmoothed = (out: StampOut[], s: Cell[]) => {
		const n = s.length;
		const p0 = s[n - 4] ?? s[n - 3];
		const p1 = s[n - 3];
		const p2 = s[n - 2];
		const p3 = s[n - 1];
		const dist = Math.max(Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
		if (dist <= 1) {
			walkTo(out, p2);
			return;
		}
		const steps = dist * 4;
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const t2 = t * t;
			const t3 = t2 * t;
			const cx =
				0.5 *
				(2 * p1.x +
					(-p0.x + p2.x) * t +
					(2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
					(-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
			const cy =
				0.5 *
				(2 * p1.y +
					(-p0.y + p2.y) * t +
					(2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
					(-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
			walkTo(out, { x: Math.round(cx), y: Math.round(cy) });
		}
		walkTo(out, p2);
	};

	let samples: Cell[] = [];

	return {
		begin: (x, y, subY) => {
			last = { x, y };
			trail = [last];
			samples = [last];
			pending = { c: last, prev: null };
			activeClass = null;
			dissent = 0;
			mergeStreak = 0;
			recentKeys = [];
			strokeStart = { x, y };
			rootDir = null;
			subYNow = subY;
			stamped.clear();
			run = null;
			rowSteps = 0;
			recentLens = [];
			spans.clear();
			tipSpans = [];
			const out: StampOut[] = [];
			if (width > 1) {
				// a roman tap daubs a full width of fill
				ribbonCell(out, { x, y }, 'vertical');
				return out;
			}
			// no direction yet: a lone tap leaves a pebble weighted by the
			// half of the cell it landed in; a drag revises it immediately
			emit(out, x, y, subY === 0 ? APOSTROPHE : PERIOD);
			return out;
		},
		move: (x, y, subY) => {
			const out: StampOut[] = [];
			subYNow = subY;
			if (!last) {
				return out;
			}
			const tail = samples[samples.length - 1];
			if (tail.x === x && tail.y === y) {
				return out;
			}
			samples.push({ x, y });
			if (samples.length > 4) {
				samples.shift();
			}
			if (samples.length >= 3) {
				drawSmoothed(out, samples);
			}
			return out;
		},
		end: () => {
			const out: StampOut[] = [];
			// the live segment still owed one sample of lag
			if (samples.length >= 2) {
				walkTo(out, samples[samples.length - 1]);
			}
			drain(out);
			// roman exit: a two cell sputter ramp past the tapered tip,
			// middle weight first then the light pebble, so the tip's own
			// AA plus the ramp reads like the corpus endings (,:' rising,
			// backtick ;, falling), never a lone quote in the void
			if (width > 1 && last && trail.length >= 2) {
				const d = windowDelta();
				if (d.y !== 0) {
					const sdx = Math.sign(d.x);
					const sdy = Math.sign(d.y);
					// the ramp hangs off the narrow living tip, not full width
					const ext = Math.ceil((tipWidth(0) - 1) / 2) + 1;
					const rising = sdy < 0;
					const mid = rising ? COLON : SEMICOLON;
					const far = rising
						? sdx < 0
							? BACKTICK
							: APOSTROPHE
						: sdx < 0
							? COMMA
							: PERIOD;
					const bx = last.x + sdx * ext;
					const by = last.y + sdy;
					emit(out, bx, by, mid);
					emit(out, bx + sdx, by + sdy, far);
				}
			}
			finishRun(out);
			// thin terminal join: re-emit the final cell carrying the
			// approach context, so the controller can voice a junction
			// where the tip meets existing ink; emitted after finishRun so
			// no later restamp in this batch shadows the junction cell
			if (width === 1 && last && activeClass !== null && trail.length >= 2) {
				const d = windowDelta();
				if (d.x !== 0 || d.y !== 0) {
					out.push({
						x: last.x,
						y: last.y,
						charCode:
							stamped.get(key(last.x, last.y)) ??
							(subYNow === 0 ? APOSTROPHE : PERIOD),
						tip: {
							dx: Math.sign(d.x),
							dy: Math.sign(d.y),
							cls: activeClass,
						},
					});
				}
			}
			// begin side of the same idea: the first cell re-emitted with
			// the departure the window froze when the stroke took shape
			if (width === 1 && strokeStart && rootDir) {
				out.push({
					x: strokeStart.x,
					y: strokeStart.y,
					charCode:
						stamped.get(key(strokeStart.x, strokeStart.y)) ??
						(subYNow === 0 ? APOSTROPHE : PERIOD),
					root: rootDir,
				});
			}
			last = null;
			trail = [];
			samples = [];
			pending = null;
			activeClass = null;
			dissent = 0;
			mergeStreak = 0;
			stamped.clear();
			spans.clear();
			tipSpans = [];
			strokeStart = null;
			rootDir = null;
			return out;
		},
		setWidth: w => {
			width = clampWidth(w);
		},
		getWidth: () => width,
	};
};
