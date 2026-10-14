/**
 * Amiga style circle stamp (owner reference art: circles.txt). A
 * circle is a double mirror: one quadrant's grammar flipped and
 * rotated into the other three, so symmetry comes by construction
 * instead of hoping two engine strokes agree. The left half is voiced
 * from per row boundary spans; the right half mirrors glyphwise. The
 * smallest sizes stop reading as curves row by row, so they come from
 * whole templates drawn by the owner (the R flourish is deliberate
 * and has no good left side mirror, so templates never mirror).
 */

export interface CircleCell {
	x: number;
	y: number;
	charCode: number;
}

const EIGHT = 56;

const HMIRROR = new Map<number, number>([
	[100, 98], // d b
	[98, 100],
	[80, 89], // P Y
	[89, 80],
	[39, 96], // ' `
	[96, 39],
	[40, 41], // ( )
	[41, 40],
]);

const mirror = (c: number): number => HMIRROR.get(c) ?? c;

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

const putRun = (cells: CircleCell[], x: number, y: number, run: string) => {
	for (let i = 0; i < run.length; i++) {
		if (run[i] !== ' ') {
			cells.push({ x: x + i, y: y, charCode: run.charCodeAt(i) });
		}
	}
};

/**
 * Cap rows read as one dressed run from the rim boundary over the
 * apex and back: pebble leads, low chisels, a Y shoulder, flat ink
 * across the top. The top cap's Y shoulder stands on both sides in
 * the reference art, so caps mirror with their own map (chisels and
 * pebbles swap, shoulders stand). A cap half always ends in a self
 * mirror glyph: its last char sits on the symmetry axis.
 */
const capRow = (half: string, keepShoulders: boolean): string => {
	let right = '';
	for (let i = half.length - 2; i >= 0; i--) {
		const c = half.charCodeAt(i);
		const flipped = keepShoulders && (c === 80 || c === 89) ? c : mirror(c);
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
 * the top rim.
 */
const stepTop = (
	step: number,
	prevChisel: boolean,
	nextChisel: boolean,
): string => {
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
};

const stepBottom = (
	step: number,
	prevChisel: boolean,
	nextChisel: boolean,
): string => {
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
};

/**
 * The equator band's first and last rows are the corners, voiced at
 * the wall column like the reference draws them: the chisel rounds
 * the rim into the bar and its dress spans any jog left by a steep
 * approach, so wide flat shoulders never tear.
 */
const cornerTop = (jog: number): string => {
	if (jog <= 1) {
		return "d'";
	}
	return 'dP' + '"'.repeat(jog - 1);
};

const cornerBottom = (jog: number): string => {
	if (jog <= 1) {
		return 'Y,';
	}
	return 'Yb' + 'a'.repeat(jog - 2) + ',';
};

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
	const yTop = Math.floor((cyHb - rhb) / 2);
	const yBot = Math.floor((cyHb + rhb) / 2);
	const rows = yBot - yTop + 1;
	// each row's leftmost rim column, from the half block center
	// nearest the equator; cap rows measure just inside the apex so
	// their width covers the gap to the first stepping row. clamped
	// monotone toward the equator so rounding never zigzags
	const xb: number[] = [];
	for (let i = 0; i < rows; i++) {
		const y = yTop + i;
		let dy = Math.min(
			Math.abs(y * 2 + 0.5 - cyHb),
			Math.abs(y * 2 + 1.5 - cyHb),
		);
		if (i === 0 || i === rows - 1) {
			dy = Math.min(dy, rhb - 1.5);
		}
		const t = Math.min(1, Math.max(0, dy) / Math.max(1, rhb));
		xb.push(Math.round(cx - rx * Math.sqrt(Math.max(0, 1 - t * t))));
	}
	if (rows === 1) {
		// a flat drag is a lens: one dressed cap row
		const out: CircleCell[] = [];
		putRun(out, xb[0], yTop, capRow(capTopHalf(cx - xb[0] + 1), true));
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
	// one walk, each row classified: step rows above and below the
	// band, corners on the band's edge rows, bars between. caps land
	// after the mirror pass with their own shoulder rules
	const cells: CircleCell[] = [];
	let prevChisel = true;
	for (let i = 1; i < rows - 1; i++) {
		const x = xb[i];
		const y = yTop + i;
		if (i < eqStart) {
			const step = xb[i - 1] - x;
			if (step === 0) {
				cells.push({ x: x, y: y, charCode: EIGHT });
				prevChisel = false;
				continue;
			}
			const nextChisel = x - xb[i + 1] > 1;
			putRun(cells, x - 1, y, stepTop(step, prevChisel, nextChisel));
			prevChisel = step > 1;
		} else if (i === eqStart && i === eqEnd) {
			cells.push({ x: x, y: y, charCode: EIGHT });
			prevChisel = false;
		} else if (i === eqStart) {
			putRun(cells, x, y, cornerTop(xb[i - 1] - x));
			prevChisel = false;
		} else if (i === eqEnd) {
			putRun(cells, x, y, cornerBottom(xb[i + 1] - x));
			prevChisel = false;
		} else if (i < eqEnd) {
			cells.push({ x: x, y: y, charCode: EIGHT });
			prevChisel = false;
		} else {
			const step = x - xb[i - 1];
			if (step === 0) {
				cells.push({ x: x, y: y, charCode: EIGHT });
				prevChisel = false;
				continue;
			}
			const nextChisel = i + 1 < rows && xb[i + 1] - x > 1;
			putRun(cells, x - 1, y, stepBottom(step, prevChisel, nextChisel));
			prevChisel = step > 1;
		}
	}
	// right half mirrors glyphwise across the center column; runs that
	// reach the axis stop there so no unmirrored ink leaks past it
	const left = cells.filter(c => c.x <= cx);
	const out: CircleCell[] = left.slice();
	for (const c of left) {
		if (c.x < cx) {
			out.push({ x: 2 * cx - c.x, y: c.y, charCode: mirror(c.charCode) });
		}
	}
	putRun(out, xb[0], yTop, capRow(capTopHalf(cx - xb[0] + 1), true));
	putRun(
		out,
		xb[rows - 1],
		yBot,
		capRow(capBottomHalf(cx - xb[rows - 1] + 1), false),
	);
	return out;
};
