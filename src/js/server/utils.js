// usage flags
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

// strips possibly sensitive headers
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

const createTimestampedFilename = (sessionName, extension) => {
	// windows safe name
	const timestamp = new Date().toISOString().replace(/[:]/g, '-');
	return `${sessionName}-${timestamp}.${extension}`;
};

export { printHelp, cleanHeaders, createTimestampedFilename };
