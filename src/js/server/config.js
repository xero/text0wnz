import { printHelp } from './utils.js';
import { unmapped } from './authGate.js';

const parseRoomPasswords = raw => {
	if (!raw) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === 'object' && parsed !== null) {
			const out = {};
			for (const [room, pass] of Object.entries(parsed)) {
				if (typeof pass === 'string') {
					// room names from paths normalize to lowercase; keys must too
					out[room.toLowerCase()] = pass;
				}
			}
			return out;
		}
	} catch {
		console.warn('[Config] ROOM_PASSWORDS is not valid JSON; ignored');
	}
	return {};
};

/** env cap knob: a positive integer, else 0 = "use the compiled-in default" */
const parseCapEnv = raw => {
	const value = parseInt(raw ?? '', 10);
	return Number.isInteger(value) && value > 0 ? value : 0;
};

/** comma-separated Origin allowlist; absent = open (ancestor behavior) */
const parseAllowedOrigins = raw => {
	if (typeof raw !== 'string') {
		return undefined;
	}
	const list = raw
		.split(',')
		.map(s => s.trim().replace(/\/+$/, ''))
		.filter(s => s !== '');
	return list.length > 0 ? list : undefined;
};

/** comma-separated proxy addresses whose forwarding headers name the
 * client (loopback is always trusted); anything else stays unheard */
const parseTrustProxy = raw =>
	(raw ?? '')
		.split(',')
		.map(s => unmapped(s.trim()))
		.filter(s => s !== '');

const parseArgs = () => {
	const args = process.argv.slice(2);
	const config = {
		ssl: false,
		sslDir: '/etc/ssl/private',
		saveInterval: 30 * 60 * 1000, // 30 minutes in milliseconds
		sessionName: 'joint',
		debug: false,
		port: 1337,
		// optional second listener speaking plaintext ws for desktop
		// clients (Moebius, icy_draw); 0 = disabled
		plainPort: 0,
		// room password applied to every room without a specific entry;
		// it gates spectators too
		pass: process.env.ROOM_PASS ?? '',
		/** per-room passwords from ROOM_PASSWORDS='{"name":"pw"}' */
		roomPasswords: parseRoomPasswords(process.env.ROOM_PASSWORDS),
		/** ws upgrade Origin allowlist; unset keeps upgrades open */
		allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS),
		// env knobs: per-deployment canvas resize wall, in EITHER
		// direction (jam hosts raise it, cautious hosts lower it);
		// 0 = use room.js ROOM_DEFAULTS (1000x10000)
		maxColumns: parseCapEnv(process.env.ROOM_MAX_COLUMNS),
		maxRows: parseCapEnv(process.env.ROOM_MAX_ROWS),
		// wrong passwords a room takes a minute from every address
		// together; 0 = the auth gate's default (20)
		maxGuesses: parseCapEnv(process.env.ROOM_MAX_GUESSES),
		// serve the built PWA from this dir (single binary and the
		// distroless image); '' = ws-only, a proxy serves static
		staticDir: process.env.STATIC_DIR ?? '',
		// proxies beyond loopback allowed to name the client address the
		// auth backoff keys on
		trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const nextArg = args[i + 1];

		switch (arg) {
			case '--debug':
				config.debug = true;
				break;
			case '--ssl':
				config.ssl = true;
				break;
			case '--ssl-dir':
				if (nextArg && !nextArg.startsWith('--')) {
					config.sslDir = nextArg;
					i++;
				}
				break;
			case '--save-interval':
				if (nextArg && !nextArg.startsWith('--')) {
					const minutes = parseInt(nextArg);
					if (!isNaN(minutes) && minutes > 0) {
						config.saveInterval = minutes * 60 * 1000;
					}
					i++;
				}
				break;
			case '--session-name':
				if (nextArg && !nextArg.startsWith('--')) {
					config.sessionName = nextArg;
					i++;
				}
				break;
			case '--plain-port':
				if (nextArg && !nextArg.startsWith('--')) {
					const plainPort = parseInt(nextArg);
					if (!isNaN(plainPort) && plainPort > 0 && plainPort <= 65535) {
						config.plainPort = plainPort;
					}
					i++;
				}
				break;
			case '--pass':
				if (nextArg && !nextArg.startsWith('--')) {
					config.pass = nextArg;
					i++;
				} else {
					// silence here booted an UNPROTECTED server the operator
					// believed was passworded
					console.warn(
						'[Server] --pass given without a value; running UNPROTECTED',
					);
				}
				break;
			case '--allowed-origins':
				if (nextArg && !nextArg.startsWith('--')) {
					config.allowedOrigins = parseAllowedOrigins(nextArg);
					i++;
				}
				break;
			case '--static':
				if (nextArg && !nextArg.startsWith('--')) {
					config.staticDir = nextArg;
					i++;
				}
				break;
			case '--help':
				printHelp();
				break;
			default:
				// a bare numeric arg is the port
				{
					const port = parseInt(arg);
					if (!isNaN(port) && port > 0 && port <= 65535) {
						config.port = port;
					}
				}
				break;
		}
	}
	if (config.debug) {
		console.log('Server configuration:', config);
	}
	return config;
};

export { parseArgs };
