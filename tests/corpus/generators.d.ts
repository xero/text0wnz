/**
 * Loose typings for the deterministic corpus generators so TS tests can
 * import them; the .js stays the single source of truth.
 */

export const lcg: (seed: number) => () => number;
export const textToBytes: (text: string) => Uint8Array;
export const concatBytes: (chunks: ReadonlyArray<Uint8Array>) => Uint8Array;
export const makeSauce: (options?: Record<string, unknown>) => Uint8Array;
export const makeAnsi: (options?: Record<string, unknown>) => Uint8Array;
export const makeUtf8Ansi: (options?: Record<string, unknown>) => Uint8Array;
export const makeBin: (options?: Record<string, unknown>) => Uint8Array;
export const makeXBinPalette: (seed?: number) => Uint8Array;
export const makeXBinFont: (
	glyphCount?: number,
	fontHeight?: number,
	seed?: number,
) => Uint8Array;
export const makeXBinRleRuns: (columns: number) => {
	cells: Uint16Array;
	rle: Uint8Array;
};
export const makeXBin: (options?: Record<string, unknown>) => Uint8Array;
export const makeCells: (
	columns: number,
	rows: number,
	seed?: number,
) => Uint16Array;
