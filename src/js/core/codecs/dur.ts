/**
 * Durdraw .dur importer (PLAN.md §4 P2: import only, export lands with
 * the frames UI in P4). Normative reference: durformat.md in the
 * durdraw clone plus durdraw_file.py's loader. A .dur is gzipped JSON
 * holding a "DurMovie": metadata, canvas size, framerate, and frames of
 * full-width text lines ("contents") with a parallel fg/bg pair grid
 * ("colorMap").
 *
 * Versions: 8 is current; 7 differs only in key names (sizeX/sizeY vs
 * columns/lines) and a transposed colorMap (pair for contents[y][x]
 * lives at colorMap[x][y]). Versions below 7 are pickled Python, not
 * JSON, and are rejected. Color formats "16" and "256" only, per plan.
 *
 * Color semantics (durdraw order is the BIN/VGA attribute order, NOT
 * xterm SGR order):
 * - "256": fg/bg 0-15 index the 16-color list directly; 16-255 are
 *   xterm-256 cube/grayscale entries. The doc gets a 256-entry palette
 *   so every cell stays palette-indexed.
 * - "16": fg is 1-based (1 black .. 16 bright white); bg is 0-based
 *   0-7, with 8 as durdraw's "black duplicate".
 * Durdraw has no blink, so imports always turn ice colors on.
 */

import {
	DocV3,
	createDefaultPaletteRGB,
	createDocV3,
	glyphWord,
	paletteColor,
	rgbColor,
} from '../doc.js';
import { DocMeta } from './bin.js';
import { CodecError, gunzip } from './util.js';

export const DUR_MIN_VERSION = 7;
export const DUR_MAX_VERSION = 8;

interface DurFrameJson {
	delay?: number;
	contents?: string[];
	colorMap?: number[][][];
}

interface DurMovieJson {
	formatVersion?: number;
	colorFormat?: string | number;
	encoding?: string;
	name?: string;
	artist?: string;
	framerate?: number;
	columns?: number;
	lines?: number;
	sizeX?: number;
	sizeY?: number;
	frames?: DurFrameJson[];
}

/** xterm-256 entries 16-255: 6x6x6 color cube, then the gray ramp. */
const xterm256RGB = (index: number): number => {
	if (index >= 232) {
		const v = 8 + 10 * (index - 232);
		return rgbColor(v, v, v);
	}
	const cube = index - 16;
	const level = (n: number): number => (n === 0 ? 0 : 55 + n * 40);
	return rgbColor(
		level(Math.floor(cube / 36)),
		level(Math.floor(cube / 6) % 6),
		level(cube % 6),
	);
};

/** 16 VGA entries in durdraw/BIN order + xterm 16-255. */
export const createXterm256Palette = (): Uint32Array => {
	const palette = new Uint32Array(256);
	palette.set(createDefaultPaletteRGB());
	for (let i = 16; i < 256; i++) {
		palette[i] = xterm256RGB(i);
	}
	return palette;
};

export interface DurDecodeResult {
	doc: DocV3;
	meta: DocMeta;
	formatVersion: number;
	colorFormat: '16' | '256';
	encoding: 'utf-8' | 'cp437';
}

const GZIP_MAGIC = (bytes: Uint8Array): boolean =>
	bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

export const decodeDur = async (
	bytes: Uint8Array,
): Promise<DurDecodeResult> => {
	const text = new TextDecoder().decode(
		GZIP_MAGIC(bytes) ? await gunzip(bytes) : bytes,
	);
	let movie: DurMovieJson | undefined;
	try {
		movie = (JSON.parse(text) as { DurMovie?: DurMovieJson }).DurMovie;
	} catch {
		throw new CodecError('not a durdraw file (expected gzipped JSON)');
	}
	if (!movie || typeof movie !== 'object') {
		throw new CodecError('not a durdraw file (no DurMovie object)');
	}
	const version = movie.formatVersion ?? 0;
	if (version < DUR_MIN_VERSION) {
		throw new CodecError(
			`durdraw format version ${version} predates the JSON container (v7+)`,
		);
	}
	if (version > DUR_MAX_VERSION) {
		throw new CodecError(
			`durdraw format version ${version} is newer than this reader (v${DUR_MAX_VERSION})`,
		);
	}
	const colorFormat = String(movie.colorFormat);
	if (colorFormat !== '16' && colorFormat !== '256') {
		throw new CodecError(
			`unsupported durdraw color format ${JSON.stringify(movie.colorFormat)} (16/256 only)`,
		);
	}
	const columns = (version >= 8 ? movie.columns : movie.sizeX) ?? 0;
	const rows = (version >= 8 ? movie.lines : movie.sizeY) ?? 0;
	if (
		!Number.isInteger(columns) ||
		!Number.isInteger(rows) ||
		columns <= 0 ||
		rows <= 0
	) {
		throw new CodecError('durdraw movie has no usable canvas size');
	}
	const frames = movie.frames;
	if (!Array.isArray(frames) || frames.length === 0) {
		throw new CodecError('durdraw movie holds no frames');
	}
	const encoding =
		(movie.encoding ?? 'utf-8').toLowerCase() === 'cp437' ? 'cp437' : 'utf-8';
	const framerate = movie.framerate ?? 0;

	const is256 = colorFormat === '256';
	const doc = createDocV3({
		columns,
		rows,
		mode: is256 ? 'xterm256' : 'classic16',
		palette: is256 ? createXterm256Palette() : undefined,
		iceColors: true, // durdraw has no blink
		globalDelayMs: framerate > 0 ? Math.round(1000 / framerate) : undefined,
	});

	// durdraw's 16-color fg list is 1-based; bg is 0-based with 8 as a
	// second black. 256-color indexes are 0-based throughout.
	const fgWord = (value: number): number => {
		if (is256) {
			return paletteColor(value >= 0 && value <= 255 ? value : 7);
		}
		return paletteColor(value >= 1 && value <= 16 ? value - 1 : 0);
	};
	const bgWord = (value: number): number => {
		if (is256) {
			return paletteColor(value >= 0 && value <= 255 ? value : 0);
		}
		return paletteColor(value >= 0 && value <= 7 ? value : 0);
	};
	const defaultPair: readonly [number, number] = is256 ? [7, 0] : [8, 0];

	frames.forEach((frame, frameIndex) => {
		const index = frameIndex === 0 ? 0 : doc.addFrame({ force: true });
		const target = doc.frames[index];
		const contents = frame.contents ?? [];
		const colorMap = frame.colorMap ?? [];
		for (let y = 0; y < rows; y++) {
			// Iterate by codepoint: surrogate pairs are one glyph
			const line = Array.from(contents[y] ?? '');
			for (let x = 0; x < columns; x++) {
				const pair =
					(version >= 8 ? colorMap[y]?.[x] : colorMap[x]?.[y]) ?? defaultPair;
				const codepoint = (line[x] ?? ' ').codePointAt(0) ?? 32;
				const cell = y * columns + x;
				// idFor dedupes against the CP437 identity seed, so classic
				// chars keep ids 0-255 and only true unicode grows the table
				target.glyph[cell] = glyphWord(doc.glyphTable.idFor(0, codepoint), 0);
				target.fg[cell] = fgWord(pair[0] ?? defaultPair[0]);
				target.bg[cell] = bgWord(pair[1] ?? defaultPair[1]);
			}
		}
		const delay = frame.delay ?? 0;
		if (delay > 0) {
			target.delayMs = Math.round(delay * 1000);
		}
	});

	return {
		doc,
		meta: {
			...(movie.name ? { title: movie.name } : {}),
			...(movie.artist ? { author: movie.artist } : {}),
		},
		formatVersion: version,
		colorFormat,
		encoding,
	};
};
