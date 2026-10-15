/**
 * Circle stamp for the ruled shape tools (owner reference art:
 * circles.txt). Nu skool circles are a double mirror: one quadrant's
 * grammar flipped and rotated into the other three, so symmetry comes
 * by construction instead of hoping two engine strokes agree. The left
 * half is voiced from per row boundary spans; the right half mirrors
 * glyphwise. Old skool circles instead follow the owner's scaling law
 * and compose from fixed profile tables (see the old skool section).
 * The smallest nu skool sizes stop reading as curves row by row, so
 * they come from whole templates drawn by the owner (the R flourish is
 * deliberate and has no good left side mirror, so templates never
 * mirror).
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
	 * blocks, so cap width covers the gap to the first stepping row
	 */
	capInsetTop: number;
	capInsetBottom: number;
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
	/**
	 * a voice that speaks its right half directly instead of glyph
	 * mirroring the left: the fill dialect keeps the Y shoulder
	 * standing on the right rim while the left swallows its P, which
	 * no per glyph mirror can produce. Runs anchor so their last char
	 * lands on the mirror of the left run's anchor column
	 */
	right?: {
		bar: string;
		stepTop: (step: number, prevChisel: boolean, nextChisel: boolean) => string;
		stepBottom: (
			step: number,
			prevChisel: boolean,
			nextChisel: boolean,
		) => string;
		cornerTop: (jog: number) => string;
		cornerBottom: (jog: number) => string;
	};
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
		let dy = Math.min(
			rhb,
			Math.min(Math.abs(y * 2 + 0.5 - cyHb), Math.abs(y * 2 + 1.5 - cyHb)),
		);
		if (i === 0) {
			dy = Math.min(dy, rhb - voice.capInsetTop);
		}
		if (i === rows - 1) {
			dy = Math.min(dy, rhb - voice.capInsetBottom);
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
	// flipped. A plateau's raw step of 0 voices as a lone step of 1
	// with no next chisel
	const cells: CircleCell[] = [];
	const rcells: CircleCell[] = [];
	const R = voice.right;
	let prevChisel = true;
	for (let i = 1; i < rows - 1; i++) {
		const x = xb[i];
		const y = yTop + i;
		let anchor = x;
		let run: string;
		let rrun: string | undefined;
		if (i < eqStart) {
			anchor = x - 1;
			const raw = xb[i - 1] - x;
			const step = raw === 0 ? 1 : raw;
			const nextChisel = raw !== 0 && x - xb[i + 1] > 1;
			run = voice.stepTop(step, prevChisel, nextChisel);
			rrun = R?.stepTop(step, prevChisel, nextChisel);
			prevChisel = raw > 1;
		} else if (i === eqStart && i === eqEnd) {
			run = voice.bar;
			rrun = R?.bar;
			prevChisel = false;
		} else if (i === eqStart) {
			run = voice.cornerTop(xb[i - 1] - x);
			rrun = R?.cornerTop(xb[i - 1] - x);
			prevChisel = false;
		} else if (i === eqEnd) {
			run = voice.cornerBottom(xb[i + 1] - x);
			rrun = R?.cornerBottom(xb[i + 1] - x);
			prevChisel = false;
		} else if (i < eqEnd) {
			run = voice.bar;
			rrun = R?.bar;
			prevChisel = false;
		} else {
			// bottoms measure against the row above: the wide anchored
			// caps absorb the final jump themselves
			anchor = x - 1;
			const raw = x - xb[i - 1];
			const step = raw === 0 ? 1 : raw;
			const nextChisel = raw !== 0 && i + 1 < rows && xb[i + 1] - x > 1;
			run = voice.stepBottom(step, prevChisel, nextChisel);
			rrun = R?.stepBottom(step, prevChisel, nextChisel);
			prevChisel = raw > 1;
		}
		putRun(cells, anchor, y, run);
		if (rrun !== undefined) {
			putRun(rcells, 2 * cx - anchor - rrun.length + 1, y, rrun);
		}
	}
	// right half mirrors glyphwise across the center column unless the
	// voice spoke it directly; runs that reach the axis stop there so
	// no unmirrored ink leaks past it
	const left = cells.filter(c => c.x <= cx);
	const out: CircleCell[] = left.slice();
	if (R) {
		for (const c of rcells) {
			if (c.x > cx) {
				out.push(c);
			}
		}
	} else {
		for (const c of left) {
			if (c.x < cx) {
				out.push({
					x: 2 * cx - c.x,
					y: c.y,
					charCode: voice.mirror(c.charCode),
				});
			}
		}
	}
	putRun(out, xb[0], yTop, voice.capTopRow(cx - xb[0] + 1));
	putRun(out, xb[rows - 1], yBot, voice.capBottomRow(cx - xb[rows - 1] + 1));
	return out;
};

// ------------------------------------------------------ nu skool voice

const NUSKOOL_MIRROR = mirrorMap([
	['d', 'b'],
	['P', 'Y'],
	["'", '`'],
	['(', ')'],
]);

const nuskoolMirror = (c: number): number => NUSKOOL_MIRROR.get(c) ?? c;

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
			keepShoulders && (c === 80 || c === 89) ? c : nuskoolMirror(c);
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
const NUSKOOL_VOICE: CircleVoice = {
	mirror: nuskoolMirror,
	capInsetTop: 1.5,
	capInsetBottom: 1.5,
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

// ------------------------------------------------------- fill voice

const FILL = 36; // $

const fillInk = (n: number): string => '$'.repeat(Math.max(0, n));

/**
 * The solid dialect wraps the nu skool ribbon anatomy (asciiStamp.ts
 * ribbonEdges) around the disc: rising walls lead ,d and trail P',
 * falling walls lead `Y and trail b, with $ ink between. The hollow
 * rim's inner dressing (colons, inner quotes and pebbles, tucked
 * chisel trails) reads as holes punched in solid ink, so fill walls
 * keep only the outward silhouette. The Y shoulder stands on the
 * right rim where the hollow dialect drew it, but its P mirror never
 * lands on the top left (owner rule shared with the hollow steps), so
 * the right half speaks for itself instead of mirroring.
 */
const NUSKOOL_FILL_VOICE: CircleVoice = {
	mirror: nuskoolMirror,
	capInsetTop: 1.5,
	capInsetBottom: 1.5,
	bar: '8',
	stepTop: (step, _prevChisel, nextChisel) => {
		if (step === 1) {
			return nextChisel ? ',d' : ',8';
		}
		return step === 2 ? ',d' : ',gd';
	},
	stepBottom: (step, prevChisel) => {
		if (step >= 3) {
			return '`"Y';
		}
		return (prevChisel ? '"' : '`') + 'Y';
	},
	cornerTop: () => 'd',
	cornerBottom: () => 'Y',
	capTopRow: h => {
		const w = 2 * h - 1;
		if (h >= 8) {
			return ',,ggd' + fillInk(w - 10) + 'bgg,,';
		}
		if (h >= 5) {
			return ',,d' + fillInk(w - 6) + 'b,,';
		}
		if (h >= 3) {
			return ',d' + fillInk(w - 4) + 'b,';
		}
		return fillInk(Math.max(1, w));
	},
	capBottomRow: h => {
		const w = 2 * h - 1;
		if (h >= 8) {
			return '``""Y' + fillInk(w - 10) + 'P""\'\'';
		}
		if (h >= 5) {
			return '`"Y' + fillInk(w - 6) + 'P"\'';
		}
		if (h >= 3) {
			return '`Y' + fillInk(w - 4) + "P'";
		}
		return fillInk(Math.max(1, w));
	},
	right: {
		bar: '8',
		stepTop: (step, _prevChisel, nextChisel) => {
			if (step === 1) {
				return nextChisel ? 'b,' : '8,';
			}
			return step === 2 ? 'Yb,' : 'Ybg,';
		},
		stepBottom: (step, prevChisel) => {
			if (step >= 3) {
				return 'P"\'';
			}
			return 'P' + (prevChisel ? '"' : "'");
		},
		cornerTop: jog => (jog <= 1 ? 'b' : 'Yb'),
		cornerBottom: () => 'P',
	},
};

/**
 * Smallest solid circles. Grammar rows this tight collapse to walls
 * touching walls, so like the hollow tinies they are whole templates.
 * Drawn by extrapolation from the owner's solid reference, pending
 * owner art.
 */
const TINY_FILL = [
	{
		left: -4,
		rows: [' ,d$$b,', 'd$$$$$$b', 'Y$$$$$$P', " `Y$$P'"],
	},
	{
		left: -4,
		rows: [' ,d$$$b,', 'd$$$$$$$b', '8$$$$$$$8', 'Y$$$$$$$P', " `Y$$$P'"],
	},
];

/**
 * Pour $ into every unwritten cell between each row's walls. Fill
 * spans come from the stamped rim itself, not the ellipse equation:
 * asymmetric walls can never strand a gap between geometry and ink.
 */
const floodRows = (cells: CircleCell[]): CircleCell[] => {
	const rows = new Map<number, Set<number>>();
	for (const c of cells) {
		let s = rows.get(c.y);
		if (s === undefined) {
			s = new Set();
			rows.set(c.y, s);
		}
		s.add(c.x);
	}
	const out = cells.slice();
	for (const [y, s] of rows) {
		let lo = Infinity;
		let hi = -Infinity;
		for (const x of s) {
			lo = Math.min(lo, x);
			hi = Math.max(hi, x);
		}
		for (let x = lo + 1; x < hi; x++) {
			if (!s.has(x)) {
				out.push({ x: x, y: y, charCode: FILL });
			}
		}
	}
	return out;
};

// ---------------------------------------------- old skool profiles

/**
 * Old skool circles speak the owner's scaling law (circles.txt): the
 * corner anatomy never changes with size. Height stretches only the
 * wall rows and width only the dash and underscore cap fills; copying
 * any other row flattens the curve into facets. Rows compose
 * directly, a left run at its inset plus a right run anchored off the
 * box's right edge, so both width parities land exactly and no glyph
 * mirror is needed. Tiers shed as the box shrinks: the full corner
 * needs thirteen columns, the quote cap eight, the apostrophe cap
 * seven, then paren walls carry the rest.
 */

type ProfileRun = [number, string];

const dashes = (n: number): string => '-'.repeat(Math.max(0, n));
const unders = (n: number): string => '_'.repeat(Math.max(0, n));

const sideRuns = (
	w: number,
	inset: number,
	left: string,
	right: string,
): ProfileRun[] => [
	[inset, left],
	[w - inset - right.length, right],
];

/**
 * Full corner (golden and both good scalings): cap tails over one
 * shoulder pair over one diagonal. The bottom hangs one column
 * heavier than the top in every owner reference: its diagonal rides
 * the wall column and its cap anchors a column wider.
 */
const fullRows = (w: number, h: number): ProfileRun[][] => {
	const rows: ProfileRun[][] = [];
	rows.push([[4, '_.' + dashes(w - 12) + '._']]);
	rows.push(sideRuns(w, 2, ".'", "'."));
	if (h === 6) {
		// with no wall band between them, adjacent diagonals read
		// pointy; the pair stands up as pipes one column in
		rows.push(sideRuns(w, 1, '|', '|'));
		rows.push(sideRuns(w, 1, '|', '|'));
	} else {
		rows.push(sideRuns(w, 1, '/', '\\'));
		for (let i = 0; i < h - 6; i++) {
			rows.push(sideRuns(w, 0, '|', '|'));
		}
		rows.push(sideRuns(w, 0, '\\', '/'));
	}
	rows.push(sideRuns(w, 1, '`.', ".'"));
	rows.push([[3, "'-." + unders(w - 12) + ".-'"]]);
	return rows;
};

/**
 * Quote cap corner for shorter or narrower rings (the 5x12 ref).
 * Past the widest owner drawn quote cap the fill reads as a slab, so
 * wide caps leave the quote family for dashes and underscores.
 */
const quoteRows = (w: number, h: number): ProfileRun[][] => {
	const wide = w >= 13;
	const rows: ProfileRun[][] = [];
	rows.push([
		[2, wide ? '_.' + dashes(w - 8) + '._' : '.-' + '"'.repeat(w - 8) + '-.'],
	]);
	rows.push(sideRuns(w, 1, '/', '\\'));
	for (let i = 0; i < h - 4; i++) {
		rows.push(sideRuns(w, 0, '|', '|'));
	}
	rows.push(sideRuns(w, 1, '\\', '/'));
	rows.push([
		[
			2,
			wide ? "'-." + unders(w - 10) + ".-'" : '`-' + '.'.repeat(w - 8) + "-'",
		],
	]);
	return rows;
};

/**
 * Four rows have no walls at all (the 4x8 ref); an apostrophe pair
 * sits the even axis, a lone apostrophe the odd one, and dashes carry
 * the stretch so the pair never widens.
 */
const flatRows = (w: number): ProfileRun[][] => {
	// the cap interior splits in thirds, dash flank / core band / dash
	// flank: the owner's tiny ref and wide pill both obey it. A short
	// core keeps the period pebble pair; a run becomes an underscore
	// floor so the whisker reads exaggerated, never dotted
	const interior = w - 4;
	const flank = dashes(Math.floor(interior / 3));
	const core = interior - 2 * flank.length;
	return [
		[[1, ',' + flank + "'".repeat(core) + flank + '.']],
		sideRuns(w, 0, '/', '\\'),
		sideRuns(w, 0, '\\', '/'),
		[[1, '`' + flank + (core <= 2 ? '.' : '_').repeat(core) + flank + "'"]],
	];
};

/**
 * Paren walls with dash caps: the three row canon family (comma and
 * backtick, per the owner) and the narrow tall fallback in one shape.
 */
const parenRows = (w: number, h: number): ProfileRun[][] => {
	const rows: ProfileRun[][] = [[[1, ',' + dashes(w - 4) + '.']]];
	for (let i = 0; i < h - 2; i++) {
		rows.push(sideRuns(w, 0, '(', ')'));
	}
	rows.push([[1, '`' + dashes(w - 4) + "'"]]);
	return rows;
};

const profileRows = (w: number, h: number): ProfileRun[][] => {
	if (h === 1) {
		// a flat drag is a lens: one cap tail row
		return [[[0, '_.' + dashes(w - 4) + '._']]];
	}
	if (h === 3 || w < 7) {
		return parenRows(w, h);
	}
	if (h === 4) {
		return flatRows(w);
	}
	if (h >= 6 && w >= 13) {
		return fullRows(w, h);
	}
	return w >= 8 ? quoteRows(w, h) : parenRows(w, h);
};

// ---------------------------------------------------------- exports

/**
 * min/max and round pass non finite values through, and an Infinity
 * extent runs the row loops forever: public core api sanitizes once
 * at each export. Signed values (box corners) keep their sign.
 */
const finite = (v: number, floor: number, signed = false): number =>
	Number.isFinite(v)
		? signed
			? Math.round(v)
			: Math.max(floor, Math.round(v))
		: floor;

/**
 * a drag long in one dimension and flat in the other asked for a lens
 * or a bar, not a grown template: templates only replace drags that
 * are small in both dimensions
 */
const sliver = (rx: number, rhb: number): boolean => rx >= 2 !== rhb >= 2;

/**
 * cx and rx in cell columns, cyHb and rhb in half block rows (the
 * controller's native drag space). Output rows are cell rows. Drags
 * too small for the grammar grow into the smallest template instead
 * of stamping crumbs.
 */
export const nuskoolCircleCells = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
): CircleCell[] => {
	cx = finite(cx, 0);
	cyHb = finite(cyHb, 0);
	rx = finite(rx, 0);
	rhb = finite(rhb, 0);
	if (rx <= 4 && rhb <= 6 && !sliver(rx, rhb)) {
		const cells: CircleCell[] = [];
		const t = rx >= 4 || rhb >= 5 ? TINY[1] : TINY[0];
		const yTop = Math.floor(cyHb / 2) - (t.rows.length >> 1);
		t.rows.forEach((row, i) => {
			putRun(cells, cx + t.left, yTop + i, row);
		});
		return cells;
	}
	return walkCircle(cx, cyHb, rx, rhb, NUSKOOL_VOICE);
};

/** Same geometry as the hollow walk, voiced solid and flooded. */
export const nuskoolCircleFilledCells = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
): CircleCell[] => {
	cx = finite(cx, 0);
	cyHb = finite(cyHb, 0);
	rx = finite(rx, 0);
	rhb = finite(rhb, 0);
	if (rx <= 4 && rhb <= 6 && !sliver(rx, rhb)) {
		const cells: CircleCell[] = [];
		const t = rx >= 4 || rhb >= 5 ? TINY_FILL[1] : TINY_FILL[0];
		const yTop = Math.floor(cyHb / 2) - (t.rows.length >> 1);
		t.rows.forEach((row, i) => {
			putRun(cells, cx + t.left, yTop + i, row);
		});
		return cells;
	}
	return floodRows(walkCircle(cx, cyHb, rx, rhb, NUSKOOL_FILL_VOICE));
};

/**
 * Box true stamp in the old skool profile grammar: xLeft and w in
 * cell columns, yTop and h in cell rows (the controller derives rows
 * from its half block drag box). Boxes under the smallest ring grow
 * around their center; a two row box grows down into the three row
 * floor.
 */
export const oldskoolCircleCells = (
	xLeft: number,
	yTop: number,
	w: number,
	h: number,
): CircleCell[] => {
	xLeft = finite(xLeft, 0, true);
	yTop = finite(yTop, 0, true);
	w = finite(w, 1);
	h = finite(h, 1);
	if (w < 5) {
		xLeft -= (5 - w) >> 1;
		w = 5;
	}
	if (h === 2) {
		h = 3;
	}
	const cells: CircleCell[] = [];
	profileRows(w, h).forEach((runs, i) => {
		for (const [inset, run] of runs) {
			putRun(cells, xLeft + inset, yTop + i, run);
		}
	});
	return cells;
};
