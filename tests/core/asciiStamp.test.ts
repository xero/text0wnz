import { describe, expect, it } from 'vitest';
import { createAsciiStampEngine } from '../../src/js/core/asciiStamp.js';

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
		expect(stroke([[3, 0], [3, 4]])).toBe(['|', '|', '|', '|', '|'].join('\n'));
	});

	it('stamps 45 degree rising as slashes', () => {
		// drawn bottom left to top right
		expect(stroke([[0, 4], [4, 0]])).toBe(
			['    /', '   /', '  /', ' /', '/'].join('\n'),
		);
	});

	it('stamps 45 degree falling as backslashes', () => {
		expect(stroke([[0, 0], [4, 4]])).toBe(
			['\\', ' \\', '  \\', '   \\', '    \\'].join('\n'),
		);
	});

	it('breaks steep column steps with pebble pairs', () => {
		// BRUSH.md line 1 vocabulary; Bresenham phases the steps a row
		// later than the hand drawn ideal, which reads identically
		expect(stroke([[2, 0], [0, 4]])).toBe(
			['  |', '  |', " .'", ' |', ".'"].join('\n'),
		);
	});

	it('stamps shallow two per row as comma quote pairs', () => {
		// BRUSH.md line 3
		expect(stroke([[0, 4], [9, 0]])).toBe(
			[
				"        ,'",
				"      ,'",
				"    ,'",
				"  ,'",
				",'",
			].join('\n'),
		);
	});

	it('stamps shallow rows in one pebble voice despite length jitter', () => {
		// BRUSH.md line 4 vocabulary; Bresenham deals rows of 2 to 4
		// cells for this slope and the rhythm keeps them all pebble runs
		expect(stroke([[0, 4], [14, 0]])).toBe(
			[
				"             ,'",
				"         ,--'",
				"      ,-'",
				"  ,--'",
				",'",
			].join('\n'),
		);
	});

	it('bands long shallow rows through the underscore ramp', () => {
		// BRUSH.md line 5 vocabulary across Bresenham's 6/12/6 row deal
		expect(stroke([[0, 2], [23, 0]])).toBe(
			[
				'                  __.--"',
				'      ___...---"""',
				'__.--"',
			].join('\n'),
		);
	});

	it('mirrors shallow falling rows high to low', () => {
		expect(stroke([[0, 0], [14, 4]])).toBe(
			[
				'`.',
				'  `--.',
				'      `-.',
				'         `--.',
				'             `.',
			].join('\n'),
		);
	});

	it('stamps horizontal in the lower band as underscores', () => {
		expect(stroke([[0, 0, 1], [7, 0, 1]])).toBe('________');
	});

	it('stamps horizontal in the upper band as dashes', () => {
		expect(stroke([[0, 0, 0], [7, 0, 0]])).toBe('--------');
	});

	it('is invariant under draw direction', () => {
		const leftToRight = stroke([[0, 4], [14, 0]]);
		const rightToLeft = stroke([[14, 0], [0, 4]]);
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
				'`.                  /                   \\                   /',
				' `.                 /                    \\                 /',
				'   `.              /                       \\             /',
				"    `.          ,'                          \\          ,'",
				"      `.      ,-'                            `.      ,-'",
				"       `-____-'                               `-____-'",
			].join('\n'),
		);
	});

	it('stamps an upstroke exactly like the downstroke', () => {
		const down = stroke([[2, 0], [0, 6]]);
		const up = stroke([[0, 6], [2, 0]]);
		expect(up).toBe(down);
		expect(down).toContain(".'");
		expect(down).not.toContain("'|");
	});

	it('keeps stems when a run crosses them in one stroke', () => {
		// vertical first, then a horizontal pass through the same cell
		const engine = createAsciiStampEngine();
		const grid = new Map<string, number>();
		const apply = (cells: Array<{ x: number; y: number; charCode: number }>) =>
			cells.forEach(c => grid.set(`${c.x},${c.y}`, c.charCode));
		apply(engine.begin(3, 0, 1));
		apply(engine.move(3, 6, 1));
		apply(engine.move(0, 3, 1));
		apply(engine.move(6, 3, 1));
		apply(engine.end());
		expect(grid.get('3,3')).toBe(124);
	});
});
