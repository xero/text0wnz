/** room name grammar shared by the ws router and persistence */
const ROOM_NAME_RE = /^[a-z0-9_-]{1,32}$/i;

/** vanilla Moebius expands join palettes from 6 bits and moebiusXBIN
 * reads them as 8, yet both send the same CONNECTED: only Electron's
 * user agent token, app name and version, tells them apart (vanilla is
 * moebius/1.x, the fork 2.x). Anything else gets 8, the depth this
 * server writes, so a miss costs nothing new
 * @param {string | null | undefined} userAgent */
const joinPaletteDepth = userAgent =>
	(typeof userAgent === 'string' && (/\bmoebius\/1\.\d/i).test(userAgent) ? 6 : 8);

/** shared wire-auth backoff: two tries stay free (humans typo),
 * then the refusal window doubles up to a 30s cap */
const authCooldownMs = failures =>
	(failures < 3 ? 0 : Math.min(30_000, 250 * 2 ** Math.min(failures - 2, 7)));

const printHelp = () => {
	console.log(`teXt0wnz backend server
Usage: {bun,node} server [port] [options]

Options:
  --ssl                 Enable SSL (requires certificates in ssl-dir)
  --ssl-dir <path>      SSL certificate directory (default: /etc/ssl/private)
  --save-interval <min> Auto-save interval in minutes (default: 30)
  --session-name <name> Default room + session file prefix (default: joint)
  --plain-port <port>   Extra plaintext ws listener for desktop clients
  --pass <password>     Room password (gates spectators too)
  --allowed-origins <l> Comma-separated Origin allowlist for ws upgrades
  --static <dir>        Serve the built PWA from <dir> (single-binary mode)
  --debug               Enable verbose console messages
  --help                Show this help message

Environment:
  ROOM_PASS             Same as --pass
  ROOM_PASSWORDS        Per-room passwords as JSON: {"room":"pw"}
  ALLOWED_ORIGINS       Same as --allowed-origins (desktop clients send
                        no Origin and always pass)
  TRUST_PROXY           Comma-separated proxy addresses whose X-Real-IP or
                        X-Forwarded-For names the client (loopback is
                        always trusted)
  ROOM_MAX_COLUMNS      Canvas resize width wall (default 1000; raise or lower)
  ROOM_MAX_ROWS         Canvas resize height wall (default 10000; raise or lower)
                        Walls gate resizes only; restored docs keep their size
  ROOM_MAX_GUESSES      Wrong passwords a room takes a minute, every address
                        together (default 20)
  BRIDGE                off (default) | local | port | allow: relay browsers on
                        this host to plaintext desktop servers; every open,
                        close, and refusal is logged with the requester
  BRIDGE_TARGET         local mode's one fixed target (default ws://127.0.0.1:8000)
  BRIDGE_PORT           port mode's one pinned port (default 8000)
  BRIDGE_ALLOW          allow mode's host:port list, comma-separated
  BRIDGE_MAX            concurrent bridged connections (default 16)

Examples:
  bun server 8080 --ssl --session-name myart --debug
  bun server 1337 --plain-port 8000 --pass hunter2
`);
	process.exit(0);
};

const callout = msg => {
	console.log(
		`╓─────  ${sanitize(msg, 100, false)}\n╙───────────────────────────────── ─ ─`,
	);
};

// Strips Unicode control characters and newlines,
// limits length, and optionally adds quotes
const sanitize = (input, limit = 100, quote = true) => {
	if (input === null || input === undefined) {
		return '';
	}
	const str = [
		...String(input)
			.trim()
			.replace(/\p{C}/gu, '')
			.replace(/[\n\r]/g, ''),
	]
		// code points, not UTF-16 units: a substring cut at the limit
		// could split a surrogate pair, re-creating the lone surrogate
		// the control strip just removed
		.slice(0, limit)
		.join('');
	return quote ? `'${str}'` : str;
};

export {
	printHelp,
	callout,
	sanitize,
	ROOM_NAME_RE,
	authCooldownMs,
	joinPaletteDepth,
};
