import { describe, expect, it } from 'vitest';
import {
	createAsciiStampEngine,
	junctionForTip,
	mergeGlyphs,
} from '../../src/js/core/asciiStamp.js';

/**
 * Golden harness: run a stroke through the engine, render the stamped
 * cells as text, and compare against inline ascii art. Last write to a
 * cell wins, mirroring the editor's behavior inside one undo group.
 */
const stroke = (
	points: Array<[number, number, number?]>,
	finalize = true,
): string => {
	const engine = createAsciiStampEngine();
	const grid = new Map<string, number>();
	const apply = (cells: Array<{ x: number; y: number; charCode: number }>) => {
		for (const c of cells) {
			grid.set(`${c.x},${c.y}`, c.charCode);
		}
	};
	points.forEach(([x, y, subY], i) => {
		if (i === 0) {
			apply(engine.begin(x, y, subY ?? 1));
		} else {
			apply(engine.move(x, y, subY ?? 1));
		}
	});
	if (finalize) {
		apply(engine.end());
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const k of grid.keys()) {
		const [x, y] = k.split(',').map(Number);
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	const lines: string[] = [];
	for (let y = minY; y <= maxY; y++) {
		let line = '';
		for (let x = minX; x <= maxX; x++) {
			const c = grid.get(`${x},${y}`);
			line += c === undefined ? ' ' : String.fromCharCode(c);
		}
		lines.push(line.replace(/\s+$/, ''));
	}
	return lines.join('\n');
};

describe('ascii stamp engine, thin style', () => {
	it('stamps a vertical bar line', () => {
		expect(
			stroke([
				[3, 0],
				[3, 4],
			]),
		).toBe(['|', '|', '|', '|', '|'].join('\n'));
	});

	it('stamps 45 degree rising as slashes', () => {
		// drawn bottom left to top right
		expect(
			stroke([
				[0, 4],
				[4, 0],
			]),
		).toBe(['    /', '   /', '  /', ' /', '/'].join('\n'));
	});

	it('stamps 45 degree falling as backslashes', () => {
		expect(
			stroke([
				[0, 0],
				[4, 4],
			]),
		).toBe(['\\', ' \\', '  \\', '   \\', '    \\'].join('\n'));
	});

	it('breaks steep column steps with pebble pairs', () => {
		// BRUSH.md line 1 vocabulary; Bresenham phases the steps a row
		// later than the hand drawn ideal, which reads identically
		expect(
			stroke([
				[2, 0],
				[0, 4],
			]),
		).toBe(['  |', '  |', " .'", ' |', ".'"].join('\n'));
	});

	it('stamps shallow two per row as comma quote pairs', () => {
		// BRUSH.md line 3
		expect(
			stroke([
				[0, 4],
				[9, 0],
			]),
		).toBe(["        ,'", "      ,'", "    ,'", "  ,'", ",'"].join('\n'));
	});

	it('stamps shallow rows in one pebble voice despite length jitter', () => {
		// BRUSH.md line 4 vocabulary; Bresenham deals rows of 2 to 4
		// cells for this slope and the rhythm keeps them all pebble runs
		expect(
			stroke([
				[0, 4],
				[14, 0],
			]),
		).toBe(
			["             ,'", "         ,--'", "      ,-'", "  ,--'", ",'"].join(
				'\n',
			),
		);
	});

	it('bands long shallow rows through the underscore ramp', () => {
		// BRUSH.md line 5 vocabulary across Bresenham's 6/12/6 row deal
		expect(
			stroke([
				[0, 2],
				[23, 0],
			]),
		).toBe(
			['                  __.--"', '      ___...---"""', '__.--"'].join('\n'),
		);
	});

	it('mirrors shallow falling rows high to low', () => {
		expect(
			stroke([
				[0, 0],
				[14, 4],
			]),
		).toBe(
			['-.', '  `--.', '      `-.', '         `--.', '             `.'].join(
				'\n',
			),
		);
	});

	it('stamps horizontal in the lower band as underscores', () => {
		expect(
			stroke([
				[0, 0, 1],
				[7, 0, 1],
			]),
		).toBe('________');
	});

	it('stamps horizontal in the upper band as dashes', () => {
		expect(
			stroke([
				[0, 0, 0],
				[7, 0, 0],
			]),
		).toBe('--------');
	});

	it('is invariant under draw direction', () => {
		const leftToRight = stroke([
			[0, 4],
			[14, 0],
		]);
		const rightToLeft = stroke([
			[14, 0],
			[0, 4],
		]);
		expect(rightToLeft).toBe(leftToRight);
	});

	it('leaves a sub cell weighted pebble on a tap', () => {
		expect(stroke([[2, 2, 1]])).toBe('.');
		expect(stroke([[2, 2, 0]])).toBe("'");
	});

	it('merges same row jitter under stem classes instead of doubling', () => {
		// hand wobble on a vertical: x oscillates one column
		expect(
			stroke([
				[5, 0],
				[5, 2],
				[6, 3],
				[5, 4],
				[5, 6],
				[6, 7],
				[6, 8],
				[5, 9],
				[5, 11],
			]),
		).not.toMatch(/\|\|/);
	});

	it('sweeps a quarter arc without doubles or orphan debris', () => {
		// flat start steepening to vertical, the cursive upstroke that
		// shook out doubled columns and lone dashes from the first cut
		const pts: Array<[number, number]> = [];
		for (let t = 0; t <= 90; t += 2) {
			const rad = (t * Math.PI) / 180;
			const x = Math.round(16 * Math.sin(rad));
			const y = 16 - Math.round(16 * (1 - Math.cos(rad)));
			const prev = pts[pts.length - 1];
			if (!prev || prev[0] !== x || prev[1] !== y) {
				pts.push([x, y]);
			}
		}
		expect(stroke(pts)).toBe(
			[
				'                |',
				'                |',
				'                |',
				'                |',
				'                |',
				"               .'",
				'               |',
				'               |',
				"              .'",
				"             .'",
				'             /',
				'            /',
				'           /',
				'          /',
				'       _-',
				'    _.-"',
				'__.-"',
			].join('\n'),
		);
	});

	it('caps a left to right turn with the circle idiom', () => {
		// a hump: rising in, falling out, x never reversing
		const pts: Array<[number, number]> = [];
		for (let x = 0; x <= 24; x++) {
			pts.push([x, Math.round(10 * Math.pow((x - 12) / 12, 2))]);
		}
		const art = stroke(pts);
		expect(art).toContain('."".');
		expect(art).not.toMatch(/`-+\./);
	});

	it('a lower half start voices its entry row at mid height', () => {
		// the pen never crossed the top of its first cell, so top ink
		// there would hook at twice the true slope; an upper half start
		// did cross it and keeps the full ramp
		const low = stroke([
			[0, 3, 1],
			[14, 7, 1],
		]);
		const high = stroke([
			[0, 2, 0],
			[14, 6, 0],
		]);
		expect(low.split('\n')[0]).toBe('-.');
		expect(high.split('\n')[0]).toBe('`.');
	});

	it('smooths sparse fast samples into connected waves', () => {
		// two sine humps at normal writing speed sampling; chords used
		// to kink the curves and cut the valleys, the spline restores
		// them, and both valleys must read as connected bowls
		const pts: Array<[number, number]> = [];
		for (let x = 0; x <= 60; x += 3) {
			pts.push([x, 6 + Math.round(5 * Math.sin((x / 60) * Math.PI * 3))]);
		}
		expect(stroke(pts)).toBe(
			[
				'                            .-"-.',
				"                          ,-'   `--.",
				"                        ,'         `-.",
				'                       /             `.',
				'                      /                 \\',
				'-.                  /                   \\                   /',
				' `.                 /                    \\                 /',
				'   `.              /                       \\             /',
				"    `.          ,'                          \\          ,'",
				"      `.      ,-'                            `.      ,-'",
				"       `-____-'                               `-____-'",
			].join('\n'),
		);
	});

	it('stamps an upstroke exactly like the downstroke', () => {
		const down = stroke([
			[2, 0],
			[0, 6],
		]);
		const up = stroke([
			[0, 6],
			[2, 0],
		]);
		expect(up).toBe(down);
		expect(down).toContain(".'");
		expect(down).not.toContain("'|");
	});

	it('keeps the thin vocabulary at width one after a width round trip', () => {
		const engine = createAsciiStampEngine({ width: 5 });
		engine.setWidth(1);
		expect(engine.getWidth()).toBe(1);
		const grid = new Map<string, number>();
		engine.begin(3, 0, 1).forEach(c => grid.set(`${c.x},${c.y}`, c.charCode));
		engine.move(3, 4, 1).forEach(c => grid.set(`${c.x},${c.y}`, c.charCode));
		engine.end().forEach(c => grid.set(`${c.x},${c.y}`, c.charCode));
		expect(grid.get('3,2')).toBe(124);
	});

	it('voices a self crossing as a junction, held against rebanding', () => {
		// vertical first, then a horizontal pass through the same cell:
		// the shared cell takes the + and the run growing past it must
		// not demote it back to a ramp glyph
		const engine = createAsciiStampEngine();
		const grid = new Map<string, number>();
		const apply = (cells: Array<{ x: number; y: number; charCode: number }>) =>
			cells.forEach(c => grid.set(`${c.x},${c.y}`, c.charCode));
		apply(engine.begin(3, 0, 1));
		apply(engine.move(3, 6, 1));
		apply(engine.move(0, 3, 1));
		apply(engine.move(6, 3, 1));
		apply(engine.end());
		expect(grid.get('3,3')).toBe(43);
	});
});

/** Roman ribbon: width above 1 stamps corpus anatomy around the
 * same skeleton (lead chisel, $ fill, trail chisel). */
const roman = (points: Array<[number, number]>, width: number): string => {
	const engine = createAsciiStampEngine({ width });
	const grid = new Map<string, number>();
	const apply = (cells: Array<{ x: number; y: number; charCode: number }>) =>
		cells.forEach(c => grid.set(`${c.x},${c.y}`, c.charCode));
	points.forEach(([x, y], i) => {
		if (i === 0) {
			apply(engine.begin(x, y, 1));
		} else {
			apply(engine.move(x, y, 1));
		}
	});
	apply(engine.end());
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const k of grid.keys()) {
		const [x, y] = k.split(',').map(Number);
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x);
		maxY = Math.max(maxY, y);
	}
	const lines: string[] = [];
	for (let y = minY; y <= maxY; y++) {
		let line = '';
		for (let x = minX; x <= maxX; x++) {
			const c = grid.get(`${x},${y}`);
			line += c === undefined ? ' ' : String.fromCharCode(c);
		}
		lines.push(line.replace(/\s+$/, ''));
	}
	return lines.join('\n');
};

describe('ascii stamp engine, roman ribbon', () => {
	it('stamps verticals as bare fill, tapered in, flicked out', () => {
		expect(
			roman(
				[
					[3, 0],
					[3, 4],
				],
				5,
			),
		).toBe(
			[' $$$', '$$$$$', '$$$$$', ' $$$$', '  $$', '  ;', '  .'].join('\n'),
		);
	});

	it('chisels rising strokes with d and P plus row AA', () => {
		expect(
			roman(
				[
					[0, 8],
					[8, 0],
				],
				5,
			),
		).toBe(
			[
				"             '",
				'            :',
				"         ,dP'",
				"       ,d$$P'",
				"     ,d$$$P'",
				"    ,d$$$P'",
				"   ,d$$$P'",
				"  ,d$$$P'",
				" ,d$$$P'",
				",d$$$P'",
				",d$P'",
			].join('\n'),
		);
	});

	it('chisels falling strokes with Y and b plus row AA', () => {
		expect(
			roman(
				[
					[0, 0],
					[8, 8],
				],
				5,
			),
		).toBe(
			[
				'`Y$b.',
				'`Y$$$b.',
				' `Y$$$b.',
				'  `Y$$$b.',
				'   `Y$$$b.',
				'    `Y$$$b.',
				'     `Y$$$b.',
				'       `Y$$b.',
				'         `Yb.',
				'            ;',
				'             .',
			].join('\n'),
		);
	});

	it('width two is the bare edge pair', () => {
		const art = roman(
			[
				[0, 6],
				[6, 0],
			],
			2,
		);
		expect(art).toContain('dP');
		expect(art).not.toContain('$d');
	});

	it('rides waves with alternating chisel sides and solid bowls', () => {
		const pts: Array<[number, number]> = [];
		for (let x = 0; x <= 60; x += 3) {
			pts.push([x, 6 + Math.round(5 * Math.sin((x / 60) * Math.PI * 3))]);
		}
		const art = roman(pts, 3);
		expect(art).toContain('Y$b');
		expect(art).toContain('d$P');
		expect(art).toContain('$$$$$$$$$$');
	});

	it('unions a closed loop solid where the ribbons meet', () => {
		const pts: Array<[number, number]> = [];
		for (let t = 0; t <= 100; t += 3) {
			const a = (t / 100) * Math.PI * 2;
			const x = 12 + Math.round(9 * Math.cos(Math.PI / 2 - a));
			const y = 7 + Math.round(6 * Math.sin(Math.PI / 2 - a));
			const prev = pts[pts.length - 1];
			if (!prev || prev[0] !== x || prev[1] !== y) {
				pts.push([x, y]);
			}
		}
		const art = roman(pts, 3);
		expect(art).toContain('d$$');
		expect(art).toContain('Y$$');
		// the seam where start meets end must be fill; a single rank one
		// pebble flick outside the union reads as corpus flourish
		expect(art.split('\n')[0].trim()).toMatch(/^\$+['.`,]?$/);
	});
});

describe('additive stroke contact', () => {
	it('holds the same glyph', () => {
		expect(mergeGlyphs(45, 45)).toBe(45);
		expect(mergeGlyphs(124, 124)).toBe(124);
	});

	it('weaves a dither knot where two fills cross', () => {
		// SAUNA's #S# joints: cross stroke fill never unions solid, and
		// the knot holds under repeat contact
		expect(mergeGlyphs(36, 36)).toBe(35);
		expect(mergeGlyphs(35, 36)).toBe(35);
		expect(mergeGlyphs(36, 35)).toBe(35);
	});

	it('never carves a heavier mark', () => {
		expect(mergeGlyphs(36, 46)).toBe(36);
		expect(mergeGlyphs(36, 124)).toBe(36);
		expect(mergeGlyphs(100, 44)).toBe(100);
	});

	it('a heavier touch wins over lighter ink', () => {
		expect(mergeGlyphs(46, 36)).toBe(36);
	});

	it('densifies equal weight contact', () => {
		expect(mergeGlyphs(46, 39)).toBe(58);
		expect(mergeGlyphs(45, 95)).toBe(61);
		expect(mergeGlyphs(47, 92)).toBe(88);
		expect(mergeGlyphs(124, 47)).toBe(88);
		expect(mergeGlyphs(100, 89)).toBe(36);
	});

	it('voices pass-through crossings as junctions', () => {
		// bar through horizontal ink: + in either order
		expect(mergeGlyphs(45, 124)).toBe(43);
		expect(mergeGlyphs(124, 95)).toBe(43);
		expect(mergeGlyphs(61, 124)).toBe(43);
		expect(mergeGlyphs(126, 124)).toBe(43);
		// diagonal through horizontal ink: %
		expect(mergeGlyphs(45, 47)).toBe(37);
		expect(mergeGlyphs(95, 92)).toBe(37);
		expect(mergeGlyphs(34, 47)).toBe(37);
		// the light dot and tick bands of a shallow line junction too,
		// in either drawing order, so a crossing cannot vanish just
		// because it landed between the heavier bands
		expect(mergeGlyphs(46, 124)).toBe(43);
		expect(mergeGlyphs(124, 39)).toBe(43);
		expect(mergeGlyphs(47, 46)).toBe(37);
		expect(mergeGlyphs(44, 92)).toBe(37);
		expect(mergeGlyphs(88, 46)).toBe(88);
	});

	it('junction glyphs are sticky under repeat contact', () => {
		expect(mergeGlyphs(43, 45)).toBe(43);
		expect(mergeGlyphs(43, 124)).toBe(43);
		expect(mergeGlyphs(37, 47)).toBe(37);
		expect(mergeGlyphs(37, 95)).toBe(37);
		expect(mergeGlyphs(88, 92)).toBe(88);
		expect(mergeGlyphs(88, 124)).toBe(88);
	});

	it('paints over ink outside the brush vocabulary', () => {
		expect(mergeGlyphs(65, 36)).toBe(36);
		expect(mergeGlyphs(219, 46)).toBe(46);
	});
});

describe('terminal joins', () => {
	const UND = 95;
	const SPACE = 32;
	const tip = (
		dx: number,
		dy: number,
		cls: import('../../src/js/core/asciiStamp.js').SlopeClass = 'steep',
	) => ({ dx, dy, cls });

	it('a rising tip hangs its leg below the bar', () => {
		const DASH = 45;
		// Rowan's 7 fix: / climbing right into a line
		expect(junctionForTip(tip(1, -1), DASH, DASH, DASH)).toBe(55);
		// mirror lean takes r
		expect(junctionForTip(tip(-1, -1), DASH, DASH, DASH)).toBe(114);
		// dead vertical from below takes T mid line
		expect(junctionForTip(tip(0, -1, 'vertical'), DASH, DASH, DASH)).toBe(84);
		// at a line end the bar leans along the line instead
		expect(junctionForTip(tip(0, -1, 'vertical'), DASH, DASH, SPACE)).toBe(55);
		expect(junctionForTip(tip(0, -1, 'vertical'), DASH, SPACE, DASH)).toBe(114);
	});

	it('a rising tip knots an underscore line with a period', () => {
		// underscore ink hugs the cell bottom: a top barred 7, r, or T
		// floats above it, the period sits on the baseline the stem
		// already touches
		expect(junctionForTip(tip(0, -1, 'vertical'), UND, UND, UND)).toBe(46);
		expect(junctionForTip(tip(1, -1), UND, UND, UND)).toBe(46);
		expect(junctionForTip(tip(-1, -1), UND, UND, UND)).toBe(46);
	});

	it('a stroke end emits tip and root metadata for the controller', () => {
		const engine = createAsciiStampEngine();
		engine.begin(3, 8, 1);
		engine.move(3, 12, 1);
		const out = engine.end();
		const tipCell = out.find(c => c.tip);
		const rootCell = out.find(c => c.root);
		expect(tipCell).toMatchObject({
			x: 3,
			y: 12,
			tip: { dx: 0, dy: 1, cls: 'vertical' },
		});
		expect(rootCell).toMatchObject({
			x: 3,
			y: 8,
			root: { dx: 0, dy: 1, cls: 'vertical' },
		});
	});

	it('a falling tip hooks toward where the line continues', () => {
		expect(junctionForTip(tip(0, 1, 'vertical'), UND, SPACE, UND)).toBe(76);
		expect(junctionForTip(tip(0, 1, 'vertical'), UND, UND, SPACE)).toBe(74);
		expect(junctionForTip(tip(0, 1, 'vertical'), UND, UND, UND)).toBe(43);
		// diagonals point the hook back along their own travel
		expect(junctionForTip(tip(1, 1), UND, UND, UND)).toBe(74);
		expect(junctionForTip(tip(-1, 1), UND, UND, UND)).toBe(76);
	});

	it('a sideways tip against a bar takes the plus', () => {
		expect(junctionForTip(tip(1, 0, 'shallow'), 124, SPACE, SPACE)).toBe(43);
	});

	it('grazes and empty contact stay silent', () => {
		// parallel touch on horizontal ink is a graze, not a join
		expect(junctionForTip(tip(1, 0, 'shallow'), UND, UND, UND)).toBe(0);
		expect(junctionForTip(tip(1, -1), SPACE, UND, UND)).toBe(0);
		expect(junctionForTip(tip(1, -1), 36, 36, 36)).toBe(0);
	});
});
