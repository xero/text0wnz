/* eslint-disable prefer-arrow-callback */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import State from '../../src/js/client/state.js';
import {
	createWorkerHandler,
	createChatController,
} from '../../src/js/client/network.js';
import { $, enforceMaxBytes, onEnter, websocketUI } from '../../src/js/client/ui.js';
import { Load } from '../../src/js/client/file.js';
import {
	EXT_SUITE_CAP,
	MoebiusAction,
	T0wnzAction,
	compressExtCells,
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
			resolveUnicode: vi.fn(async () => new Map()),
			resize: vi.fn(),
			setFont: vi.fn(),
			setIceColors: vi.fn(),
			quickDraw: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
			getDoc: vi.fn(() => ({ palette: new Uint32Array(16) })),
			redrawEntireImage: vi.fn(),
			journalKeyframe: vi.fn(),
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
	enforceMaxBytes: vi.fn(),
}));

vi.mock('../../src/js/client/palette.js', () => ({
	createDefaultPalette: vi.fn(() => ({})),
	createPalette: vi.fn(() => ({})),
}));

// the stub below hides jsdom, which the comment box tests still need
// for a real textarea
const jsdom = document;

vi.stubGlobal('document', {
	getElementsByClassName: vi.fn(() => []),
	addEventListener: vi.fn(),
	removeEventListener: vi.fn(),
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

		it('probes after init without joining (consent-first)', async () => {
			createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			await messageListener({ data: { cmd: 'initialized' } });
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ cmd: 'probe' });
			// a found server only opens the choice modal; no connect yet
			await messageListener({ data: { cmd: 'probeResult', found: true } });
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

		it('the invitation names a link-chosen server', async () => {
			global.window.location.search = '?server=ws://jam.example:8000/lounge';
			try {
				createWorkerHandler(mockInputHandle);
				await listenerOf()({ data: { cmd: 'probeResult', found: true } });
				expect(State.modal.open).toHaveBeenCalledWith('choice');
				expect(elementFor('choiceServer').textContent).toBe(
					' at jam.example/lounge',
				);
			} finally {
				global.window.location.search = '';
			}
		});

		it('ignores a probe that finds nothing', async () => {
			createWorkerHandler(mockInputHandle);
			const messageListener = mockWorker.addEventListener.mock.calls.find(
				call => call[0] === 'message',
			)[1];
			await messageListener({ data: { cmd: 'probeResult', found: false } });
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

		it('a blank ?server= counts as absent', async () => {
			global.window.location.search = '?server=';
			try {
				createWorkerHandler(mockInputHandle);
				await listenerOf()({ data: { cmd: 'probeResult', found: true } });
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

		it('a dropped session says the editor is local again with autosave on', async () => {
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
			global.alert.mockClear();
			await messageListener({ data: { cmd: 'closed', wasConnected: true } });
			expect(handler.isConnected()).toBe(false);
			expect(global.alert).toHaveBeenCalledWith(
				'Disconnected from the server. You are working locally again, and autosave is back on.',
			);
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
			expect(State.textArtCanvas.resize).toHaveBeenCalledWith(100, 30, { undoable: false });
		});

		it('a peer resize applies outside the local undo history', async () => {
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
			State.textArtCanvas.resize.mockClear();
			await messageListener({
				data: {
					cmd: 'frame',
					type: MoebiusAction.SET_CANVAS_SIZE,
					data: { columns: 100, rows: 30, id: 2 },
				},
			});
			expect(State.textArtCanvas.resize).toHaveBeenCalledWith(100, 30, { undoable: false });
		});

		it('a peer SAUCE update refreshes the comment byte counter', async () => {
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
			const sauce = (data, id = 2) =>
				messageListener({ data: { cmd: 'frame', type: MoebiusAction.SAUCE, data: { ...data, id } } });
			vi.mocked(enforceMaxBytes).mockClear();
			await sauce({ title: 'only a title' });
			expect(enforceMaxBytes).not.toHaveBeenCalled();
			await sauce({ title: '', author: '', group: '', comments: 'x'.repeat(200) });
			expect(enforceMaxBytes).toHaveBeenCalledTimes(1);
		});

		const blank = { code: 32, fg: 7, bg: 0 };
		const join = (handler, { caps = [EXT_SUITE_CAP], doc = {} } = {}) => {
			handler.joinCollaboration();
			return listenerOf()({
				data: {
					cmd: 'connected',
					data: {
						caps,
						doc: { columns: 2, rows: 1, data: [blank, blank], ...doc },
						users: [],
						chat_history: [],
					},
				},
			});
		};
		const frame = (type, data) =>
			listenerOf()({ data: { cmd: 'frame', type, data } });
		const sync = (extra = {}) =>
			frame(T0wnzAction.EXT_SYNC, {
				columns: 2,
				rows: 1,
				cells: compressExtCells(
					Array.from({ length: 2 }, () => ({ u: 32, a: 0, fg: 7, bg: 0 })),
				),
				seq: 5,
				...extra,
			});
		const sent = () =>
			mockWorker.postMessage.mock.calls
				.map(call => call[0])
				.filter(msg => msg.cmd === 'send')
				.map(({ type, data }) => ({ type, data }));
		// a load the test finishes by hand, so it can act mid-await;
		// loading settles with the call's arguments once the handler
		// reaches it
		const hold = (fn, value) => {
			let finish;
			let reached;
			const loading = new Promise(resolve => {
				reached = resolve;
			});
			fn.mockImplementationOnce((...args) => {
				reached(args);
				return new Promise(resolve => {
					finish = () => resolve(value);
				});
			});
			return { loading, finish: () => finish() };
		};
		const holdFontLoad = () => hold(State.textArtCanvas.setFont);
		const holdGlyphs = () => hold(State.textArtCanvas.resolveUnicode, new Map());
		// the canvas resolves unseen glyphs before it writes, as the real
		// one does, and drawn records each write as [x, y, codepoint]
		let drawn = [];
		const emulateDraws = () => {
			drawn = [];
			State.textArtCanvas.drawRemoteExtCells.mockImplementation(async cells => {
				const unseen = cells.filter(cell => cell.u > 0xff).map(cell => cell.u);
				if (unseen.length > 0) {
					await State.textArtCanvas.resolveUnicode(new Set(unseen));
				}
				drawn.push(cells.map(({ x, y, u }) => [x, y, u]));
			});
		};
		const cell = (x, y, u = 65) => ({ x, y, u, a: 0, fg: 7, bg: 0 });
		// our own stroke, shaped the way canvas.js hands it over
		const ourDraw = (handler, ...cells) =>
			handler.draw(
				cells.map(({ x, y, ...ext }) => ({ x, y, block: { code: 65, fg: 7, bg: 0 }, ext })),
			);
		const resetCanvasMocks = () => {
			for (const fn of [
				State.textArtCanvas.resize,
				State.textArtCanvas.setIceColors,
				State.textArtCanvas.setDocData,
				State.textArtCanvas.setFont,
				State.textArtCanvas.redrawEntireImage,
				State.textArtCanvas.drawRemoteExtCells,
				State.textArtCanvas.resolveUnicode,
				State.textArtCanvas.quickDraw,
				State.font.setLetterSpacing,
				vi.mocked(enforceMaxBytes),
			]) {
				fn.mockReset();
			}
		};

		describe('the echo gate', () => {
			afterEach(resetCanvasMocks);

			it('a change made while a resync loads its font reaches the room', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				State.font.setLetterSpacing.mockClear();
				const font = holdFontLoad();
				const syncing = sync({ font_name: 'IBM VGA' });
				await font.loading;
				mockWorker.postMessage.mockClear();
				handler.sendResize(100, 30);
				handler.sendIceColorsChange(true);
				handler.sendLetterSpacingChange(true);
				handler.sendSauce({ title: 'mid-load' });
				font.finish();
				await syncing;
				expect(sent().map(msg => msg.type)).toEqual([
					MoebiusAction.SET_CANVAS_SIZE,
					MoebiusAction.ICE_COLORS,
					MoebiusAction.USE_9PX_FONT,
					MoebiusAction.SAUCE,
				]);
				expect(State.textArtCanvas.resize).toHaveBeenLastCalledWith(100, 30, { undoable: false });
				// the snapshot predates our 9px op, so its tail leaves ours be
				expect(State.font.setLetterSpacing.mock.calls.map(call => call[0])).toEqual([true]);
			});

			it('a change made while the join loads its font reaches the room, and the join leaves it be', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				const font = holdFontLoad();
				const joining = join(handler, { caps: [], doc: { font_name: 'IBM VGA' } });
				await font.loading;
				handler.sendResize(100, 30);
				handler.sendLetterSpacingChange(true);
				font.finish();
				await joining;
				expect(sent()).toEqual([
					{ type: MoebiusAction.SET_CANVAS_SIZE, data: { columns: 100, rows: 30 } },
					{ type: MoebiusAction.USE_9PX_FONT, data: { value: true } },
				]);
				// the join doc predates our 9px op, so its spacing never lands
				expect(State.font.setLetterSpacing.mock.calls.map(call => call[0])).toEqual([true]);
			});

			it('a listener that sends during a remote apply sends nothing', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				// every apply fires a listener that echoes the change back
				// out; capped, since an unmuted echo inside a replay would
				// otherwise queue itself forever and hang the run
				let echoes = 0;
				const echo = send => (...args) => {
					if (echoes++ < 50) {
						send(...args);
					}
				};
				State.textArtCanvas.resize.mockImplementation(echo(handler.sendResize));
				State.textArtCanvas.setIceColors.mockImplementation(echo(handler.sendIceColorsChange));
				State.font.setLetterSpacing.mockImplementation(echo(handler.sendLetterSpacingChange));
				State.textArtCanvas.setDocData.mockImplementation(echo(() => handler.sendResize(4, 4)));
				State.textArtCanvas.redrawEntireImage.mockImplementation(echo(() => handler.sendResize(3, 3)));
				vi.mocked(enforceMaxBytes).mockImplementation(echo(() => handler.sendSauce({ title: 'echo' })));
				await join(handler);
				await frame(MoebiusAction.SET_CANVAS_SIZE, { columns: 100, rows: 30, id: 2 });
				await frame(MoebiusAction.ICE_COLORS, { value: true, id: 2 });
				await frame(MoebiusAction.USE_9PX_FONT, { value: true, id: 2 });
				await frame(MoebiusAction.SAUCE, { title: '', author: '', group: '', comments: 'hi', id: 2 });
				await frame(T0wnzAction.EXT_PALETTE, { palette: Array.from({ length: 16 }, (_, i) => i) });
				await sync({ use_9px_font: true });
				expect(State.textArtCanvas.resize).toHaveBeenCalledWith(100, 30, { undoable: false });
				expect(State.textArtCanvas.setIceColors).toHaveBeenCalledWith(true);
				expect(State.textArtCanvas.redrawEntireImage).toHaveBeenCalled();
				expect(enforceMaxBytes).toHaveBeenCalled();
				expect(State.textArtCanvas.setDocData).toHaveBeenCalledTimes(2);
				expect(sent()).toEqual([]);
			});

			it('a remote apply that throws leaves our sends open', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				State.textArtCanvas.resize.mockImplementationOnce(() => {
					throw new Error('allocation failed');
				});
				await frame(MoebiusAction.SET_CANVAS_SIZE, { columns: 100, rows: 30, id: 2 }).catch(() => {});
				mockWorker.postMessage.mockClear();
				handler.sendIceColorsChange(true);
				expect(sent()).toEqual([{ type: MoebiusAction.ICE_COLORS, data: { value: true } }]);
			});

			it('replaying in-flight ops sends nothing and queues nothing twice', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				handler.sendResize(100, 30);
				handler.sendIceColorsChange(true);
				mockWorker.postMessage.mockClear();
				await sync();
				await sync({ seq: 6 });
				expect(sent()).toEqual([]);
				// each resync replays the two unacked ops once: a replay that
				// re-queued them would show three calls here
				expect(State.textArtCanvas.resize).toHaveBeenCalledTimes(2);
				expect(State.textArtCanvas.setIceColors).toHaveBeenCalledTimes(2);
			});

			it('an op sent while the replay awaits lands after the older ops', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				emulateDraws();
				ourDraw(handler, cell(0, 0, 0x2603));
				handler.sendIceColorsChange(false);
				const glyphs = holdGlyphs();
				const syncing = sync();
				await glyphs.loading;
				mockWorker.postMessage.mockClear();
				handler.sendIceColorsChange(true);
				glyphs.finish();
				await syncing;
				expect(sent()).toEqual([{ type: MoebiusAction.ICE_COLORS, data: { value: true } }]);
				// the room applies false then true; so must we
				expect(State.textArtCanvas.setIceColors.mock.calls.map(call => call[0])).toEqual([false, true]);
			});

			it('an ack that arrives during the resync font load waits for the replay', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				handler.sendResize(100, 30);
				const font = holdFontLoad();
				// the snapshot predates our resize, which the server applied
				// and acked right after it
				const queued = [sync({ font_name: 'IBM VGA' }), frame(T0wnzAction.EXT_ACK, { seq: 6 })];
				await font.loading;
				font.finish();
				await Promise.all(queued);
				expect(State.textArtCanvas.resize).toHaveBeenCalledWith(100, 30, { undoable: false });
			});
		});

		describe('server order', () => {
			afterEach(resetCanvasMocks);

			it('a peer write that arrives before the ack of our draw on its cell yields to ours', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				emulateDraws();
				ourDraw(handler, cell(0, 0));
				// the server applied these before our draw, which holds (0,0)
				await frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 66), seq: 6, id: 2 });
				await frame(T0wnzAction.EXT_DRAW_BATCH, { cells: [cell(0, 0, 67), cell(1, 0, 67)], seq: 7, id: 2 });
				await frame(MoebiusAction.DRAW, { x: 0, y: 0, block: { code: 68, fg: 7, bg: 0 }, seq: 8, id: 3 });
				expect(drawn).toEqual([[[1, 0, 67]]]);
				expect(State.textArtCanvas.quickDraw).not.toHaveBeenCalled();
				await frame(T0wnzAction.EXT_ACK, { seq: 9 });
				// and this one after it
				await frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 69), seq: 10, id: 2 });
				expect(drawn).toEqual([[[1, 0, 67]], [[0, 0, 69]]]);
			});

			it('a peer setting that arrives before the ack of ours of that kind yields to ours', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				State.font.setLetterSpacing.mockClear();
				vi.mocked(enforceMaxBytes).mockClear();
				handler.sendIceColorsChange(true);
				handler.sendLetterSpacingChange(true);
				handler.sendSauce({ title: 'ours' });
				handler.sendFontChange('Topaz 500');
				const peer = async seq => {
					await frame(MoebiusAction.ICE_COLORS, { value: false, seq, id: 2 });
					await frame(MoebiusAction.USE_9PX_FONT, { value: false, seq: seq + 1, id: 2 });
					await frame(MoebiusAction.SAUCE, { title: 'theirs', author: '', group: '', comments: 'x', seq: seq + 2, id: 2 });
					await frame(MoebiusAction.CHANGE_FONT, { font_name: 'IBM VGA', seq: seq + 3, id: 2 });
				};
				await peer(6);
				expect(State.textArtCanvas.setIceColors).not.toHaveBeenCalled();
				expect(State.font.setLetterSpacing).not.toHaveBeenCalled();
				expect(enforceMaxBytes).not.toHaveBeenCalled();
				expect(State.textArtCanvas.setFont).not.toHaveBeenCalled();
				for (let seq = 10; seq < 14; seq++) {
					await frame(T0wnzAction.EXT_ACK, { seq });
				}
				await peer(14);
				expect(State.textArtCanvas.setIceColors).toHaveBeenCalledWith(false);
				expect(State.font.setLetterSpacing).toHaveBeenCalledWith(false);
				expect(enforceMaxBytes).toHaveBeenCalled();
				expect(State.textArtCanvas.setFont).toHaveBeenCalledTimes(1);
			});

			it('a vanilla session lays a peer write over our own', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: []});
				ourDraw(handler, cell(0, 0));
				handler.sendIceColorsChange(true);
				await frame(MoebiusAction.DRAW, { x: 0, y: 0, block: { code: 66, fg: 7, bg: 0 }, id: 2 });
				await frame(MoebiusAction.ICE_COLORS, { value: false, id: 2 });
				expect(State.textArtCanvas.quickDraw).toHaveBeenCalled();
				expect(State.textArtCanvas.setIceColors).toHaveBeenCalledWith(false);
			});

			it('a peer font yields to a pick of ours that goes out before it installs', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				const font = holdFontLoad();
				const changing = frame(MoebiusAction.CHANGE_FONT, { font_name: 'IBM VGA', seq: 6, id: 2 });
				const [, , , wanted] = await font.loading;
				expect(wanted()).toBe(true);
				// our pick, queued ahead of the peer's, installs and goes
				// out first, so the room applies it after the peer's
				handler.sendFontChange('Topaz 500');
				expect(wanted()).toBe(false);
				font.finish();
				await changing;
			});

			it('a vanilla peer font yields to a pick of ours that goes out before it installs', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: []});
				const font = holdFontLoad();
				const changing = frame(MoebiusAction.CHANGE_FONT, { font_name: 'IBM VGA', id: 2 });
				const [, , , wanted] = await font.loading;
				expect(wanted()).toBe(true);
				// no acks here, yet ours still reached the server after the
				// peer's, so the room ends on ours
				handler.sendFontChange('Topaz 500');
				expect(wanted()).toBe(false);
				font.finish();
				await changing;
			});

			it('a peer font leaves the label to the font that goes live', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				State.textArtCanvas.setFont.mockClear();
				await frame(MoebiusAction.CHANGE_FONT, { font_name: 'IBM VGA', seq: 6, id: 2 });
				// a failed load installs the default font instead, and the
				// onFontChange listener in main.js labels whichever went live
				// IBM VGA is the Moebius name for ours
				expect(State.textArtCanvas.setFont).toHaveBeenCalledTimes(1);
				const [name, callback] = State.textArtCanvas.setFont.mock.calls[0];
				expect(name).toBe('CP437 8x16');
				expect(callback).toBeUndefined();
			});

			it('a resync replays our draw under a peer write the server applied after it', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				emulateDraws();
				ourDraw(handler, cell(0, 0));
				const font = holdFontLoad();
				// the snapshot predates our draw; the server then applied
				// and acked ours, then applied a peer's to the same cell
				const queued = [
					sync({ font_name: 'IBM VGA' }),
					frame(T0wnzAction.EXT_ACK, { seq: 6 }),
					frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 66), seq: 7, id: 2 }),
				];
				await font.loading;
				font.finish();
				await Promise.all(queued);
				expect(drawn).toEqual([[[0, 0, 65]], [[0, 0, 66]]]);
			});

			it('a resync replays our draw over a peer write the server applied before it', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				emulateDraws();
				ourDraw(handler, cell(0, 0));
				const font = holdFontLoad();
				const queued = [
					sync({ font_name: 'IBM VGA' }),
					frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 66), seq: 6, id: 2 }),
					frame(T0wnzAction.EXT_ACK, { seq: 7 }),
				];
				await font.loading;
				font.finish();
				await Promise.all(queued);
				expect(drawn).toEqual([[[0, 0, 65]]]);
			});

			it('a snapshot setting yields to an unacked op of ours of that kind', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				State.font.setLetterSpacing.mockClear();
				handler.sendFontChange('Topaz 500');
				handler.sendLetterSpacingChange(true);
				await sync({ font_name: 'IBM VGA', use_9px_font: false });
				// our font is the installed one, so nothing replays it
				expect(State.textArtCanvas.setFont).toHaveBeenCalledTimes(1);
				const [, , , wanted] = State.textArtCanvas.setFont.mock.calls[0];
				expect(wanted()).toBe(false);
				expect(State.font.setLetterSpacing).not.toHaveBeenCalledWith(false);
			});

			it('frames apply in arrival order while one waits on its glyphs', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				emulateDraws();
				const glyphs = holdGlyphs();
				const queued = [
					frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 0x2603), seq: 6, id: 2 }),
					frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 65), seq: 7, id: 3 }),
					frame(MoebiusAction.ICE_COLORS, { value: true, seq: 8, id: 3 }),
				];
				await glyphs.loading;
				expect(drawn).toEqual([]);
				expect(State.textArtCanvas.setIceColors).not.toHaveBeenCalled();
				glyphs.finish();
				await Promise.all(queued);
				expect(drawn).toEqual([[[0, 0, 0x2603]], [[0, 0, 65]]]);
				expect(State.textArtCanvas.setIceColors).toHaveBeenCalledWith(true);
			});

			it('a peer\'s text, NUL, and 255 draw without a glyph fetch', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				emulateDraws();
				await frame(T0wnzAction.EXT_DRAW_BATCH, {
					cells: [cell(0, 0, 65), cell(1, 0, 0)],
					seq: 6,
					id: 2,
				});
				await frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 0xa0), seq: 7, id: 2 });
				expect(State.textArtCanvas.resolveUnicode).not.toHaveBeenCalled();
				expect(drawn).toEqual([[[0, 0, 65], [1, 0, 0]], [[0, 0, 0xa0]]]);
			});

			it('the join finishes before the resync behind it applies', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				const font = holdFontLoad();
				const queued = [join(handler, { doc: { font_name: 'IBM VGA' } }), sync({ use_9px_font: true })];
				await font.loading;
				expect(State.textArtCanvas.setDocData).toHaveBeenCalledTimes(1);
				font.finish();
				await Promise.all(queued);
				expect(State.textArtCanvas.setDocData).toHaveBeenCalledTimes(2);
				expect(State.font.setLetterSpacing.mock.calls.map(call => call[0])).toEqual([false, true]);
			});

			it('a resync behind another adoption applies after it, in server order', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				handler.sendIceColorsChange(true);
				const font = holdFontLoad();
				// the server cut one snapshot, applied and acked our op, took
				// a peer's back off, and cut a second snapshot
				const queued = [
					sync({ font_name: 'IBM VGA' }),
					frame(T0wnzAction.EXT_ACK, { seq: 6 }),
					frame(MoebiusAction.ICE_COLORS, { value: false, seq: 7, id: 2 }),
					sync({ seq: 7, use_9px_font: true }),
				];
				await font.loading;
				// the join's doc, then the first snapshot's
				expect(State.textArtCanvas.setDocData).toHaveBeenCalledTimes(2);
				font.finish();
				await Promise.all(queued);
				expect(State.textArtCanvas.setDocData).toHaveBeenCalledTimes(3);
				expect(State.textArtCanvas.setIceColors.mock.calls.map(call => call[0])).toEqual([true, false]);
				expect(State.font.setLetterSpacing).toHaveBeenLastCalledWith(true);
			});

			it('a glyph fetch that never settles holds later frames only until the wait runs out', async () => {
				const timers = [];
				global.setTimeout.mockImplementation((fn, ms, ...args) => timers.push({ fn, ms, args }));
				try {
					const handler = createWorkerHandler(mockInputHandle);
					await join(handler);
					emulateDraws();
					let reached;
					const fetching = new Promise(resolve => {
						reached = resolve;
					});
					State.textArtCanvas.resolveUnicode.mockImplementationOnce(() => {
						reached();
						return new Promise(() => {});
					});
					const queued = [
						frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 0x2603), seq: 6, id: 2 }),
						frame(MoebiusAction.ICE_COLORS, { value: true, seq: 7, id: 2 }),
					];
					await fetching;
					mockWorker.postMessage.mockClear();
					const wait = timers.find(timer => timer.ms === 10000);
					wait.fn(...wait.args);
					await Promise.all(queued);
					// the cells drop rather than land late, and a resync brings them
					expect(drawn).toEqual([]);
					expect(sent()).toEqual([{ type: T0wnzAction.EXT_SYNC, data: {} }]);
					expect(State.textArtCanvas.setIceColors).toHaveBeenCalledWith(true);
				} finally {
					global.setTimeout.mockReset();
				}
			});

			it('time the page spends hidden does not count toward the glyph wait', async () => {
				vi.useFakeTimers();
				const live = new Set();
				document.addEventListener.mockImplementation((type, fn) => {
					if (type === 'visibilitychange') {
						live.add(fn);
					}
				});
				document.removeEventListener.mockImplementation((_type, fn) => live.delete(fn));
				const turn = hidden => {
					document.hidden = hidden;
					live.forEach(fn => fn());
				};
				try {
					const handler = createWorkerHandler(mockInputHandle);
					await join(handler);
					emulateDraws();
					const slow = holdGlyphs();
					const landing = frame(T0wnzAction.EXT_DRAW, { ...cell(0, 0, 0x2603), seq: 6, id: 2 });
					await slow.loading;
					mockWorker.postMessage.mockClear();
					await vi.advanceTimersByTimeAsync(9000);
					turn(true);
					await vi.advanceTimersByTimeAsync(60000);
					turn(false);
					await vi.advanceTimersByTimeAsync(900);
					slow.finish();
					await landing;
					expect(drawn).toEqual([[[0, 0, 0x2603]]]);
					expect(sent()).toEqual([]);
					// visible time still runs the wait out
					const stuck = holdGlyphs();
					const dropping = frame(T0wnzAction.EXT_DRAW, { ...cell(1, 0, 0x2603), seq: 7, id: 2 });
					await stuck.loading;
					await vi.advanceTimersByTimeAsync(4000);
					turn(true);
					await vi.advanceTimersByTimeAsync(60000);
					turn(false);
					await vi.advanceTimersByTimeAsync(6000);
					await dropping;
					expect(drawn).toEqual([[[0, 0, 0x2603]]]);
					expect(sent()).toEqual([{ type: T0wnzAction.EXT_SYNC, data: {} }]);
				} finally {
					delete document.hidden;
					document.addEventListener.mockReset();
					document.removeEventListener.mockReset();
					vi.useRealTimers();
				}
			});

			it('a frame that throws leaves the frames behind it flowing', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				State.textArtCanvas.resize.mockImplementationOnce(() => {
					throw new Error('allocation failed');
				});
				const queued = [
					frame(MoebiusAction.SET_CANVAS_SIZE, { columns: 100, rows: 30, seq: 6, id: 2 }),
					frame(T0wnzAction.EXT_SYNC, { columns: 2, rows: 1, cells: 'garbage', seq: 6 }),
					frame(MoebiusAction.ICE_COLORS, { value: true, seq: 7, id: 2 }),
				];
				await Promise.all(queued);
				expect(console.error).toHaveBeenCalledWith('[Network] message failed:', expect.any(Error));
				expect(console.warn).toHaveBeenCalledWith('[Network] dropped malformed EXT_SYNC:', expect.anything());
				expect(State.textArtCanvas.setIceColors).toHaveBeenCalledWith(true);
			});
		});

		it('the timelapse request waits out only the time the page shows', async () => {
			vi.useFakeTimers();
			const live = new Set();
			document.addEventListener.mockImplementation((type, fn) => {
				if (type === 'visibilitychange') {
					live.add(fn);
				}
			});
			document.removeEventListener.mockImplementation((_type, fn) => live.delete(fn));
			const turn = hidden => {
				document.hidden = hidden;
				live.forEach(fn => fn());
			};
			try {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				const answered = handler.requestTimelapse();
				await vi.advanceTimersByTimeAsync(9000);
				turn(true);
				await vi.advanceTimersByTimeAsync(60000);
				turn(false);
				await frame(T0wnzAction.EXT_TIMELAPSE, { ops: []});
				expect(await answered).toEqual({ ops: []});
				expect(live.size).toBe(0);
				const silent = handler.requestTimelapse();
				await vi.advanceTimersByTimeAsync(4000);
				turn(true);
				await vi.advanceTimersByTimeAsync(60000);
				turn(false);
				await vi.advanceTimersByTimeAsync(6000);
				expect(await silent).toBeNull();
			} finally {
				delete document.hidden;
				document.addEventListener.mockReset();
				document.removeEventListener.mockReset();
				vi.useRealTimers();
			}
		});

		describe('room SAUCE', () => {
			const ids = ['sauceTitle', 'sauceAuthor', 'sauceGroup', 'sauceComments'];
			const room = {
				title: 'room title',
				author: 'room author',
				group: 'room group',
				comments: 'room comments',
			};
			const ours = {
				title: 'our title',
				author: 'our author',
				group: 'our group',
				comments: 'our comments',
			};
			let fields;
			let lookup;
			// what main.js reads back out of the Sauce Editor on Done
			const editor = () => ({
				title: fields.sauceTitle.value,
				author: fields.sauceAuthor.value,
				group: fields.sauceGroup.value,
				comments: fields.sauceComments.value,
			});
			const typeInEditor = meta => {
				fields.sauceTitle.value = meta.title;
				fields.sauceAuthor.value = meta.author;
				fields.sauceGroup.value = meta.group;
				fields.sauceComments.value = meta.comments;
			};
			const sauceEvents = () =>
				document.dispatchEvent.mock.calls.filter(
					([event]) => event?.type === 'onSauceChange',
				).length;

			beforeEach(() => {
				fields = Object.fromEntries(ids.map(id => [id, { value: `local ${id}` }]));
				lookup = document.getElementById.getMockImplementation();
				document.getElementById.mockImplementation(id => fields[id] ?? lookup(id));
				State.title = 'Untitled';
			});

			afterEach(() => {
				document.getElementById.mockImplementation(lookup);
				resetCanvasMocks();
			});

			it('a late joiner adopts the room SAUCE, and a Done sends it back unchanged', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: [], doc: room });
				expect(editor()).toEqual(room);
				expect(State.title).toBe('room title');
				expect(sauceEvents()).toBe(1);
				expect(enforceMaxBytes).toHaveBeenCalled();
				mockWorker.postMessage.mockClear();
				handler.sendSauce(editor());
				expect(sent()).toEqual([{ type: MoebiusAction.SAUCE, data: room }]);
			});

			it('an untitled room clears the local SAUCE and titles the page collab mode', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: []});
				expect(editor()).toEqual({ title: '', author: '', group: '', comments: '' });
				expect(State.title).toBe('collab mode');
			});

			it('a resync adopts the room SAUCE', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				typeInEditor(ours);
				await sync(room);
				expect(editor()).toEqual(room);
				expect(State.title).toBe('room title');
				expect(sauceEvents()).toBe(2);
			});

			it('a resync SAUCE yields to an unacked SAUCE op of ours', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				typeInEditor(ours);
				State.title = ours.title;
				handler.sendSauce(editor());
				await sync(room);
				expect(editor()).toEqual(ours);
				expect(State.title).toBe('our title');
			});

			it('a join SAUCE yields to a SAUCE op of ours sent while the font loads', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				const font = holdFontLoad();
				const joining = join(handler, { caps: [], doc: { ...room, font_name: 'IBM VGA' } });
				await font.loading;
				typeInEditor(ours);
				State.title = ours.title;
				handler.sendSauce(editor());
				font.finish();
				await joining;
				expect(editor()).toEqual(ours);
				expect(State.title).toBe('our title');
			});

			it('a cleared room title names the page collab mode on every member', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: [], doc: room });
				await frame(MoebiusAction.SAUCE, { ...room, title: '', id: 2 });
				expect(fields.sauceTitle.value).toBe('');
				expect(State.title).toBe('collab mode');
				// main.js titles the page from the field before it sends
				State.title = '';
				handler.sendSauce({ ...room, title: '' });
				expect(State.title).toBe('collab mode');
			});

			const close = () => listenerOf()({ data: { cmd: 'closed', wasConnected: true } });

			it('leaving an untitled room titles the page Untitled and tells the sidebar', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				State.title = 'mine';
				await join(handler, { caps: []});
				const events = sauceEvents();
				await close();
				expect(State.title).toBe('Untitled');
				expect(sauceEvents()).toBe(events + 1);
			});

			it('leaving a titled room keeps the title whose SAUCE stays', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: [], doc: room });
				await close();
				expect(State.title).toBe('room title');
				expect(editor()).toEqual(room);
			});

			it('a join that fails after the room SAUCE landed leaves no placeholder title', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				vi.mocked(websocketUI).mockImplementationOnce(() => {
					throw new Error('toolbar failed');
				});
				await join(handler, { caps: []});
				expect(handler.isConnected()).toBe(false);
				expect(State.title).toBe('Untitled');
			});

			it('leaving a session journals the doc it left on screen', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler);
				expect(State.textArtCanvas.journalKeyframe).not.toHaveBeenCalled();
				await close();
				expect(State.textArtCanvas.journalKeyframe).toHaveBeenCalledTimes(1);
				// a dial that never became a session has nothing to journal
				handler.joinCollaboration();
				await close();
				handler.stayLocal();
				expect(State.textArtCanvas.journalKeyframe).toHaveBeenCalledTimes(1);
			});

			describe('while the Sauce Editor is open', () => {
				it('a peer edit and a resync wait, and the latest lands when it closes', async () => {
					const handler = createWorkerHandler(mockInputHandle);
					await join(handler);
					State.title = 'local';
					handler.holdSauce();
					typeInEditor(ours);
					const events = sauceEvents();
					await frame(MoebiusAction.SAUCE, { ...room, title: 'peer title', seq: 6, id: 2 });
					await sync({ ...room, seq: 7 });
					expect(editor()).toEqual(ours);
					expect(State.title).toBe('local');
					expect(sauceEvents()).toBe(events);
					handler.releaseSauce();
					expect(editor()).toEqual(room);
					expect(State.title).toBe('room title');
					expect(sauceEvents()).toBe(events + 1);
					// closed, the room lands at once
					await frame(MoebiusAction.SAUCE, { ...room, title: 'later', seq: 8, id: 2 });
					expect(State.title).toBe('later');
				});

				it('a Save sends ours over a held room SAUCE, which never lands', async () => {
					const handler = createWorkerHandler(mockInputHandle);
					await join(handler);
					handler.holdSauce();
					typeInEditor(ours);
					await sync(room);
					mockWorker.postMessage.mockClear();
					handler.sendSauce(editor());
					handler.releaseSauce();
					expect(sent()).toEqual([{ type: MoebiusAction.SAUCE, data: ours }]);
					expect(editor()).toEqual(ours);
					expect(State.title).toBe('our title');
				});

				it('a dropped session forgets the held room SAUCE', async () => {
					const handler = createWorkerHandler(mockInputHandle);
					await join(handler, { caps: []});
					handler.holdSauce();
					typeInEditor(ours);
					await frame(MoebiusAction.SAUCE, { ...room, id: 2 });
					await close();
					handler.releaseSauce();
					expect(editor()).toEqual(ours);
					expect(State.title).toBe('Untitled');
				});

				it('a join is a new document and adopts the room SAUCE regardless', async () => {
					const handler = createWorkerHandler(mockInputHandle);
					handler.holdSauce();
					await join(handler, { caps: [], doc: room });
					expect(editor()).toEqual(room);
					expect(State.title).toBe('room title');
				});
			});

			it('a room comment of one blank line fills an empty box and Done sends it back', async () => {
				fields.sauceComments = jsdom.createElement('textarea');
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: [], doc: room });
				await frame(MoebiusAction.SAUCE, { ...room, comments: ' ', id: 2 });
				expect(fields.sauceComments.value).toBe('');
				mockWorker.postMessage.mockClear();
				handler.sendSauce({ ...room, comments: Load.commentsOf(fields.sauceComments) });
				const blankLine = { ...room, comments: ' ' };
				expect(sent()).toEqual([{ type: MoebiusAction.SAUCE, data: blankLine }]);
			});
		});

		describe('font names on the wire', () => {
			afterEach(resetCanvasMocks);

			it('a font outside the SAUCE table reaches a peer as the same font', async () => {
				const handler = createWorkerHandler(mockInputHandle);
				await join(handler, { caps: []});
				mockWorker.postMessage.mockClear();
				handler.sendFontChange('CP437 8x8');
				handler.sendFontChange('CP866 8x16');
				const names = sent().map(msg => msg.data.font_name);
				expect(names).toEqual(['IBM VGA50', 'CP866 8x16']);
				State.textArtCanvas.setFont.mockClear();
				for (const name of names) {
					await frame(MoebiusAction.CHANGE_FONT, { font_name: name, id: 2 });
				}
				expect(State.textArtCanvas.setFont.mock.calls.map(call => call[0])).toEqual([
					'CP437 8x8',
					'CP866 8x16',
				]);
			});
		});

		it('sends no setting changes outside a collaboration session', () => {
			const handler = createWorkerHandler(mockInputHandle);

			handler.sendResize(80, 25);
			handler.sendFontChange('CP437 8x8');
			handler.sendIceColorsChange(true);
			handler.sendLetterSpacingChange(false);
			handler.sendSauce({ title: 'local' });

			expect(sent()).toEqual([]);
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
			// a throw on garbage here kills the boot
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
