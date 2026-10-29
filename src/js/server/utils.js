/** room names become session file names: this grammar keeps them
 * inside ./sessions */
const ROOM_NAME_RE = /^[a-z0-9_-]{1,32}$/i;

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
  ROOM_MAX_COLUMNS      Canvas resize width wall (default 1000; raise or lower)
  ROOM_MAX_ROWS         Canvas resize height wall (default 10000; raise or lower)
                        Walls gate resizes only; restored docs keep their size
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
};
