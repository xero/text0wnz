import State from './state.js';
import { $, $$, showOverlay, hideOverlay, websocketUI } from './ui.js';

const createWorkerHandler = inputHandle => {
	const workerPath = `${import.meta.env.BASE_URL}ui/worker.js`;
	try {
		State.worker = new Worker(workerPath);
	} catch(error) {
		console.error(`Failed to load worker from ${workerPath}:`, error);
	}

	let handle = localStorage.getItem('handle');
	if (handle === null) {
		handle = 'Anonymous';
		localStorage.setItem('handle', handle);
	}
	inputHandle.value = handle;
	let connected = false;
	let silentCheck = false;
	let collaborationMode = false;
	let pendingImageData = null;
	let pendingCanvasSettings = null; // Store settings during silent check
	let silentCheckTimer = null;
	let applyReceivedSettings = false; // Flag to prevent broadcasting when applying settings from server
	let initializing = false; // Flag to prevent broadcasting during initial collaboration setup
	State.worker.postMessage({ cmd: 'handle', handle: handle });

	const onConnected = () => {
		websocketUI(true);
		$('artwork-title').value = window.location.hostname;
		State.worker.postMessage({ cmd: 'join', handle: handle });
		connected = true;
	};

	const onDisconnected = () => {
		if (connected === true) {
			alert('You were disconnected from the server, try refreshing the page to try again.');
		} else if (!silentCheck) {
			hideOverlay($('websocket-overlay'));
		}
		websocketUI(false);
		// If this was a silent check and it failed, just stay in local mode
		connected = false;
	};

	const onImageData = (columns, rows, data, iceColors, letterSpacing) => {
		if (silentCheck) {
			// Clear the timeout since we received image data
			if (silentCheckTimer) {
				clearTimeout(silentCheckTimer);
				silentCheckTimer = null;
			}
			// Store image data for later use if user chooses collaboration
			pendingImageData = { columns, rows, data, iceColors, letterSpacing };
			// Now show the collaboration choice dialog
			showCollaborationChoice();
		} else if (collaborationMode) {
			// Apply image data immediately only in collaboration mode
			State.textArtCanvas.setImageData(columns, rows, data, iceColors, letterSpacing);
			hideOverlay($('websocket-overlay'));
		}
	};

	const onChat = (handle, text, showNotification) => {
		State.chat.addConversation(handle, text, showNotification);
	};

	const onJoin = (handle, sessionID, showNotification) => {
		State.chat.join(handle, sessionID, showNotification);
	};

	const onPart = sessionID => {
		State.chat.part(sessionID);
	};

	const onNick = (handle, sessionID, showNotification) => {
		State.chat.nick(handle, sessionID, showNotification);
	};

	const onDraw = blocks => {
		State.textArtCanvas.quickDraw(blocks);
	};

	const onCanvasSettings = settings => {
		if (silentCheck) {
			// Store settings during silent check instead of applying them
			pendingCanvasSettings = settings;
			return;
		}

		// Only apply settings if we're in collaboration mode
		if (!collaborationMode) {
			return;
		}

		// Set flag to prevent re-broadcasting
		applyReceivedSettings = true;

		if (settings.columns !== undefined && settings.rows !== undefined) {
			State.textArtCanvas.resize(settings.columns, settings.rows);
		}
		if (settings.fontName !== undefined) {
			State.textArtCanvas.setFont(settings.fontName, () => {});
		}
		if (settings.iceColors !== undefined) {
			State.textArtCanvas.setIceColors(settings.iceColors);
			// Update the ice colors toggle UI
			if ($('navICE')) {
				const iceColorsToggle = $('navICE');
				if (settings.iceColors) {
					iceColorsToggle.classList.add('enabled');
				} else {
					iceColorsToggle.classList.remove('enabled');
				}
			}
		}
		if (settings.letterSpacing !== undefined) {
			State.font.setLetterSpacing(settings.letterSpacing);
			// Update the letter spacing toggle UI
			if ($('nav9pt')) {
				const letterSpacingToggle = $('nav9pt');
				if (settings.letterSpacing) {
					letterSpacingToggle.classList.add('enabled');
				} else {
					letterSpacingToggle.classList.remove('enabled');
				}
			}
		}
		applyReceivedSettings = false;

		// If this was during initialization, we're now ready to send changes
		if (initializing) {
			initializing = false;
		}
	};

	const onResize = (columns, rows) => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.textArtCanvas.resize(columns, rows);
		applyReceivedSettings = false;
	};

	const onFontChange = fontName => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.textArtCanvas.setFont(fontName, () => {
			// Update the font display UI
			if ($$('#current-font-display kbd')) {
				$$('#current-font-display kbd').textContent = fontName;
			}
			if ($('font-select')) {
				$('font-select').value = fontName;
			}
		});
		applyReceivedSettings = false;
	};

	const onIceColorsChange = iceColors => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.textArtCanvas.setIceColors(iceColors);
		// Update the ice colors toggle UI
		if ($('navICE')) {
			const iceColorsToggle = $('navICE');
			if (iceColors) {
				iceColorsToggle.classList.add('enabled');
			} else {
				iceColorsToggle.classList.remove('enabled');
			}
		}
		applyReceivedSettings = false;
	};

	const onLetterSpacingChange = letterSpacing => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.font.setLetterSpacing(letterSpacing);
		// Update the letter spacing toggle UI
		if ($('nav9pt')) {
			const letterSpacingToggle = $('nav9pt');
			if (letterSpacing) {
				letterSpacingToggle.classList.add('enabled');
			} else {
				letterSpacingToggle.classList.remove('enabled');
			}
		}
		applyReceivedSettings = false;
	};

	const onMessage = msg => {
		const data = msg.data;
		switch (data.cmd) {
			case 'connected':
				if (silentCheck) {
					// Silent check succeeded - send join to get full session data
					State.worker.postMessage({ cmd: 'join', handle: handle });
					// Use async timeout to show dialog if no image data comes within 2 seconds
					silentCheckTimer = setTimeout(() => {
						if (silentCheck) {
							showCollaborationChoice();
						}
					}, 2000);
				} else {
					// Direct connection - proceed with collaboration
					onConnected();
				}
				break;
			case 'disconnected':
				onDisconnected();
				break;
			case 'error':
				if (silentCheck) {
					console.log('Failed to connect to server: ' + data.error);
				} else {
					alert('Failed to connect to server: ' + data.error);
				}
				break;
			case 'imageData':
				onImageData(data.columns, data.rows, new Uint16Array(data.data), data.iceColors, data.letterSpacing);
				break;
			case 'chat':
				onChat(data.handle, data.text, data.showNotification);
				break;
			case 'join':
				onJoin(data.handle, data.sessionID, data.showNotification);
				break;
			case 'part':
				onPart(data.sessionID);
				break;
			case 'nick':
				onNick(data.handle, data.sessionID, data.showNotification);
				break;
			case 'draw':
				onDraw(data.blocks);
				break;
			case 'canvasSettings':
				onCanvasSettings(data.settings);
				break;
			case 'resize':
				onResize(data.columns, data.rows);
				break;
			case 'fontChange':
				onFontChange(data.fontName);
				break;
			case 'iceColorsChange':
				onIceColorsChange(data.iceColors);
				break;
			case 'letterSpacingChange':
				onLetterSpacingChange(data.letterSpacing);
				break;
		}
	};

	const draw = blocks => {
		if (collaborationMode && connected) {
			State.worker.postMessage({ cmd: 'draw', blocks: blocks });
		}
	};

	const sendCanvasSettings = settings => {
		if (collaborationMode && connected && !applyReceivedSettings && !initializing) {
			State.worker.postMessage({ cmd: 'canvasSettings', settings: settings });
		}
	};

	const sendResize = (columns, rows) => {
		if (collaborationMode && connected && !applyReceivedSettings && !initializing) {
			State.worker.postMessage({ cmd: 'resize', columns: columns, rows: rows });
		}
	};

	const sendFontChange = fontName => {
		if (collaborationMode && connected && !applyReceivedSettings && !initializing) {
			State.worker.postMessage({ cmd: 'fontChange', fontName: fontName });
		}
	};

	const sendIceColorsChange = iceColors => {
		if (collaborationMode && connected && !applyReceivedSettings && !initializing) {
			State.worker.postMessage({ cmd: 'iceColorsChange', iceColors: iceColors });
		}
	};

	const sendLetterSpacingChange = letterSpacing => {
		if (collaborationMode && connected && !applyReceivedSettings && !initializing) {
			State.worker.postMessage({ cmd: 'letterSpacingChange', letterSpacing: letterSpacing });
		}
	};

	const showCollaborationChoice = () => {
		showOverlay($('collaboration-choice-overlay'));
		// Reset silent check flag since we're now in interactive mode
		silentCheck = false;
		// Clear any remaining timer
		if (silentCheckTimer) {
			clearTimeout(silentCheckTimer);
			silentCheckTimer = null;
		}
	};

	const joinCollaboration = () => {
		hideOverlay($('collaboration-choice-overlay'));
		showOverlay($('websocket-overlay'));
		collaborationMode = true;
		initializing = true; // Set flag to prevent broadcasting during initial setup

		// Apply pending image data if available
		if (pendingImageData) {
			State.textArtCanvas.setImageData(
				pendingImageData.columns,
				pendingImageData.rows,
				pendingImageData.data,
				pendingImageData.iceColors,
				pendingImageData.letterSpacing,
			);
			pendingImageData = null;
		}

		// Apply pending canvas settings if available
		if (pendingCanvasSettings) {
			onCanvasSettings(pendingCanvasSettings);
			pendingCanvasSettings = null;
		}

		// The connection is already established and we already sent join during silent check
		// Just need to apply the UI changes for collaboration mode
		websocketUI(true);
		$('artwork-title').value = window.location.hostname;
		connected = true;

		// Settings will be received automatically from the start message
		// through the canvasSettings mechanism we implemented in the worker

		// Hide the overlay since we're ready
		hideOverlay($('websocket-overlay'));
	};

	const stayLocal = () => {
		hideOverlay($('collaboration-choice-overlay'));
		collaborationMode = false;
		pendingImageData = null; // Clear any pending server data
		pendingCanvasSettings = null; // Clear any pending server settings
		websocketUI(false);
		// Disconnect the websocket since user wants local mode
		State.worker.postMessage({ cmd: 'disconnect' });
	};

	const setHandle = newHandle => {
		if (handle !== newHandle) {
			handle = newHandle;
			localStorage.setItem('handle', handle);
			State.worker.postMessage({ cmd: 'nick', handle: handle });
		}
	};

	const sendChat = text => {
		State.worker.postMessage({ cmd: 'chat', text: text });
	};

	const isConnected = () => {
		return connected;
	};

	State.worker.addEventListener('message', onMessage);

	// Set up collaboration choice dialog handlers
	$('join-collaboration').addEventListener('click', joinCollaboration);
	$('stay-local').addEventListener('click', stayLocal);

	// Use ws:// for HTTP server, wss:// for HTTPS server
	const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';

	// Check if we're running through a proxy (like nginx) by checking the port
	// If we're on standard HTTP/HTTPS ports, use /server path, otherwise connect directly
	const isProxied = window.location.port === '' || window.location.port === '80' || window.location.port === '443';
	let wsUrl;

	if (isProxied) {
		// Running through proxy (nginx) - use /server path
		wsUrl = protocol + window.location.host + '/server';
		console.info('Network: Detected proxy setup, checking server at:', wsUrl);
	} else {
		// Direct connection - use port 1337
		wsUrl = protocol + window.location.hostname + ':1337' + window.location.pathname;
		console.info('Network: Direct connection mode, checking server at:', wsUrl);
	}

	// Start with a silent connection check
	silentCheck = true;
	State.worker.postMessage({ cmd: 'connect', url: wsUrl, silentCheck: true });

	return {
		draw: draw,
		setHandle: setHandle,
		sendChat: sendChat,
		isConnected: isConnected,
		joinCollaboration: joinCollaboration,
		stayLocal: stayLocal,
		sendCanvasSettings: sendCanvasSettings,
		sendResize: sendResize,
		sendFontChange: sendFontChange,
		sendIceColorsChange: sendIceColorsChange,
		sendLetterSpacingChange: sendLetterSpacingChange,
	};
};

const createChatController = (
	divChatButton,
	divChatWindow,
	divMessageWindow,
	divUserList,
	inputHandle,
	inputMessage,
	inputNotificationCheckbox,
	onFocusCallback,
	onBlurCallback,
) => {
	let enabled = false;
	const userList = {};
	let notifications = localStorage.getItem('notifications');
	if (notifications === null) {
		notifications = false;
		localStorage.setItem('notifications', notifications);
	} else {
		notifications = JSON.parse(notifications);
	}
	inputNotificationCheckbox.checked = notifications;

	const scrollToBottom = () => {
		const rect = divMessageWindow.getBoundingClientRect();
		divMessageWindow.scrollTop = divMessageWindow.scrollHeight - rect.height;
	};

	const newNotification = text => {
		const notification = new Notification($('artwork-title').value + ' - text.0w.nz', {
			body: text,
			icon: `${import.meta.env.BASE_URL}ui/face.png`,
		});
		// Auto-close notification after 7 seconds
		const notificationTimer = setTimeout(() => {
			notification.close();
		}, 7000);

		// Clean up timer if notification is manually closed
		notification.addEventListener('close', () => {
			clearTimeout(notificationTimer);
		});
	};

	const addConversation = (handle, text, showNotification) => {
		const div = document.createElement('DIV');
		const spanHandle = document.createElement('SPAN');
		const spanSeperator = document.createElement('SPAN');
		const spanText = document.createElement('SPAN');
		spanHandle.textContent = handle;
		spanHandle.classList.add('handle');
		spanSeperator.textContent = ' ';
		spanText.textContent = text;
		div.appendChild(spanHandle);
		div.appendChild(spanSeperator);
		div.appendChild(spanText);
		const rect = divMessageWindow.getBoundingClientRect();
		const doScroll =
			rect.height > divMessageWindow.scrollHeight ||
			divMessageWindow.scrollTop === divMessageWindow.scrollHeight - rect.height;
		divMessageWindow.appendChild(div);
		if (doScroll) {
			scrollToBottom();
		}
		if (showNotification === true && enabled === false && divChatButton.classList.contains('notification') === false) {
			divChatButton.classList.add('notification');
		}
	};

	const onFocus = () => {
		onFocusCallback();
	};

	const onBlur = () => {
		onBlurCallback();
	};

	const blurHandle = _ => {
		if (inputHandle.value === '') {
			inputHandle.value = 'Anonymous';
		}
		State.network.setHandle(inputHandle.value);
	};

	const keypressHandle = e => {
		if (e.code === 'Enter') {
			// Enter key
			inputMessage.focus();
		}
	};

	const keypressMessage = e => {
		if (e.code === 'Enter') {
			// Enter key
			if (inputMessage.value !== '') {
				const text = inputMessage.value;
				inputMessage.value = '';
				State.network.sendChat(text);
			}
		}
	};

	inputHandle.addEventListener('focus', onFocus);
	inputHandle.addEventListener('blur', onBlur);
	inputMessage.addEventListener('focus', onFocus);
	inputMessage.addEventListener('blur', onBlur);
	inputHandle.addEventListener('blur', blurHandle);
	inputHandle.addEventListener('keypress', keypressHandle);
	inputMessage.addEventListener('keypress', keypressMessage);

	const toggle = () => {
		if (enabled === true) {
			divChatWindow.style.display = 'none';
			enabled = false;
			onBlurCallback();
			divChatButton.classList.remove('active');
		} else {
			divChatWindow.style.display = 'block';
			enabled = true;
			scrollToBottom();
			onFocusCallback();
			inputMessage.focus();
			divChatButton.classList.remove('notification');
			divChatButton.classList.add('active');
		}
	};

	const isEnabled = () => {
		return enabled;
	};

	const join = (handle, sessionID, showNotification) => {
		if (userList[sessionID] === undefined) {
			if (notifications === true && showNotification === true) {
				newNotification(handle + ' has joined');
			}
			userList[sessionID] = { handle: handle, div: document.createElement('DIV') };
			userList[sessionID].div.classList.add('user-name');
			userList[sessionID].div.textContent = handle;
			divUserList.appendChild(userList[sessionID].div);
		}
	};

	const nick = (handle, sessionID, showNotification) => {
		if (userList[sessionID] !== undefined) {
			if (showNotification === true && notifications === true) {
				newNotification(userList[sessionID].handle + ' has changed their name to ' + handle);
			}
			userList[sessionID].handle = handle;
			userList[sessionID].div.textContent = handle;
		}
	};

	const part = sessionID => {
		if (userList[sessionID] !== undefined) {
			if (notifications === true) {
				newNotification(userList[sessionID].handle + ' has left');
			}
			divUserList.removeChild(userList[sessionID].div);
			delete userList[sessionID];
		}
	};

	const globalToggleKeydown = e => {
		if (e.code === 'Escape') {
			// Escape key
			toggle();
		}
	};

	const notificationCheckboxClicked = _ => {
		if (inputNotificationCheckbox.checked) {
			if (Notification.permission !== 'granted') {
				Notification.requestPermission(_permission => {
					notifications = true;
					localStorage.setItem('notifications', notifications);
				});
			} else {
				notifications = true;
				localStorage.setItem('notifications', notifications);
			}
		} else {
			notifications = false;
			localStorage.setItem('notifications', notifications);
		}
	};

	document.addEventListener('keydown', globalToggleKeydown);
	inputNotificationCheckbox.addEventListener('click', notificationCheckboxClicked);

	return {
		addConversation: addConversation,
		toggle: toggle,
		isEnabled: isEnabled,
		join: join,
		nick: nick,
		part: part,
	};
};

export { createWorkerHandler, createChatController };
