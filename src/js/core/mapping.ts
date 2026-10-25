/**
 * Pointer-to-cell mapping: ONE pure function family shared by
 * hit-testing, drawing overlays, and tests, so every consumer agrees
 * about which cell a pixel belongs to at every zoom.
 *
 * The formula is v2's getXYCoords transcribed exactly:
 *   cell = floor((client - origin) / cellPx)
 * where origin is the canvas container's bounding rect corner and
 * cellPx is the ALREADY-SCALED integer cell size the font reports
 * (floor(fontPx * zoom), letter spacing folded in). Zoom therefore
 * never appears below; it is baked into the metrics by the caller.
 * halfBlockY runs at twice the row rate for half-block tools.
 *
 * Round-trip guarantee (pinned by fuzz tests): mapping the CENTER of
 * any cell or half-block returns that cell identically. Corner points
 * sit on the floor() boundary where IEEE subtraction may land a hair
 * under the true value, so centers are the stable probe everywhere
 * (the e2e fuzz clicks centers for the same reason). snapOrigin()
 * quantizes a fractional bounding-rect origin to device pixels, which
 * is where dpr enters; the cell math itself is dpr-free CSS pixels.
 */

export interface CellMetrics {
	/** scaled cell width in CSS px (State.font.getWidth()) */
	cellWidth: number;
	/** scaled cell height in CSS px (State.font.getHeight()) */
	cellHeight: number;
	/** canvas container bounding rect left in CSS px */
	originX: number;
	/** canvas container bounding rect top in CSS px */
	originY: number;
}

export interface CellPoint {
	x: number;
	y: number;
	halfBlockY: number;
}

export class MappingError extends Error {}

const checkMetrics = (m: CellMetrics): void => {
	if (
		!(m.cellWidth > 0) ||
		!(m.cellHeight > 0) ||
		!Number.isFinite(m.originX) ||
		!Number.isFinite(m.originY)
	) {
		throw new MappingError(
			`bad cell metrics ${m.cellWidth}x${m.cellHeight} @ ${m.originX},${m.originY}`,
		);
	}
};

/** v2 getXYCoords, verbatim semantics: floor, no clamping. */
export const cellFromPoint = (
	clientX: number,
	clientY: number,
	m: CellMetrics,
): CellPoint => {
	checkMetrics(m);
	const relX = clientX - m.originX;
	const relY = clientY - m.originY;
	return {
		x: Math.floor(relX / m.cellWidth),
		y: Math.floor(relY / m.cellHeight),
		halfBlockY: Math.floor((relY / m.cellHeight) * 2),
	};
};

/**
 * Quantize a fractional bounding-rect origin to the device pixel grid.
 * At dpr > 1 getBoundingClientRect can report origins between device
 * pixels; snapping keeps repeated measurements of the same layout from
 * straddling a floor() boundary.
 */
export const snapOrigin = (origin: number, dpr: number): number => {
	if (!(dpr > 0) || !Number.isFinite(origin)) {
		throw new MappingError(`bad snap input ${origin} @ dpr ${dpr}`);
	}
	return Math.round(origin * dpr) / dpr;
};

/**
 * True when (x, y) is an integer cell inside a columns by rows grid.
 * The one bounds predicate for every write and read guard: fractional
 * or out of range cells wrap through y * columns + x into a
 * neighboring row, or no-op past the planes while side effects (undo
 * records, collab echoes) still fire.
 */
export const cellInRange = (
	x: number,
	y: number,
	columns: number,
	rows: number,
): boolean =>
	Number.isInteger(x) &&
	Number.isInteger(y) &&
	x >= 0 &&
	x < columns &&
	y >= 0 &&
	y < rows;

/** Clamp a cell to document bounds (capture-time drags leave the canvas). */
export const clampCell = (
	cell: CellPoint,
	columns: number,
	rows: number,
): CellPoint => {
	// min/max pass NaN through untouched, and a NaN cell downstream can
	// spin the stamp engine's bresenham walk forever
	const n = (v: number) => (Number.isFinite(v) ? v : 0);
	const x = Math.min(Math.max(n(cell.x), 0), columns - 1);
	const y = Math.min(Math.max(n(cell.y), 0), rows - 1);
	const halfBlockY = Math.min(Math.max(n(cell.halfBlockY), 0), rows * 2 - 1);
	return { x, y, halfBlockY };
};
