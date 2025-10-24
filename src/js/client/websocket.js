/* global self:readonly */
let socket;
let sessionID;
let joint;
let trustedOrigin;

const send = (cmd, msg) => {
	if (socket && socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify([cmd, msg]));
	}
};

const onSockOpen = () => {
	self.postMessage({ cmd: 'connected' });
};

const onChat = (handle, text, showNotification) => {
	self.postMessage({ cmd: 'chat', handle, text, showNotification });
};

const onStart = (msg, newSessionID) => {
	joint = msg;
	sessionID = newSessionID;
	msg.chat.forEach(msg => {
		onChat(msg[0], msg[1], false);
	});

	// Forward canvas settings from start message to network layer
	self.postMessage({
		cmd: 'canvasSettings',
		settings: {
			columns: msg.columns,
			rows: msg.rows,
			iceColors: msg.iceColors,
			letterSpacing: msg.letterSpacing,
			fontName: msg.fontName,
		},
	});
};

const onJoin = (handle, joinSessionID, showNotification) => {
	if (joinSessionID === sessionID) {
		showNotification = false;
	}
	self.postMessage({
		cmd: 'join',
		sessionID: joinSessionID,
		handle,
		showNotification,
	});
};

const onNick = (handle, nickSessionID) => {
	self.postMessage({
		cmd: 'nick',
		sessionID: nickSessionID,
		handle,
		showNotification: nickSessionID !== sessionID,
	});
};

const onPart = sessionID => {
	self.postMessage({ cmd: 'part', sessionID });
};

const onDraw = blocks => {
	const outputBlocks = new Array();
	let index;
	blocks.forEach(block => {
		index = block >> 16;
		outputBlocks.push([
			index,
			block & 0xffff,
			index % joint.columns,
			Math.floor(index / joint.columns),
		]);
	});
	self.postMessage({ cmd: 'draw', blocks: outputBlocks });
};

const onMsg = e => {
	let data = e.data;
	if (typeof data === 'object') {
		const fr = new FileReader();
		fr.addEventListener('load', e => {
			self.postMessage({
				cmd: 'imageData',
				data: e.target.result,
				columns: joint.columns,
				rows: joint.rows,
				iceColors: joint.iceColors,
				letterSpacing: joint.letterSpacing,
			});
		});
		fr.readAsArrayBuffer(data);
	} else {
		try {
			data = JSON.parse(data);
		} catch {
			console.error('[Worker] Invalid data received from server');
			return;
		}

		switch (data[0]) {
			case 'start': {
				const serverID = data[2];
				const userList = data[3];
				Object.keys(userList).forEach(userSessionID => {
					onJoin(userList[userSessionID], userSessionID, false);
				});
				onStart(data[1], serverID);
				break;
			}
			case 'join':
				onJoin(data[1], data[2], true);
				break;
			case 'nick':
				onNick(data[1], data[2]);
				break;
			case 'draw':
				onDraw(data[1]);
				break;
			case 'part':
				onPart(data[1]);
				break;
			case 'chat':
				onChat(data[1], data[2], true);
				break;
			case 'canvasSettings':
				self.postMessage({ cmd: 'canvasSettings', settings: data[1] });
				break;
			case 'resize':
				self.postMessage({
					cmd: 'resize',
					columns: data[1].columns,
					rows: data[1].rows,
				});
				break;
			case 'fontChange':
				self.postMessage({ cmd: 'fontChange', fontName: data[1].fontName });
				break;
			case 'iceColorsChange':
				self.postMessage({
					cmd: 'iceColorsChange',
					iceColors: data[1].iceColors,
				});
				break;
			case 'letterSpacingChange':
				self.postMessage({
					cmd: 'letterSpacingChange',
					letterSpacing: data[1].letterSpacing,
				});
				break;
			default:
				console.warn('[Worker] Ignoring unknown command');
				break;
		}
	}
};

const removeDuplicates = blocks => {
	const indexes = [];
	let index;
	blocks = blocks.reverse();
	blocks = blocks.filter(block => {
		index = block >> 16;
		if (indexes.lastIndexOf(index) === -1) {
			indexes.push(index);
			return true;
		}
		return false;
	});
	return blocks.reverse();
};

// Main Handler
self.onmessage = msg => {
	// First message received will establish trust
	if (!trustedOrigin) {
		trustedOrigin = msg.origin;
	}

	// In same-origin contexts, origin can be "" or "null"
	if (
		msg.origin !== trustedOrigin &&
		msg.origin !== '' &&
		msg.origin !== 'null'
	) {
		console.warn(
			`[Worker] Discarding message from untrusted origin: ${msg.origin}`,
		);
		return;
	}

	const data = msg.data;
	switch (data.cmd) {
		case 'connect':
			try {
				socket = new WebSocket(data.url);

				// Attach event listeners to the WebSocket
				socket.addEventListener('open', onSockOpen);
				socket.addEventListener('message', onMsg);
				socket.addEventListener('close', e => {
					if (data.silentCheck) {
						self.postMessage({ cmd: 'silentCheckFailed' });
					} else {
						console.info(
							'[Worker] WebSocket connection closed. Code:',
							e.code,
							'Reason:',
							e.reason,
						);
						self.postMessage({ cmd: 'disconnected' });
					}
				});
				socket.addEventListener('error', () => {
					if (data.silentCheck) {
						self.postMessage({ cmd: 'silentCheckFailed' });
					} else {
						self.postMessage({
							cmd: 'error',
							error: 'WebSocket connection failed.',
						});
					}
				});
			} catch (error) {
				if (data.silentCheck) {
					self.postMessage({ cmd: 'silentCheckFailed' });
				} else {
					self.postMessage({
						cmd: 'error',
						error: `WebSocket initialization failed: ${error.message}`,
					});
				}
			}
			break;
		case 'join':
			send('join', data.handle);
			break;
		case 'nick':
			send('nick', data.handle);
			break;
		case 'chat':
			send('chat', data.text);
			break;
		case 'draw':
			send('draw', removeDuplicates(data.blocks));
			break;
		case 'canvasSettings':
			send('canvasSettings', data.settings);
			break;
		case 'resize':
			send('resize', { columns: data.columns, rows: data.rows });
			break;
		case 'fontChange':
			send('fontChange', { fontName: data.fontName });
			break;
		case 'iceColorsChange':
			send('iceColorsChange', { iceColors: data.iceColors });
			break;
		case 'letterSpacingChange':
			send('letterSpacingChange', { letterSpacing: data.letterSpacing });
			break;
		case 'disconnect':
			if (socket) {
				socket.close();
			}
			break;
		case 'init':
			break;
		default:
			break;
	}
};
