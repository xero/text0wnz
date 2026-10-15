/**
 * Circle stamp for the ruled shape tools (owner reference art:
 * circles.txt). A circle is a double mirror: one quadrant's grammar
 * flipped and rotated into the other three, so symmetry comes by
 * construction instead of hoping two engine strokes agree. The left
 * half is voiced from per row boundary spans; the right half mirrors
 * glyphwise. One geometry walker serves every dialect; each mode
 * supplies a voice (mirror pairs, wall bars, step and corner strings,
 * cap rows). The smallest amiga sizes stop reading as curves row by
 * row, so they come from whole templates drawn by the owner (the R
 * flourish is deliberate and has no good left side mirror, so
 * templates never mirror).
 */

export interface CircleCell {
	x: number;
	y: number;
	charCode: number;
}

interface CircleVoice {
	mirror: (c: number) => number;
	/**
	 * how far inside the apex each cap row measures its width, in half
	 * blocks: thin tops run narrow while bottoms anchor wide, a split
	 * the owner draws in both dialects. exact caps measure at the
	 * inset regardless of where the row's centers fall; clamped caps
	 * only widen degenerate rows
	 */
	capInsetTop: number;
	capInsetBottom: number;
	capExact: boolean;
	/**
	 * where a row measures the curve, per half: at its widest crossing
	 * (the half block nearest the equator, the ribbon dialect's full
	 * footprint) or its narrowest (toward the apex). The thin
	 * reference art measures tops narrow so steps ease 3, 2, 1 instead
	 * of blowing out wide below the cap and reading pointed, while
	 * bottoms measure wide and hang heavy
	 */
	measureTop: 'wide' | 'narrow';
	measureBottom: 'wide' | 'narrow';
	/** wall rows inside the equator band */
	bar: string;
	stepTop: (step: number, prevChisel: boolean, nextChisel: boolean) => string;
	stepBottom: (
		step: number,
		prevChisel: boolean,
		nextChisel: boolean,
	) => string;
	cornerTop: (jog: number) => string;
	cornerBottom: (jog: number) => string;
	/** full cap rows, anchored at the row's left boundary */
	capTopRow: (h: number) => string;
	capBottomRow: (h: number) => string;
}

const mirrorMap = (pairs: Array<[string, string]>): Map<number, number> => {
	const m = new Map<number, number>();
	for (const [a, b] of pairs) {
		m.set(a.charCodeAt(0), b.charCodeAt(0));
		m.set(b.charCodeAt(0), a.charCodeAt(0));
	}
	return m;
};

const putRun = (cells: CircleCell[], x: number, y: number, run: string) => {
	for (let i = 0; i < run.length; i++) {
		if (run[i] !== ' ') {
			cells.push({ x: x + i, y: y, charCode: run.charCodeAt(i) });
		}
	}
};

/**
 * Shared geometry: per row leftmost rim columns from the half block
 * center nearest the equator, cap rows measured just inside the apex
 * so their width covers the gap to the first stepping row, clamped
 * monotone toward the equator so rounding never zigzags. The walk
 * classifies each row (cap, step, corner, bar), voices the left half,
 * mirrors it, and lands the caps last as full rows.
 */
const walkCircle = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
	voice: CircleVoice,
): CircleCell[] => {
	const yTop = Math.floor((cyHb - rhb) / 2);
	const yBot = Math.floor((cyHb + rhb) / 2);
	const rows = yBot - yTop + 1;
	const xb: number[] = [];
	for (let i = 0; i < rows; i++) {
		const y = yTop + i;
		const half = y * 2 + 1 <= cyHb ? voice.measureTop : voice.measureBottom;
		const pick = half === 'narrow' ? Math.max : Math.min;
		let dy = Math.min(
			rhb,
			pick(Math.abs(y * 2 + 0.5 - cyHb), Math.abs(y * 2 + 1.5 - cyHb)),
		);
		if (i === 0) {
			dy = voice.capExact
				? rhb - voice.capInsetTop
				: Math.min(dy, rhb - voice.capInsetTop);
		}
		if (i === rows - 1) {
			dy = voice.capExact
				? rhb - voice.capInsetBottom
				: Math.min(dy, rhb - voice.capInsetBottom);
		}
		const t = Math.min(1, Math.max(0, dy) / Math.max(1, rhb));
		xb.push(Math.round(cx - rx * Math.sqrt(Math.max(0, 1 - t * t))));
	}
	if (rows === 1) {
		// a flat drag is a lens: one dressed cap row
		const out: CircleCell[] = [];
		putRun(out, xb[0], yTop, voice.capTopRow(cx - xb[0] + 1));
		return out;
	}
	let eqStart = 0;
	for (let i = 1; i < rows; i++) {
		if (xb[i] < xb[eqStart]) {
			eqStart = i;
		}
	}
	for (let i = 1; i <= eqStart; i++) {
		xb[i] = Math.min(xb[i], xb[i - 1]);
	}
	for (let i = eqStart + 1; i < rows; i++) {
		xb[i] = Math.max(xb[i], xb[i - 1]);
	}
	let eqEnd = eqStart;
	while (eqEnd + 1 < rows && xb[eqEnd + 1] === xb[eqStart]) {
		eqEnd += 1;
	}
	// plateaus inside the step zones repeat the steep dress instead of
	// taking wall bars (the reference voices its two row plateau as
	// stacked `8, rows): a bare bar one column off the wall line reads
	// flipped
	const cells: CircleCell[] = [];
	let prevChisel = true;
	for (let i = 1; i < rows - 1; i++) {
		const x = xb[i];
		const y = yTop + i;
		if (i < eqStart) {
			const step = xb[i - 1] - x;
			if (step === 0) {
				putRun(cells, x - 1, y, voice.stepTop(1, prevChisel, false));
				prevChisel = false;
				continue;
			}
			const nextChisel = x - xb[i + 1] > 1;
			putRun(cells, x - 1, y, voice.stepTop(step, prevChisel, nextChisel));
			prevChisel = step > 1;
		} else if (i === eqStart && i === eqEnd) {
			putRun(cells, x, y, voice.bar);
			prevChisel = false;
		} else if (i === eqStart) {
			putRun(cells, x, y, voice.cornerTop(xb[i - 1] - x));
			prevChisel = false;
		} else if (i === eqEnd) {
			putRun(cells, x, y, voice.cornerBottom(xb[i + 1] - x));
			prevChisel = false;
		} else if (i < eqEnd) {
			putRun(cells, x, y, voice.bar);
			prevChisel = false;
		} else {
			const step = x - xb[i - 1];
			if (step === 0) {
				putRun(cells, x - 1, y, voice.stepBottom(1, prevChisel, false));
				prevChisel = false;
				continue;
			}
			const nextChisel = i + 1 < rows && xb[i + 1] - x > 1;
			putRun(cells, x - 1, y, voice.stepBottom(step, prevChisel, nextChisel));
			prevChisel = step > 1;
		}
	}
	// right half mirrors glyphwise across the center column; runs that
	// reach the axis stop there so no unmirrored ink leaks past it
	const left = cells.filter(c => c.x <= cx);
	const out: CircleCell[] = left.slice();
	for (const c of left) {
		if (c.x < cx) {
			out.push({ x: 2 * cx - c.x, y: c.y, charCode: voice.mirror(c.charCode) });
		}
	}
	putRun(out, xb[0], yTop, voice.capTopRow(cx - xb[0] + 1));
	putRun(out, xb[rows - 1], yBot, voice.capBottomRow(cx - xb[rows - 1] + 1));
	return out;
};

// ------------------------------------------------------ amiga voice

const AMIGA_MIRROR = mirrorMap([
	['d', 'b'],
	['P', 'Y'],
	["'", '`'],
	['(', ')'],
]);

const amigaMirror = (c: number): number => AMIGA_MIRROR.get(c) ?? c;

/**
 * Smallest circles, verbatim from the owner. Spaces stay unwritten so
 * the rim is hollow. Four rows is the floor: anything smaller grows
 * into it.
 */
const TINY = [
	{
		left: -4,
		rows: [' ,gPRg,', "dP'  `Yb", 'Yb    dP', ' "8gg8"'],
	},
	{
		left: -4,
		rows: [' ,gPPRg,', "dP'   `Yb", '8)     (8', 'Yb     dP', ' "8ggg8"'],
	},
];

/**
 * Cap rows read as one dressed run from the rim boundary over the
 * apex and back: pebble leads, low chisels, a Y shoulder, flat ink
 * across the top. The top cap's Y shoulder stands on both sides in
 * the reference art, so caps mirror with their own rule (chisels and
 * pebbles swap, shoulders stand). A cap half always ends in a self
 * mirror glyph: its last char sits on the symmetry axis.
 */
const capRow = (half: string, keepShoulders: boolean): string => {
	let right = '';
	for (let i = half.length - 2; i >= 0; i--) {
		const c = half.charCodeAt(i);
		const flipped =
			keepShoulders && (c === 80 || c === 89) ? c : amigaMirror(c);
		right += String.fromCharCode(flipped);
	}
	return half + right;
};

const capTopHalf = (h: number): string => {
	if (h >= 8) {
		return ',,ggddY' + '"'.repeat(h - 7);
	}
	if (h >= 5) {
		return ',,dd' + '"'.repeat(h - 4);
	}
	if (h >= 3) {
		return ',d' + '"'.repeat(h - 2);
	}
	return '"'.repeat(Math.max(1, h));
};

const capBottomHalf = (h: number): string => {
	if (h >= 8) {
		return '``""YYb' + 'a'.repeat(h - 7);
	}
	if (h >= 5) {
		return '`"Yb' + 'a'.repeat(h - 4);
	}
	if (h === 4) {
		return '`Yba';
	}
	if (h === 3) {
		return '`ba';
	}
	return 'a'.repeat(Math.max(1, h));
};

/**
 * Stepping rows are strings anchored one column outside the row's
 * boundary: the lead pebble sits where the neighboring rim lands and
 * the trail tucks under the previous row's span. Pebble glyphs follow
 * the adjacent row's body: a quote tucked under chisels rides higher
 * than an apostrophe under a bare 8. Long runs chisel at most two
 * deep and fill with flat ink, like the reference caps; the Y
 * shoulder stays out of step runs so the mirror never lands a P on
 * the top rim. Wall bars wear an inner colon: bare 8 columns read
 * thin against the dressed quadrants.
 */
const AMIGA_VOICE: CircleVoice = {
	mirror: amigaMirror,
	capInsetTop: 1.5,
	capInsetBottom: 1.5,
	capExact: false,
	measureTop: 'wide',
	measureBottom: 'wide',
	bar: '8:',
	stepTop: (step, prevChisel, nextChisel) => {
		if (step === 1) {
			// a lone steep row between chisel rows keeps the ribbon
			// diagonal; bare 8 is for runs that lean on the vertical zone
			if (nextChisel) {
				return ',d"';
			}
			return prevChisel ? ',8"' : ",8'";
		}
		if (step === 2) {
			return ',dP"';
		}
		if (step === 3) {
			return ',gdP"';
		}
		if (step === 4) {
			return ',agd""\'';
		}
		return ',,ggdd' + '"'.repeat(step - 4) + "'";
	},
	stepBottom: (step, prevChisel, nextChisel) => {
		if (step === 1) {
			if (nextChisel) {
				return (prevChisel ? '"' : '`') + 'Ya';
			}
			return (prevChisel ? '"' : '`') + '8,';
		}
		if (step === 2) {
			return (prevChisel ? '"' : '`') + 'Yba';
		}
		if (step === 3) {
			return '`"Yba,';
		}
		return '`"YYbb' + 'a'.repeat(step - 4) + ',';
	},
	// the equator band's first and last rows are the corners, voiced
	// at the wall column like the reference draws them: the chisel
	// rounds the rim into the bar and its dress spans any jog left by
	// a steep approach, so wide flat shoulders never tear
	cornerTop: jog => {
		if (jog <= 1) {
			return "d'";
		}
		return 'dP' + '"'.repeat(jog - 1);
	},
	cornerBottom: jog => {
		if (jog <= 1) {
			return 'Y,';
		}
		return 'Yb' + 'a'.repeat(Math.max(0, jog - 2)) + ',';
	},
	capTopRow: h => capRow(capTopHalf(h), true),
	capBottomRow: h => capRow(capBottomHalf(h), false),
};

// ------------------------------------------------------- thin voice

/**
 * The thin dialect speaks the owner's ascii reference set: bar walls,
 * slash diagonals, short dressed shoulders with no anticipating lead
 * (`.-'` is its whole span), caps keyed by width (bare underscores at
 * mid sizes, a tilde apex at large, quotes small), and bottoms that
 * anchor wider than their tops with a dot nestled into the tails.
 * The mirror runs one way where the art demands it: backtick flips
 * to apostrophe and comma to period, while period and apostrophe
 * stand on both sides.
 */
const THIN_MIRROR = new Map<number, number>([
	[47, 92], // / to backslash
	[92, 47],
	[40, 41], // ( )
	[41, 40],
	[96, 39], // backtick to apostrophe, never back
	[44, 46], // comma to period, never back
]);

const THIN_VOICE: CircleVoice = {
	mirror: (c: number) => THIN_MIRROR.get(c) ?? c,
	capInsetTop: 0.5,
	capInsetBottom: 1.5,
	capExact: true,
	measureTop: 'narrow',
	measureBottom: 'wide',
	bar: '|',
	// a leading space keeps the shared anchor: thin shoulders start on
	// the boundary itself and spaces stay unwritten
	stepTop: step => {
		if (step === 1) {
			return ' /';
		}
		return ' .' + '-'.repeat(step - 2) + "'";
	},
	stepBottom: step => {
		if (step === 1) {
			return ' \\';
		}
		return '`' + '-'.repeat(step - 2) + '.';
	},
	// a two cell jog wants the bare diagonal floating mid jog, like
	// the reference rows; wider jogs keep a dressed tail
	cornerTop: jog => {
		if (jog <= 1) {
			return '|';
		}
		if (jog === 2) {
			return ' /';
		}
		return '/' + '-'.repeat(jog - 1);
	},
	cornerBottom: jog => {
		if (jog <= 1) {
			return '|';
		}
		if (jog === 2) {
			return ' \\';
		}
		return '\\' + '_'.repeat(jog - 1);
	},
	capTopRow: h => {
		const w = 2 * h - 1;
		if (w >= 7) {
			const flank = '-'.repeat((w - 7) >> 1);
			return '_.-' + flank + '~' + flank + '-._';
		}
		if (w >= 5) {
			return '.-~-.';
		}
		return '_'.repeat(Math.max(1, w));
	},
	capBottomRow: h => {
		const w = 2 * h - 1;
		if (w >= 9) {
			return '`-.' + '_'.repeat(w - 6) + ".-'";
		}
		if (w >= 5) {
			return '`-' + '.'.repeat(w - 4) + "-'";
		}
		if (w >= 3) {
			return "`-'";
		}
		return '_'.repeat(Math.max(1, w));
	},
};

/**
 * Smallest thin rings, from the owner's reference set: paren sides
 * and dash caps. Three rows is the floor; anything smaller grows in.
 */
const THIN_TINY = [
	{
		left: -2,
		rows: [' ,-.', '(   )', " `-'"],
	},
	{
		left: -3,
		rows: [' ,---.', '(     )', " `---'"],
	},
];

// ---------------------------------------------------------- exports

/**
 * cx and rx in cell columns, cyHb and rhb in half block rows (the
 * controller's native drag space). Output rows are cell rows. Drags
 * too small for the grammar grow into the smallest template instead
 * of stamping crumbs.
 */
export const amigaCircleCells = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
): CircleCell[] => {
	rx = Math.max(0, Math.round(rx));
	rhb = Math.max(0, Math.round(rhb));
	if (rx <= 4 && rhb <= 6) {
		const cells: CircleCell[] = [];
		const t = rx >= 4 || rhb >= 5 ? TINY[1] : TINY[0];
		const yTop = Math.floor(cyHb / 2) - (t.rows.length >> 1);
		t.rows.forEach((row, i) => {
			putRun(cells, cx + t.left, yTop + i, row);
		});
		return cells;
	}
	return walkCircle(cx, cyHb, rx, rhb, AMIGA_VOICE);
};

/** Same walk and mirror in the thin line vocabulary. */
export const asciiCircleCells = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
): CircleCell[] => {
	rx = Math.max(0, Math.round(rx));
	rhb = Math.max(0, Math.round(rhb));
	if (rx <= 3 && rhb <= 3) {
		const cells: CircleCell[] = [];
		const t = rx >= 3 ? THIN_TINY[1] : THIN_TINY[0];
		const yTop = Math.floor(cyHb / 2) - 1;
		t.rows.forEach((row, i) => {
			putRun(cells, cx + t.left, yTop + i, row);
		});
		return cells;
	}
	return walkCircle(cx, cyHb, rx, rhb, THIN_VOICE);
};
