/** room name grammar shared by the ws router and persistence */
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
};
