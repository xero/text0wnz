import { readFile, writeFile } from 'fs';
import { load, save } from './fileio.js';
import { createTimestampedFilename } from './utils.js';

let imageData;
const userList = {};
let chat = [];
let debug = false;
let sessionName = 'joint'; // Default session name

// Initialize the module with configuration
const initialize = config => {
	sessionName = config.sessionName;
	debug = config.debug || false;
	if (debug) {
		console.log('Initializing text0wnz with session name:', sessionName);
	}

	// Load or create session files
	loadSession();
};

const loadSession = () => {
	const chatFile = sessionName + '.json';
	const binFile = sessionName + '.bin';

	// Load chat history
	readFile(chatFile, 'utf8', (err, data) => {
		if (!err) {
			try {
				chat = JSON.parse(data).chat;
				if (debug) {
					console.log('Loaded chat history from:', chatFile);
				}
			} catch(parseErr) {
				console.error('Error parsing chat file:', parseErr);
				chat = [];
			}
		} else {
			if (debug) {
				console.log('No existing chat file found, starting with empty chat');
			}
			chat = [];
		}
	});

	// Load or create canvas data
	load(binFile, loadedImageData => {
		if (loadedImageData !== undefined) {
			imageData = loadedImageData;
			if (debug) {
				console.log('Loaded canvas data from:', binFile);
			}
		} else {
			// create default
			const c = 80;
			const r = 50;
			imageData = {
				columns: c,
				rows: r,
				data: new Uint16Array(c * r),
				iceColors: false,
				letterSpacing: false,
				fontName: 'CP437 8x16', // Default font
			};
			if (debug) {
				console.log(`Created default canvas: ${c}x${r}`);
			}
			// Save the new session file
			save(binFile, imageData, () => {
				if (debug) {
					console.log('Created new session file:', binFile);
				}
			});
		}
	});
};

const sendToAll = (clients, msg) => {
	const message = JSON.stringify(msg);
	if (debug) {
		console.log('Broadcasting message to', clients.size, 'clients:', msg[0]);
	}

	clients.forEach(client => {
		try {
			if (client.readyState === 1) {
				// WebSocket.OPEN
				client.send(message);
			}
		} catch(err) {
			console.error('Error sending to client:', err);
		}
	});
};

const saveSessionWithTimestamp = callback => {
	save(createTimestampedFilename(sessionName, 'bin'), imageData, callback);
};

const saveSession = callback => {
	writeFile(sessionName + '.json', JSON.stringify({ chat: chat }), () => {
		save(sessionName + '.bin', imageData, callback);
	});
};

const getStart = sessionID => {
	if (!imageData) {
		console.error('ImageData not initialized');
		return JSON.stringify(['error', 'Server not ready']);
	}
	return JSON.stringify([
		'start',
		{
			columns: imageData.columns,
			rows: imageData.rows,
			letterSpacing: imageData.letterSpacing,
			iceColors: imageData.iceColors,
			fontName: imageData.fontName || 'CP437 8x16', // Include font with fallback
			chat: chat,
		},
		sessionID,
		userList,
	]);
};

const getImageData = () => {
	if (!imageData) {
		console.error('ImageData not initialized');
		return { data: new Uint16Array(0) };
	}
	return imageData;
};

const message = (msg, sessionID, clients) => {
	if (!imageData) {
		console.error('ImageData not initialized, ignoring message');
		return;
	}

	switch (msg[0]) {
		case 'join':
			console.log(`${msg[1]} has joined`);
			userList[sessionID] = msg[1];
			msg.push(sessionID);
			break;
		case 'nick':
			console.log(`${userList[sessionID]} is now ${msg[1]}`);
			userList[sessionID] = msg[1];
			msg.push(sessionID);
			break;
		case 'chat':
			msg.splice(1, 0, userList[sessionID]);
			chat.push([msg[1], msg[2]]);
			if (chat.length > 128) {
				chat.shift();
			}
			break;
		case 'draw':
			msg[1].forEach(block => {
				imageData.data[block >> 16] = block & 0xffff;
			});
			break;
		case 'resize':
			if (msg[1] && msg[1].columns && msg[1].rows) {
				if (debug) {
					console.log('Server: Updating canvas size to', msg[1].columns, 'x', msg[1].rows);
				}
				imageData.columns = msg[1].columns;
				imageData.rows = msg[1].rows;
				// Resize the data array
				const newSize = msg[1].columns * msg[1].rows;
				const newData = new Uint16Array(newSize);
				const copyLength = Math.min(imageData.data.length, newSize);
				for (let i = 0; i < copyLength; i++) {
					newData[i] = imageData.data[i];
				}
				imageData.data = newData;
			}
			break;
		case 'fontChange':
			if (msg[1] && Object.hasOwn(msg[1], 'fontName')) {
				if (debug) {
					console.log('Server: Updating font to', msg[1].fontName);
				}
				imageData.fontName = msg[1].fontName;
			}
			break;
		case 'iceColorsChange':
			if (msg[1] && Object.hasOwn(msg[1], 'iceColors')) {
				if (debug) {
					console.log('Server: Updating ice colors to', msg[1].iceColors);
				}
				imageData.iceColors = msg[1].iceColors;
			}
			break;
		case 'letterSpacingChange':
			if (msg[1] && Object.hasOwn(msg[1], 'letterSpacing')) {
				if (debug) {
					console.log('Server: Updating letter spacing to', msg[1].letterSpacing);
				}
				imageData.letterSpacing = msg[1].letterSpacing;
			}
			break;
		default:
			break;
	}
	sendToAll(clients, msg);
};

const closeSession = (sessionID, clients) => {
	if (userList[sessionID] !== undefined) {
		console.log(`${userList[sessionID]} has quit.`);
		delete userList[sessionID];
	}
	sendToAll(clients, ['part', sessionID]);
};
export { initialize, saveSessionWithTimestamp, saveSession, getStart, getImageData, message, closeSession };
export default {
	initialize,
	saveSessionWithTimestamp,
	saveSession,
	getStart,
	getImageData,
	message,
	closeSession,
};
