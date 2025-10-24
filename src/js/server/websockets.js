import text0wnz from './text0wnz.js';
import { callout, sanitize, anonymizeIp } from './utils.js';

let debug;
let allClients;

const webSocketInit = (config, clients) => {
	debug = config.debug || false;
	allClients = clients;
};
const onWebSocketConnection = (ws, req) => {
	const anonID = req.sessionID.slice(0, req.sessionID.length * 0.5) + 'XXXXXX';
	callout('New WebSocket Connection');
	console.log(`- Timestamp: ${new Date().toISOString()}`);
	console.log(`- Session ID: ${anonID}`);
	if (debug) {
		const ip = req.connection.remoteAddress || req.ip;
		console.log(`- Remote IP: ${anonymizeIp(ip)}`);
		console.log(`- User-Agent: ${req.headers['user-agent']}`);
		console.log(`- Origin: ${req.headers['origin']}`);
		console.log(`- URL: ${req.url}`);
	}
	allClients.add(ws);

	// Send initial data
	try {
		const startData = text0wnz.getStart(req.sessionID);
		ws.send(startData);

		const imageData = text0wnz.getImageData();
		if (imageData?.data) {
			ws.send(imageData.data, { binary: true });
		}
	} catch (err) {
		console.error('Error sending initial data:', err);
		ws.close(1011, 'Server error during initialization');
	}

	ws.on('message', msg => {
		try {
			const parsedMsg = JSON.parse(msg);
			text0wnz.message(parsedMsg, req.sessionID, allClients);
		} catch (err) {
			console.error('Error parsing message:', err, sanitize(msg.toString()));
		}
	});

	ws.on('close', (_code, _reason) => {
		allClients.delete(ws);
		text0wnz.closeSession(req.sessionID, allClients);
	});

	ws.on('error', err => {
		console.error('WebSocket error:', err);
		allClients.delete(ws);
	});
};
export { webSocketInit, onWebSocketConnection };
