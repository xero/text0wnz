import { printHelp } from './utils.js';

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
