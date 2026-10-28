/* eslint-disable prefer-arrow-callback */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	createWorkerHandler,
	createChatController,
} from '../../src/js/client/network.js';
import { $, onEnter } from '../../src/js/client/ui.js';
import {
	EXT_SUITE_CAP,
	MoebiusAction,
	T0wnzAction,
	compressExtCells,
	paletteColor,
} from '../../src/js/core/index.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		worker: null,
		modal: {
			close: vi.fn(),
			open: vi.fn(),
			loading: vi.fn(),
			error: vi.fn(),
			onClose: vi.fn(),
		},
		title: '',
		textArtCanvas: {
			setImageData: vi.fn(),
			setDocData: vi.fn(),
			drawRemoteExtCells: vi.fn(),
			resize: vi.fn(),
			setFont: vi.fn(),
			setIceColors: vi.fn(),
			quickDraw: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			getDoc: vi.fn(() => ({ palette: new Uint32Array(16) })),
			redrawEntireImage: vi.fn(),
		},
		chat: {
			addConversation: vi.fn(),
			join: vi.fn(),
			part: vi.fn(),
			nick: vi.fn(),
		},
		font: { setLetterSpacing: vi.fn(), setPalette: vi.fn() },
		network: {
			setHandle: vi.fn(),
			sendChat: vi.fn(),
		},
	},
}));

vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(_id => ({
		value: '',
		style: { display: 'block' },
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
			toggle: vi.fn(),
			contains: vi.fn(() => false),
		},
		addEventListener: vi.fn(),
		appendChild: vi.fn(),
		removeChild: vi.fn(),
		textContent: '',
		checked: false,
		focus: vi.fn(),
		getBoundingClientRect: vi.fn(() => ({ height: 100 })),
		scrollHeight: 200,
		scrollTop: 0,
	})),
	$$: vi.fn(_id => ({
		value: '',
		style: { display: 'block' },
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
			toggle: vi.fn(),
			contains: vi.fn(() => false),
		},
		addEventListener: vi.fn(),
		appendChild: vi.fn(),
		removeChild: vi.fn(),
		textContent: '',
		checked: false,
		focus: vi.fn(),
		getBoundingClientRect: vi.fn(() => ({ height: 100 })),
		scrollHeight: 200,
		scrollTop: 0,
	})),
	showOverlay: vi.fn(),
	hideOverlay: vi.fn(),
	websocketUI: vi.fn(),
	onEnter: vi.fn(),
}));

vi.mock('../../src/js/client/palette.js', () => ({
	createDefaultPalette: vi.fn(() => ({})),
	createPalette: vi.fn(() => ({})),
}));

vi.stubGlobal('document', {
	getElementsByClassName: vi.fn(() => []),
	addEventListener: vi.fn(),
	createElement: vi.fn(() => ({
		classList: { add: vi.fn() },
		textContent: '',
		appendChild: vi.fn(),
	})),
	getElementById: vi.fn(() => ({
		value: '',
		style: { display: 'block' },
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
			toggle: vi.fn(),
			contains: vi.fn(() => false),
		},
		addEventListener: vi.fn(),
		appendChild: vi.fn(),
		removeChild: vi.fn(),
		textContent: '',
		checked: false,
		focus: vi.fn(),
		getBoundingClientRect: vi.fn(() => ({ height: 100 })),
		scrollHeight: 200,
		scrollTop: 0,
	})),
	querySelector: vi.fn(() => null),
	dispatchEvent: vi.fn(),
});

global.window = {
	location: {
		hostname: 'localhost',
		protocol: 'http:',
		host: 'localhost:3000',
		port: '3000',
		pathname: '/',
	},
};

vi.stubGlobal('localStorage', {
	getItem: vi.fn(() => null),
	setItem: vi.fn(),
});

global.Worker = vi.fn(function () {
	return {
		addEventListener: vi.fn(),
		postMessage: vi.fn(),
		removeEventListener: vi.fn(),
	};
});

global.alert = vi.fn();
global.console = { log: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() };

global.Notification = vi.fn(function () {
	return {
		addEventListener: vi.fn(),
		close: vi.fn(),
	};
});
global.Notification.permission = 'granted';
global.Notification.requestPermission = vi.fn();

global.setTimeout = vi.fn();
global.clearTimeout = vi.fn();

describe('Network Module', () => {
	let mockInputHandle;
	let mockWorker;

	beforeEach(() => {
		vi.clearAllMocks();

		mockInputHandle = {
			value: '',
			addEventListener: vi.fn(),
		};

		mockWorker = {
			addEventListener: vi.fn(),
			postMessage: vi.fn(),
			removeEventListener: vi.fn(),
		};

		global.Worker.mockImplementation(function () {
			return mockWorker;
		});
		global.localStorage.getItem.mockReturnValue(null);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('createWorkerHandler', () => {
		it('should create worker handler with proper interface', () => {
			const handler = createWorkerHandler(mockInputHandle);

			expect(handler).toHaveProperty('draw');
			expect(handler).toHaveProperty('setHandle');
			expect(handler).toHaveProperty('sendChat');
			expect(handler).toHaveProperty('isConnected');
			expect(handler).toHaveProperty('joinCollaboration');
			expect(handler).toHaveProperty('stayLocal');
			expect(handler).toHaveProperty('sendCanvasSettings');
			expect(handler).toHaveProperty('sendResize');
			expect(handler).toHaveProperty('sendFontChange');
			expect(handler).toHaveProperty('sendIceColorsChange');
			expect(handler).toHaveProperty('sendLetterSpacingChange');

			expect(typeof handler.draw).toBe('function');
			expect(typeof handler.setHandle).toBe('function');
			expect(typeof handler.sendChat).toBe('function');
			expect(typeof handler.isConnected).toBe('function');
		});

		it('should initialize with Anonymous handle from localStorage', () => {
			createWorkerHandler(mockInputHandle);

			expect(global.localStorage.getItem).toHaveBeenCalledWith('handle');
			expect(global.localStorage.setItem).toHaveBeenCalledWith(
				'handle',
				'Anonymous',
			);
			expect(mockInputHandle.value).toBe('Anonymous');
		});

		it('should use existing handle from localStorage', () => {
			global.localStorage.getItem.mockReturnValue('ExistingUser');

			createWorkerHandler(mockInputHandle);

			expect(mockInputHandle.value).toBe('ExistingUser');
			expect(global.localStorage.setItem).not.toHaveBeenCalled();
		});

		it('should create worker and set up message handling', () => {
			createWorkerHandler(mockInputHandle);

			expect(mockWorker.postMessage).toHaveBeenCalledWith({ cmd: 'init' });
			expect(mockWorker.addEventListener).toHaveBeenCalledWith(
				'message',
				expect.any(Function),
			);
		});

		it('probes after init without joining (consent-first)', () => {
			createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			messageListener({ data: { cmd: 'initialized' } });
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ cmd: 'probe' });
			// a found server only opens the choice modal; no connect yet
			messageListener({ data: { cmd: 'probeResult', found: true } });
			expect(State.modal.open).toHaveBeenCalledWith('choice');
			const cmds = mockWorker.postMessage.mock.calls.map(c => c[0].cmd);
			expect(cmds).not.toContain('connect');
		});

		it('a fresh join after a wrong password prompts again', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			global.window.prompt = vi.fn(() => 'typo');
			handler.joinCollaboration();
			await messageListener({ data: { cmd: 'refused' } });
			expect(global.window.prompt).toHaveBeenCalledTimes(1);
			// the typo is refused: alert, back to local
			await messageListener({ data: { cmd: 'refused' } });
			expect(global.alert).toHaveBeenCalledTimes(1);
			// the next click on the network button must prompt again, not
			// alert forever until a reload
			handler.joinCollaboration();
			await messageListener({ data: { cmd: 'refused' } });
			expect(global.window.prompt).toHaveBeenCalledTimes(2);
		});

		it('the invitation names a link-chosen server', () => {
			global.window.location.search = '?server=ws://jam.example:8000/lounge';
			try {
				createWorkerHandler(mockInputHandle);
				listenerOf()({ data: { cmd: 'probeResult', found: true } });
				expect(State.modal.open).toHaveBeenCalledWith('choice');
				expect(elementFor('choiceServer').textContent).toBe(
					' at jam.example/lounge',
				);
			} finally {
				global.window.location.search = '';
			}
		});

		it('ignores a probe that finds nothing', () => {
			createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			messageListener({ data: { cmd: 'probeResult', found: false } });
			expect(State.modal.open).not.toHaveBeenCalled();
		});

		// the ui mock hands out a fresh element per lookup; find the one
		// the handler captured for an id and fire its click
		const elementFor = id => {
			const index = $.mock.calls.findIndex(call => call[0] === id);
			return $.mock.results[index].value;
		};
		const clickOn = id => {
			const el = elementFor(id);
			el.addEventListener.mock.calls.find(call => call[0] === 'click')[1]();
		};
		const listenerOf = () =>
			mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];

		it('the network button opens the connect form with the handle filled in', () => {
			global.localStorage.getItem.mockImplementation(key =>
				(key === 'handle' ? 'xero' : null));
			createWorkerHandler(mockInputHandle);
			clickOn('networkButton');
			expect(State.modal.open).toHaveBeenCalledWith('connect');
			expect(elementFor('connectNick').value).toBe('xero');
		});

		it('connecting from the form dials the parsed address and remembers it', async () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = '127.0.0.1:9000/jam';
			elementFor('connectPass').value = 'pw';
			elementFor('connectNick').value = 'xero';
			elementFor('connectGroup').value = 'impure';
			clickOn('connectJoin');
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'connect',
				nick: 'xero',
				group: 'impure',
				pass: 'pw',
				caps: [EXT_SUITE_CAP],
				url: 'ws://127.0.0.1:9000/jam',
			});
			expect(global.localStorage.setItem).toHaveBeenCalledWith('group', 'impure');
			// the recent list waits for a server that answers
			expect(global.localStorage.setItem).not.toHaveBeenCalledWith(
				'collabServers',
				expect.anything(),
			);
			const blank = { code: 32, fg: 7, bg: 0 };
			await listenerOf()({
				data: {
					cmd: 'connected',
					data: { caps: [], doc: { columns: 1, rows: 1, data: [blank]}, users: []},
				},
			});
			expect(global.localStorage.setItem).toHaveBeenCalledWith(
				'collabServers',
				JSON.stringify(['127.0.0.1:9000/jam']),
			);
		});

		it('a typo never enters the recent list', async () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'jam.exmaple';
			clickOn('connectJoin');
			await listenerOf()({ data: { cmd: 'closed', wasConnected: false } });
			expect(global.localStorage.setItem).not.toHaveBeenCalledWith(
				'collabServers',
				expect.anything(),
			);
		});

		it('dismissing the Joining modal ends the dial', () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'jam.example';
			clickOn('connectJoin');
			const dismissed = State.modal.onClose.mock.calls.at(-1)[0];
			mockWorker.postMessage.mockClear();
			dismissed();
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ cmd: 'disconnect' });
			// the dial is over: a late close must not pop the form back up
			State.modal.open.mockClear();
			return listenerOf()({ data: { cmd: 'closed', wasConnected: false } }).then(
				() => {
					expect(State.modal.open).not.toHaveBeenCalled();
				},
			);
		});

		it('a worker error before the handshake reports like a dead socket', async () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'jam.example';
			clickOn('connectJoin');
			await listenerOf()({ data: { cmd: 'error', error: 'SecurityError' } });
			expect(State.modal.close).toHaveBeenCalled();
			expect(elementFor('connectStatus').textContent).toMatch(/Could not connect/);
		});

		it('a blank ?server= counts as absent', () => {
			global.window.location.search = '?server=';
			try {
				createWorkerHandler(mockInputHandle);
				listenerOf()({ data: { cmd: 'probeResult', found: true } });
				clickOn('networkButton');
				expect(elementFor('connectServer').value).toBe(
					'ws://localhost:3000/server',
				);
			} finally {
				global.window.location.search = '';
			}
		});

		it('a worker that will not construct hides the local button', () => {
			global.Worker.mockImplementation(() => {
				throw new Error('no module workers here');
			});
			expect(createWorkerHandler(mockInputHandle)).toBeUndefined();
			expect(elementFor('networkButton').hidden).toBe(true);
			expect(elementFor('networkButton').disabled).toBe(true);
		});

		it('a refusal on the typed path returns to the form instead of prompting', async () => {
			createWorkerHandler(mockInputHandle);
			global.window.prompt = vi.fn();
			elementFor('connectServer').value = 'jam.example';
			clickOn('connectJoin');
			await listenerOf()({ data: { cmd: 'refused' } });
			expect(global.window.prompt).not.toHaveBeenCalled();
			expect(State.modal.open).toHaveBeenLastCalledWith('connect');
			expect(elementFor('connectStatus').textContent).toMatch(/refused/);
		});

		it('a dial that dies before the handshake reports instead of stranding the loading modal', async () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'jam.example';
			clickOn('connectJoin');
			expect(State.modal.loading).toHaveBeenCalled();
			await listenerOf()({ data: { cmd: 'closed', wasConnected: false } });
			expect(State.modal.close).toHaveBeenCalled();
			expect(elementFor('connectStatus').textContent).toMatch(
				/Could not connect to jam\.example/,
			);
			expect(global.alert).not.toHaveBeenCalled();
		});

		it('a dead bridged dial blames the site, not the server alone', async () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'jam.example';
			clickOn('connectJoin');
			// browsers fire error before close: the error message is the
			// one that ends the dial, so it must carry the route
			await listenerOf()({ data: { cmd: 'error', error: 'websocket error', bridged: true } });
			expect(elementFor('connectStatus').textContent).toMatch(/bridge/);
			// the close that follows must not report a second time
			State.modal.open.mockClear();
			await listenerOf()({ data: { cmd: 'closed', wasConnected: false, bridged: true } });
			expect(State.modal.open).not.toHaveBeenCalled();
		});

		it('a clean close before the handshake still reads the route', async () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'jam.example';
			clickOn('connectJoin');
			await listenerOf()({ data: { cmd: 'closed', wasConnected: false, bridged: true } });
			expect(elementFor('connectStatus').textContent).toMatch(/bridge/);
		});

		it('the join palette of our own server is read at the depth we know', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			// every component under 64: the wire heuristic would expand it
			const dark = Array.from({ length: 16 }, () => ({ r: 16, g: 8, b: 32 }));
			await listenerOf()({
				data: {
					cmd: 'connected',
					data: {
						caps: [EXT_SUITE_CAP],
						doc: { columns: 1, rows: 1, data: [blank], palette: dark },
						users: [],
					},
				},
			});
			const doc = State.textArtCanvas.setDocData.mock.calls.at(-1)[0];
			expect(doc.palette[1]).toBe((16 << 16) | (8 << 8) | 32);
		});

		it('a reply after dismissal adopts nothing and prompts nothing', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			global.window.prompt = vi.fn();
			handler.joinCollaboration();
			State.modal.onClose.mock.calls.at(-1)[0]();
			mockWorker.postMessage.mockClear();
			State.textArtCanvas.setDocData.mockClear();
			const blank = { code: 32, fg: 7, bg: 0 };
			await listenerOf()({
				data: {
					cmd: 'connected',
					data: { caps: [], doc: { columns: 1, rows: 1, data: [blank]}, users: []},
				},
			});
			expect(State.textArtCanvas.setDocData).not.toHaveBeenCalled();
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ cmd: 'disconnect' });
			await listenerOf()({ data: { cmd: 'refused' } });
			expect(global.window.prompt).not.toHaveBeenCalled();
		});

		it('a bad address never dials', () => {
			createWorkerHandler(mockInputHandle);
			elementFor('connectServer').value = 'http://nope';
			clickOn('connectJoin');
			const cmds = mockWorker.postMessage.mock.calls.map(c => c[0].cmd);
			expect(cmds).not.toContain('connect');
			expect(elementFor('connectStatus').textContent).toMatch(/host:port/);
		});

		it('should handle connection state management', () => {
			const handler = createWorkerHandler(mockInputHandle);

			expect(handler.isConnected()).toBe(false);

			expect(mockWorker.addEventListener).toHaveBeenCalledWith(
				'message',
				expect.any(Function),
			);
		});

		it('should handle draw commands when connected', () => {
			const handler = createWorkerHandler(mockInputHandle);
			const blocks = [0x41, 0x42, 0x43];

			handler.draw(blocks);
			expect(mockWorker.postMessage).not.toHaveBeenCalledWith({
				cmd: 'draw',
				blocks: blocks,
			});
		});

		it('should handle setHandle functionality', () => {
			const handler = createWorkerHandler(mockInputHandle);
			mockWorker.postMessage.mockClear();
			handler.setHandle('NewHandle');
			expect(global.localStorage.setItem).toHaveBeenCalledWith(
				'handle',
				'NewHandle',
			);
			// moebius has no NICK frame; the rename rides the next CHAT
			expect(mockWorker.postMessage).not.toHaveBeenCalled();
		});

		it('should not update handle if same', () => {
			global.localStorage.getItem.mockReturnValue('ExistingUser');
			const handler = createWorkerHandler(mockInputHandle);

			vi.clearAllMocks();

			handler.setHandle('ExistingUser');
			expect(global.localStorage.setItem).not.toHaveBeenCalled();
			expect(mockWorker.postMessage).not.toHaveBeenCalledWith({
				cmd: 'nick',
				handle: 'ExistingUser',
			});
		});

		it('sendChat is inert while disconnected (server excludes sender)', () => {
			const handler = createWorkerHandler(mockInputHandle);
			mockWorker.postMessage.mockClear();
			handler.sendChat('Hello world');
			// not connected: nothing hits the wire and nothing renders
			const cmds = mockWorker.postMessage.mock.calls.map(c => c[0].cmd);
			expect(cmds).not.toContain('send');
		});

		it('the collab join rebinds the font to the default palette', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			State.font.setPalette.mockClear();
			await messageListener({
				data: {
					cmd: 'connected',
					data: {
						caps: [],
						doc: { columns: 2, rows: 1, data: [blank, blank]},
						users: [],
						chat_history: [],
					},
				},
			});
			// without the rebind the later setLetterSpacing rebuild runs
			// against the handle's stale palette ref
			expect(State.font.setPalette).toHaveBeenCalledWith(State.palette);
		});

		it('EXT_PALETTE rebinds the live font handle', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			await messageListener({
				data: {
					cmd: 'connected',
					data: {
						caps: [EXT_SUITE_CAP],
						doc: { columns: 2, rows: 1, data: [blank, blank]},
						users: [],
						chat_history: [],
					},
				},
			});
			State.font.setPalette.mockClear();
			await messageListener({
				data: {
					cmd: 'frame',
					type: T0wnzAction.EXT_PALETTE,
					data: { palette: Array.from({ length: 16 }, (_, i) => i) },
				},
			});
			expect(State.font.setPalette).toHaveBeenCalledWith(State.palette);
		});

		it('replays own in-flight ops after an EXT_SYNC snapshot', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			await messageListener({
				data: {
					cmd: 'connected',
					data: {
						caps: [EXT_SUITE_CAP],
						doc: { columns: 2, rows: 1, data: [blank, blank]},
						users: [],
						chat_history: [],
					},
				},
			});
			// an in-flight resize: sent, unacked
			handler.sendResize(100, 30);
			State.textArtCanvas.resize.mockClear();
			State.textArtCanvas.setDocData.mockClear();
			// the sync snapshot was cut before our resize and the server
			// never echoes our own ops back: without the replay the local
			// doc silently reverts to the snapshot's dimensions
			await messageListener({
				data: {
					cmd: 'frame',
					type: T0wnzAction.EXT_SYNC,
					data: {
						columns: 2,
						rows: 1,
						cells: compressExtCells(
							Array.from({ length: 2 }, () => ({ u: 32, a: 0, fg: 7, bg: 0 })),
						),
						seq: 5,
					},
				},
			});
			expect(State.textArtCanvas.setDocData).toHaveBeenCalled();
			expect(State.textArtCanvas.resize).toHaveBeenCalledWith(100, 30);
		});

		it('a remote apply that throws leaves settings sends working', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			await messageListener({
				data: {
					cmd: 'connected',
					data: {
						caps: [EXT_SUITE_CAP],
						doc: { columns: 2, rows: 1, data: [blank, blank]},
						users: [],
						chat_history: [],
					},
				},
			});
			// a low-memory phone failing to allocate a peer's huge canvas
			State.textArtCanvas.resize.mockImplementationOnce(() => {
				throw new RangeError('canvas too large');
			});
			await messageListener({ data: { cmd: 'frame', type: MoebiusAction.SET_CANVAS_SIZE, data: { id: 1, columns: 900, rows: 9000 } } }).catch(() => {});
			mockWorker.postMessage.mockClear();
			handler.sendResize(100, 30);
			// a stuck depth would mute this, and every later setting, in silence
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'send',
				type: MoebiusAction.SET_CANVAS_SIZE,
				data: { columns: 100, rows: 30 },
			});
		});

		it('a settings change made while a sync loads its font still goes out', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			await messageListener({
				data: {
					cmd: 'connected',
					data: {
						caps: [EXT_SUITE_CAP],
						doc: { columns: 2, rows: 1, data: [blank, blank]},
						users: [],
						chat_history: [],
					},
				},
			});
			// the join's follow-up sync names a font; hold the load open
			let finishFont;
			State.textArtCanvas.setFont.mockImplementationOnce(
				() => new Promise(resolve => (finishFont = resolve)),
			);
			const syncing = messageListener({
				data: {
					cmd: 'frame',
					type: T0wnzAction.EXT_SYNC,
					data: {
						columns: 2,
						rows: 1,
						cells: compressExtCells(
							Array.from({ length: 2 }, () => ({ u: 32, a: 0, fg: 7, bg: 0 })),
						),
						seq: 5,
						font_name: 'IBM VGA',
					},
				},
			});
			await vi.waitFor(() => expect(finishFont).toBeTypeOf('function'));
			mockWorker.postMessage.mockClear();
			// the artist resizes mid-load: applied locally, so it has to
			// reach the server or the room diverges with no seq gap to tell
			handler.sendResize(100, 30);
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'send',
				type: MoebiusAction.SET_CANVAS_SIZE,
				data: { columns: 100, rows: 30 },
			});
			finishFont();
			await syncing;
		});

		it('a fork color past the classic 16 keeps its index on a live DRAW', async () => {
			const handler = createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			handler.joinCollaboration();
			const blank = { code: 32, fg: 7, bg: 0 };
			await messageListener({
				data: {
					cmd: 'connected',
					data: {
						caps: [],
						doc: { columns: 2, rows: 1, data: [blank, blank]},
						users: [],
						chat_history: [],
					},
				},
			});
			State.textArtCanvas.drawRemoteExtCells.mockClear();
			State.textArtCanvas.quickDraw.mockClear();
			const draw = block =>
				messageListener({ data: { cmd: 'frame', type: MoebiusAction.DRAW, data: { id: 1, x: 1, y: 0, block } } });
			// moebiusXBIN paints from a 256-color palette; a u16 word keeps
			// four bits a color, so 196 on 17 used to land as 4 on 1
			await draw({ code: 65, fg: 196, bg: 17 });
			expect(State.textArtCanvas.drawRemoteExtCells).toHaveBeenCalledWith([{ x: 1, y: 0, u: 65, a: 0, fg: paletteColor(196), bg: paletteColor(17) }]);
			expect(State.textArtCanvas.quickDraw).not.toHaveBeenCalled();
			// the classic 16 stay on the fast path
			await draw({ code: 65, fg: 12, bg: 1 });
			expect(State.textArtCanvas.quickDraw).toHaveBeenCalledWith([[1, (65 << 8) | (1 << 4) | 12, 1, 0]]);
		});

		it('should handle canvas settings when not in collaboration mode', () => {
			const handler = createWorkerHandler(mockInputHandle);

			handler.sendCanvasSettings({ columns: 80, rows: 25 });
			handler.sendResize(80, 25);
			handler.sendFontChange('CP437 8x8');
			handler.sendIceColorsChange(true);
			handler.sendLetterSpacingChange(false);

			expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({ cmd: 'canvasSettings' }),
			);
			expect(mockWorker.postMessage).not.toHaveBeenCalledWith(
				expect.objectContaining({ cmd: 'resize' }),
			);
		});
	});

	describe('createChatController', () => {
		let mockElements;

		beforeEach(() => {
			mockElements = {
				divChatButton: {
					classList: {
						add: vi.fn(),
						remove: vi.fn(),
						contains: vi.fn(() => false),
					},
				},
				divMessageWindow: {
					appendChild: vi.fn(),
					getBoundingClientRect: vi.fn(() => ({ height: 100 })),
					scrollHeight: 200,
					scrollTop: 0,
				},
				divUserList: { appendChild: vi.fn(), removeChild: vi.fn() },
				inputHandle: { value: '', addEventListener: vi.fn(), focus: vi.fn() },
				inputMessage: { value: '', addEventListener: vi.fn(), focus: vi.fn() },
				inputButton: { addEventListener: vi.fn() },
				inputNotificationCheckbox: {
					checked: false,
					addEventListener: vi.fn(),
				},
			};

			global.localStorage.getItem.mockImplementation(key => {
				if (key === 'notifications') {
					return 'false';
				}
				return null;
			});
		});

		it('should create chat controller with proper interface', () => {
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				onFocus,
				onBlur,
			);

			expect(controller).toHaveProperty('addConversation');
			expect(controller).toHaveProperty('toggle');
			expect(controller).toHaveProperty('isEnabled');
			expect(controller).toHaveProperty('join');
			expect(controller).toHaveProperty('nick');
			expect(controller).toHaveProperty('part');

			expect(typeof controller.addConversation).toBe('function');
			expect(typeof controller.toggle).toBe('function');
			expect(typeof controller.isEnabled).toBe('function');
		});

		it('should set up event listeners', () => {
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				onFocus,
				onBlur,
			);

			expect(mockElements.inputHandle.addEventListener).toHaveBeenCalledWith(
				'focus',
				expect.any(Function),
			);
			expect(mockElements.inputHandle.addEventListener).toHaveBeenCalledWith(
				'blur',
				expect.any(Function),
			);
			expect(mockElements.inputMessage.addEventListener).toHaveBeenCalledWith(
				'focus',
				expect.any(Function),
			);
			expect(mockElements.inputMessage.addEventListener).toHaveBeenCalledWith(
				'blur',
				expect.any(Function),
			);
			// Enter rides the shared onEnter detector, never keypress:
			// Android IMEs skip keypress and ship an empty e.code
			expect(onEnter).toHaveBeenCalledWith(
				mockElements.inputHandle,
				expect.any(Function),
			);
			expect(onEnter).toHaveBeenCalledWith(
				mockElements.inputMessage,
				expect.any(Function),
			);
			expect(
				mockElements.inputHandle.addEventListener,
			).not.toHaveBeenCalledWith('keypress', expect.any(Function));
			expect(
				mockElements.inputMessage.addEventListener,
			).not.toHaveBeenCalledWith('keypress', expect.any(Function));
			expect(mockElements.inputButton.addEventListener).toHaveBeenCalledWith(
				'click',
				expect.any(Function),
			);
			expect(
				mockElements.inputNotificationCheckbox.addEventListener,
			).toHaveBeenCalledWith('click', expect.any(Function));
		});

		it('sends and clears the message box on Enter', () => {
			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			const send = onEnter.mock.calls.find(
				([el]) => el === mockElements.inputMessage,
			)[1];
			mockElements.inputMessage.value = 'hello scene';
			send();
			expect(State.network.sendChat).toHaveBeenCalledWith('hello scene');
			expect(mockElements.inputMessage.value).toBe('');
		});

		it('does not send an empty message on Enter', () => {
			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			State.network.sendChat.mockClear();
			const send = onEnter.mock.calls.find(
				([el]) => el === mockElements.inputMessage,
			)[1];
			mockElements.inputMessage.value = '';
			send();
			expect(State.network.sendChat).not.toHaveBeenCalled();
		});

		it('moves focus from the handle to the message box on Enter', () => {
			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			const hop = onEnter.mock.calls.find(
				([el]) => el === mockElements.inputHandle,
			)[1];
			hop();
			expect(mockElements.inputMessage.focus).toHaveBeenCalled();
		});

		it('should handle notification settings from localStorage', () => {
			global.localStorage.getItem.mockReturnValue('true');

			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			expect(mockElements.inputNotificationCheckbox.checked).toBe(true);
		});

		it('should initialize with default notification settings', () => {
			global.localStorage.getItem.mockReturnValue(null);

			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			expect(mockElements.inputNotificationCheckbox.checked).toBe(false);
		});

		it('treats a corrupted notifications value as off, never throws', () => {
			// the old JSON.parse path threw on garbage and killed the boot
			global.localStorage.getItem.mockReturnValue('{broken');

			createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			expect(mockElements.inputNotificationCheckbox.checked).toBe(false);
		});

		it('should handle toggle functionality', () => {
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				onFocus,
				onBlur,
			);

			expect(controller.isEnabled()).toBe(false);

			controller.toggle();
			expect(mockElements.inputMessage.focus).toHaveBeenCalled();
			expect(mockElements.divChatButton.classList.add).toHaveBeenCalledWith(
				'active',
			);
			expect(mockElements.divChatButton.classList.remove).toHaveBeenCalledWith(
				'notification',
			);
			expect(onFocus).toHaveBeenCalled();
			expect(controller.isEnabled()).toBe(true);

			controller.toggle();
			expect(mockElements.divChatButton.classList.remove).toHaveBeenCalledWith(
				'active',
			);
			expect(onBlur).toHaveBeenCalled();
			expect(controller.isEnabled()).toBe(false);
		});

		it('should handle user join functionality', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			controller.join('TestUser', 'session123', true);
			expect(mockElements.divUserList.appendChild).toHaveBeenCalled();
		});

		it('should handle user part functionality', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			controller.join('TestUser', 'session123', false);

			controller.part('session123');
			expect(mockElements.divUserList.removeChild).toHaveBeenCalled();
		});

		it('should handle nick changes', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			controller.join('OldUser', 'session123', false);

			controller.nick('NewUser', 'session123', true);

			expect(mockElements.divUserList.appendChild).toHaveBeenCalled();
		});

		it('should handle conversation addition', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			controller.addConversation('TestUser', 'Hello world', false);
			expect(mockElements.divMessageWindow.appendChild).toHaveBeenCalled();
		});

		it('should handle notification when chat disabled and notification flag set', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputButton,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			controller.addConversation('TestUser', 'Hello world', true);
			expect(mockElements.divChatButton.classList.add).toHaveBeenCalledWith(
				'notification',
			);
		});
	});
});
