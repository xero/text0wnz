// Usage flags
const printHelp = () => {
	console.log(`teXt0wnz backend server
Usage: {bun,node} server.js [port] [options]

Options:
  --ssl                 Enable SSL (requires certificates in ssl-dir)
  --ssl-dir <path>      SSL certificate directory (default: /etc/ssl/private)
  --save-interval <min> Auto-save interval in minutes (default: 30)
  --session-name <name> Session file prefix (default: joint)
  --debug               Enable verbose console messages
  --help                Show this help message

Examples:
  bun server.js 8080 --ssl --session-name myart --debug
  node server.js --save-interval 60 --session-name collaborative
`);
	process.exit(0);
};

const callout = msg => {
	console.log(
		`╓─────  ${sanitize(msg)}\n╙───────────────────────────────── ─ ─`,
	);
};

const createTimestampedFilename = (sessionName, extension) => {
	// Windows safe file names
	const timestamp = new Date().toISOString().replace(/[:]/g, '-');
	return `${sessionName}-${timestamp}.${extension}`;
};

// Strips possibly sensitive headers
const cleanHeaders = headers => {
	const SENSITIVE_HEADERS = [
		'authorization',
		'cookie',
		'set-cookie',
		'proxy-authorization',
		'x-api-key',
	];
	const redacted = {};
	for (const [key, value] of Object.entries(headers)) {
		if (SENSITIVE_HEADERS.includes(key.toLowerCase())) {
			redacted[key] = '[REDACTED]';
		} else {
			redacted[key] = value;
		}
	}
	return redacted;
};

// Strips Unicode control characters, newlines, limits length, and adds quotes
const sanitize = input => {
	if (input === null || input === undefined) {
		return '';
	}
	const str = String(input)
		.trim()
		.replace(/\p{C}/gu, '')
		.replace(/[\n\r]/g, '')
		.substring(0, 100);
	return `'${str}'`;
};

const anonymizeIp = ip => {
	if (!ip) {
		return 'unknown';
	}
	// Handle IPv4-mapped IPv6 addresses (e.g. reverse proxy)
	if (ip.includes('::ffff:')) {
		ip = ip.split(':').pop();
	}
	// Mask the final octet
	if (ip.includes('.')) {
		const parts = ip.split('.');
		parts[3] = 'X';
		return parts.join('.');
	}
	if (ip.includes(':')) {
		const parts = ip.split(':');
		const anonymizedParts = parts.slice(0, 4);
		while (anonymizedParts.length < 8) {
			anonymizedParts.push('X');
		}
		return anonymizedParts.join(':');
	}
	return 'unknown';
};

export {
	printHelp,
	callout,
	createTimestampedFilename,
	cleanHeaders,
	sanitize,
	anonymizeIp,
};
