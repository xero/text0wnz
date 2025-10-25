import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs';
import { load, save } from './fileio.js';
import { callout, sanitize, createTimestampedFilename } from './utils.js';

const SESSION_DIR = path.resolve('./sessions');
const userList = {};
let imageData;
let chat = [];
let debug = false;
let sessionName = 'joint'; // Default session name

const initialize = config => {
	sessionName = config.sessionName;
	debug = config.debug || false;
	if (debug) {
		console.log('* Initializing text0wnz with session name:', sessionName);
	}
	if (!existsSync(SESSION_DIR)) {
		mkdirSync(SESSION_DIR, { recursive: true });
		if (debug) {
			console.log('* Creating session directory:', SESSION_DIR);
		}
	}
	loadSession();
};

const log = msg => {
	debug ? callout(msg) : console.log(`* ${sanitize(msg)}`);
};

const loadSession = () => {
	const chatFile = path.join(SESSION_DIR, `${sessionName}.json`);
	const binFile = path.join(SESSION_DIR, `${sessionName}.bin`);

	// Validate and sanitize file paths
	if (!chatFile.startsWith(SESSION_DIR) || !binFile.startsWith(SESSION_DIR)) {
		console.error('[Error] Invalid session file path');
		return;
	}

	// Load chat history
	readFile(chatFile, 'utf8', (err, data) => {
		if (!err) {
			try {
				chat = JSON.parse(data).chat;
				if (debug) {
					console.log('* Loaded chat history from:', chatFile);
				}
			} catch (parseErr) {
				console.error('[Error] parsing chat file:', sanitize(parseErr));
				chat = [];
			}
		} else {
			if (debug) {
				console.log('* No existing chat file found, starting with empty chat');
			}
			chat = [];
		}
	});

	// Load or create canvas data
	load(binFile, loadedImageData => {
		if (loadedImageData !== undefined) {
			imageData = loadedImageData;
			if (debug) {
				console.log('* Loaded canvas data from:', binFile);
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
				console.log(`* Created default canvas: `, sanitize(c + 'x' + r));
			}
			// Save the new session file
			save(binFile, imageData, () => {
				if (debug) {
					console.log('* Created new session file:', binFile);
				}
			});
		}
	});
};

const sendToAll = (clients, msg) => {
	const message = JSON.stringify(msg);
	if (debug) {
		console.log(
			'[Broadcasting]',
			sanitize(msg[0]),
			'to',
			clients.size,
			'clients',
		);
	}

	clients.forEach(client => {
		try {
			if (client.readyState === 1) {
				// WebSocket.OPEN
				client.send(message);
			}
		} catch (e) {
			console.error('[Error] sending to client:', sanitize(e));
		}
	});
};

const saveSessionWithTimestamp = callback => {
	const binTime = path.join(
		SESSION_DIR,
		createTimestampedFilename(sessionName, 'bin'),
	);
	save(binTime, imageData, callback);
};

const saveSession = callback => {
	const chatFile = path.join(SESSION_DIR, `${sessionName}.json`);
	const binFile = path.join(SESSION_DIR, `${sessionName}.bin`);
	writeFile(chatFile, JSON.stringify({ chat: chat }), () => {
		save(binFile, imageData, callback);
	});
};

const getStart = sessionID => {
	if (!imageData) {
		console.error('! ImageData not initialized');
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
		console.error('! ImageData not initialized');
		return { data: new Uint16Array(0) };
	}
	return imageData;
};

const message = (msg, sessionID, clients) => {
	if (!imageData) {
		console.error('! ImageData not initialized, ignoring message');
		return;
	}

	switch (msg[0]) {
		case 'join': {
			const handle = sanitize(msg[1]);
			log(`${handle} has joined`);
			userList[sessionID] = handle;
			msg[1] = handle;
			msg.push(sessionID);
			break;
		}
		case 'nick': {
			const oldHandle = sanitize(userList[sessionID] || 'Anonymous');
			const newHandle = sanitize(msg[1]);
			console.log(`> ${oldHandle} is now ${newHandle}`);
			userList[sessionID] = newHandle;
			msg[1] = newHandle;
			msg.push(sessionID);
			break;
		}
		case 'chat': {
			const handle = sanitize(userList[sessionID] || 'Anonymous');
			const chatText = sanitize(msg[1]);
			msg.splice(1, 0, handle);
			msg[2] = chatText;
			chat.push([handle, chatText]);
			if (chat.length > 128) {
				chat.shift();
			}
			break;
		}
		case 'draw':
			msg[1].forEach(block => {
				imageData.data[block >> 16] = block & 0xffff;
			});
			break;
		case 'resize':
			if (msg[1] && msg[1].columns && msg[1].rows) {
				console.log(
					'[Server] Set canvas size:',
					`${sanitize(msg[1].columns)}x${sanitize(msg[1].rows)}`,
				);
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
				console.log('[Server] set font:', sanitize(msg[1].fontName));
				imageData.fontName = msg[1].fontName;
			}
			break;
		case 'iceColorsChange':
			if (msg[1] && Object.hasOwn(msg[1], 'iceColors')) {
				console.log('[Server] ice colors:', sanitize(msg[1].iceColors));
				imageData.iceColors = msg[1].iceColors;
			}
			break;
		case 'letterSpacingChange':
			if (msg[1] && Object.hasOwn(msg[1], 'letterSpacing')) {
				console.log('[Server] letter spacing:', sanitize(msg[1].letterSpacing));
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
		log(`${sanitize(userList[sessionID])} has quit.`);
		delete userList[sessionID];
	}
	sendToAll(clients, ['part', sessionID]);
};
export {
	initialize,
	saveSessionWithTimestamp,
	saveSession,
	getStart,
	getImageData,
	message,
	closeSession,
};
export default {
	initialize,
	saveSessionWithTimestamp,
	saveSession,
	getStart,
	getImageData,
	message,
	closeSession,
};
