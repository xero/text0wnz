/**
 * Mapping fuzz: round-trip identity for the one shared
 * pointer-to-cell mapping across zooms 0.5-4, fractional
 * origins, dpr-snapped origins, and letter-spacing cell widths. The
 * e2e spec replays the same probe pattern through real DOM events on
 * chromium, webkit, and firefox; this file owns the exhaustive sweep.
 */
import { describe, it, expect } from 'vitest';
import {
	cellFromPoint,
	snapOrigin,
	clampCell,
	MappingError,
	type CellMetrics,
} from '../../src/js/core/mapping';

// probe generators, local since the sweep is their only caller: the
// top-left corner and the center points whose round trip through
// cellFromPoint is the mapping's spec
const pointFromCell = (x: number, y: number, m: CellMetrics) => ({
	clientX: m.originX + x * m.cellWidth,
	clientY: m.originY + y * m.cellHeight,
});
const cellCenter = (x: number, y: number, m: CellMetrics) => ({
	clientX: m.originX + x * m.cellWidth + m.cellWidth / 2,
	clientY: m.originY + y * m.cellHeight + m.cellHeight / 2,
});
const halfBlockCenter = (x: number, halfBlockY: number, m: CellMetrics) => ({
	clientX: m.originX + x * m.cellWidth + m.cellWidth / 2,
	clientY: m.originY + (halfBlockY * m.cellHeight) / 2 + m.cellHeight / 4,
});

const mulberry32 = (seed: number) => () => {
	seed |= 0;
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// zoom enters the metrics the same way the lazy font computes them:
// floor(basePx * zoom), letter spacing adds floor(1 * zoom)
const scaledMetrics = (
	baseW: number,
	baseH: number,
	zoom: number,
	letterSpacing: boolean,
	originX: number,
	originY: number,
) => ({
	cellWidth: Math.floor(baseW * zoom) + (letterSpacing ? Math.floor(zoom) : 0),
	cellHeight: Math.floor(baseH * zoom),
	originX,
	originY,
});

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 3.5, 4];
const DPRS = [1, 1.5, 2, 3];

describe('cell mapping round-trips', () => {
	it('cell centers map back to their cell at every zoom', () => {
		const rand = mulberry32(0x7e57);
		for (const zoom of ZOOMS) {
			for (let i = 0; i < 400; i++) {
				const m = scaledMetrics(
					8 + Math.floor(rand() * 9), // base width 8-16
					8 + Math.floor(rand() * 25), // base height 8-32
					zoom,
					rand() < 0.5,
					rand() * 2000 - 1000, // fractional origins, negative too
					rand() * 4000 - 2000,
				);
				const x = Math.floor(rand() * 200);
				const y = Math.floor(rand() * 3000);
				const p = cellCenter(x, y, m);
				const back = cellFromPoint(p.clientX, p.clientY, m);
				expect(back.x).toBe(x);
				expect(back.y).toBe(y);
				// a cell center always sits in that cell's TOP or BOTTOM half,
				// and both halves belong to row y
				expect(Math.floor(back.halfBlockY / 2)).toBe(y);
			}
		}
	});

	it('half-block centers map back to their half at every zoom', () => {
		const rand = mulberry32(0xb10c);
		for (const zoom of ZOOMS) {
			for (let i = 0; i < 400; i++) {
				const m = scaledMetrics(
					8 + Math.floor(rand() * 9),
					8 + Math.floor(rand() * 25),
					zoom,
					rand() < 0.5,
					rand() * 2000 - 1000,
					rand() * 4000 - 2000,
				);
				const x = Math.floor(rand() * 200);
				const halfBlockY = Math.floor(rand() * 6000);
				const p = halfBlockCenter(x, halfBlockY, m);
				const back = cellFromPoint(p.clientX, p.clientY, m);
				expect(back.x).toBe(x);
				expect(back.halfBlockY).toBe(halfBlockY);
				expect(back.y).toBe(Math.floor(halfBlockY / 2));
			}
		}
	});

	it('dpr-snapped origins keep the identity', () => {
		const rand = mulberry32(0xd9a1);
		for (const dpr of DPRS) {
			for (const zoom of ZOOMS) {
				for (let i = 0; i < 150; i++) {
					const m = scaledMetrics(
						8,
						16,
						zoom,
						rand() < 0.5,
						snapOrigin(rand() * 1000 - 500, dpr),
						snapOrigin(rand() * 1000 - 500, dpr),
					);
					const x = Math.floor(rand() * 120);
					const y = Math.floor(rand() * 500);
					const p = cellCenter(x, y, m);
					const back = cellFromPoint(p.clientX, p.clientY, m);
					expect([back.x, back.y]).toEqual([x, y]);
				}
			}
		}
	});

	it('every interior point of a cell maps to that cell', () => {
		const rand = mulberry32(0x1707);
		for (let i = 0; i < 2000; i++) {
			const zoom = ZOOMS[Math.floor(rand() * ZOOMS.length)];
			const m = scaledMetrics(
				8 + Math.floor(rand() * 9),
				8 + Math.floor(rand() * 25),
				zoom,
				rand() < 0.5,
				rand() * 2000 - 1000,
				rand() * 4000 - 2000,
			);
			const x = Math.floor(rand() * 200);
			const y = Math.floor(rand() * 1000);
			const corner = pointFromCell(x, y, m);
			// sample strictly inside: quarter-pixel margin off every edge
			const px = corner.clientX + 0.25 + rand() * (m.cellWidth - 0.5);
			const py = corner.clientY + 0.25 + rand() * (m.cellHeight - 0.5);
			const back = cellFromPoint(px, py, m);
			expect([back.x, back.y]).toEqual([x, y]);
		}
	});

	it('matches v2 getXYCoords semantics exactly (no clamping, floor)', () => {
		const m = { cellWidth: 8, cellHeight: 16, originX: 100, originY: 50 };
		expect(cellFromPoint(100, 50, m)).toEqual({ x: 0, y: 0, halfBlockY: 0 });
		expect(cellFromPoint(107.9, 65.9, m)).toEqual({
			x: 0,
			y: 0,
			halfBlockY: 1,
		});
		expect(cellFromPoint(108, 66, m)).toEqual({ x: 1, y: 1, halfBlockY: 2 });
		// points left/above the canvas go negative, exactly like v2
		expect(cellFromPoint(92, 33.9, m)).toEqual({
			x: -1,
			y: -2,
			halfBlockY: -3,
		});
	});

	it('clampCell pins capture-time overshoot to the document', () => {
		expect(clampCell({ x: -3, y: -1, halfBlockY: -2 }, 80, 25)).toEqual({
			x: 0,
			y: 0,
			halfBlockY: 0,
		});
		expect(clampCell({ x: 99, y: 40, halfBlockY: 81 }, 80, 25)).toEqual({
			x: 79,
			y: 24,
			halfBlockY: 49,
		});
		expect(clampCell({ x: 5, y: 6, halfBlockY: 13 }, 80, 25)).toEqual({
			x: 5,
			y: 6,
			halfBlockY: 13,
		});
	});

	it('rejects degenerate metrics', () => {
		expect(() =>
			cellFromPoint(0, 0, {
				cellWidth: 0,
				cellHeight: 16,
				originX: 0,
				originY: 0,
			}),
		).toThrow(MappingError);
		expect(() => snapOrigin(NaN, 2)).toThrow(MappingError);
		expect(() => snapOrigin(10, 0)).toThrow(MappingError);
	});
});
