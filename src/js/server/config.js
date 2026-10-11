import { printHelp } from './utils.js';

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
					out[room] = pass;
				}
			}
			return out;
		}
	} catch {
		console.warn('[Config] ROOM_PASSWORDS is not valid JSON; ignored');
	}
	return {};
};

const parseArgs = () => {
	const args = process.argv.slice(2);
	// Defaults
	const config = {
		ssl: false,
		sslDir: '/etc/ssl/private',
		saveInterval: 30 * 60 * 1000, // 30 minutes in milliseconds
		sessionName: 'joint',
		debug: false,
		port: 1337,
		// P4: optional second listener speaking plaintext ws for desktop
		// clients (Moebius, icy_draw); 0 = disabled
		plainPort: 0,
		// room password applied to every room without a specific entry;
		// D12: it gates spectators too
		pass: process.env.ROOM_PASS ?? '',
		/** per-room passwords from ROOM_PASSWORDS='{"name":"pw"}' */
		roomPasswords: parseRoomPasswords(process.env.ROOM_PASSWORDS),
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
					i++; // Skip next argument as we consumed it
				}
				break;
			case '--save-interval':
				if (nextArg && !nextArg.startsWith('--')) {
					const minutes = parseInt(nextArg);
					if (!isNaN(minutes) && minutes > 0) {
						config.saveInterval = minutes * 60 * 1000;
					}
					i++; // Skip next argument as we consumed it
				}
				break;
			case '--session-name':
				if (nextArg && !nextArg.startsWith('--')) {
					config.sessionName = nextArg;
					i++; // Skip next argument as we consumed it
				}
				break;
			case '--plain-port':
				if (nextArg && !nextArg.startsWith('--')) {
					const plainPort = parseInt(nextArg);
					if (!isNaN(plainPort) && plainPort > 0 && plainPort <= 65535) {
						config.plainPort = plainPort;
					}
					i++; // Skip next argument as we consumed it
				}
				break;
			case '--pass':
				if (nextArg && !nextArg.startsWith('--')) {
					config.pass = nextArg;
					i++; // Skip next argument as we consumed it
				}
				break;
			case '--help':
				printHelp();
				break;
			default:
				// Check if it's a port number
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
