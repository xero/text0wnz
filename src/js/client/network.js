import State from './state.js';
import { $, onEnter, websocketUI } from './ui.js';
import { createDefaultPalette, createPalette } from './palette.js';
import { trustedMessage } from './messageGuard.js';
import {
	EXT_BATCH_LIMIT,
	EXT_SUITE_CAP,
	MoebiusAction,
	T0wnzAction,
	blockToExtCell,
	compress8to6,
	extSyncToDoc,
	joinDocToDoc,
	sanitizeExtCell,
	sanitizeExtPalette,
} from '../core/index';
import { Load } from './file.js';
import magicNumbers from './magicNumbers.js';
import {
	defaultServerUrl,
	formatTarget,
	parseTarget,
	targetToUrl,
} from './collabTarget.js';
import { createRecentList } from './recentList.js';

// blocked site data must not abort the boot: localStorage access
// throws under some privacy modes, and every other module guards it
const readLocal = key => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};
const writeLocal = (key, value) => {
	try {
		localStorage.setItem(key, value);
	} catch {
		// the preference simply does not persist this session
	}
};

/**
 * Remote collaborator cursors (native CURSOR/SELECTION frames): one
 * positioned box per peer id, placed through the same scaled font
 * metrics everything else uses.
 */
const createRemoteCursors = () => {
	/** @type {Map<number, HTMLElement>} */
	const cursors = new Map();
	const container = () => document.getElementById('canvasContainer');

	const show = (id, x, y) => {
		const host = container();
		if (!host || !State.font) {
			return;
		}
		let el = cursors.get(id);
		if (!el) {
			// forged ids must not grow unbounded DOM in every peer's tab;
			// real rooms hold a handful of members
			if (cursors.size >= 64) {
				return;
			}
			el = document.createElement('div');
			el.className = 'remoteCursor';
			el.style.position = 'absolute';
			el.style.pointerEvents = 'none';
			el.style.border = '1px solid #ff7518';
			// top of the canvas overlay band, below every piece of chrome
			el.style.zIndex = '30';
			host.appendChild(el);
			cursors.set(id, el);
		}
		const w = State.font.getWidth();
		const h = State.font.getHeight();
		el.style.left = `${x * w}px`;
		el.style.top = `${y * h}px`;
		el.style.width = `${w}px`;
		el.style.height = `${h}px`;
		el.style.display = 'block';
	};

	const hide = id => {
		const el = cursors.get(id);
		if (el) {
			el.style.display = 'none';
		}
	};

	const remove = id => {
		cursors.get(id)?.remove();
		cursors.delete(id);
	};

	const clear = () => {
		for (const el of cursors.values()) {
			el.remove();
		}
		cursors.clear();
	};

	return { show, hide, remove, clear };
};

const createWorkerHandler = inputHandle => {
	const btnJoin = $('joinCollaboration');
	const btnLocal = $('stayLocal');
	const choiceServer = $('choiceServer');
	const lblFont = $('currentFontDisplay');
	const selFont = $('fontSelect');
	const btn9pt = $('nav9pt');
	const btnIce = $('navICE');
	const btnNet = $('networkButton');
	const btnConnect = $('connectJoin');
	const inServer = $('connectServer');
	const inPass = $('connectPass');
	const inNick = $('connectNick');
	const inGroup = $('connectGroup');
	const listRecent = $('connectRecent');
	const connectStatus = $('connectStatus');

	try {
		State.worker = new Worker(new URL('./collabWorker.js', import.meta.url), { type: 'module' });
	} catch (error) {
		console.error('[Network] Failed to load collab worker:', error);
		// no worker, no dial: the local button must not invite a tap
		// nothing answers (the form is bound below, after this return)
		btnNet.hidden = true;
		btnNet.disabled = true;
		return;
	}
	let handle = readLocal('handle');
	if (handle === null) {
		handle = 'Anonymous';
		writeLocal('handle', handle);
	}
	inputHandle.value = handle;
	let group = readLocal('group') ?? '';
	let connected = false;
	let collaborationMode = false;
	// explicit server url (?server=ws://...): remote dial on explicit
	// user intent; same-origin default otherwise. A blank value (an
	// unset variable in a scripted launcher) counts as absent
	const explicitServer =
		new URLSearchParams(window.location.search).get('server') || undefined;
	// depth, not a boolean: nested remote-apply helpers (font change
	// inside a sync inside adoption) each balance their own ++/--
	let applyDepth = 0;
	const remoteCursors = createRemoteCursors();
	/** id -> nick, for rename detection (renames ride CHAT upstream) */
	const peerNicks = new Map();
	// extension suite state (t0wnz-ext-1): negotiated caps, the seq
	// stream position, and our own mutations still awaiting an ack
	// (kept as payloads, not a count: a resync adopts a snapshot cut
	// BEFORE these ops, and the server never echoes them back to us,
	// so they replay locally after the adoption or the work vanishes)
	/** @type {string[]} */
	let serverCaps = [];
	let lastSeq = -1;
	/** @type {{type: number, data: object}[]} */
	const pendingSends = [];
	let syncCooldown = 0;
	let syncQueued = false;
	let syncRetryTimer = 0;
	let passwordTried = false;
	// the dial in flight, one object so every path that ends it (adopt,
	// refusal, dead socket, dismissal, stay local) clears the same
	// thing: its url, and the typed spelling when it came from the
	// connect form (null spelling = the same-origin invitation)
	/** @type {{url: string | undefined, spelling: string | null} | null} */
	let attempt = null;
	let sameOriginFound = false;
	const extActive = () => serverCaps.includes(EXT_SUITE_CAP);

	const onDisconnected = wasConnected => {
		const hadSession = connected && collaborationMode;
		connected = false;
		collaborationMode = false;
		serverCaps = [];
		lastSeq = -1;
		pendingSends.length = 0;
		syncQueued = false;
		clearTimeout(syncRetryTimer);
		syncRetryTimer = 0;
		remoteCursors.clear();
		peerNicks.clear();
		websocketUI(false);
		if (hadSession && wasConnected) {
			// a silent drop leaves local autosave paused forever; tell the user
			alert(
				'You were disconnected from the server, try refreshing the page to try again.',
			);
		}
	};

	const onRemoteDraw = data => {
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const { x, y, block } = data;
		if (
			!Number.isInteger(x) ||
			!Number.isInteger(y) ||
			x < 0 ||
			y < 0 ||
			// bounds against OUR current dims: a draw serialized before a
			// resize must not land at a wrong index (draws near concurrent
			// resizes drop everywhere, by design)
			x >= columns ||
			y >= rows ||
			typeof block !== 'object' ||
			block === null
		) {
			return;
		}
		if (block.code > 0xff) {
			// icy-style raw codepoint on the vanilla wire: join and resync
			// intern these, so the live view must too or the two diverge
			// until the next sync
			State.textArtCanvas.drawRemoteExtCells([{ x: x, y: y, ...blockToExtCell(block) }]);
			return;
		}
		const word =
			((block.code & 0xff) << 8) | ((block.bg & 15) << 4) | (block.fg & 15);
		State.textArtCanvas.quickDraw([[y * columns + x, word, x, y]]);
	};

	const onRemoteChat = data => {
		const id = data.id;
		const nick = typeof data.nick === 'string' ? data.nick : 'guest';
		if (Number.isInteger(id)) {
			const known = peerNicks.get(id);
			if (known !== undefined && known !== nick) {
				State.chat.nick(nick, id, false);
			}
			peerNicks.set(id, nick);
		}
		State.chat.addConversation(nick, String(data.text ?? ''), true);
	};

	const onResize = (columns, rows) => {
		// a hostile/buggy server must not drive an unbounded allocation
		// (the user can dial any ?server= url); clamp at the border
		if (
			!Number.isInteger(columns) ||
			!Number.isInteger(rows) ||
			columns < 1 ||
			rows < 1 ||
			columns > magicNumbers.MAX_COLUMNS ||
			rows > magicNumbers.MAX_ROWS
		) {
			return;
		}
		applyDepth++; // prevents re-broadcasting received settings
		State.textArtCanvas.resize(columns, rows);
		applyDepth = Math.max(0, applyDepth - 1);
	};

	const onFontChange = async fontName => {
		// no applyDepth hold: nothing echoes a font apply back out (all
		// settings sends ride direct user clicks), and holding the depth
		// across this await starved every mutation send for the whole
		// font load
		await State.textArtCanvas.setFont(fontName, () => {
			lblFont.textContent = fontName;
			selFont.value = fontName;
		});
	};

	const onIceColorsChange = iceColors => {
		applyDepth++; // prevents re-broadcasting received settings
		State.textArtCanvas.setIceColors(iceColors);
		if (iceColors) {
			btnIce.classList.add('enabled');
		} else {
			btnIce.classList.remove('enabled');
		}
		applyDepth = Math.max(0, applyDepth - 1);
	};

	const onLetterSpacingChange = letterSpacing => {
		applyDepth++; // prevents re-broadcasting received settings
		State.font.setLetterSpacing(letterSpacing);
		if (letterSpacing) {
			btn9pt.classList.add('enabled');
		} else {
			btn9pt.classList.remove('enabled');
		}
		applyDepth = Math.max(0, applyDepth - 1);
	};

	/** @type {((payload: object) => void) | null} */
	let timelapseWaiter = null;

	/**
	 * Fetch the room's baseline + op log (EXT_TIMELAPSE); resolves null
	 * on vanilla sessions or a 10s server silence. The caller (file.js)
	 * replays it into an exportable animation.
	 * @returns {Promise<object | null>}
	 */
	const requestTimelapse = () =>
		new Promise(resolve => {
			if (!connected || !extActive()) {
				resolve(null);
				return;
			}
			const timer = setTimeout(() => {
				timelapseWaiter = null;
				resolve(null);
			}, 10000);
			timelapseWaiter = payload => {
				clearTimeout(timer);
				resolve(payload);
			};
			State.worker.postMessage({
				cmd: 'send',
				type: T0wnzAction.EXT_TIMELAPSE,
				data: {},
			});
		});

	/**
	 * Ask the server for a wholesale resync (seq gap, or a resize racing
	 * our in-flight ops). Cooldown-coalesced so a burst of gaps costs one
	 * round trip.
	 */
	const requestSync = () => {
		if (!extActive() || !connected) {
			return;
		}
		if (syncCooldown) {
			// remember the suppressed request; dropping it loses the recovery
			syncQueued = true;
			return;
		}
		syncCooldown = setTimeout(() => {
			syncCooldown = 0;
			if (syncQueued) {
				syncQueued = false;
				requestSync();
			}
		}, 1000);
		// retry insurance: the server rate-limits sync replies, so a
		// request landing inside ITS window vanishes silently; keep
		// re-asking (gently) until a sync actually applies
		clearTimeout(syncRetryTimer);
		syncRetryTimer = setTimeout(() => {
			syncQueued = false;
			requestSync();
		}, 2500);
		State.worker.postMessage({
			cmd: 'send',
			type: T0wnzAction.EXT_SYNC,
			data: {},
		});
	};

	/**
	 * Track the mutation seq stream. ONLY server-stamped mutation types
	 * consult this: a fake seq smuggled through a blind-relayed frame
	 * (CURSOR) would wedge every caps peer. Returns false for a stale
	 * frame the caller must skip; a gap schedules recovery but still
	 * applies the frame.
	 */
	const SEQ_TYPES = new Set([
		MoebiusAction.DRAW,
		MoebiusAction.SAUCE,
		MoebiusAction.ICE_COLORS,
		MoebiusAction.USE_9PX_FONT,
		MoebiusAction.CHANGE_FONT,
		MoebiusAction.SET_CANVAS_SIZE,
		T0wnzAction.EXT_DRAW,
		T0wnzAction.EXT_DRAW_BATCH,
		T0wnzAction.EXT_PALETTE,
	]);
	const noteSeq = data => {
		const seq = data?.seq;
		if (!Number.isInteger(seq) || !extActive()) {
			return true;
		}
		if (lastSeq >= 0 && seq <= lastSeq) {
			return false;
		}
		if (lastSeq >= 0 && seq > lastSeq + 1) {
			requestSync();
		}
		lastSeq = seq;
		return true;
	};

	/** acks advance the stream but are never dropped as stale */
	const noteSeqAdvance = data => {
		const seq = data?.seq;
		if (!Number.isInteger(seq) || !extActive()) {
			return;
		}
		if (lastSeq >= 0 && seq > lastSeq + 1) {
			requestSync();
		}
		if (seq > lastSeq) {
			lastSeq = seq;
		}
	};

	/** bridge the classic 16 of a remote palette into the strip + GL */
	const adoptClassic16 = palette => {
		const triples = [];
		for (let i = 0; i < 16; i++) {
			const word = palette[i] ?? 0;
			triples.push([
				compress8to6((word >> 16) & 0xff),
				compress8to6((word >> 8) & 0xff),
				compress8to6(word & 0xff),
			]);
		}
		State.palette = createPalette(triples);
		// rebind before the dispatch; onCriticalChange repaints from the
		// handle, and a bare redraw() rebuilt in the OLD colors
		State.font?.setPalette?.(State.palette);
		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);
	};

	const onRemoteExtPalette = data => {
		const palette = sanitizeExtPalette(data.palette);
		if (!palette) {
			return;
		}
		applyDepth++;
		try {
			const doc = State.textArtCanvas.getDoc();
			const words = new Uint32Array(Math.max(doc.palette.length, palette.length));
			words.set(doc.palette.subarray(0, Math.min(doc.palette.length, words.length)));
			for (let i = 0; i < palette.length; i++) {
				words[i] = palette[i];
			}
			doc.palette = words;
			adoptClassic16(palette);
			State.textArtCanvas.redrawEntireImage();
		} finally {
			applyDepth = Math.max(0, applyDepth - 1);
		}
	};

	const onRemoteExtDraw = async cells => {
		const valid = [];
		for (const raw of cells) {
			const cell = sanitizeExtCell(raw);
			if (
				cell &&
				Number.isInteger(raw.x) &&
				Number.isInteger(raw.y) &&
				raw.x >= 0 &&
				raw.y >= 0
			) {
				valid.push({ x: raw.x, y: raw.y, ...cell });
			}
		}
		if (valid.length > 0) {
			await State.textArtCanvas.drawRemoteExtCells(valid);
		}
	};

	/**
	 * Replay one of our own in-flight mutations onto a freshly adopted
	 * snapshot, through the same handlers remote frames use. SAUCE is
	 * deliberately absent: its fields are local UI state the user still
	 * sees, and the server applies the op regardless.
	 * @param {number} type @param {any} data
	 */
	const applyOwnOp = async (type, data) => {
		switch (type) {
			case T0wnzAction.EXT_DRAW_BATCH:
				if (Array.isArray(data.cells)) {
					await onRemoteExtDraw(data.cells);
				}
				return;
			case T0wnzAction.EXT_PALETTE:
				onRemoteExtPalette(data);
				return;
			case MoebiusAction.SET_CANVAS_SIZE:
				onResize(data.columns, data.rows);
				return;
			case MoebiusAction.CHANGE_FONT:
				if (typeof data.font_name === 'string') {
					await onFontChange(
						Load.sauceToAppFont(data.font_name) ?? data.font_name,
					);
				}
				return;
			case MoebiusAction.ICE_COLORS:
				onIceColorsChange(data.value === true);
				return;
			case MoebiusAction.USE_9PX_FONT:
				onLetterSpacingChange(data.value === true);
				return;
			default:
				return;
		}
	};

	/** adopt the full-fidelity doc (join follow-up or requested resync) */
	const applyExtSync = async payload => {
		applyDepth++;
		try {
			const result = extSyncToDoc(payload);
			State.textArtCanvas.setDocData(result.doc);
			// seq and sync state settle BEFORE any awaited tail: a frame
			// landing during the font load must not get judged against
			// the pre-sync seq and trigger a spurious resync round trip
			if (Number.isInteger(payload.seq)) {
				lastSeq = payload.seq;
			}
			syncQueued = false;
			clearTimeout(syncRetryTimer);
			syncRetryTimer = 0;
			if (result.fontName) {
				await onFontChange(
					Load.sauceToAppFont(result.fontName) ?? result.fontName,
				);
			}
			State.font.setLetterSpacing(result.use9px);
			btn9pt.classList.toggle('enabled', result.use9px);
			btnIce.classList.toggle('enabled', result.doc.getIceColors());
			if (Array.isArray(payload.palette)) {
				const palette = sanitizeExtPalette(payload.palette);
				if (palette) {
					adoptClassic16(palette);
				}
			}
			// ops sent after the sync request are not in the snapshot and
			// the server excludes the sender from echo, so without this
			// replay our own strokes vanish with no seq gap to recover
			// them; set-cell ops are idempotent, so replaying one the
			// snapshot already holds is harmless
			for (const op of pendingSends.slice()) {
				await applyOwnOp(op.type, op.data);
			}
		} catch (error) {
			console.warn('[Network] dropped malformed EXT_SYNC:', error);
		} finally {
			applyDepth = Math.max(0, applyDepth - 1);
		}
	};

	/** @param {number} type @param {any} data */
	const onFrame = async (type, data) => {
		// acks and sync replies are the RECOVERY channel: they must never
		// fall to the staleness drop (a sync reply's seq always looks
		// stale, so recovery would never apply)
		if (type === T0wnzAction.EXT_ACK) {
			noteSeqAdvance(data);
			pendingSends.shift();
			if (data?.refused === true) {
				// the server dropped an op this client already applied
				// locally; nothing else reconciles that
				requestSync();
			}
			return;
		}
		if (type === T0wnzAction.EXT_SYNC) {
			await applyExtSync(data);
			return;
		}
		// only server-stamped mutation types consult the seq stream
		if (SEQ_TYPES.has(type) && !noteSeq(data)) {
			return;
		}
		switch (type) {
			case MoebiusAction.DRAW:
				onRemoteDraw(data);
				break;
			case T0wnzAction.EXT_DRAW:
				await onRemoteExtDraw([data]);
				break;
			case T0wnzAction.EXT_DRAW_BATCH:
				if (Array.isArray(data.cells)) {
					await onRemoteExtDraw(data.cells);
				}
				break;
			case T0wnzAction.EXT_PALETTE:
				onRemoteExtPalette(data);
				break;
			case T0wnzAction.EXT_TIMELAPSE:
				if (timelapseWaiter) {
					timelapseWaiter(data);
					timelapseWaiter = null;
				}
				break;
			case MoebiusAction.CHAT:
				onRemoteChat(data);
				break;
			case MoebiusAction.JOIN: {
				const nick = typeof data.nick === 'string' ? data.nick : 'guest';
				peerNicks.set(data.id, nick);
				State.chat.join(nick, data.id, true);
				break;
			}
			case MoebiusAction.LEAVE:
				remoteCursors.remove(data.id);
				peerNicks.delete(data.id);
				State.chat.part(data.id);
				break;
			case MoebiusAction.CURSOR:
			case MoebiusAction.SELECTION:
				remoteCursors.show(data.id, data.x, data.y);
				break;
			case MoebiusAction.HIDE_CURSOR:
				remoteCursors.hide(data.id);
				break;
			case MoebiusAction.ICE_COLORS:
				onIceColorsChange(data.value === true);
				break;
			case MoebiusAction.USE_9PX_FONT:
				onLetterSpacingChange(data.value === true);
				break;
			case MoebiusAction.CHANGE_FONT:
				// Moebius speaks SAUCE font names ('IBM VGA'); map to app
				// names, fall through raw for unknowns
				if (typeof data.font_name === 'string') {
					await onFontChange(
						Load.sauceToAppFont(data.font_name) ?? data.font_name,
					);
				}
				break;
			case MoebiusAction.SET_CANVAS_SIZE:
				onResize(data.columns, data.rows);
				// a remote resize racing our in-flight ops is the one
				// divergence the vanilla dialect can't detect; with the
				// suite negotiated, recover wholesale
				if (extActive() && pendingSends.length > 0) {
					requestSync();
				}
				break;
			case MoebiusAction.SAUCE: {
				// remote SAUCE edits land in the modal + title
				applyDepth++;
				try {
					if (typeof data.title === 'string') {
						State.title = data.title;
						const field = document.getElementById('sauceTitle');
						if (field) {
							field.value = data.title;
						}
					}
					for (const [key, id] of [
						['author', 'sauceAuthor'],
						['group', 'sauceGroup'],
						['comments', 'sauceComments'],
					]) {
						const field = document.getElementById(id);
						if (field && typeof data[key] === 'string') {
							field.value = data[key];
						}
					}
				} finally {
					applyDepth = Math.max(0, applyDepth - 1);
				}
				// the sidebar sauce block mirrors these fields
				document.dispatchEvent(new CustomEvent('onSauceChange'));
				break;
			}
			default:
				// STATUS, operations 17-20/22: nothing to render yet
				break;
		}
	};

	const onMessage = async msg => {
		if (!trustedMessage(msg)) {
			return;
		}
		const data = msg.data;
		switch (data.cmd) {
			case 'initialized':
				// the probe dials the same-origin default, or a link's target
				// direct from this browser; the worker refuses to route a
				// probe through the bridge. No join and no remote state
				// until the user consents
				State.worker.postMessage({ cmd: 'probe', url: explicitServer });
				break;
			case 'probeResult':
				if (data.found) {
					sameOriginFound = explicitServer === undefined;
					// a link chose the server: the invitation must say which,
					// or the visitor consents to a session they cannot name
					const target = explicitServer ? parseTarget(explicitServer) : null;
					choiceServer.textContent = explicitServer
						? ` at ${target ? formatTarget(target) : explicitServer}`
						: '';
					showCollaborationChoice();
				}
				break;
			case 'connected':
				if (!attempt) {
					// a reply already in the queue when the dial was dismissed
					// is nobody's session; the worker drops the socket
					State.worker.postMessage({ cmd: 'disconnect' });
					break;
				}
				await adoptSession(data);
				break;
			case 'refused': {
				if (!attempt) {
					break; // ditto: no attempt, no prompt
				}
				const { url, spelling } = attempt;
				attempt = null;
				if (spelling !== null) {
					// the typed path keeps its form: back to it with the
					// reason and the password field ready for another go
					stayLocal();
					openConnectModal(
						'The server refused the connection. Check the password.',
					);
					inPass.focus();
					break;
				}
				// the same-origin invitation gets one prompt and retry,
				// then stays local
				if (!passwordTried) {
					passwordTried = true;
					const pass = window.prompt(
						'This room is password protected. Enter the password:',
					);
					if (pass) {
						joinCollaboration(pass, url);
						break;
					}
				} else {
					alert('The collab server refused the connection.');
				}
				stayLocal();
				break;
			}
			case 'frame':
				if (collaborationMode) {
					await onFrame(data.type, data.data);
				}
				break;
			case 'closed':
				if (attempt && !connected) {
					failJoin(data.bridged === true);
					break;
				}
				onDisconnected(data.wasConnected);
				break;
			case 'error':
				console.warn('[Network] worker error:', data.error);
				if (attempt && !connected) {
					// browsers post error first on a failed handshake (and a
					// socket they refuse to construct posts nothing else), so
					// the dial ends here, with the route the worker named
					failJoin(data.bridged === true);
				}
				break;
		}
	};

	/** @param {number} type @param {object} data @returns {boolean} sent */
	const sendFrame = (type, data) => {
		if (collaborationMode && connected && applyDepth === 0) {
			State.worker.postMessage({ cmd: 'send', type, data });
			return true;
		}
		return false;
	};

	/**
	 * Chat and cursor frames are never echoes of a remote apply, so the
	 * applyDepth gate must not swallow them: a line typed while a sync
	 * or font load applies used to echo locally and never broadcast.
	 * @param {number} type @param {object} data @returns {boolean} sent
	 */
	const sendLive = (type, data) => {
		if (collaborationMode && connected) {
			State.worker.postMessage({ cmd: 'send', type, data });
			return true;
		}
		return false;
	};

	/** a doc mutation of ours: the ext ack bookkeeping rides the send */
	const sendMutation = (type, data) => {
		if (sendFrame(type, data) && extActive()) {
			pendingSends.push({ type, data });
		}
	};

	/**
	 * cells arrive from canvas.js as {x, y, block:{code, fg, bg}, ext}
	 * (apply-locally-on-send: the server excludes the sender, so no echo
	 * comes back). Ext sessions send one full-fidelity batch per flush;
	 * vanilla sessions get per-cell DRAWs with the ext payload stripped
	 * (upstream servers relay unknown fields verbatim).
	 */
	const draw = cells => {
		if (!collaborationMode || !connected || !Array.isArray(cells)) {
			return;
		}
		if (extActive()) {
			const extCells = [];
			for (const cell of cells) {
				if (cell && cell.ext) {
					extCells.push({ x: cell.x, y: cell.y, ...cell.ext });
				}
			}
			for (let i = 0; i < extCells.length; i += EXT_BATCH_LIMIT) {
				const data = { cells: extCells.slice(i, i + EXT_BATCH_LIMIT) };
				pendingSends.push({ type: T0wnzAction.EXT_DRAW_BATCH, data });
				State.worker.postMessage({
					cmd: 'send',
					type: T0wnzAction.EXT_DRAW_BATCH,
					data,
				});
			}
			return;
		}
		State.worker.postMessage({
			cmd: 'draw',
			cells: cells.map(({ x, y, block }) => ({ x, y, block })),
		});
	};

	// no Moebius equivalent; a no-op keeps call sites inert
	const sendCanvasSettings = _settings => {};

	const sendResize = (columns, rows) =>
		sendMutation(MoebiusAction.SET_CANVAS_SIZE, { columns, rows });

	const sendFontChange = fontName =>
		// peers (Moebius included) expect SAUCE font names
		sendMutation(MoebiusAction.CHANGE_FONT, { font_name: Load.appToSauceFont(fontName) ?? fontName });

	const sendIceColorsChange = iceColors =>
		sendMutation(MoebiusAction.ICE_COLORS, { value: iceColors });

	const sendSauce = meta =>
		sendMutation(MoebiusAction.SAUCE, {
			title: meta.title ?? '',
			author: meta.author ?? '',
			group: meta.group ?? '',
			comments: meta.comments ?? '',
		});

	const sendLetterSpacingChange = letterSpacing =>
		sendMutation(MoebiusAction.USE_9PX_FONT, { value: letterSpacing });

	const showCollaborationChoice = () => {
		State.modal.open('choice');
	};

	/**
	 * CONNECTED arrived: adopt the session doc and populate chat. This
	 * runs only after the user consented (joinCollaboration connects).
	 */
	const adoptSession = async data => {
		connected = true;
		collaborationMode = true;
		const spelling = attempt?.spelling ?? null;
		attempt = null;
		if (spelling !== null) {
			// only a server that answered earns a place in the recent
			// list; a typo must not become tomorrow's prefill
			recentServers.remember(spelling);
		}
		applyDepth++;
		serverCaps = Array.isArray(data.data.caps)
			? data.data.caps.filter(cap => typeof cap === 'string')
			: [];
		lastSeq = -1;
		pendingSends.length = 0;
		try {
			State.modal.loading(
				'Updating editor with data from the collab session...',
			);
			State.palette = createDefaultPalette();
			// the join replaces the palette; without the rebind the later
			// setLetterSpacing rebuild runs against the stale handle ref
			State.font?.setPalette?.(State.palette);
			document.dispatchEvent(
				new CustomEvent('onPaletteChange', {
					detail: State.palette,
					bubbles: true,
					cancelable: false,
				}),
			);
			// a caps reply is our own server, whose join palette is 8-bit
			// by construction; everyone else's depth only the wire can tell
			const result = joinDocToDoc(data.data.doc, { paletteDepth: extActive() ? 8 : undefined });
			State.textArtCanvas.setDocData(result.doc);
			if (result.fontName) {
				await onFontChange(Load.sauceToAppFont(result.fontName) ?? result.fontName);
			}
			// joining IS a new document; resyncs later in the session go
			// through setDocData too and must NOT re-home anything, so
			// the reset event fires only here
			document.dispatchEvent(new CustomEvent('onNewDocument'));
			State.font.setLetterSpacing(result.use9px);
			if (Array.isArray(data.data.users)) {
				for (const user of data.data.users) {
					const nick = typeof user.nick === 'string' ? user.nick : 'guest';
					peerNicks.set(user.id, nick);
					State.chat.join(nick, user.id, false);
				}
			}
			if (Array.isArray(data.data.chat_history)) {
				for (const entry of data.data.chat_history) {
					State.chat.addConversation(
						String(entry.nick ?? 'guest'),
						String(entry.text ?? ''),
						false,
					);
				}
			}
			websocketUI(true);
			State.title = 'collab mode';
		} catch (error) {
			console.error('[Network] failed to adopt session doc:', error);
			stayLocal();
		} finally {
			applyDepth = Math.max(0, applyDepth - 1);
			State.modal.close();
		}
	};

	const joinCollaboration = (pass, url = explicitServer, spelling = null) => {
		// callers include DOM click handlers: only a real string is a
		// password (a PointerEvent breaks the worker clone)
		const offered = typeof pass === 'string' ? pass : '';
		if (offered === '') {
			// a fresh attempt earns a fresh prompt; only a retry inside the
			// same attempt may give up on the user
			passwordTried = false;
		}
		attempt = { url, spelling };
		State.modal.loading('Joining the collab session...');
		// a dismissed Joining modal (backdrop, Escape) ends the dial, so
		// neither a late failure nor a late success can act on a session
		// nobody is waiting for
		State.modal.onClose(() => {
			if (attempt) {
				attempt = null;
				State.worker.postMessage({ cmd: 'disconnect' });
			}
		});
		State.worker.postMessage({
			cmd: 'connect',
			nick: handle,
			group,
			pass: offered,
			caps: [EXT_SUITE_CAP],
			url,
		});
	};

	const stayLocal = () => {
		attempt = null;
		State.modal.close();
		collaborationMode = false;
		connected = false;
		websocketUI(false);
		State.worker.postMessage({ cmd: 'disconnect' });
	};

	/** a dial that died before the handshake: say so where the user is */
	const failJoin = bridged => {
		const spelling = attempt?.spelling ?? null;
		stayLocal();
		if (spelling !== null) {
			openConnectModal(
				bridged
					? `Could not reach ${spelling} through this site's bridge. The site may not allow it, or the server is down.`
					: `Could not connect to ${spelling}.`,
			);
		} else {
			State.modal.error('Could not reach the collab server.');
		}
	};

	const recentServers = createRecentList(
		'collabServers',
		8,
		/** @returns {value is string} */ value => typeof value === 'string',
	);

	const setConnectStatus = text => {
		connectStatus.textContent = text;
		connectStatus.classList.toggle('hide', text === '');
	};

	/**
	 * The manual path: any server, any room, Moebius included. The
	 * address prefills from the query string, the last one used, or
	 * the same-origin server the probe found, and a half-typed one is
	 * never clobbered.
	 */
	const openConnectModal = (status = '') => {
		const recent = recentServers.load();
		listRecent.innerHTML = '';
		for (const entry of recent) {
			const option = document.createElement('option');
			option.value = entry;
			listRecent.appendChild(option);
		}
		if (inServer.value === '') {
			inServer.value =
				explicitServer ??
				recent[0] ??
				(sameOriginFound ? defaultServerUrl(window.location) : '');
		}
		inNick.value = handle;
		inGroup.value = group;
		setConnectStatus(status);
		State.modal.open('connect');
		inServer.focus();
	};

	const connectFromModal = () => {
		const target = parseTarget(inServer.value);
		if (!target) {
			setConnectStatus('Enter a server as host:port/room, or a ws:// url.');
			inServer.focus();
			return;
		}
		const nick = inNick.value.trim() || 'Anonymous';
		setHandle(nick);
		inputHandle.value = nick;
		group = inGroup.value.trim();
		writeLocal('group', group);
		joinCollaboration(inPass.value, targetToUrl(target), formatTarget(target));
	};
	btnConnect.addEventListener('click', connectFromModal);
	for (const field of [inServer, inPass, inNick, inGroup]) {
		onEnter(field, connectFromModal);
	}
	// bound once, not per stayLocal call, or listeners stack
	btnNet.addEventListener('click', _ => {
		openConnectModal();
	});

	const setHandle = newHandle => {
		if (handle !== newHandle) {
			handle = newHandle;
			writeLocal('handle', handle);
			// moebius has no NICK frame: renames ride the next CHAT
		}
	};

	const sendChat = text => {
		if (connected) {
			sendLive(MoebiusAction.CHAT, { nick: handle, group, text });
			// the server excludes the sender: render our own line locally
			State.chat.addConversation(handle, text, false);
		}
	};

	const isConnected = () => connected;

	// own-cursor sends, throttled ~100ms trailing; peers render the
	// native CURSOR frames
	let cursorTimer = 0;
	let cursorPending = null;
	document.addEventListener('onTextCursorMove', e => {
		if (!collaborationMode || !connected) {
			return;
		}
		cursorPending = /** @type {CustomEvent} */ (e).detail;
		if (cursorTimer) {
			return;
		}
		cursorTimer = /** @type {number} */ (
			/** @type {unknown} */ (
				setTimeout(() => {
					cursorTimer = 0;
					if (cursorPending && connected) {
						sendLive(MoebiusAction.CURSOR, {
							x: cursorPending.x,
							y: cursorPending.y,
						});
						cursorPending = null;
					}
				}, 100)
			)
		);
	});

	if (State.worker) {
		try {
			State.worker.addEventListener('message', onMessage);
			// 'init' MUST be the worker's first message
			State.worker.postMessage({ cmd: 'init' });
		} catch (error) {
			console.error(
				'[Network] Failed to add message event listener to worker:',
				error,
			);
		}
	}

	// wrapped: the click event must never become the password argument
	btnJoin.addEventListener('click', () => joinCollaboration());
	btnLocal.addEventListener('click', stayLocal);

	return {
		draw: draw,
		setHandle: setHandle,
		sendChat: sendChat,
		isConnected: isConnected,
		// true iff the session negotiated the t0wnz extension suite:
		// unicode cells and extended colors travel natively, so the
		// vanilla-dialect lockouts lift
		extCollab: () => connected && extActive(),
		requestTimelapse: requestTimelapse,
		joinCollaboration: joinCollaboration,
		stayLocal: stayLocal,
		sendCanvasSettings: sendCanvasSettings,
		sendResize: sendResize,
		sendFontChange: sendFontChange,
		sendIceColorsChange: sendIceColorsChange,
		sendLetterSpacingChange: sendLetterSpacingChange,
		sendSauce: sendSauce,
	};
};

const createChatController = (
	btnChat,
	winMsg,
	winUsers,
	txtHandle,
	txtMsg,
	btnInput,
	checkNotifications,
	onFocusCallback,
	onBlurCallback,
) => {
	let enabled = false;
	const userList = {};
	// a strict string compare instead of JSON.parse: a corrupted value
	// must read as "off", never throw during boot
	let notifications = readLocal('notifications') === 'true';
	checkNotifications.checked = notifications;

	const close = $('closeChat');

	const scrollToBottom = () => {
		const rect = winMsg.getBoundingClientRect();
		winMsg.scrollTop = winMsg.scrollHeight - rect.height;
	};

	const newNotification = text => {
		// the pref gates every desktop popup, and the page-context
		// constructor throws on Android Chrome: a popup must never
		// abort the chat log line that lands after it
		if (
			!notifications ||
			typeof Notification === 'undefined' ||
			Notification.permission !== 'granted'
		) {
			return;
		}
		try {
			const notification = new Notification('text.0w.nz', {
				body: text,
				icon: `${State.uiDir}img/favicon.svg`,
			});
			const notificationTimer = setTimeout(() => {
				notification.close();
			}, 7000);

			notification.addEventListener('close', () => {
				clearTimeout(notificationTimer);
			});
		} catch {
			// no page-context notifications here; the chat button dot
			// still signals
		}
	};

	const addConversation = (handle, text, showNotification, log = false) => {
		const div = document.createElement('DIV');
		if (log) {
			const spanLog = document.createElement('SPAN');
			spanLog.textContent = `${text}`;
			spanLog.classList.add('log');
			div.appendChild(spanLog);
			if (showNotification) {
				newNotification(text);
			}
		} else {
			// chat was the one event class with NO popup path; joins and
			// quits had one. Popup only while the chat window is closed,
			// matching the button dot
			if (showNotification && !enabled) {
				newNotification(`${handle}: ${text}`);
			}
			const spanHandle = document.createElement('SPAN');
			const spanSeparator = document.createElement('SPAN');
			const spanText = document.createElement('SPAN');
			spanHandle.textContent = handle;
			spanHandle.classList.add('handle');
			spanSeparator.textContent = ' ';
			spanText.textContent = text;
			div.appendChild(spanHandle);
			div.appendChild(spanSeparator);
			div.appendChild(spanText);
		}
		winMsg.appendChild(div);
		scrollToBottom();
		if (
			showNotification &&
			!enabled &&
			!btnChat.classList.contains('notification')
		) {
			btnChat.classList.add('notification');
		}
	};

	const onFocus = () => {
		onFocusCallback();
	};

	const onBlur = () => {
		onBlurCallback();
	};

	const blurHandle = _ => {
		if (txtHandle.value === '') {
			txtHandle.value = 'Anonymous';
		}
		State.network.setHandle(txtHandle.value);
	};

	const sendMessage = _ => {
		if (txtMsg.value !== '') {
			const text = txtMsg.value;
			txtMsg.value = '';
			State.network.sendChat(text);
		}
	};

	btnInput.addEventListener('click', sendMessage);
	txtHandle.addEventListener('focus', onFocus);
	txtHandle.addEventListener('blur', onBlur);
	txtMsg.addEventListener('focus', onFocus);
	txtMsg.addEventListener('blur', onBlur);
	txtHandle.addEventListener('blur', blurHandle);
	onEnter(txtHandle, () => txtMsg.focus());
	onEnter(txtMsg, sendMessage);

	// the panel manager derives the chat module's visibility from the
	// enabled flag; placement and focus belong to it too
	const toggle = _ => {
		if (enabled) {
			enabled = false;
			State.panels?.layout();
			onBlurCallback();
			btnChat.classList.remove('active');
		} else {
			enabled = true;
			State.panels?.layout();
			State.panels?.focus('chat');
			scrollToBottom();
			onFocusCallback();
			txtMsg.focus();
			btnChat.classList.remove('notification');
			btnChat.classList.add('active');
		}
	};
	close.addEventListener('click', toggle);
	// the title bar X reads as close where the inner door does not; it
	// only shows while the window does, so toggle always means close
	$('chatModClose')?.addEventListener('click', toggle);

	const isEnabled = () => {
		return enabled;
	};

	const join = (handle, sessionID, showNotification) => {
		if (userList[sessionID] === undefined) {
			userList[sessionID] = {
				handle: handle,
				div: document.createElement('DIV'),
			};
			const msg = `${handle} has joined`;
			userList[sessionID].div.classList.add('userName');
			userList[sessionID].div.textContent = handle;
			winUsers.appendChild(userList[sessionID].div);
			addConversation(handle, msg, showNotification, true);
		}
	};

	const nick = (handle, sessionID, showNotification) => {
		if (userList[sessionID] !== undefined) {
			const msg = `${userList[sessionID].handle} is now ${handle}`;
			userList[sessionID].handle = handle;
			userList[sessionID].div.textContent = handle;
			addConversation(handle, msg, showNotification, true);
		}
	};

	const part = sessionID => {
		if (userList[sessionID] !== undefined) {
			const handle = userList[sessionID].handle;
			const msg = `${handle} has quit`;
			winUsers.removeChild(userList[sessionID].div);
			delete userList[sessionID];
			// newNotification itself gates on the pref now, the same as
			// joins and renames; quit was the only one that checked
			addConversation(handle, msg, true, true);
		}
	};

	const notificationCheckboxClicked = _ => {
		if (checkNotifications.checked) {
			if (typeof Notification === 'undefined') {
				// no Notification API in this context (some webviews)
				notifications = false;
				checkNotifications.checked = false;
				writeLocal('notifications', notifications);
				return;
			}
			if (Notification.permission !== 'granted') {
				Notification.requestPermission(_permission => {
					notifications = true;
					writeLocal('notifications', notifications);
				});
			} else {
				notifications = true;
				writeLocal('notifications', notifications);
			}
		} else {
			notifications = false;
			writeLocal('notifications', notifications);
		}
	};

	checkNotifications.addEventListener('click', notificationCheckboxClicked);

	return {
		addConversation: addConversation,
		toggle: toggle,
		isEnabled: isEnabled,
		join: join,
		nick: nick,
		part: part,
	};
};

export { createWorkerHandler, createChatController };
