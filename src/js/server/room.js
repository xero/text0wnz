// @ts-check
/**
 * Collab room (PLAN §3.6.3): Moebius-native semantics with the
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
 *   crash without (landmine §3.6.2 #2).
 * - CURSOR/SELECTION/OPERATION/17-20/22 ride the default relay to
 *   registered users and are NEVER persisted; late joiners see stale
 *   palette/flips exactly like upstream (do-not-diverge rule).
 * - SET_BG is swallowed (upstream comments it out).
 *
 * Our deltas (owner decisions):
 * - D12: a room password applies to EVERYONE, including nickless
 *   spectators (upstream lets nickless connections bypass it).
 * - O14: spectators default to read-only drawing but MAY chat, and
 *   they receive chat (upstream excludes them from the chat tier).
 * - resize is row-aware (v2's linear copy scrambled late joiners).
 * - malformed frames are dropped with a log line, never a crash.
 * - every mutation lands in a bounded op log (timelapse substrate).
 */

import {
	MoebiusAction,
	MoebiusStatus,
	MOEBIUS_EXTENSION_BASE,
	compressBlocks,
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
});

/** capability names our server advertises to caps-aware clients */
/** @type {readonly string[]} */
export const SERVER_CAPS = Object.freeze([]);

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
 * @param {number} [options.opLogLimit]
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
	const opLogLimit = options.opLogLimit ?? ROOM_DEFAULTS.opLogLimit;
	const log = options.log ?? (() => {});

	// the live document, wire-shaped (block cells); persistence converts
	// through the shared codecs at the file boundary
	const doc = {
		columns: options.columns ?? ROOM_DEFAULTS.columns,
		rows: options.rows ?? ROOM_DEFAULTS.rows,
		/** @type {{code: number, fg: number, bg: number}[]} */
		data: [],
		title: '',
		author: '',
		group: '',
		comments: '',
		/** @type {number[][] | undefined} */
		palette: undefined,
		/** @type {unknown} */
		font_bytes: undefined,
		font_name: 'CP437 8x16',
		ice_colors: false,
		use_9px_font: false,
	};
	doc.data = Array.from({ length: doc.columns * doc.rows }, blankBlock);

	/** @type {Map<RoomClient, {id: number, nick: string | undefined, group: string, status: number, role: 'viewer' | 'editor', caps: string[] | null}>} */
	const members = new Map();
	/** @type {{id: number, nick: string, group: string, text: string, time: number}[]} */
	const chatHistory = [];
	/** @type {{t: number, type: number, data: object}[]} */
	const opLog = [];
	let nextId = 0;
	let dirty = false;

	/** @param {number} type @param {object} data */
	const pushOp = (type, data) => {
		opLog.push({ t: Date.now(), type, data });
		if (opLog.length > opLogLimit) {
			opLog.splice(0, opLog.length - opLogLimit);
		}
		dirty = true;
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
	 * row-aware resize; v2's linear copy scrambled late joiners
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

	/**
	 * @param {RoomClient} client
	 * @param {Record<string, unknown>} data CONNECTED frame data
	 * @returns {boolean} connected
	 */
	const connect = (client, data) => {
		const nick = typeof data.nick === 'string' ? sanitize(data.nick, ROOM_DEFAULTS.nickLimit, false) : undefined;
		const pass = typeof data.pass === 'string' ? data.pass : '';
		// D12: the password gates EVERYONE, spectators included
		if (password !== '' && pass !== password) {
			client.send(MoebiusAction.REFUSED, {});
			log(`${nick ?? 'spectator'} refused (bad password)`);
			return false;
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
					return;
				}
				const cell = {
					code: Number.isInteger(block.code) ? block.code : 32,
					fg: Number.isInteger(block.fg) ? block.fg : 7,
					bg: Number.isInteger(block.bg) ? block.bg : 0,
				};
				doc.data[y * doc.columns + x] = cell;
				pushOp(type, { x, y, block: cell, id: user.id });
				broadcast(client, type, data, { spectators: true });
				return;
			}
			case MoebiusAction.CHAT: {
				if (user.role === 'viewer' && !spectators.canChat) {
					return;
				}
				const nick = typeof data.nick === 'string' ? sanitize(data.nick, ROOM_DEFAULTS.nickLimit, false) : (user.nick ?? '');
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
				// O14: spectators chat and HEAR chat on our server
				broadcast(client, type, { ...data, nick, text, id: user.id }, { spectators: true });
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
				doc.title = typeof data.title === 'string' ? data.title : doc.title;
				doc.author = typeof data.author === 'string' ? data.author : doc.author;
				doc.group = typeof data.group === 'string' ? data.group : doc.group;
				doc.comments =
					typeof data.comments === 'string' ? data.comments : doc.comments;
				pushOp(type, data);
				broadcast(client, type, data, { spectators: true });
				return;
			}
			case MoebiusAction.ICE_COLORS: {
				if (user.role === 'viewer') {
					return;
				}
				doc.ice_colors = data.value === true;
				pushOp(type, data);
				broadcast(client, type, data, { spectators: true });
				return;
			}
			case MoebiusAction.USE_9PX_FONT: {
				if (user.role === 'viewer') {
					return;
				}
				doc.use_9px_font = data.value === true;
				pushOp(type, data);
				broadcast(client, type, data, { spectators: true });
				return;
			}
			case MoebiusAction.CHANGE_FONT: {
				if (user.role === 'viewer') {
					return;
				}
				if (typeof data.font_name === 'string') {
					doc.font_name = data.font_name;
				}
				pushOp(type, data);
				broadcast(client, type, data, { spectators: true });
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
					columns > ROOM_DEFAULTS.maxColumns ||
					rows > ROOM_DEFAULTS.maxRows
				) {
					return;
				}
				resizeDoc(columns, rows);
				pushOp(type, { columns, rows, id: user.id });
				// relay the sender's data verbatim: it carries the id vanilla
				// clients crash without (landmine 2)
				broadcast(client, type, data, { spectators: true });
				log(`canvas resized ${columns}x${rows}`);
				return;
			}
			case MoebiusAction.SET_BG:
				return; // upstream swallows it
			default: {
				if (type >= MOEBIUS_EXTENSION_BASE && user.caps === null) {
					return; // extensions only flow between caps-aware peers
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
			if (Array.isArray(/** @type {any} */ (saved).chat)) {
				chatHistory.push(...(saved).chat);
			}
		},
		stats: () => ({
			name,
			users: usersList(),
			memberCount: members.size,
			columns: doc.columns,
			rows: doc.rows,
			opLogLength: opLog.length,
			dirty,
		}),
		chatHistory: () => [...chatHistory],
		opLog: () => [...opLog],
		markClean: () => {
			dirty = false;
		},
		isDirty: () => dirty,
	};
};
