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

// Strips Unicode control characters and newlines,
// limits length, and optionally adds quotes
const sanitize = (input, limit = 100, quote = true) => {
	if (input === null || input === undefined) {
		return '';
	}
	const str = String(input)
		.trim()
		.replace(/\p{C}/gu, '')
		.replace(/[\n\r]/g, '')
		.substring(0, limit);
	return quote ? `'${str}'` : str;
};

const anonymizeIp = ip => {
	if (!ip) {
		return 'unknown';
	}
	let normalizedIp = ip;
	if (normalizedIp.includes('::ffff:')) {
		normalizedIp = normalizedIp.split(':').pop();
	}
	// Mask the final octet for IPv4
	if (ip.includes('.')) {
		const parts = ip.split('.');
		parts[3] = 'X';
		return parts.join('.');
	}
	// Handle IPv6 (including compressed notation)
	if (ip.includes(':')) {
		const expandIPv6 = address => {
			const [head, tail] = address.split('::');
			const headParts = head ? head.split(':').filter(Boolean) : [];
			const tailParts = tail ? tail.split(':').filter(Boolean) : [];
			const missing = 8 - (headParts.length + tailParts.length);
			const zeros = Array(missing > 0 ? missing : 0).fill('0');
			return [...headParts, ...zeros, ...tailParts];
		};
		const parts = expandIPv6(ip);
		if (parts.length !== 8) {
			return 'unknown';
		}
		// Mask the last 4 segments
		for (let i = 4; i < 8; i++) {
			parts[i] = 'X';
		}
		return parts.join(':');
	}
};

export {
	printHelp,
	callout,
	createTimestampedFilename,
	cleanHeaders,
	sanitize,
	anonymizeIp,
};
