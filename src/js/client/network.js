import State from './state.js';
import { $, $$, websocketUI } from './ui.js';
import { createDefaultPalette } from './palette.js';
import { trustedMessage } from './messageGuard.js';
import { MoebiusAction, joinDocToDoc } from '../core/index';
import { Load } from './file.js';

/**
 * Remote collaborator cursors (native CURSOR/SELECTION rendering,
 * PLAN §3.6.3): one positioned box per peer id, placed through the
 * same scaled font metrics everything else uses.
 */
const createRemoteCursors = () => {
	/** @type {Map<number, HTMLElement>} */
	const cursors = new Map();
	const container = () => document.getElementById('canvasContainer');

	const show = (id, x, y) => {
		const host = container();
		if (!host || !State.font) {
			return;
		}
		let el = cursors.get(id);
		if (!el) {
			el = document.createElement('div');
			el.className = 'remoteCursor';
			el.style.position = 'absolute';
			el.style.pointerEvents = 'none';
			el.style.border = '1px solid #ff7518';
			el.style.zIndex = '900';
			host.appendChild(el);
			cursors.set(id, el);
		}
		const w = State.font.getWidth();
		const h = State.font.getHeight();
		el.style.left = `${x * w}px`;
		el.style.top = `${y * h}px`;
		el.style.width = `${w}px`;
		el.style.height = `${h}px`;
		el.style.display = 'block';
	};

	const hide = id => {
		const el = cursors.get(id);
		if (el) {
			el.style.display = 'none';
		}
	};

	const remove = id => {
		cursors.get(id)?.remove();
		cursors.delete(id);
	};

	const clear = () => {
		for (const el of cursors.values()) {
			el.remove();
		}
		cursors.clear();
	};

	return { show, hide, remove, clear };
};

const createWorkerHandler = inputHandle => {
	const btnJoin = $('joinCollaboration');
	const btnLocal = $('stayLocal');
	const lblFont = $$('#currentFontDisplay kbd');
	const selFont = $('fontSelect');
	const btn9pt = $('nav9pt');
	const btnIce = $('navICE');
	const btnNet = $('networkButton');

	try {
		State.worker = new Worker(new URL('./collabWorker.js', import.meta.url), { type: 'module' });
	} catch (error) {
		console.error('[Network] Failed to load collab worker:', error);
		return;
	}
	let handle = localStorage.getItem('handle');
	if (handle === null) {
		handle = 'Anonymous';
		localStorage.setItem('handle', handle);
	}
	inputHandle.value = handle;
	let connected = false;
	let collaborationMode = false;
	// explicit server url (?server=ws://...): remote dial on explicit
	// user intent; same-origin default otherwise (PLAN 3.6.3)
	const explicitServer =
		new URLSearchParams(window.location.search).get('server') ?? undefined;
	let applyReceivedSettings = false;
	const remoteCursors = createRemoteCursors();
	/** id -> nick, for rename detection (renames ride CHAT upstream) */
	const peerNicks = new Map();

	const onDisconnected = wasConnected => {
		const hadSession = connected && collaborationMode;
		connected = false;
		collaborationMode = false;
		remoteCursors.clear();
		peerNicks.clear();
		websocketUI(false);
		if (hadSession && wasConnected) {
			// the v2 defect: a dropped server was never noticed and local
			// autosave stayed paused forever; now the journal resumes and
			// the user hears about it
			alert(
				'You were disconnected from the server, try refreshing the page to try again.',
			);
		}
	};

	const onRemoteDraw = data => {
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const { x, y, block } = data;
		if (
			!Number.isInteger(x) ||
			!Number.isInteger(y) ||
			x < 0 ||
			y < 0 ||
			// bounds against OUR current dims: a draw serialized before a
			// resize must not land at a wrong index (landmine 7; draws
			// near concurrent resizes drop everywhere, by design)
			x >= columns ||
			y >= rows ||
			typeof block !== 'object' ||
			block === null
		) {
			return;
		}
		const word =
			((block.code & 0xff) << 8) | ((block.bg & 15) << 4) | (block.fg & 15);
		State.textArtCanvas.quickDraw([[y * columns + x, word, x, y]]);
	};

	const onRemoteChat = data => {
		const id = data.id;
		const nick = typeof data.nick === 'string' ? data.nick : 'guest';
		if (Number.isInteger(id)) {
			const known = peerNicks.get(id);
			if (known !== undefined && known !== nick) {
				State.chat.nick(nick, id, false);
			}
			peerNicks.set(id, nick);
		}
		State.chat.addConversation(nick, String(data.text ?? ''), true);
	};

	const onResize = (columns, rows) => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.textArtCanvas.resize(columns, rows);
		applyReceivedSettings = false;
	};

	const onFontChange = async fontName => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		await State.textArtCanvas.setFont(fontName, () => {
			// Update the font display UI
			lblFont.textContent = fontName;
			selFont.value = fontName;
		});
		applyReceivedSettings = false;
	};

	const onIceColorsChange = iceColors => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.textArtCanvas.setIceColors(iceColors);
		// Update the ice colors toggle UI
		if (iceColors) {
			btnIce.classList.add('enabled');
		} else {
			btnIce.classList.remove('enabled');
		}
		applyReceivedSettings = false;
	};

	const onLetterSpacingChange = letterSpacing => {
		applyReceivedSettings = true; // Flag to prevent re-broadcasting
		State.font.setLetterSpacing(letterSpacing);
		// Update the letter spacing toggle UI
		if (letterSpacing) {
			btn9pt.classList.add('enabled');
		} else {
			btn9pt.classList.remove('enabled');
		}
		applyReceivedSettings = false;
	};

	/** @param {number} type @param {any} data */
	const onFrame = async (type, data) => {
		switch (type) {
			case MoebiusAction.DRAW:
				onRemoteDraw(data);
				break;
			case MoebiusAction.CHAT:
				onRemoteChat(data);
				break;
			case MoebiusAction.JOIN: {
				const nick = typeof data.nick === 'string' ? data.nick : 'guest';
				peerNicks.set(data.id, nick);
				State.chat.join(nick, data.id, true);
				break;
			}
			case MoebiusAction.LEAVE:
				remoteCursors.remove(data.id);
				peerNicks.delete(data.id);
				State.chat.part(data.id);
				break;
			case MoebiusAction.CURSOR:
			case MoebiusAction.SELECTION:
				remoteCursors.show(data.id, data.x, data.y);
				break;
			case MoebiusAction.HIDE_CURSOR:
				remoteCursors.hide(data.id);
				break;
			case MoebiusAction.ICE_COLORS:
				onIceColorsChange(data.value === true);
				break;
			case MoebiusAction.USE_9PX_FONT:
				onLetterSpacingChange(data.value === true);
				break;
			case MoebiusAction.CHANGE_FONT:
				// landmine 6: Moebius speaks SAUCE font names ('IBM VGA');
				// map to app names, fall through raw for unknowns
				await onFontChange(
					Load.sauceToAppFont(data.font_name) ?? data.font_name,
				);
				break;
			case MoebiusAction.SET_CANVAS_SIZE:
				onResize(data.columns, data.rows);
				break;
			default:
				// STATUS, SAUCE, operations 17-20/22: nothing to render yet
				break;
		}
	};

	const onMessage = async msg => {
		if (!trustedMessage(msg)) {
			return;
		}
		const data = msg.data;
		switch (data.cmd) {
			case 'initialized':
				// scoped probe: same-origin default server only; no join and
				// no remote state until the user consents
				State.worker.postMessage({ cmd: 'probe', url: explicitServer });
				break;
			case 'probeResult':
				if (data.found) {
					showCollaborationChoice();
				}
				break;
			case 'connected':
				await adoptSession(data);
				break;
			case 'refused':
				alert('The collab server refused the connection.');
				stayLocal();
				break;
			case 'frame':
				if (collaborationMode) {
					await onFrame(data.type, data.data);
				}
				break;
			case 'closed':
				onDisconnected(data.wasConnected);
				break;
			case 'error':
				console.warn('[Network] worker error:', data.error);
				break;
		}
	};

	/** @param {number} type @param {object} data */
	const sendFrame = (type, data) => {
		if (collaborationMode && connected && !applyReceivedSettings) {
			State.worker.postMessage({ cmd: 'send', type, data });
		}
	};

	/**
	 * cells arrive from canvas.js as {x, y, block:{code, fg, bg}}; each
	 * becomes a per-cell DRAW (apply-locally-on-send: the server
	 * excludes the sender, so no echo comes back)
	 */
	const draw = cells => {
		if (collaborationMode && connected && Array.isArray(cells)) {
			State.worker.postMessage({ cmd: 'draw', cells });
		}
	};

	// no Moebius equivalent; kept as a no-op so old call sites are inert
	const sendCanvasSettings = _settings => {};

	const sendResize = (columns, rows) =>
		sendFrame(MoebiusAction.SET_CANVAS_SIZE, { columns, rows });

	const sendFontChange = fontName =>
		// landmine 6 outbound: peers (Moebius included) expect SAUCE names
		sendFrame(MoebiusAction.CHANGE_FONT, { font_name: Load.appToSauceFont(fontName) ?? fontName });

	const sendIceColorsChange = iceColors =>
		sendFrame(MoebiusAction.ICE_COLORS, { value: iceColors });

	const sendLetterSpacingChange = letterSpacing =>
		sendFrame(MoebiusAction.USE_9PX_FONT, { value: letterSpacing });

	const showCollaborationChoice = () => {
		State.modal.open('choice');
	};

	/**
	 * CONNECTED arrived: adopt the session doc and populate chat. This
	 * runs only after the user consented (joinCollaboration connects).
	 */
	const adoptSession = async data => {
		connected = true;
		collaborationMode = true;
		applyReceivedSettings = true;
		try {
			State.modal.loading(
				'Updating editor with data from the collab session...',
			);
			State.palette = createDefaultPalette();
			document.dispatchEvent(
				new CustomEvent('onPaletteChange', {
					detail: State.palette,
					bubbles: true,
					cancelable: false,
				}),
			);
			const result = joinDocToDoc(data.data.doc);
			State.textArtCanvas.setDocData(result.doc);
			if (result.fontName) {
				await onFontChange(Load.sauceToAppFont(result.fontName) ?? result.fontName);
			}
			State.font.setLetterSpacing(result.use9px);
			if (Array.isArray(data.data.users)) {
				for (const user of data.data.users) {
					const nick = typeof user.nick === 'string' ? user.nick : 'guest';
					peerNicks.set(user.id, nick);
					State.chat.join(nick, user.id, false);
				}
			}
			if (Array.isArray(data.data.chat_history)) {
				for (const entry of data.data.chat_history) {
					State.chat.addConversation(
						String(entry.nick ?? 'guest'),
						String(entry.text ?? ''),
						false,
					);
				}
			}
			btnNet.classList.add('hide');
			websocketUI(true);
			State.title = 'collab mode';
		} catch (error) {
			console.error('[Network] failed to adopt session doc:', error);
			stayLocal();
		} finally {
			applyReceivedSettings = false;
			State.modal.close();
		}
	};

	const joinCollaboration = () => {
		State.modal.loading('Joining the collab session...');
		State.worker.postMessage({
			cmd: 'connect',
			nick: handle,
			group: '',
			pass: '',
			caps: [],
			url: explicitServer,
		});
	};

	const stayLocal = () => {
		State.modal.close();
		collaborationMode = false;
		connected = false;
		websocketUI(false);
		State.worker.postMessage({ cmd: 'disconnect' });
		btnNet.classList.remove('hide');
		btnNet.addEventListener('click', _ => {
			showCollaborationChoice();
		});
	};

	const setHandle = newHandle => {
		if (handle !== newHandle) {
			handle = newHandle;
			localStorage.setItem('handle', handle);
			// moebius has no NICK frame: renames ride the next CHAT
		}
	};

	const sendChat = text => {
		if (connected) {
			sendFrame(MoebiusAction.CHAT, { nick: handle, group: '', text });
			// the server excludes the sender: render our own line locally
			State.chat.addConversation(handle, text, false);
		}
	};

	const isConnected = () => connected;

	// own-cursor sends, throttled ~100ms trailing (PLAN 3.6.3): peers
	// render it via the native CURSOR frames
	let cursorTimer = 0;
	let cursorPending = null;
	document.addEventListener('onTextCursorMove', e => {
		if (!collaborationMode || !connected) {
			return;
		}
		cursorPending = /** @type {CustomEvent} */ (e).detail;
		if (cursorTimer) {
			return;
		}
		cursorTimer = /** @type {number} */ (
			/** @type {unknown} */ (
				setTimeout(() => {
					cursorTimer = 0;
					if (cursorPending && connected) {
						sendFrame(MoebiusAction.CURSOR, {
							x: cursorPending.x,
							y: cursorPending.y,
						});
						cursorPending = null;
					}
				}, 100)
			)
		);
	});

	if (State.worker) {
		try {
			State.worker.addEventListener('message', onMessage);
			// Initialize the worker first - this MUST be the first message sent
			State.worker.postMessage({ cmd: 'init' });
		} catch (error) {
			console.error(
				'[Network] Failed to add message event listener to worker:',
				error,
			);
		}
	}

	// Set up collaboration choice dialog handlers
	btnJoin.addEventListener('click', joinCollaboration);
	btnLocal.addEventListener('click', stayLocal);

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
	btnChat,
	winChat,
	winMsg,
	winUsers,
	txtHandle,
	txtMsg,
	btnInput,
	checkNotifications,
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
	checkNotifications.checked = notifications;

	// Drag functionality for chat window
	const chatHeader = winChat.querySelector('header');
	const close = $('closeChat');
	let isDragging = false;
	let currentX = 0;
	let currentY = 0;
	let initialX = 0;
	let initialY = 0;

	const dragStart = e => {
		// Only drag when clicking on header or h2, not on child elements like inputs
		if (
			e.target === chatHeader ||
			e.target.tagName === 'H2' ||
			e.target.parentElement?.tagName === 'H2'
		) {
			initialX = e.clientX - currentX;
			initialY = e.clientY - currentY;
			isDragging = true;
			chatHeader.style.cursor = 'grabbing';
			winChat.classList.add('drag');
		}
	};

	const dragEnd = () => {
		isDragging = false;
		chatHeader.style.cursor = 'grab';
		winChat.classList.remove('drag');
	};

	const drag = e => {
		if (isDragging) {
			e.preventDefault();
			currentX = e.clientX - initialX;
			currentY = e.clientY - initialY;

			// Apply transform to move the chat window
			winChat.style.transform = `translate(${currentX}px, ${currentY}px)`;
		}
	};

	chatHeader.addEventListener('mousedown', dragStart);
	document.addEventListener('mouseup', dragEnd);
	document.addEventListener('mousemove', drag);

	const scrollToBottom = () => {
		const rect = winMsg.getBoundingClientRect();
		winMsg.scrollTop = winMsg.scrollHeight - rect.height;
	};

	const newNotification = text => {
		const notification = new Notification('text.0w.nz', {
			body: text,
			icon: `${State.uiDir}img/favicon.svg`,
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

	const addConversation = (handle, text, showNotification, log = false) => {
		const div = document.createElement('DIV');
		if (log) {
			const spanLog = document.createElement('SPAN');
			spanLog.textContent = `${text}`;
			spanLog.classList.add('log');
			div.appendChild(spanLog);
			if (showNotification) {
				newNotification(text);
			}
		} else {
			const spanHandle = document.createElement('SPAN');
			const spanSeparator = document.createElement('SPAN');
			const spanText = document.createElement('SPAN');
			spanHandle.textContent = handle;
			spanHandle.classList.add('handle');
			spanSeparator.textContent = ' ';
			spanText.textContent = text;
			div.appendChild(spanHandle);
			div.appendChild(spanSeparator);
			div.appendChild(spanText);
		}
		winMsg.appendChild(div);
		scrollToBottom();
		if (
			showNotification &&
			!enabled &&
			!btnChat.classList.contains('notification')
		) {
			btnChat.classList.add('notification');
		}
	};

	const onFocus = () => {
		onFocusCallback();
	};

	const onBlur = () => {
		onBlurCallback();
	};

	const blurHandle = _ => {
		if (txtHandle.value === '') {
			txtHandle.value = 'Anonymous';
		}
		State.network.setHandle(txtHandle.value);
	};

	const keypressHandle = e => {
		if (e.code === 'Enter') {
			txtMsg.focus();
		}
	};

	const onClick = _ => {
		if (txtMsg.value !== '') {
			const text = txtMsg.value;
			txtMsg.value = '';
			State.network.sendChat(text);
		}
	};
	const keypressMessage = e => {
		if (e.code === 'Enter') {
			if (txtMsg.value !== '') {
				const text = txtMsg.value;
				txtMsg.value = '';
				State.network.sendChat(text);
			}
		}
	};

	btnInput.addEventListener('click', onClick);
	txtHandle.addEventListener('focus', onFocus);
	txtHandle.addEventListener('blur', onBlur);
	txtMsg.addEventListener('focus', onFocus);
	txtMsg.addEventListener('blur', onBlur);
	txtHandle.addEventListener('blur', blurHandle);
	txtHandle.addEventListener('keypress', keypressHandle);
	txtMsg.addEventListener('keypress', keypressMessage);

	const toggle = _ => {
		if (enabled) {
			winChat.classList.add('hide');
			enabled = false;
			onBlurCallback();
			btnChat.classList.remove('active');
		} else {
			winChat.classList.remove('hide');
			enabled = true;
			scrollToBottom();
			onFocusCallback();
			txtMsg.focus();
			btnChat.classList.remove('notification');
			btnChat.classList.add('active');
		}
	};
	close.addEventListener('click', toggle);

	const isEnabled = () => {
		return enabled;
	};

	const join = (handle, sessionID, showNotification) => {
		if (userList[sessionID] === undefined) {
			userList[sessionID] = {
				handle: handle,
				div: document.createElement('DIV'),
			};
			const msg = `${handle} has joined`;
			userList[sessionID].div.classList.add('userName');
			userList[sessionID].div.textContent = handle;
			winUsers.appendChild(userList[sessionID].div);
			addConversation(handle, msg, showNotification, true);
		}
	};

	const nick = (handle, sessionID, showNotification) => {
		if (userList[sessionID] !== undefined) {
			const msg = `${userList[sessionID].handle} is now ${handle}`;
			userList[sessionID].handle = handle;
			userList[sessionID].div.textContent = handle;
			addConversation(handle, msg, showNotification, true);
		}
	};

	const part = sessionID => {
		if (userList[sessionID] !== undefined) {
			const handle = userList[sessionID].handle;
			const msg = `${handle} has quit`;
			winUsers.removeChild(userList[sessionID].div);
			delete userList[sessionID];
			addConversation(handle, msg, notifications, true);
		}
	};

	const notificationCheckboxClicked = _ => {
		if (checkNotifications.checked) {
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

	checkNotifications.addEventListener('click', notificationCheckboxClicked);

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
