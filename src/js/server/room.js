// @ts-check
/**
 * Collab room: Moebius-native semantics with the superset policies
 * layered on. Transport-free (a client is anything with
 * send(type, data)), so the protocol unit-tests without a network.
 *
 * Vanilla semantics follow moebiusXBIN server.js, Joint.message():
 * - the CONNECTED reply is {id, doc} for spectators, else
 *   {id, doc, users, chat_history, status}; JOIN goes to registered
 *   users only.
 * - DRAW reaches everyone INCLUDING spectators and EXCLUDING the
 *   sender (clients apply locally).
 * - SAUCE/ICE_COLORS/USE_9PX_FONT/CHANGE_FONT/SET_CANVAS_SIZE persist
 *   and broadcast including spectators.
 * - CURSOR/SELECTION/OPERATION/17-20/22 ride the default relay to
 *   registered users and are NEVER persisted; late joiners see stale
 *   palette/flips exactly like upstream.
 * - SET_BG is swallowed (upstream comments it out).
 *
 * Deliberate deltas from upstream:
 * - the room password gates EVERYONE (upstream lets nickless
 *   connections bypass it).
 * - spectators cannot draw by default but MAY chat, and they receive
 *   chat (upstream excludes them from the chat tier).
 * - malformed frames drop with a log line, never a crash.
 * - every mutation lands in a bounded op log (timelapse substrate).
 *
 * Extension suite (core/protocol/extensions.ts): every ext mutation
 * down-converts to the nearest vanilla frame for caps-less members so
 * mixed rooms stay coherent, and blocks carry an ext payload only
 * where the vanilla projection loses information.
 */

import {
	MoebiusAction,
	MoebiusStatus,
	MOEBIUS_EXTENSION_BASE,
	compressBlocks,
	EXT_BATCH_LIMIT,
	EXT_SUITE_CAP,
	T0wnzAction,
	blockToExtCell,
	compressExtCells,
	expandExtCells,
	extCellEquals,
	extCellToBlock,
	paletteWordsFromJoin,
	sanitizeExtDraw,
	sanitizeExtPalette,
} from '../core/index';
import { authCooldownMs, sanitize } from './utils.js';

export const ROOM_DEFAULTS = Object.freeze({
	columns: 80,
	rows: 25,
	chatHistoryLimit: 128,
	chatTextLimit: 140,
	nickLimit: 100,
	maxColumns: 1000,
	maxRows: 10000,
	opLogLimit: 10000,
	// count alone lets 10000 batches of 4096 cells hold ~40M objects,
	// and one EXT_TIMELAPSE stringifies the lot
	opLogByteLimit: 8 * 1024 * 1024,
	fontName: 'CP437 8x16',
});

/** @type {readonly string[]} */
export const SERVER_CAPS = Object.freeze([EXT_SUITE_CAP]);

const blankBlock = () => ({ code: 32, fg: 7, bg: 0 });

/** 0x00RRGGBB words -> the 16 {r,g,b} entries vanilla joiners expect
 * @param {number[] | Uint32Array} words */
const rgb8FromWords = words =>
	[...words.slice(0, 16)].map(w => ({
		r: (w >> 16) & 0xff,
		g: (w >> 8) & 0xff,
		b: w & 0xff,
	}));

/** sidecars from the 6-bit writer hold number[][] join palettes,
 * which the ancestor resolves to black, so restores renormalize. The
 * shape names the depth (arrays 6-bit, objects this server's 8-bit)
 * so the wire heuristic never guesses at a file we wrote: a dark
 * 8-bit palette would come back brighter
 * @param {*} palette the sidecar's join.palette, shape untrusted */
const normalizeJoinPalette = palette => {
	if (!Array.isArray(palette) || palette.length === 0) {
		return undefined;
	}
	try {
		const depth = Array.isArray(palette[0]) ? 6 : 8;
		return rgb8FromWords(paletteWordsFromJoin(palette, depth));
	} catch {
		return undefined; // corrupt sidecar palette: defaults stand
	}
};

/**
 * @typedef {object} RoomClient
 * @property {(type: number, data: object) => void} send
 */

/**
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {string} [options.password]
 * @param {{enabled?: boolean, canChat?: boolean, canDraw?: boolean}} [options.spectators]
 * @param {number} [options.columns]
 * @param {number} [options.rows]
 * @param {number} [options.maxColumns] resize wall
 * @param {number} [options.maxRows] resize wall
 * @param {number} [options.opLogLimit]
 * @param {number} [options.syncCooldownMs] per-user EXT_SYNC/TIMELAPSE rate limit
 * @param {(line: string) => void} [options.log]
 */
export const createRoom = (options = {}) => {
	const name = options.name ?? 'joint';
	const password = options.password ?? '';
	const spectators = {
		enabled: options.spectators?.enabled ?? true,
		canChat: options.spectators?.canChat ?? true,
		canDraw: options.spectators?.canDraw ?? false,
	};
	const maxColumns = options.maxColumns ?? ROOM_DEFAULTS.maxColumns;
	const maxRows = options.maxRows ?? ROOM_DEFAULTS.maxRows;
	const opLogLimit = options.opLogLimit ?? ROOM_DEFAULTS.opLogLimit;
	const syncCooldownMs = options.syncCooldownMs ?? 1000;
	const log = options.log ?? (() => {});

	// wire-shaped (block cells); persistence converts at the file
	// boundary
	const doc = {
		columns: options.columns ?? ROOM_DEFAULTS.columns,
		rows: options.rows ?? ROOM_DEFAULTS.rows,
		/** @type {{code: number, fg: number, bg: number, ext?: import('../core/index').ExtCell}[]} */
		data: [],
		title: '',
		author: '',
		group: '',
		comments: '',
		/** @type {import('../core/index').MoebiusPaletteEntry[] | undefined} */
		palette: undefined,
		/** @type {unknown} */
		font_bytes: undefined,
		/** @type {string} */
		font_name: ROOM_DEFAULTS.fontName,
		ice_colors: false,
		use_9px_font: false,
		/** @type {number[] | undefined} full ext palette, 0x00RRGGBB words */
		ext_palette: undefined,
	};
	doc.data = Array.from({ length: doc.columns * doc.rows }, blankBlock);

	/** fold the ext palette's classic 16 into the vanilla join shape
	 * @param {number[]} palette full ext palette, 0x00RRGGBB words */
	const bridgeToVanillaPalette = palette => {
		// doc.palette is always this server's 8-bit objects
		const bridge = paletteWordsFromJoin(doc.palette, 8);
		for (let i = 0; i < Math.min(16, palette.length); i++) {
			bridge[i] = palette[i];
		}
		return rgb8FromWords(bridge);
	};

	/** @type {Map<RoomClient, {id: number, nick: string | undefined, group: string, status: number, role: 'viewer' | 'editor', caps: string[] | null, lastSyncAt: number}>} */
	const members = new Map();
	/** @type {{id: number, nick: string, group: string, text: string, time: number}[]} */
	const chatHistory = [];
	/** @type {{t: number, type: number, data: object, seq: number, weight: number}[]} */
	const opLog = [];
	let nextId = 0;
	let dirty = false;
	// monotonic mutation counter: saves clear dirty ONLY if nothing
	// mutated while the write was in flight
	let dirtySeq = 0;
	// ext suite op counter: a gap on the client side is a missed op,
	// and the client answers it with EXT_SYNC
	let seq = 0;

	// timelapse baseline: the doc BEFORE the oldest logged op. Evicted
	// ops are absorbed so baseline + log always replays to the live doc
	/** @type {{columns: number, rows: number, cells: import('../core/index').ExtCell[]}} */
	const baseline = { columns: 0, rows: 0, cells: []};
	const resetBaseline = () => {
		baseline.columns = doc.columns;
		baseline.rows = doc.rows;
		baseline.cells = doc.data.map(blockToExtCell);
	};

	/** @param {{type: number, data: any}} op */
	const absorbIntoBaseline = op => {
		const { type, data } = op;
		/** @param {any} x @param {any} y @param {import('../core/index').ExtCell | null} cell */
		const putCell = (x, y, cell) => {
			if (
				cell &&
				Number.isInteger(x) &&
				Number.isInteger(y) &&
				x >= 0 &&
				y >= 0 &&
				x < baseline.columns &&
				y < baseline.rows
			) {
				baseline.cells[y * baseline.columns + x] = cell;
			}
		};
		if (type === MoebiusAction.DRAW && data?.block) {
			putCell(data.x, data.y, blockToExtCell(data.block));
		} else if (type === T0wnzAction.EXT_DRAW) {
			putCell(data.x, data.y, {
				u: data.u,
				a: data.a,
				fg: data.fg,
				bg: data.bg,
			});
		} else if (type === T0wnzAction.EXT_DRAW_BATCH && Array.isArray(data?.cells)) {
			for (const cell of data.cells) {
				putCell(cell.x, cell.y, {
					u: cell.u,
					a: cell.a,
					fg: cell.fg,
					bg: cell.bg,
				});
			}
		} else if (type === MoebiusAction.SET_CANVAS_SIZE) {
			const { columns, rows } = data;
			if (!Number.isInteger(columns) || !Number.isInteger(rows)) {
				return;
			}
			const next = Array.from({ length: columns * rows }, () =>
				blockToExtCell(blankBlock()));
			const copyCols = Math.min(columns, baseline.columns);
			const copyRows = Math.min(rows, baseline.rows);
			for (let y = 0; y < copyRows; y++) {
				for (let x = 0; x < copyCols; x++) {
					next[y * columns + x] =
						baseline.cells[y * baseline.columns + x];
				}
			}
			baseline.columns = columns;
			baseline.rows = rows;
			baseline.cells = next;
		}
	};

	resetBaseline();

	let opLogBytes = 0;
	/** @param {number} type @param {object} data @returns {number} seq */
	const pushOp = (type, data) => {
		seq++;
		// a rough byte weight per op bounds MEMORY, not just count: big
		// paste batches weigh thousands of count-one entries
		const weight = JSON.stringify(data)?.length ?? 64;
		opLog.push({ t: Date.now(), type, data, seq, weight });
		opLogBytes += weight;
		while (
			opLog.length > opLogLimit ||
			opLogBytes > ROOM_DEFAULTS.opLogByteLimit
		) {
			const oldest = opLog[0];
			absorbIntoBaseline(oldest);
			opLogBytes -= oldest.weight ?? 0;
			opLog.shift();
		}
		dirty = true;
		dirtySeq++;
		return seq;
	};

	/**
	 * @param {RoomClient | null} except
	 * @param {number} type
	 * @param {object} data
	 * @param {{spectators?: boolean, includeSelf?: boolean}} [tier]
	 */
	const broadcast = (except, type, data, tier = {}) => {
		for (const [client, user] of members) {
			if (client === except && !tier.includeSelf) {
				continue;
			}
			if (user.role === 'viewer' && !tier.spectators) {
				continue;
			}
			try {
				client.send(type, data);
			} catch {
				// a dead socket must not break the fanout; close() reaps it
			}
		}
	};

	/** @param {{caps: string[] | null}} user */
	const hasExt = user => user.caps?.includes(EXT_SUITE_CAP) === true;

	const paletteWords = () =>
		doc.ext_palette
			? Uint32Array.from(doc.ext_palette)
			: paletteWordsFromJoin(doc.palette, 8);

	/**
	 * vanilla is the down-converted frame(s), null when nothing is
	 * expressible. A caps sender gets EXT_ACK so its seq stream stays
	 * contiguous under exclude-sender echo semantics.
	 * @param {RoomClient} sender
	 * @param {{caps: string[] | null}} senderUser
	 * @param {number} opSeq
	 * @param {{type: number, data: object}} native
	 * @param {{type: number, data: object} | {type: number, data: object}[] | null} vanilla
	 * @param {{spectators?: boolean}} [tier]
	 */
	const fanoutMutation = (sender, senderUser, opSeq, native, vanilla, tier = {}) => {
		for (const [client, user] of members) {
			if (client === sender) {
				continue;
			}
			if (user.role === 'viewer' && !tier.spectators) {
				continue;
			}
			try {
				if (hasExt(user)) {
					client.send(native.type, { ...native.data, seq: opSeq });
				} else if (Array.isArray(vanilla)) {
					for (const frame of vanilla) {
						client.send(frame.type, frame.data);
					}
				} else if (vanilla) {
					client.send(vanilla.type, vanilla.data);
				}
			} catch {
				// dead sockets never break the fanout
			}
		}
		if (hasExt(senderUser)) {
			try {
				sender.send(T0wnzAction.EXT_ACK, { seq: opSeq });
			} catch {
				// dead socket; close() reaps it
			}
		}
	};

	/**
	 * A silently dropped mutation from a caps client would strand an
	 * entry in its pendingSends queue AND leave its apply-locally state
	 * diverged with no seq gap to notice. Refusals ack with the current
	 * seq and a refused flag: the client books the op off and resyncs.
	 * @param {RoomClient} client @param {{caps: string[] | null}} user
	 */
	const refuseAck = (client, user) => {
		if (hasExt(user)) {
			try {
				client.send(T0wnzAction.EXT_ACK, { seq, refused: true });
			} catch {
				// dead socket; close() reaps it
			}
		}
	};

	const syncPayload = () => ({
		seq,
		columns: doc.columns,
		rows: doc.rows,
		cells: compressExtCells(doc.data.map(blockToExtCell)),
		palette: doc.ext_palette ?? null,
		ice_colors: doc.ice_colors,
		use_9px_font: doc.use_9px_font,
		font_name: doc.font_name,
		title: doc.title,
		author: doc.author,
		group: doc.group,
		comments: doc.comments,
	});

	/**
	 * ice toggles and palette swaps change how ext cells project to
	 * vanilla blocks; recompute the stored vanilla views so late vanilla
	 * joiners and the interchange save never see a stale fold
	 */
	const reprojectExtBlocks = () => {
		const words = paletteWords();
		for (let i = 0; i < doc.data.length; i++) {
			const ext = doc.data[i].ext;
			if (ext) {
				doc.data[i] = { ...extCellToBlock(ext, doc.ice_colors, words), ext };
			}
		}
	};

	const usersList = () =>
		[...members.values()].map(u => ({
			id: u.id,
			nick: u.nick,
			group: u.group,
			status: u.status,
		}));

	const toJoinDoc = () => ({
		columns: doc.columns,
		rows: doc.rows,
		title: doc.title,
		author: doc.author,
		group: doc.group,
		comments: doc.comments,
		palette: doc.palette,
		font_bytes: doc.font_bytes,
		font_name: doc.font_name,
		ice_colors: doc.ice_colors,
		use_9px_font: doc.use_9px_font,
		compressed_data: compressBlocks(doc.data),
	});

	/**
	 * row-aware like Moebius libtextmode.js, resize_canvas(); a linear
	 * copy scrambles late joiners
	 * @param {number} columns @param {number} rows
	 */
	const resizeDoc = (columns, rows) => {
		const next = Array.from({ length: columns * rows }, blankBlock);
		const copyCols = Math.min(columns, doc.columns);
		const copyRows = Math.min(rows, doc.rows);
		for (let y = 0; y < copyRows; y++) {
			for (let x = 0; x < copyCols; x++) {
				next[y * columns + x] = doc.data[y * doc.columns + x];
			}
		}
		doc.columns = columns;
		doc.rows = rows;
		doc.data = next;
	};

	// repeated failures open an exponential cooldown during which every
	// attempt refuses instantly, or passwords brute-force at wire speed
	let authFailures = 0;
	let authCooldownUntil = 0;

	/**
	 * @param {RoomClient} client
	 * @param {Record<string, unknown>} data CONNECTED frame data
	 * @returns {boolean} connected
	 */
	const connect = (client, data) => {
		const nick = typeof data.nick === 'string' ? sanitize(data.nick, ROOM_DEFAULTS.nickLimit, false) : undefined;
		const pass = typeof data.pass === 'string' ? data.pass : '';
		// the password gates EVERYONE, spectators included
		if (password !== '') {
			if (pass === '') {
				// the client probe's shape, never a guess: it must not open
				// the cooldown (the pre-room gate applies the same rule)
				client.send(MoebiusAction.REFUSED, {});
				log(`${nick ?? 'spectator'} refused (no password)`);
				return false;
			}
			if (Date.now() < authCooldownUntil) {
				client.send(MoebiusAction.REFUSED, {});
				log('refused (auth cooldown)');
				return false;
			}
			if (pass !== password) {
				authFailures++;
				authCooldownUntil = Date.now() + authCooldownMs(authFailures);
				client.send(MoebiusAction.REFUSED, {});
				log(`${nick ?? 'spectator'} refused (bad password)`);
				return false;
			}
			authFailures = 0;
		}
		const isSpectator = nick === undefined;
		if (isSpectator && !spectators.enabled) {
			client.send(MoebiusAction.REFUSED, {});
			log('spectator refused (disabled)');
			return false;
		}
		const caps = Array.isArray(data.caps)
			? data.caps.filter(c => typeof c === 'string')
			: null;
		const id = nextId++;
		const user = {
			id,
			nick,
			group: typeof data.group === 'string' ? sanitize(data.group, ROOM_DEFAULTS.nickLimit, false) : '',
			status: isSpectator ? MoebiusStatus.WEB : MoebiusStatus.ACTIVE,
			role: /** @type {'viewer' | 'editor'} */ (
				isSpectator ? 'viewer' : 'editor'
			),
			caps,
			lastSyncAt: 0,
		};
		// reply shapes verbatim from Moebius server.js, the CONNECTED
		// case; caps ride along only for caps-aware clients (vanilla must
		// see exactly vanilla)
		const reply = isSpectator
			? { id, doc: toJoinDoc() }
			: {
					id,
					doc: toJoinDoc(),
					users: usersList(),
					chat_history: chatHistory,
					status: MoebiusStatus.ACTIVE,
				};
		if (caps !== null) {
			/** @type {Record<string, unknown>} */ (reply).caps = [...SERVER_CAPS];
		}
		members.set(client, user);
		client.send(MoebiusAction.CONNECTED, reply);
		if (hasExt(user)) {
			// the reply's doc is the quantized vanilla view; caps clients
			// adopt the snapshot that follows, which counts against the
			// sync rate limit
			user.lastSyncAt = Date.now();
			client.send(T0wnzAction.EXT_SYNC, syncPayload());
		}
		broadcast(client, MoebiusAction.JOIN, {
			id,
			nick,
			group: user.group,
			status: user.status,
		});
		log(`${nick ?? 'spectator'} joined ${name} as #${id}`);
		return true;
	};

	/**
	 * @param {RoomClient} client
	 * @param {{type: number, data: Record<string, any>}} frame
	 */
	const message = (client, frame) => {
		const user = members.get(client);
		if (!user) {
			return;
		}
		const { type, data } = frame;
		switch (type) {
			case MoebiusAction.DRAW: {
				if (user.role === 'viewer' && !spectators.canDraw) {
					return;
				}
				const { x, y, block } = data;
				if (
					!Number.isInteger(x) ||
					!Number.isInteger(y) ||
					x < 0 ||
					y < 0 ||
					x >= doc.columns ||
					y >= doc.rows ||
					typeof block !== 'object' ||
					block === null
				) {
					refuseAck(client, user);
					return;
				}
				/** @param {unknown} v @param {number} fallback @param {number} max */
				const clamp = (v, fallback, max) =>
					typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max
						? v
						: fallback;
				let code = clamp(block.code, 32, 0x10ffff);
				if (code >= 0xd800 && code <= 0xdfff) {
					// surrogate halves are not characters; one in the doc
					// poisons the ext projection and makes every save throw
					code = 63;
				}
				const cell = {
					code,
					fg: clamp(block.fg, 7, 255),
					bg: clamp(block.bg, 0, 255),
				};
				doc.data[y * doc.columns + x] = cell;
				const payload = { x, y, block: cell, id: user.id };
				const opSeq = pushOp(type, payload);
				// fan out the SANITIZED cell with the server-known id: the
				// stored doc and what peers render can never diverge, and ids
				// cannot be spoofed
				fanoutMutation(
					client,
					user,
					opSeq,
					{ type, data: payload },
					{ type, data: payload },
					{ spectators: true },
				);
				return;
			}
			case MoebiusAction.CHAT: {
				if (user.role === 'viewer' && !spectators.canChat) {
					return;
				}
				// viewers speak as themselves, or a nickless spectator could
				// broadcast ANY nick the frame claims; editors may rename
				const nick =
					user.role === 'editor' && typeof data.nick === 'string'
						? sanitize(data.nick, ROOM_DEFAULTS.nickLimit, false)
						: (user.nick ?? 'spectator');
				const text = typeof data.text === 'string' ? sanitize(data.text, ROOM_DEFAULTS.chatTextLimit, false) : '';
				if (text === '') {
					return;
				}
				// nick/group renames piggyback on chat, as in Moebius
				// server.js, the CHAT case
				if (user.role === 'editor' && nick !== '') {
					user.nick = nick;
				}
				if (typeof data.group === 'string') {
					user.group = sanitize(data.group, ROOM_DEFAULTS.nickLimit, false);
				}
				chatHistory.push({
					id: user.id,
					nick,
					group: user.group,
					text,
					time: Date.now(),
				});
				if (chatHistory.length > ROOM_DEFAULTS.chatHistoryLimit) {
					chatHistory.shift();
				}
				dirty = true;
				// without the seq bump a chat landing mid-save is marked
				// clean by that save's token and lost when the room empties
				dirtySeq++;
				// explicit shape: relaying junk fields would let a client
				// smuggle a fake `seq` into caps peers' streams
				broadcast(
					client,
					type,
					{ nick, group: user.group, text, id: user.id },
					{ spectators: true },
				);
				log(`${nick}: ${text}`);
				return;
			}
			case MoebiusAction.STATUS: {
				if (Number.isInteger(data.status)) {
					user.status = /** @type {number} */ (data.status);
				}
				broadcast(client, type, { id: user.id, status: user.status }, { includeSelf: true });
				return;
			}
			case MoebiusAction.SAUCE: {
				if (user.role === 'viewer') {
					return;
				}
				// clamped at intake: unbounded strings bloat the op log, the
				// sidecar JSON, and every broadcast
				/** @param {unknown} value @param {string} fallback @param {number} limit */
				const field = (value, fallback, limit) =>
					typeof value === 'string' ? value.slice(0, limit) : fallback;
				doc.title = field(data.title, doc.title, 35);
				doc.author = field(data.author, doc.author, 20);
				doc.group = field(data.group, doc.group, 20);
				doc.comments = field(data.comments, doc.comments, 64 * 64);
				const payload = {
					title: doc.title,
					author: doc.author,
					group: doc.group,
					comments: doc.comments,
					id: user.id,
				};
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					{ type, data: payload },
					{ spectators: true },
				);
				return;
			}
			case MoebiusAction.ICE_COLORS: {
				if (user.role === 'viewer') {
					return;
				}
				doc.ice_colors = data.value === true;
				// the blink fold in stored vanilla views depends on ice
				reprojectExtBlocks();
				const payload = { value: doc.ice_colors, id: user.id };
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					{ type, data: payload },
					{ spectators: true },
				);
				return;
			}
			case MoebiusAction.USE_9PX_FONT: {
				if (user.role === 'viewer') {
					return;
				}
				doc.use_9px_font = data.value === true;
				const payload = { value: doc.use_9px_font, id: user.id };
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					{ type, data: payload },
					{ spectators: true },
				);
				return;
			}
			case MoebiusAction.CHANGE_FONT: {
				if (user.role === 'viewer') {
					return;
				}
				if (typeof data.font_name === 'string') {
					doc.font_name = data.font_name.slice(0, 100);
				}
				const payload = { font_name: doc.font_name, id: user.id };
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					{ type, data: payload },
					{ spectators: true },
				);
				return;
			}
			case MoebiusAction.SET_CANVAS_SIZE: {
				if (user.role === 'viewer') {
					return;
				}
				const { columns, rows } = data;
				if (
					!Number.isInteger(columns) ||
					!Number.isInteger(rows) ||
					columns <= 0 ||
					rows <= 0 ||
					columns > maxColumns ||
					rows > maxRows
				) {
					refuseAck(client, user);
					return;
				}
				// NO throttle, deliberately: a dropped resize diverges the
				// sender's apply-locally state and the vanilla dialect has no
				// content resync (only caps clients recover, via EXT_SYNC)
				resizeDoc(columns, rows);
				const payload = { columns, rows, id: user.id };
				const opSeq = pushOp(type, payload);
				// rebuilt shape with the SERVER-known id: vanilla clients
				// crash without an id, and relayed client ids are forgeable
				fanoutMutation(
					client,
					user,
					opSeq,
					{ type, data: payload },
					{ type, data: payload },
					{ spectators: true },
				);
				log(`canvas resized ${columns}x${rows}`);
				return;
			}
			case T0wnzAction.EXT_DRAW: {
				if (!hasExt(user)) {
					return;
				}
				if (user.role === 'viewer' && !spectators.canDraw) {
					return;
				}
				const draw = sanitizeExtDraw(data, doc.columns, doc.rows);
				if (!draw) {
					refuseAck(client, user);
					return;
				}
				const { x, y } = draw;
				const ext = { u: draw.u, a: draw.a, fg: draw.fg, bg: draw.bg };
				const block = extCellToBlock(ext, doc.ice_colors, paletteWords());
				// ext payload only where the vanilla block loses information
				doc.data[y * doc.columns + x] = extCellEquals(
					blockToExtCell(block),
					ext,
				)
					? block
					: { ...block, ext };
				const payload = { x, y, ...ext, id: user.id };
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					{
						type: MoebiusAction.DRAW,
						data: { x, y, block, id: user.id },
					},
					{ spectators: true },
				);
				return;
			}
			case T0wnzAction.EXT_DRAW_BATCH: {
				if (!hasExt(user)) {
					return;
				}
				if (user.role === 'viewer' && !spectators.canDraw) {
					return;
				}
				if (
					!Array.isArray(data.cells) ||
					data.cells.length === 0 ||
					data.cells.length > EXT_BATCH_LIMIT
				) {
					refuseAck(client, user);
					return;
				}
				const words = paletteWords();
				const applied = [];
				const vanillaFrames = [];
				for (const raw of data.cells) {
					const draw = sanitizeExtDraw(raw ?? {}, doc.columns, doc.rows);
					if (!draw) {
						continue;
					}
					const ext = { u: draw.u, a: draw.a, fg: draw.fg, bg: draw.bg };
					const block = extCellToBlock(ext, doc.ice_colors, words);
					doc.data[draw.y * doc.columns + draw.x] = extCellEquals(
						blockToExtCell(block),
						ext,
					)
						? block
						: { ...block, ext };
					applied.push(draw);
					vanillaFrames.push({
						type: MoebiusAction.DRAW,
						data: { x: draw.x, y: draw.y, block, id: user.id },
					});
				}
				if (applied.length === 0) {
					refuseAck(client, user);
					return;
				}
				// one op, one seq; vanilla peers get it as per-cell DRAWs
				const payload = { cells: applied, id: user.id };
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					vanillaFrames,
					{ spectators: true },
				);
				return;
			}
			case T0wnzAction.EXT_SYNC: {
				if (!hasExt(user)) {
					return;
				}
				// a tiny request frame makes the server walk the whole doc:
				// per-user cooldown (the honest client already has one)
				const now = Date.now();
				if (now - user.lastSyncAt < syncCooldownMs) {
					return;
				}
				user.lastSyncAt = now;
				try {
					client.send(T0wnzAction.EXT_SYNC, syncPayload());
				} catch {
					// dead socket; close() reaps it
				}
				return;
			}
			case T0wnzAction.EXT_PALETTE: {
				if (!hasExt(user) || user.role === 'viewer') {
					return;
				}
				const palette = sanitizeExtPalette(data.palette);
				if (!palette) {
					refuseAck(client, user);
					return;
				}
				doc.ext_palette = palette;
				// late vanilla joiners see the classic 16 through the join
				// palette; in-session vanilla peers keep a stale one
				// (upstream's own CHANGE_PALETTE precedent). EXACTLY 16, as
				// 8-bit {r,g,b} objects: vanilla clients index a short
				// palette blindly, and the ancestor resolves 6-bit arrays to
				// black
				doc.palette = bridgeToVanillaPalette(palette);
				reprojectExtBlocks();
				const payload = { palette, id: user.id };
				fanoutMutation(
					client,
					user,
					pushOp(type, payload),
					{ type, data: payload },
					null,
					{ spectators: true },
				);
				return;
			}
			case T0wnzAction.EXT_TIMELAPSE: {
				if (!hasExt(user)) {
					return;
				}
				const now = Date.now();
				if (now - user.lastSyncAt < syncCooldownMs) {
					return;
				}
				user.lastSyncAt = now;
				try {
					client.send(T0wnzAction.EXT_TIMELAPSE, {
						columns: baseline.columns,
						rows: baseline.rows,
						cells: compressExtCells(baseline.cells),
						palette: doc.ext_palette ?? null,
						// weight is op-log byte accounting, not wire contract
						ops: opLog.map(({ t, type, data, seq }) => ({
							t,
							type,
							data,
							seq,
						})),
					});
				} catch {
					// dead socket; close() reaps it
				}
				return;
			}
			case T0wnzAction.EXT_ACK:
				return; // server-emitted only
			case MoebiusAction.CONNECTED:
			case MoebiusAction.REFUSED:
			case MoebiusAction.JOIN:
			case MoebiusAction.LEAVE:
				// handshake/membership frames are server-emitted only; a
				// mid-session CONNECTED hitting the blind relay would leak
				// the pass field to peers and crash vanilla clients
				return;
			case MoebiusAction.SET_BG:
				return; // upstream swallows it
			default: {
				if (type >= MOEBIUS_EXTENSION_BASE) {
					// unknown FUTURE extension ids relay only between
					// caps-bearing registered peers; vanilla members never see
					// shapes they cannot parse
					if (user.caps === null || user.role === 'viewer') {
						return;
					}
					for (const [peer, peerUser] of members) {
						if (
							peer === client ||
							peerUser.role === 'viewer' ||
							peerUser.caps === null
						) {
							continue;
						}
						try {
							peer.send(type, data);
						} catch {
							// dead sockets never break the fanout
						}
					}
					return;
				}
				// Moebius server.js, the default case: a blind relay to
				// registered users, never persisted
				if (user.role === 'viewer') {
					return;
				}
				broadcast(client, type, data);
			}
		}
	};

	/** @param {RoomClient} client */
	const disconnect = client => {
		const user = members.get(client);
		if (!user) {
			return;
		}
		members.delete(client);
		broadcast(null, MoebiusAction.LEAVE, { id: user.id });
		log(`${user.nick ?? 'spectator'} left ${name}`);
	};

	return {
		name,
		connect,
		message,
		disconnect,
		toJoinDoc,
		/** @param {import('../core/index').MoebiusJoinDoc & {chat?: typeof chatHistory}} saved */
		loadState: saved => {
			if (
				Number.isInteger(saved.columns) &&
				Number.isInteger(saved.rows) &&
				Array.isArray(saved.data) &&
				saved.data.length === saved.columns * saved.rows
			) {
				doc.columns = saved.columns;
				doc.rows = saved.rows;
				doc.data = saved.data;
				doc.title = saved.title ?? '';
				doc.author = saved.author ?? '';
				doc.group = saved.group ?? '';
				doc.comments = saved.comments ?? '';
				doc.palette = normalizeJoinPalette(saved.palette);
				doc.font_bytes = saved.font_bytes;
				doc.font_name = saved.font_name ?? doc.font_name;
				doc.ice_colors = saved.ice_colors === true;
				doc.use_9px_font = saved.use_9px_font === true;
			}
			const savedChat = /** @type {any} */ (saved).chat;
			if (Array.isArray(savedChat)) {
				chatHistory.push(
					...savedChat.slice(-ROOM_DEFAULTS.chatHistoryLimit),
				);
			}
			// full-fidelity rider (sidecar or envelope restore): reattach
			// ext payloads where the vanilla block lost information
			const savedExt = /** @type {any} */ (saved).ext;
			if (savedExt && Array.isArray(savedExt.palette)) {
				const palette = sanitizeExtPalette(savedExt.palette);
				if (palette) {
					doc.ext_palette = palette;
					// the 6-bit join shape lost the low bits; the ext words
					// did not, so re-derive the exact classic 16 from them
					doc.palette = bridgeToVanillaPalette(palette);
				}
			}
			if (savedExt && Array.isArray(savedExt.cells)) {
				try {
					const cells = expandExtCells(
						savedExt.cells,
						doc.columns * doc.rows,
					);
					for (let i = 0; i < cells.length; i++) {
						if (!extCellEquals(blockToExtCell(doc.data[i]), cells[i])) {
							doc.data[i] = { ...doc.data[i], ext: cells[i] };
						}
					}
				} catch {
					// corrupt ext rider: the vanilla view stands
				}
			}
			// the restored doc is the new timelapse starting point
			resetBaseline();
		},
		extState: () => ({
			cells: compressExtCells(doc.data.map(blockToExtCell)),
			palette: doc.ext_palette ?? null,
		}),
		stats: () => ({
			name,
			users: usersList(),
			memberCount: members.size,
			columns: doc.columns,
			rows: doc.rows,
			opLogLength: opLog.length,
			seq,
			dirty,
		}),
		chatHistory: () => [...chatHistory],
		/** ignores ice/9px/dims: a blank canvas renders the same under
		 * them, and counting one-click toggles would make nearly every
		 * dirty room undeletable */
		isBlank: () =>
			chatHistory.length === 0 &&
			doc.title === '' &&
			doc.author === '' &&
			doc.group === '' &&
			doc.comments === '' &&
			doc.ext_palette === undefined &&
			doc.font_bytes === undefined &&
			doc.font_name === ROOM_DEFAULTS.fontName &&
			doc.data.every(
				block =>
					!block.ext &&
					(block.code === 32 || block.code === 0) &&
					block.bg === 0,
			),
		/** capture before a save begins; pass back to markClean */
		dirtyToken: () => dirtySeq,
		/** @param {number} [token] clears dirty only if nothing mutated since */
		markClean: token => {
			if (token === undefined || token === dirtySeq) {
				dirty = false;
			}
		},
		isDirty: () => dirty,
	};
};
