import text0wnz from './text0wnz.js';

let debug;
let allClients;

const webSocketInit = (config, clients) => {
	debug = config.debug || false;
	allClients = clients;
};
const onWebSocketConnection = (ws, req) => {
	console.log('╓───── New WebSocket Connection');
	console.log('╙───────────────────────────────── ─ ─');
	console.log(`- Timestamp: ${new Date().toISOString()}`);
	console.log(`- Session ID: ${req.sessionID}`);
	if (debug) {
		console.log(`- Remote address: ${req.connection.remoteAddress || req.ip}`);
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
			console.error('Error parsing message:', err, msg.toString());
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
