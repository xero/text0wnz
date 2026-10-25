// @ts-check
/**
 * Collab room: Moebius-native semantics with the
 * superset policies layered on. Transport-free: callers hand in
 * client objects with a send(type, data) and we never touch sockets,
 * so the whole protocol surface unit-tests without a network.
 *
 * Vanilla semantics transcribed from moebiusXBIN app/server.js:
 * - CONNECTED first; reply carries {id, doc} (spectators) or
 *   {id, doc, users, chat_history, status}; JOIN broadcast to
 *   registered users.
 * - DRAW bounds-checks, mutates, broadcasts to everyone INCLUDING
 *   spectators and EXCLUDING the sender (clients apply locally).
 * - SAUCE/ICE_COLORS/USE_9PX_FONT/CHANGE_FONT/SET_CANVAS_SIZE persist
 *   and broadcast including spectators; SET_CANVAS_SIZE relays the
 *   sender's data verbatim, which keeps the id vanilla Moebius clients
 *   crash without.
 * - CURSOR/SELECTION/OPERATION/17-20/22 ride the default relay to
 *   registered users and are NEVER persisted; late joiners see stale
 *   palette/flips exactly like upstream (do-not-diverge rule).
 * - SET_BG is swallowed (upstream comments it out).
 *
 * Our deltas (owner decisions):
 * - a room password applies to EVERYONE, including nickless
 *   spectators (upstream lets nickless connections bypass it).
 * - spectators default to read-only drawing but MAY chat, and
 *   they receive chat (upstream excludes them from the chat tier).
 * - resize is row-aware (a linear copy scrambles late joiners).
 * - malformed frames are dropped with a log line, never a crash.
 * - every mutation lands in a bounded op log (timelapse substrate).
 *
 * Extension suite v1 (ids 23-27, cap "t0wnz-ext-1"):
 * caps-aware clients get full-fidelity cells (unicode + v3 color
 * words), a seq on every mutation plus EXT_ACK for their own, and
 * EXT_SYNC wholesale recovery. Every ext mutation is down-converted to
 * the nearest vanilla frame for caps-less members, so mixed rooms stay
 * coherent; ext payloads are stored on blocks only where the vanilla
 * projection loses information.
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
import { sanitize } from './utils.js';

export const ROOM_DEFAULTS = Object.freeze({
	columns: 80,
	rows: 25,
	chatHistoryLimit: 128,
	chatTextLimit: 140,
	nickLimit: 100,
	maxColumns: 1000,
	maxRows: 10000,
	opLogLimit: 10000,
	// count alone let 10000 batches of 4096 cells hold ~40M objects;
	// one EXT_TIMELAPSE stringified the lot
	opLogByteLimit: 8 * 1024 * 1024,
});

/** capability names our server advertises to caps-aware clients */
/** @type {readonly string[]} */
export const SERVER_CAPS = Object.freeze([EXT_SUITE_CAP]);

const blankBlock = () => ({ code: 32, fg: 7, bg: 0 });

/**
 * @typedef {object} RoomClient anything with a send; the server layer
 *   wraps sockets, tests pass plain objects
 * @property {(type: number, data: object) => void} send
 */

/**
 * @param {object} [options]
 * @param {string} [options.name]
 * @param {string} [options.password]
 * @param {{enabled?: boolean, canChat?: boolean, canDraw?: boolean}} [options.spectators]
 * @param {number} [options.columns]
 * @param {number} [options.rows]
 * @param {number} [options.maxColumns] resize wall (env knob; either direction)
 * @param {number} [options.maxRows] resize wall (env knob; either direction)
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

	// the live document, wire-shaped (block cells); persistence converts
	// through the shared codecs at the file boundary
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
		font_name: 'CP437 8x16',
		ice_colors: false,
		use_9px_font: false,
		/** @type {number[] | undefined} full ext palette, 0x00RRGGBB words */
		ext_palette: undefined,
	};
	doc.data = Array.from({ length: doc.columns * doc.rows }, blankBlock);

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
	// the extension suite's op counter: every accepted doc mutation gets
	// the next seq; caps clients receive it on broadcasts and acks, and
	// a gap on their side means a missed op (=> they request EXT_SYNC)
	let seq = 0;

	// timelapse baseline: the doc state BEFORE the oldest logged op.
	// Evicted ops are absorbed so baseline + log always replays to the
	// live doc, however long the session runs.
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
				// a dead socket must never break the fanout; close() will
				// reap it
			}
		}
	};

	/** @param {{caps: string[] | null}} user */
	const hasExt = user => user.caps?.includes(EXT_SUITE_CAP) === true;

	/** resolve words for down-converting quantization */
	const paletteWords = () =>
		doc.ext_palette
			? Uint32Array.from(doc.ext_palette)
			: paletteWordsFromJoin(doc.palette);

	/**
	 * Mutation fanout: caps members get the native frame with seq,
	 * vanilla members get the down-converted frame(s) (null = nothing
	 * expressible), and a caps sender gets EXT_ACK so its seq stream
	 * stays contiguous under exclude-sender echo semantics.
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
				// ditto
			}
		}
	};

	/**
	 * A silently dropped mutation from a caps client would leak its
	 * pendingOps counter forever AND leave its apply-locally state
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

	/** the full-fidelity doc snapshot a caps client adopts wholesale */
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
	 * row-aware resize; a linear copy scrambles late joiners
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

	// wire-speed brute force: repeated failures open an exponential
	// cooldown window during which every attempt refuses instantly
	// (the first couple of tries stay free: humans typo)
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
			if (Date.now() < authCooldownUntil) {
				client.send(MoebiusAction.REFUSED, {});
				log('refused (auth cooldown)');
				return false;
			}
			if (pass !== password) {
				authFailures++;
				if (authFailures >= 3) {
					authCooldownUntil =
						Date.now() +
						Math.min(30_000, 250 * 2 ** Math.min(authFailures - 2, 7));
				}
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
		// upstream reply shapes, verbatim; caps ride along only for
		// caps-aware clients (vanilla must see exactly vanilla)
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
			// the vanilla doc in the reply is the quantized view; caps
			// clients adopt the full-fidelity snapshot that follows it
			// (and it counts against the sync rate limit)
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
			return; // frames before CONNECTED are dropped
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
				// a nickless spectator could broadcast ANY nick the frame
				// claimed; viewers speak as themselves, editors may rename
				const nick =
					user.role === 'editor' && typeof data.nick === 'string'
						? sanitize(data.nick, ROOM_DEFAULTS.nickLimit, false)
						: (user.nick ?? 'spectator');
				const text = typeof data.text === 'string' ? sanitize(data.text, ROOM_DEFAULTS.chatTextLimit, false) : '';
				if (text === '') {
					return;
				}
				// nick/group renames piggyback on chat, like upstream
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
				// without the seq bump a chat landing mid-save was marked
				// clean by that save's token and lost when the room emptied
				dirtySeq++;
				// spectators chat and HEAR chat on our server. Explicit
				// shape: relaying junk fields would let a client smuggle a
				// fake `seq` into caps peers' streams
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
				// content resync. Vanilla peers live with that, exactly as
				// upstream; caps clients detect divergence through the seq
				// stream and recover via EXT_SYNC.
				resizeDoc(columns, rows);
				const payload = { columns, rows, id: user.id };
				const opSeq = pushOp(type, payload);
				// rebuilt shape with the SERVER-known id: vanilla clients
				// crash without an id, and relayed client ids
				// are forgeable
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
				// store the ext payload only when the vanilla block loses
				// information (a caps client drawing a plain classic cell
				// costs nothing extra)
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
				// bridge the classic 16 into the vanilla join palette so late
				// vanilla joiners see them; in-session vanilla peers keep a
				// stale palette (upstream's own CHANGE_PALETTE precedent).
				// Padded to EXACTLY 16: a short join palette is an
				// out-of-contract shape vanilla clients index into blindly.
				// 8-bit {r,g,b} objects, the ancestor's own join shape: it
				// resolves 6-bit arrays to black
				const bridge = paletteWordsFromJoin(doc.palette);
				for (let i = 0; i < Math.min(16, palette.length); i++) {
					bridge[i] = palette[i];
				}
				doc.palette = [...bridge.slice(0, 16)].map(w => ({
					r: (w >> 16) & 0xff,
					g: (w >> 8) & 0xff,
					b: w & 0xff,
				}));
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
						ops: opLog,
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
				// upstream's blind relay: registered users only, never
				// persisted (CURSOR/SELECTION/OPERATION/17-20/22). Late
				// joiners see stale palette/flips exactly like upstream.
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
				doc.palette = saved.palette;
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
		/** full-fidelity state for persistence (RLE runs + ext palette) */
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
		/** blank art and silent chat: nothing worth a session file */
		isBlank: () =>
			chatHistory.length === 0 &&
			doc.data.every(
				block => (block.code === 32 || block.code === 0) && block.bg === 0,
			),
		opLog: () => [...opLog],
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
