/**
 * Pointer-to-cell mapping (PLAN §3.1): ONE pure function family shared
 * by hit-testing, drawing overlays, and tests, so every consumer agrees
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

/** Top-left corner of a cell, in client CSS px. */
export const pointFromCell = (
	x: number,
	y: number,
	m: CellMetrics,
): { clientX: number; clientY: number } => {
	checkMetrics(m);
	return {
		clientX: m.originX + x * m.cellWidth,
		clientY: m.originY + y * m.cellHeight,
	};
};

/** Center of a cell: the stable round-trip probe point. */
export const cellCenter = (
	x: number,
	y: number,
	m: CellMetrics,
): { clientX: number; clientY: number } => {
	checkMetrics(m);
	return {
		clientX: m.originX + x * m.cellWidth + m.cellWidth / 2,
		clientY: m.originY + y * m.cellHeight + m.cellHeight / 2,
	};
};

/** Center of a half-block (halfBlockY counts half-rows). */
export const halfBlockCenter = (
	x: number,
	halfBlockY: number,
	m: CellMetrics,
): { clientX: number; clientY: number } => {
	checkMetrics(m);
	return {
		clientX: m.originX + x * m.cellWidth + m.cellWidth / 2,
		clientY: m.originY + (halfBlockY * m.cellHeight) / 2 + m.cellHeight / 4,
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

/** Clamp a cell to document bounds (capture-time drags leave the canvas). */
export const clampCell = (
	cell: CellPoint,
	columns: number,
	rows: number,
): CellPoint => {
	const x = Math.min(Math.max(cell.x, 0), columns - 1);
	const y = Math.min(Math.max(cell.y, 0), rows - 1);
	const halfBlockY = Math.min(Math.max(cell.halfBlockY, 0), rows * 2 - 1);
	return { x, y, halfBlockY };
};
