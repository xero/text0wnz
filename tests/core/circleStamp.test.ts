import { describe, expect, it } from 'vitest';
import { amigaCircleCells } from '../../src/js/core/circleStamp.js';

/**
 * Golden harness: render the stamped cells as text and compare against
 * inline ascii art, like the stamp engine goldens. Grammar details are
 * owner tuned by feel, so a golden moving is fine when the change is
 * the intended look; symmetry and safety are the hard contracts.
 */
const render = (cx: number, cyHb: number, rx: number, rhb: number): string => {
	const grid = new Map<string, number>();
	for (const c of amigaCircleCells(cx, cyHb, rx, rhb)) {
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
		const pairs = new Map([
			[100, 98],
			[98, 100],
			[80, 89],
			[89, 80],
			[39, 96],
			[96, 39],
			[40, 41],
			[41, 40],
		]);
		for (const [rx, rhb] of [
			[7, 8],
			[11, 12],
			[23, 21],
			[16, 7],
			[5, 14],
			[30, 4],
			[6, 40],
			[1, 12],
			[2, 48],
		]) {
			const grid = new Map<string, number>();
			for (const c of amigaCircleCells(40, 40, rx, rhb)) {
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
				// cap shoulders stand unmirrored (Y both sides up top),
				// everything else swaps through the pair map
				const flipped = pairs.get(c) ?? c;
				expect(
					twin === flipped || (twin === c && (c === 89 || c === 80)),
					`glyph mismatch at ${x},${y} rx ${rx} rhb ${rhb}: ${c} vs ${twin}`,
				).toBe(true);
			}
		}
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
