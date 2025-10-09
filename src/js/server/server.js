import path from 'path';
import { existsSync, readFileSync } from 'fs';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import express from 'express';
import session from 'express-session';
import expressWs from 'express-ws';
import { cleanHeaders } from './utils.js';
import { webSocketInit, onWebSocketConnection } from './websockets.js';
import text0wnz from './text0wnz.js';

const startServer = config => {
	let server;

	// Check if SSL certificates exist and use HTTPS, otherwise fallback to HTTP
	if (config.ssl) {
		const certPath = path.join(config.sslDir, 'letsencrypt-domain.pem');
		const keyPath = path.join(config.sslDir, 'letsencrypt-domain.key');

		try {
			if (existsSync(certPath) && existsSync(keyPath)) {
				server = createHttpsServer({
					cert: readFileSync(certPath),
					key: readFileSync(keyPath),
				});
				console.log(
					'Using HTTPS server with SSL certificates from:',
					config.sslDir,
				);
			} else {
				throw new Error(`SSL certificates not found in ${config.sslDir}`);
			}
		} catch (err) {
			console.error('SSL Error:', err.message);
			console.log('Falling back to HTTP server');
			server = createHttpServer();
		}
	} else {
		server = createHttpServer();
		console.log('Using HTTP server (SSL disabled)');
	}

	const app = express();
	const allClients = new Set();

	// Important: Set up session middleware before WebSocket handling
	app.use(session({ resave: false, saveUninitialized: true, secret: 'sauce' }));
	app.use(express.static('public'));

	// Initialize express-ws with the server AFTER session middleware
	expressWs(app, server);

	// Debugging middleware for WebSocket upgrade requests
	app.use('/server', (req, _res, next) => {
		if (config.debug) {
			console.log(`Request to /server endpoint:
  - Method: ${req.method}
  - Headers: ${JSON.stringify(cleanHeaders(req.headers))}
  - Connection header: ${req.headers.connection}
  - Upgrade header: ${req.headers.upgrade}`);
		}
		next();
	});

	// WebSocket handler function
	webSocketInit(config, allClients);
	// WebSocket routes for both direct and proxy connections
	app.ws('/', onWebSocketConnection);
	app.ws('/server', onWebSocketConnection);

	server.listen(config.port, () => {
		if (config.debug) {
			console.log(`Server listening on port: ${config.port}`);
		}
	});

	setInterval(() => {
		text0wnz.saveSessionWithTimestamp(() => {});
		text0wnz.saveSession(() => {});
	}, config.saveInterval);

	process.on('SIGINT', () => {
		text0wnz.saveSession(() => process.exit());
	});
};
export { startServer };
