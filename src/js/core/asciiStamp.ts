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
const PERIOD = 46; // .
const COMMA = 44; // ,
const APOSTROPHE = 39; // '
const BACKTICK = 96; // `

/**
 * Same stroke collision ranks: stems beat run bodies beat AA pebbles,
 * so a scribble crossing itself keeps its skeleton readable. Equal
 * rank resolves to the newest write (the hand knows best).
 */
const RANK = new Map<number, number>([
	[VBAR, 3],
	[SLASH, 3],
	[BACKSLASH, 3],
	[DASH, 2],
	[UNDERSCORE, 2],
	[DQUOTE, 2],
	[PERIOD, 1],
	[COMMA, 1],
	[APOSTROPHE, 1],
	[BACKTICK, 1],
]);

/** Long shallow runs band by position: low to high for rising rows. */
const LONG_RAMP_RISING = [UNDERSCORE, PERIOD, DASH, DQUOTE];

// direction window: long enough to ride out one noisy step, short
// enough that a deliberate curve changes class within a few cells
const WINDOW = 6;

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
}

export const createAsciiStampEngine = (): AsciiStampEngine => {
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
	/** x positions of the shallow run growing on the current row. */
	let run: { y: number; xs: number[] } | null = null;

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
		if (prev === charCode) {
			return;
		}
		// rank guards cross path collisions only; run restamps must be
		// free to demote a cell as its row grows and rebands
		if (
			!force &&
			prev !== undefined &&
			(RANK.get(prev) ?? 0) > (RANK.get(charCode) ?? 0)
		) {
			return;
		}
		stamped.set(k, charCode);
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
	const restampRun = (out: StampOut[]) => {
		if (!run) {
			return;
		}
		const xs = run.xs;
		const len = xs.length;
		const fall = falling();
		const banded = rowRhythm(len) >= 5;
		for (let i = 0; i < len; i++) {
			// position measured low to high within the row: rising rows
			// climb left to right, falling rows climb right to left
			const pos = fall ? len - 1 - i : i;
			let charCode: number;
			if (rowSteps === 0) {
				charCode = subYNow === 1 ? UNDERSCORE : DASH;
			} else if (len === 1) {
				charCode = DASH;
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
	const finishRun = (out: StampOut[]) => {
		restampRun(out);
		if (run && run.xs.length > 0) {
			recentLens.push(run.xs.length);
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
				finishRun(out);
				run = { y: c.y, xs: [] };
			}
			run.xs.push(c.x);
			run.xs.sort((a, b) => a - b);
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
		// steep: straight rows take the bar; a column step row takes the
		// pebble pair so the jog reads as a curve. The pair is defined
		// geometrically, period under the lower row's column, apostrophe
		// under the upper row's column, bar on the upper cell itself, so
		// an upstroke stamps exactly what a downstroke does. The period
		// is forced because an upstroke has already barred the lower
		// cell before the step is known.
		if (prev && prev.x !== c.x && prev.y !== c.y) {
			const upper = prev.y < c.y ? prev : c;
			const lower = prev.y < c.y ? c : prev;
			emit(out, lower.x, lower.y, PERIOD, true);
			emit(out, upper.x, lower.y, APOSTROPHE);
			emit(out, upper.x, upper.y, VBAR);
			return;
		}
		emit(out, c.x, c.y, VBAR);
	};

	const isStem = (cls: SlopeClass): boolean =>
		cls === 'vertical' || cls === 'steep' || cls === 'diag';

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
		if (pending && isStem(activeClass) && pending.c.y === c.y) {
			// wobble: two columns on one row under a stem class; the
			// newer cell wins and the jittered one is never inked
			pending = { c, prev: pending.prev };
			return;
		}
		if (pending) {
			emitCell(out, pending.c, pending.prev, activeClass);
		}
		pending = { c, prev };
	};

	/**
	 * Resolve whatever is still uninked at stroke end. A stroke that
	 * never moved has no class and keeps its tap pebble.
	 */
	const drain = (out: StampOut[]) => {
		if (pending && activeClass !== null) {
			emitCell(out, pending.c, pending.prev, activeClass);
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

	return {
		begin: (x, y, subY) => {
			last = { x, y };
			trail = [last];
			pending = { c: last, prev: null };
			activeClass = null;
			dissent = 0;
			subYNow = subY;
			stamped.clear();
			run = null;
			rowSteps = 0;
			recentLens = [];
			const out: StampOut[] = [];
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
			if (last.x === x && last.y === y) {
				return out;
			}
			let prev: Cell | null = last;
			let first = true;
			bresenham(last, { x, y }, c => {
				// the first visited cell is last itself, already consumed
				if (first) {
					first = false;
					return;
				}
				consume(out, c, prev);
				prev = c;
			});
			last = { x, y };
			return out;
		},
		end: () => {
			const out: StampOut[] = [];
			drain(out);
			finishRun(out);
			last = null;
			trail = [];
			pending = null;
			activeClass = null;
			dissent = 0;
			stamped.clear();
			return out;
		},
	};
};
