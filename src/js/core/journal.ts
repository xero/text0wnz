/**
 * Autosave journal format: an append-only byte log the OPFS worker
 * writes incrementally via createSyncAccessHandle (with an
 * IndexedDB blob fallback for Safari 15.0-15.1). This module is the
 * pure format layer: record framing, stroke serialization, replay, and
 * the compaction policy. File IO lives in the client store; everything
 * here runs anywhere.
 *
 * Layout: 'T0WJ' magic + u8 version, then records of
 * `[u32 LE payloadLen][u8 type][payload][u32 LE crc32(type+payload)]`.
 * Record types: 1 = keyframe (payload is a full t0wnz-doc envelope),
 * 2 = stroke (one committed patch-arena stroke). Doc-level mutations
 * that strokes cannot express (resize, palette edits, frame add/remove,
 * ice/spacing flips) are journaled by writing a fresh keyframe.
 *
 * Replay starts at the LAST valid keyframe and applies the stroke
 * records after it. A torn tail (crash mid-append) parses as an invalid
 * frame: replay stops there and reports it, never throws. Compaction
 * rewrites the file as header + one fresh keyframe; the store swaps
 * files at keyframes/idle so the journal never grows unbounded.
 */

import { DocV3 } from './doc.js';
import { CommittedStroke, PlaneName, StrokeMeta } from './patchArena.js';
import { DocMeta } from './codecs/bin.js';
import {
	EncodeEnvelopeOptions,
	decodeEnvelope,
	encodeEnvelope,
} from './codecs/envelope.js';
import {
	CodecError,
	concatBytes,
	crc32,
	readLE32,
	writeLE32,
} from './codecs/util.js';

export const JOURNAL_MAGIC = 'T0WJ';
export const JOURNAL_VERSION = 1;
export const RECORD_KEYFRAME = 1;
export const RECORD_STROKE = 2;

const HEADER_SIZE = 5;
/** Frame overhead: u32 length + u8 type + u32 crc. */
const FRAME_OVERHEAD = 9;

/**
 * Compaction policy defaults: rewrite once the strokes since the last
 * keyframe outweigh it, or after enough strokes that replay would lag.
 */
export const DEFAULT_COMPACT_BYTES = 4 * 1024 * 1024;
export const DEFAULT_COMPACT_STROKES = 512;

export const shouldCompact = (
	state: { bytesSinceKeyframe: number; strokesSinceKeyframe: number },
	limits: { bytes?: number; strokes?: number } = {},
): boolean =>
	state.bytesSinceKeyframe >= (limits.bytes ?? DEFAULT_COMPACT_BYTES) ||
	state.strokesSinceKeyframe >= (limits.strokes ?? DEFAULT_COMPACT_STROKES);

// ---------------------------------------------------------------- framing

const frameRecord = (type: number, payload: Uint8Array): Uint8Array => {
	const out = new Uint8Array(FRAME_OVERHEAD + payload.length);
	writeLE32(out, 0, payload.length);
	out[4] = type;
	out.set(payload, 5);
	writeLE32(
		out,
		5 + payload.length,
		crc32(out.subarray(4, 5 + payload.length)),
	);
	return out;
};

export interface JournalRecord {
	type: number;
	payload: Uint8Array;
	/** Byte offset of the record frame inside the journal. */
	offset: number;
	/** Total frame size in bytes. */
	size: number;
}

export interface JournalScan {
	records: JournalRecord[];
	/** Index into records of the last keyframe, or -1. */
	lastKeyframe: number;
	/** Bytes of valid journal; anything past this is a torn tail. */
	validLength: number;
	tornTail: boolean;
}

/** Walk the journal, stopping cleanly at the first invalid frame. */
export const scanJournal = (bytes: Uint8Array): JournalScan => {
	if (
		bytes.length < HEADER_SIZE ||
		String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !==
			JOURNAL_MAGIC
	) {
		throw new CodecError('not a t0wnz journal (bad magic)');
	}
	if (bytes[4] > JOURNAL_VERSION) {
		throw new CodecError(
			`journal version ${bytes[4]} is newer than this reader (${JOURNAL_VERSION})`,
		);
	}
	const records: JournalRecord[] = [];
	let lastKeyframe = -1;
	let at = HEADER_SIZE;
	while (at + FRAME_OVERHEAD <= bytes.length) {
		const payloadLength = readLE32(bytes, at);
		const size = FRAME_OVERHEAD + payloadLength;
		if (at + size > bytes.length) {
			break; // truncated mid-record: torn tail
		}
		const body = bytes.subarray(at + 4, at + 5 + payloadLength);
		if (readLE32(bytes, at + 5 + payloadLength) !== crc32(body)) {
			break; // corrupt record: everything from here on is suspect
		}
		const type = bytes[at + 4];
		records.push({
			type,
			payload: bytes.subarray(at + 5, at + 5 + payloadLength),
			offset: at,
			size,
		});
		if (type === RECORD_KEYFRAME) {
			lastKeyframe = records.length - 1;
		}
		at += size;
	}
	return {
		records,
		lastKeyframe,
		validLength: at,
		tornTail: at < bytes.length,
	};
};

// ---------------------------------------------------------------- strokes

const PLANE_IDS: ReadonlyArray<PlaneName> = ['glyph', 'fg', 'bg'];

const encodeStrokePayload = (stroke: CommittedStroke): Uint8Array => {
	const userId = stroke.meta.userId;
	// userId flag: 0 none, 1 utf-8 string, 2 number (as decimal text)
	let userFlag = 0;
	let userBytes = new Uint8Array(0);
	if (typeof userId === 'string') {
		userFlag = 1;
		userBytes = new TextEncoder().encode(userId);
	} else if (typeof userId === 'number') {
		userFlag = 2;
		userBytes = new TextEncoder().encode(String(userId));
	}
	if (userBytes.length > 0xff) {
		throw new CodecError('stroke userId longer than 255 bytes');
	}
	const planes = PLANE_IDS.map((plane, id) => ({
		id,
		flat: stroke.patches[plane],
	})).filter((entry): entry is { id: number; flat: Uint32Array } =>
		Boolean(entry.flat && entry.flat.length),
	);
	let size = 4 + 1 + 1 + userBytes.length + 1;
	for (const { flat } of planes) {
		size += 1 + 4 + flat.length * 4;
	}
	const out = new Uint8Array(size);
	let at = 0;
	writeLE32(out, at, stroke.meta.frame);
	at += 4;
	out[at++] = userFlag;
	out[at++] = userBytes.length;
	out.set(userBytes, at);
	at += userBytes.length;
	out[at++] = planes.length;
	for (const { id, flat } of planes) {
		out[at++] = id;
		writeLE32(out, at, flat.length / 3);
		at += 4;
		for (let i = 0; i < flat.length; i++) {
			writeLE32(out, at, flat[i]);
			at += 4;
		}
	}
	return out;
};

export interface DecodedStroke {
	meta: StrokeMeta;
	patches: Partial<Record<PlaneName, Uint32Array>>;
}

export const decodeStrokePayload = (payload: Uint8Array): DecodedStroke => {
	if (payload.length < 7) {
		throw new CodecError('stroke record too short');
	}
	let at = 0;
	const frame = readLE32(payload, at);
	at += 4;
	const userFlag = payload[at++];
	const userLength = payload[at++];
	let userId: string | number | undefined;
	if (userFlag !== 0) {
		const text = new TextDecoder().decode(
			payload.subarray(at, at + userLength),
		);
		userId = userFlag === 2 ? Number(text) : text;
		at += userLength;
	}
	const planeCount = payload[at++];
	const patches: Partial<Record<PlaneName, Uint32Array>> = {};
	for (let p = 0; p < planeCount; p++) {
		const planeId = payload[at++];
		const plane = PLANE_IDS[planeId];
		if (!plane) {
			throw new CodecError(`stroke record names unknown plane ${planeId}`);
		}
		const triples = readLE32(payload, at);
		at += 4;
		if (at + triples * 12 > payload.length) {
			throw new CodecError('stroke record truncated');
		}
		const flat = new Uint32Array(triples * 3);
		for (let i = 0; i < flat.length; i++) {
			flat[i] = readLE32(payload, at);
			at += 4;
		}
		patches[plane] = flat;
	}
	return { meta: { frame, userId }, patches };
};

// ------------------------------------------------------------ public API

/** Header + one keyframe: a fresh journal (also the compacted form). */
export const createJournal = async (
	doc: DocV3,
	options: EncodeEnvelopeOptions = {},
): Promise<Uint8Array> => {
	const header = new Uint8Array(HEADER_SIZE);
	for (let i = 0; i < JOURNAL_MAGIC.length; i++) {
		header[i] = JOURNAL_MAGIC.charCodeAt(i);
	}
	header[4] = JOURNAL_VERSION;
	// the same record a doc-level mutation appends; inlining it here
	// once let the two drift apart
	return concatBytes([header, await encodeKeyframeRecord(doc, options)]);
};

/** Bytes to append for one committed stroke. */
export const encodeStrokeRecord = (stroke: CommittedStroke): Uint8Array =>
	frameRecord(RECORD_STROKE, encodeStrokePayload(stroke));

/** Bytes to append for a doc-level mutation (fresh keyframe record). */
export const encodeKeyframeRecord = async (
	doc: DocV3,
	options: EncodeEnvelopeOptions = {},
): Promise<Uint8Array> =>
	frameRecord(RECORD_KEYFRAME, await encodeEnvelope(doc, options));

export interface ReplayResult {
	doc: DocV3;
	meta: DocMeta;
	fontBytes: Uint8Array | null;
	fontHeight: number | null;
	/** Stroke records applied after the last keyframe. */
	strokesApplied: number;
	/** Stroke records dropped (unknown frame or out-of-range writes). */
	strokesSkipped: number;
	/** True when the journal ends in a torn or corrupt record. */
	tornTail: boolean;
}

export const replayJournal = async (
	bytes: Uint8Array,
): Promise<ReplayResult> => {
	const scan = scanJournal(bytes);
	if (scan.lastKeyframe < 0) {
		throw new CodecError('journal holds no keyframe');
	}
	const keyframe = scan.records[scan.lastKeyframe];
	const { doc, meta, fontBytes, fontHeight } = await decodeEnvelope(
		keyframe.payload,
	);
	let strokesApplied = 0;
	let strokesSkipped = 0;
	for (let i = scan.lastKeyframe + 1; i < scan.records.length; i++) {
		const record = scan.records[i];
		if (record.type !== RECORD_STROKE) {
			continue;
		}
		let stroke: DecodedStroke;
		try {
			stroke = decodeStrokePayload(record.payload);
		} catch {
			strokesSkipped++;
			continue;
		}
		const frame = doc.frames[stroke.meta.frame];
		if (!frame) {
			strokesSkipped++;
			continue;
		}
		let applied = false;
		for (const plane of PLANE_IDS) {
			const flat = stroke.patches[plane];
			if (!flat) {
				continue;
			}
			const target = frame[plane];
			for (let i2 = 0; i2 < flat.length; i2 += 3) {
				if (flat[i2] < target.length) {
					target[flat[i2]] = flat[i2 + 2];
					applied = true;
				}
			}
		}
		if (applied) {
			strokesApplied++;
		} else {
			strokesSkipped++;
		}
	}
	return {
		doc,
		meta,
		fontBytes,
		fontHeight,
		strokesApplied,
		strokesSkipped,
		tornTail: scan.tornTail,
	};
};
