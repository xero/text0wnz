// @ts-check
/**
 * Server address grammar shared by the page and the transport worker:
 * `host[:port][/room]` the way Moebius's connect dialog reads it, or a
 * full ws:// or wss:// url. A bare address assumes plaintext ws on
 * port 8000 (the Moebius default); port 443 alone means wss, since
 * nothing serves plaintext websockets there. Pure: no DOM, no sockets,
 * so both sides parse one way and the unit tests need no browser.
 */

export const MOEBIUS_PORT = 8000;

/**
 * @typedef {object} CollabTarget
 * @property {'ws:' | 'wss:'} protocol
 * @property {string} host hostname, or a bracketed v6 literal
 * @property {number} port
 * @property {string} path '' or a leading-slash room path
 */

/**
 * @param {unknown} input
 * @returns {CollabTarget | null} null when nothing dialable was typed
 */
export const parseTarget = input => {
	if (typeof input !== 'string') {
		return null;
	}
	const text = input.trim();
	if (text === '') {
		return null;
	}
	const explicit = (/^wss?:\/\//i).test(text);
	if (!explicit && (/^[a-z][a-z0-9+.-]*:\/\//i).test(text)) {
		// a pasted http(s) url is not a websocket endpoint; parsing it
		// as a bare host would dial a host named 'http'
		return null;
	}
	let url;
	try {
		url = new URL(explicit ? text : `ws://${text}`);
	} catch {
		return null;
	}
	if (!url.hostname) {
		return null;
	}
	// the URL parser blanks a port that equals the scheme default
	// (ws://h:80 reads back as ''), which would turn a typed :80 into
	// the Moebius default; read the port off the authority instead
	const authority = text.replace(/^wss?:\/\//i, '').split('/')[0];
	const typed = authority.match(/:(\d{1,5})$/);
	const specified = typed ? Number(typed[1]) : 0;
	// 0 is the "nothing typed" sentinel below, so a typed :0 must not
	// masquerade as a default; no server listens there anyway
	if (typed && specified === 0) {
		return null;
	}
	let protocol = /** @type {'ws:' | 'wss:'} */ (
		url.protocol === 'wss:' ? 'wss:' : 'ws:'
	);
	let port = specified;
	if (port <= 0 || port > 65535) {
		port = explicit ? (protocol === 'wss:' ? 443 : 80) : MOEBIUS_PORT;
	}
	if (!explicit && port === 443) {
		protocol = 'wss:';
	}
	// a doubled slash joins the room through the bridge (which strips
	// slashes) but not direct against Moebius (which matches the path
	// verbatim), so one spelling has to mean one room everywhere
	const path = url.pathname.replace(/\/{2,}/g, '/').replace(/\/+$/, '');
	return { protocol, host: url.hostname, port, path };
};

/** @param {CollabTarget} target */
export const targetToUrl = target =>
	`${target.protocol}//${target.host}:${target.port}${target.path || '/'}`;

/**
 * The shortest spelling that parses back to the same target: what the
 * recent-servers list stores and the address field shows.
 * @param {CollabTarget} target
 */
export const formatTarget = target => {
	const { protocol, host, port, path } = target;
	if (protocol === 'wss:') {
		return `wss://${host}${port === 443 ? '' : `:${port}`}${path}`;
	}
	if (port === 443) {
		// bare :443 would read back as wss; keep the scheme explicit
		return `ws://${host}:443${path}`;
	}
	return `${host}${port === MOEBIUS_PORT ? '' : `:${port}`}${path}`;
};

/**
 * The room path as the server's bridge wants it: no slash, '' for the
 * default room.
 * @param {CollabTarget} target
 */
export const targetRoom = target => target.path.replace(/^\/+/, '');

/**
 * The same-origin default: the page's own host, matching scheme, at
 * the /server path the deployed proxies forward.
 * @param {{protocol: string, hostname: string, port: string}} location
 */
export const defaultServerUrl = location => {
	const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
	const port = location.port || (location.protocol === 'https:' ? '443' : '80');
	return `${protocol}//${location.hostname}:${port}/server`;
};

/**
 * Which socket to open for a target from THIS page. A secure page
 * cannot open plaintext websockets (mixed content, no header can
 * allow it), and every Moebius server is plaintext, so an https page
 * reaches one through its own host's bridge, a byte pipe the host
 * enables with BRIDGE=port (default off). Everything else dials
 * direct. No url at all means the same-origin default.
 * @param {{protocol: string, hostname: string, host: string, port: string}} location
 * @param {unknown} explicit the dial url the page chose, if any
 * @returns {{url: string, bridged: boolean}}
 */
export const resolveTransport = (location, explicit) => {
	const target = typeof explicit === 'string' ? parseTarget(explicit) : null;
	if (!target) {
		return { url: defaultServerUrl(location), bridged: false };
	}
	if (target.protocol === 'ws:' && location.protocol === 'https:') {
		const query = new URLSearchParams({
			host: target.host,
			port: String(target.port),
			room: targetRoom(target),
		});
		return { url: `wss://${location.host}/bridge?${query}`, bridged: true };
	}
	return { url: targetToUrl(target), bridged: false };
};
