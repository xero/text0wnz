import { describe, expect, it } from 'vitest';
import {
	amigaCircleCells,
	amigaCircleFilledCells,
	asciiCircleCells,
} from '../../src/js/core/circleStamp.js';

type Stamp = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
) => Array<{ x: number; y: number; charCode: number }>;

/**
 * Golden harness: render the stamped cells as text and compare against
 * inline ascii art, like the stamp engine goldens. Grammar details are
 * owner tuned by feel, so a golden moving is fine when the change is
 * the intended look; symmetry and safety are the hard contracts.
 */
const renderWith = (
	stamp: Stamp,
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
): string => {
	const grid = new Map<string, number>();
	for (const c of stamp(cx, cyHb, rx, rhb)) {
		grid.set(`${c.x},${c.y}`, c.charCode);
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

const render = (cx: number, cyHb: number, rx: number, rhb: number): string =>
	renderWith(amigaCircleCells, cx, cyHb, rx, rhb);

const renderThin = (
	cx: number,
	cyHb: number,
	rx: number,
	rhb: number,
): string => renderWith(asciiCircleCells, cx, cyHb, rx, rhb);

/** Mirror pair check shared by both dialect property tests. */
const expectMirrored = (
	stamp: Stamp,
	pairs: Map<number, number>,
	sizes: Array<[number, number]>,
	standing: number[] = [],
) => {
	for (const [rx, rhb] of sizes) {
		const grid = new Map<string, number>();
		for (const c of stamp(40, 40, rx, rhb)) {
			grid.set(`${c.x},${c.y}`, c.charCode);
		}
		for (const [k, c] of grid) {
			const [x, y] = k.split(',').map(Number);
			if (x === 40) {
				continue;
			}
			const twin = grid.get(`${80 - x},${y}`);
			expect(
				twin,
				`missing mirror of ${x},${y} at rx ${rx} rhb ${rhb}`,
			).toBeDefined();
			// one way maps (thin backtick to apostrophe) pass in either
			// direction; standing glyphs hold their own ground
			const flipped = pairs.get(c) ?? c;
			const ok =
				twin === flipped ||
				pairs.get(twin as number) === c ||
				(twin === c && standing.includes(c));
			expect(
				ok,
				`glyph mismatch at ${x},${y} rx ${rx} rhb ${rhb}: ${c} vs ${twin}`,
			).toBe(true);
		}
	}
};

describe('amiga circle stamp', () => {
	it('voices a medium circle in the quadrant grammar', () => {
		expect(render(60, 60, 11, 12)).toBe(
			[
				'      ,,dd"""bb,,',
				'  ,gdP"         "Ybg,',
				' ,8"               "8,',
				",8'                 `8,",
				"d'                   `b",
				'8:                   :8',
				'8:                   :8',
				'Y,                   ,P',
				"`8,                 ,8'",
				" `8,               ,8'",
				"  `Ya             aP'",
				'     `"Yba, ,adP"\'',
				'      `"YbaaadP"\'',
			].join('\n'),
		);
	});

	it('voices a small circle above the template band', () => {
		expect(render(60, 60, 7, 8)).toBe(
			[
				'   ,,dd"bb,,',
				',dP"       "Yb,',
				"d'           `b",
				'8:           :8',
				'8:           :8',
				'Y,           ,P',
				"`Ya         aP'",
				"  `Yba   adP'",
				'   `"YbadP"\'',
			].join('\n'),
		);
	});

	it('keeps tops breathing and bottoms anchored on wide ellipses', () => {
		expect(render(60, 60, 16, 7)).toBe(
			[
				'      ,,ggddY"""""""Ybbgg,,',
				'   ,dP"                   "Yb,',
				',gdP"                       "Ybg,',
				"d'                             `b",
				'Y,                             ,P',
				"`Ya                           aP'",
				'   `"Yba,               ,adP"\'',
				'      ``""YYbaaaaaaadPP""\'\'',
			].join('\n'),
		);
	});

	it('spans wide flat shoulders with the corner dress', () => {
		expect(render(60, 60, 30, 4)).toBe(
			[
				'       ,,ggddY"""""""""""""""""""""""""""""""""Ybbgg,,',
				'dP""""""                                             """"""Yb',
				'Ybaaaaa,                                             ,aaaaadP',
				'      `"YYbbaaa,                             ,aaaddPP"\'',
				'       ``""YYbaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaadPP""\'\'',
			].join('\n'),
		);
	});

	it('rounds one corner chisel per side however steep the rim', () => {
		const lines = render(60, 60, 6, 40).split('\n');
		const tops = lines.filter(l => l.trim().startsWith("d'"));
		const bottoms = lines.filter(l => l.trim().startsWith('Y,'));
		expect(tops.length).toBe(1);
		expect(bottoms.length).toBe(1);
	});

	it('renders a flat drag as a dressed lens', () => {
		expect(render(60, 60, 8, 0)).toBe(',,ggddY"""Ybbgg,,');
		expect(render(60, 60, 8, 1)).toBe(
			[',,ggddY"""Ybbgg,,', '``""YYbaaadPP""\'\''].join('\n'),
		);
	});

	it('stamps the owner five row template verbatim, R flourish intact', () => {
		expect(render(60, 60, 4, 5)).toBe(
			[' ,gPPRg,', "dP'   `Yb", '8)     (8', 'Yb     dP', ' "8ggg8"'].join(
				'\n',
			),
		);
	});

	it('stamps the owner four row template at the smallest sizes', () => {
		expect(render(60, 60, 3, 4)).toBe(
			[' ,gPRg,', "dP'  `Yb", 'Yb    dP', ' "8gg8"'].join('\n'),
		);
	});

	it('grows a tap into the smallest template instead of crumbs', () => {
		expect(render(60, 60, 0, 0)).toBe(render(60, 60, 3, 4));
	});

	it('mirrors generated circles cell for cell across the center', () => {
		// cap shoulders stand unmirrored (Y both sides up top),
		// everything else swaps through the pair map
		expectMirrored(
			amigaCircleCells,
			new Map([
				[100, 98],
				[98, 100],
				[80, 89],
				[89, 80],
				[39, 96],
				[96, 39],
				[40, 41],
				[41, 40],
			]),
			[
				[7, 8],
				[11, 12],
				[23, 21],
				[16, 7],
				[5, 14],
				[30, 4],
				[6, 40],
				[1, 12],
				[2, 48],
			],
			[89, 80],
		);
	});

	it('emits finite cells for every size up to huge radii', () => {
		for (let rx = 0; rx <= 30; rx += 3) {
			for (let rhb = 0; rhb <= 30; rhb += 3) {
				for (const c of amigaCircleCells(50, 50, rx, rhb)) {
					expect(Number.isFinite(c.x)).toBe(true);
					expect(Number.isFinite(c.y)).toBe(true);
					expect(c.charCode).toBeGreaterThan(32);
				}
			}
		}
	});

	it('shrugs off degenerate and negative inputs', () => {
		expect(() => amigaCircleCells(10, 10, -3, -5)).not.toThrow();
		expect(() => amigaCircleCells(10, 10, -1, 20)).not.toThrow();
		expect(() => amigaCircleCells(10, 10, 20, -1)).not.toThrow();
		for (const c of amigaCircleCells(10, 10, -1, 20)) {
			expect(Number.isFinite(c.x)).toBe(true);
			expect(Number.isFinite(c.y)).toBe(true);
		}
	});
});

describe('thin circle stamp', () => {
	it('voices a medium circle in the owner reference vocabulary', () => {
		expect(renderThin(60, 60, 11, 12)).toBe(
			[
				'        .-"""-.',
				"    .--'       '--.",
				"  .'               '.",
				' /                   \\',
				'|                     |',
				'|                     |',
				'|                     |',
				'|                     |',
				'|                     |',
				' \\                   /',
				"  `.               .'",
				"    `--.       .--'",
				"        `-___-'",
			].join('\n'),
		);
	});

	it('condenses to a clean ring at small sizes', () => {
		expect(renderThin(60, 60, 4, 5)).toBe(
			[
				'  .-"-.',
				' /     \\',
				'|       |',
				'|       |',
				' \\     /',
				"  `-_-'",
			].join('\n'),
		);
	});

	it('stamps the paren ring templates at the smallest sizes', () => {
		expect(renderThin(60, 60, 3, 3)).toBe(
			[' ,---.', '(     )', " `---'"].join('\n'),
		);
		expect(renderThin(60, 60, 2, 2)).toBe([' ,-.', '(   )', " `-'"].join('\n'));
		expect(renderThin(60, 60, 0, 0)).toBe(renderThin(60, 60, 2, 2));
	});

	it('mirrors thin circles with the pebble pairs swapped', () => {
		expectMirrored(
			asciiCircleCells,
			new Map([
				[47, 92],
				[92, 47],
				[40, 41],
				[41, 40],
				[96, 39],
				[44, 46],
			]),
			[
				[7, 8],
				[11, 12],
				[23, 21],
				[16, 7],
				[5, 14],
				[30, 4],
				[6, 40],
				[4, 5],
				[1, 12],
			],
			// the cap rows stand their period leads on both ends
			[46],
		);
	});

	it('emits finite thin cells for every size up to huge radii', () => {
		for (let rx = 0; rx <= 30; rx += 3) {
			for (let rhb = 0; rhb <= 30; rhb += 3) {
				for (const c of asciiCircleCells(50, 50, rx, rhb)) {
					expect(Number.isFinite(c.x)).toBe(true);
					expect(Number.isFinite(c.y)).toBe(true);
					expect(c.charCode).toBeGreaterThan(32);
				}
			}
		}
	});
});

describe('amiga filled circle stamp', () => {
	const renderFilled = (
		cx: number,
		cyHb: number,
		rx: number,
		rhb: number,
	): string => renderWith(amigaCircleFilledCells, cx, cyHb, rx, rhb);

	it('voices the owner hand reference verbatim', () => {
		// owner drew the hollow tool output at this size, then hand
		// edited it solid on canvas; this golden IS that edit
		expect(renderFilled(40, 40, 9, 9)).toBe(
			[
				'    ,,d$$$$$b,,',
				'  ,d$$$$$$$$$$$b,',
				',d$$$$$$$$$$$$$$Yb,',
				'd$$$$$$$$$$$$$$$$$b',
				'8$$$$$$$$$$$$$$$$$8',
				'8$$$$$$$$$$$$$$$$$8',
				'Y$$$$$$$$$$$$$$$$$P',
				"`Y$$$$$$$$$$$$$$$P'",
				"  `Y$$$$$$$$$$$P'",
				'    `"Y$$$$$P"\'',
			].join('\n'),
		);
	});

	it('grows small drags into the solid templates', () => {
		expect(renderFilled(40, 40, 2, 3)).toBe(
			[' ,d$$b,', 'd$$$$$$b', 'Y$$$$$$P', " `Y$$P'"].join('\n'),
		);
		expect(renderFilled(40, 40, 4, 5)).toBe(
			[' ,d$$$b,', 'd$$$$$$$b', '8$$$$$$$8', 'Y$$$$$$$P', " `Y$$$P'"].join(
				'\n',
			),
		);
	});

	it('leaves no hole between the walls at any size', () => {
		for (const [rx, rhb] of [
			[6, 7],
			[9, 9],
			[14, 13],
			[24, 22],
			[12, 4],
			[5, 12],
		]) {
			for (const row of renderFilled(40, 40, rx, rhb).split('\n')) {
				expect(row.trim(), `rx ${rx} rhb ${rhb}`).not.toContain(' ');
			}
		}
	});

	it('keeps the hollow silhouette row for row', () => {
		// same drag, same disc: only the dress changes between the
		// hollow and solid dialects
		const spans = (
			cells: Array<{ x: number; y: number; charCode: number }>,
		) => {
			const rows = new Map<number, [number, number]>();
			for (const c of cells) {
				const s = rows.get(c.y) ?? [Infinity, -Infinity];
				rows.set(c.y, [Math.min(s[0], c.x), Math.max(s[1], c.x)]);
			}
			return rows;
		};
		for (const [rx, rhb] of [
			[6, 7],
			[9, 9],
			[14, 13],
			[16, 7],
			[5, 12],
		]) {
			const hollow = spans(amigaCircleCells(40, 40, rx, rhb));
			const solid = spans(amigaCircleFilledCells(40, 40, rx, rhb));
			expect(solid.size, `rx ${rx} rhb ${rhb}`).toBe(hollow.size);
			for (const [y, s] of hollow) {
				expect(solid.get(y), `row ${y} rx ${rx} rhb ${rhb}`).toEqual(s);
			}
		}
	});

	it('emits finite solid cells for every size up to huge radii', () => {
		for (let rx = 0; rx <= 30; rx += 3) {
			for (let rhb = 0; rhb <= 30; rhb += 3) {
				for (const c of amigaCircleFilledCells(50, 50, rx, rhb)) {
					expect(Number.isFinite(c.x)).toBe(true);
					expect(Number.isFinite(c.y)).toBe(true);
					expect(c.charCode).toBeGreaterThan(32);
				}
			}
		}
	});
});
