import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkerHandler, createChatController } from '../../src/js/client/network.js';

// Mock State module
vi.mock('../../src/js/client/state.js', () => ({
	default: {
		worker: null,
		textArtCanvas: {
			setImageData: vi.fn(),
			resize: vi.fn(),
			setFont: vi.fn(),
			setIceColors: vi.fn(),
			quickDraw: vi.fn(),
		},
		chat: {
			addConversation: vi.fn(),
			join: vi.fn(),
			part: vi.fn(),
			nick: vi.fn(),
		},
		font: { setLetterSpacing: vi.fn() },
		network: {
			setHandle: vi.fn(),
			sendChat: vi.fn(),
		},
	},
}));

// Mock UI module
vi.mock('../../src/js/client/ui.js', () => ({
	$: vi.fn(_id => ({
		value: '',
		style: { display: 'block' },
		classList: {
			add: vi.fn(),
			remove: vi.fn(),
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
}));

// Mock DOM
global.document = {
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
};

global.window = {
	location: {
		hostname: 'localhost',
		protocol: 'http:',
		host: 'localhost:3000',
		port: '3000',
		pathname: '/',
	},
};

global.localStorage = {
	getItem: vi.fn(() => null),
	setItem: vi.fn(),
};

global.Worker = vi.fn(() => ({
	addEventListener: vi.fn(),
	postMessage: vi.fn(),
}));

global.alert = vi.fn();
global.console = { log: vi.fn(), info: vi.fn(), error: vi.fn(), warn: vi.fn() };

global.Notification = vi.fn(() => ({
	addEventListener: vi.fn(),
	close: vi.fn(),
}));
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
		};

		global.Worker.mockReturnValue(mockWorker);
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
			expect(global.localStorage.setItem).toHaveBeenCalledWith('handle', 'Anonymous');
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

			expect(global.Worker).toHaveBeenCalledWith('/ui/worker.js');
			expect(mockWorker.postMessage).toHaveBeenCalledWith({ cmd: 'handle', handle: 'Anonymous' });
			expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
		});

		it('should determine WebSocket URL based on location', () => {
			// Test proxied setup (standard ports)
			global.window.location.port = '';
			createWorkerHandler(mockInputHandle);
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'connect',
				url: 'ws://localhost:3000/server',
				silentCheck: true,
			});

			vi.clearAllMocks();

			// Test direct connection (custom port)
			global.window.location.port = '8080';
			global.window.location.hostname = 'example.com';
			global.window.location.pathname = '/path';

			createWorkerHandler(mockInputHandle);
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'connect',
				url: 'ws://example.com:1337/path',
				silentCheck: true,
			});
		});

		it('should use wss:// for HTTPS', () => {
			global.window.location.protocol = 'https:';
			global.window.location.port = '';

			createWorkerHandler(mockInputHandle);
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'connect',
				url: 'wss://localhost:3000/server',
				silentCheck: true,
			});
		});

		it('should handle connection state management', () => {
			const handler = createWorkerHandler(mockInputHandle);

			// Initial state
			expect(handler.isConnected()).toBe(false);

			// Test that message handlers would be called
			expect(mockWorker.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
		});

		it('should handle draw commands when connected', () => {
			const handler = createWorkerHandler(mockInputHandle);
			const blocks = [0x41, 0x42, 0x43];

			// Initially not connected, should not send
			handler.draw(blocks);
			expect(mockWorker.postMessage).not.toHaveBeenCalledWith({
				cmd: 'draw',
				blocks: blocks,
			});
		});

		it('should handle setHandle functionality', () => {
			const handler = createWorkerHandler(mockInputHandle);

			handler.setHandle('NewUser');
			expect(global.localStorage.setItem).toHaveBeenCalledWith('handle', 'NewUser');
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'nick',
				handle: 'NewUser',
			});
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

		it('should handle sendChat functionality', () => {
			const handler = createWorkerHandler(mockInputHandle);

			handler.sendChat('Hello world');
			expect(mockWorker.postMessage).toHaveBeenCalledWith({
				cmd: 'chat',
				text: 'Hello world',
			});
		});

		it('should handle canvas settings when not in collaboration mode', () => {
			const handler = createWorkerHandler(mockInputHandle);

			// Should not send when not in collaboration mode
			handler.sendCanvasSettings({ columns: 80, rows: 25 });
			handler.sendResize(80, 25);
			handler.sendFontChange('CP437 8x8');
			handler.sendIceColorsChange(true);
			handler.sendLetterSpacingChange(false);

			// Should not have sent any canvas-related messages
			expect(mockWorker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ cmd: 'canvasSettings' }));
			expect(mockWorker.postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ cmd: 'resize' }));
		});
	});

	describe('createChatController', () => {
		let mockElements;

		beforeEach(() => {
			mockElements = {
				divChatButton: { classList: { add: vi.fn(), remove: vi.fn(), contains: vi.fn(() => false) } },
				divChatWindow: { style: { display: 'none' } },
				divMessageWindow: {
					appendChild: vi.fn(),
					getBoundingClientRect: vi.fn(() => ({ height: 100 })),
					scrollHeight: 200,
					scrollTop: 0,
				},
				divUserList: { appendChild: vi.fn(), removeChild: vi.fn() },
				inputHandle: { value: '', addEventListener: vi.fn(), focus: vi.fn() },
				inputMessage: { value: '', addEventListener: vi.fn(), focus: vi.fn() },
				inputNotificationCheckbox: { checked: false, addEventListener: vi.fn() },
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
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
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
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputNotificationCheckbox,
				onFocus,
				onBlur,
			);

			expect(mockElements.inputHandle.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
			expect(mockElements.inputHandle.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
			expect(mockElements.inputMessage.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
			expect(mockElements.inputMessage.addEventListener).toHaveBeenCalledWith('blur', expect.any(Function));
			expect(mockElements.inputHandle.addEventListener).toHaveBeenCalledWith('keypress', expect.any(Function));
			expect(mockElements.inputMessage.addEventListener).toHaveBeenCalledWith('keypress', expect.any(Function));
			expect(mockElements.inputNotificationCheckbox.addEventListener).toHaveBeenCalledWith(
				'click',
				expect.any(Function),
			);
			expect(global.document.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function));
		});

		it('should handle notification settings from localStorage', () => {
			global.localStorage.getItem.mockReturnValue('true');

			createChatController(
				mockElements.divChatButton,
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
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
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			expect(global.localStorage.setItem).toHaveBeenCalledWith('notifications', false);
			expect(mockElements.inputNotificationCheckbox.checked).toBe(false);
		});

		it('should handle toggle functionality', () => {
			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputNotificationCheckbox,
				onFocus,
				onBlur,
			);

			// Initial state
			expect(controller.isEnabled()).toBe(false);

			// Toggle on
			controller.toggle();
			expect(mockElements.divChatWindow.style.display).toBe('block');
			expect(mockElements.inputMessage.focus).toHaveBeenCalled();
			expect(mockElements.divChatButton.classList.add).toHaveBeenCalledWith('active');
			expect(mockElements.divChatButton.classList.remove).toHaveBeenCalledWith('notification');
			expect(onFocus).toHaveBeenCalled();
			expect(controller.isEnabled()).toBe(true);

			// Toggle off
			controller.toggle();
			expect(mockElements.divChatWindow.style.display).toBe('none');
			expect(mockElements.divChatButton.classList.remove).toHaveBeenCalledWith('active');
			expect(onBlur).toHaveBeenCalled();
			expect(controller.isEnabled()).toBe(false);
		});

		it('should handle user join functionality', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
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
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			// First join a user
			controller.join('TestUser', 'session123', false);

			// Then have them part
			controller.part('session123');
			expect(mockElements.divUserList.removeChild).toHaveBeenCalled();
		});

		it('should handle nick changes', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			// First join a user
			controller.join('OldUser', 'session123', false);

			// Then change their nick
			controller.nick('NewUser', 'session123', true);

			// Should have updated the user
			expect(mockElements.divUserList.appendChild).toHaveBeenCalled();
		});

		it('should handle conversation addition', () => {
			const controller = createChatController(
				mockElements.divChatButton,
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
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
				mockElements.divChatWindow,
				mockElements.divMessageWindow,
				mockElements.divUserList,
				mockElements.inputHandle,
				mockElements.inputMessage,
				mockElements.inputNotificationCheckbox,
				vi.fn(),
				vi.fn(),
			);

			// Chat is disabled, should add notification class
			controller.addConversation('TestUser', 'Hello world', true);
			expect(mockElements.divChatButton.classList.add).toHaveBeenCalledWith('notification');
		});
	});
});
