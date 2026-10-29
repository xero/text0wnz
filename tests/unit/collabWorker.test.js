import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';

const sockets = [];

class FakeWebSocket {
	constructor(url) {
		this.url = url;
		this.sent = [];
		this.listeners = new Map();
		this.closed = false;
		sockets.push(this);
	}

	addEventListener(name, fn) {
		if (!this.listeners.has(name)) {
			this.listeners.set(name, []);
		}
		this.listeners.get(name).push(fn);
	}

	emit(name, event = {}) {
		for (const fn of this.listeners.get(name) ?? []) {
			fn(event);
		}
	}

	send(data) {
		this.sent.push(JSON.parse(data));
	}

	close() {
		this.closed = true;
		this.emit('close', {});
	}
}

const fakeSelf = {
	onmessage: null,
	postMessage: vi.fn(),
	location: {
		origin: 'http://localhost:3000',
		protocol: 'http:',
		hostname: 'localhost',
		host: 'localhost:3000',
		port: '3000',
	},
};

const toWorker = data => fakeSelf.onmessage({ origin: '', data });
const pageMessages = () => fakeSelf.postMessage.mock.calls.map(c => c[0]);

beforeAll(async () => {
	vi.stubGlobal('self', fakeSelf);
	vi.stubGlobal('WebSocket', FakeWebSocket);
	await import('../../src/js/client/collabWorker.js');
});

afterAll(() => {
	vi.unstubAllGlobals();
});

beforeEach(() => {
	fakeSelf.postMessage.mockClear();
	sockets.length = 0;
	toWorker({ cmd: 'disconnect' });
	fakeSelf.postMessage.mockClear();
});

describe('collab worker', () => {
	it('initializes and probes with a nickless one-shot CONNECTED', () => {
		toWorker({ cmd: 'init' });
		expect(pageMessages()).toEqual([{ cmd: 'initialized' }]);
		toWorker({ cmd: 'probe' });
		const probe = sockets.at(-1);
		expect(probe.url).toBe('ws://localhost:3000/server');
		probe.emit('open');
		expect(probe.sent[0].type).toBe(0);
		expect(probe.sent[0].data.nick).toBeUndefined();
		// ANY reply proves a server; the probe socket closes itself
		probe.emit('message', { data: '{"type":1}' });
		expect(pageMessages().at(-1)).toEqual({ cmd: 'probeResult', found: true });
		expect(probe.closed).toBe(true);
	});

	it('reports a missing server from the probe', () => {
		toWorker({ cmd: 'probe' });
		const probe = sockets.at(-1);
		probe.emit('error');
		expect(pageMessages().at(-1)).toEqual({
			cmd: 'probeResult',
			found: false,
		});
	});

	it('handshakes, stamps ids on sends, and forwards frames', () => {
		toWorker({ cmd: 'connect', nick: 'xero', group: 'impure', pass: 'pw' });
		const ws = sockets.at(-1);
		ws.emit('open');
		expect(ws.sent[0]).toEqual({
			type: 0,
			data: { nick: 'xero', group: 'impure', pass: 'pw', caps: undefined },
		});
		ws.emit('message', { data: JSON.stringify({ type: 0, data: { id: 7, doc: { columns: 2 } } }) });
		const connectedMsg = pageMessages().find(m => m.cmd === 'connected');
		expect(connectedMsg.id).toBe(7);

		toWorker({ cmd: 'send', type: 16, data: { columns: 5, rows: 3 } });
		expect(ws.sent.at(-1)).toEqual({
			type: 16,
			data: { columns: 5, rows: 3, id: 7 },
		});

		toWorker({
			cmd: 'draw',
			cells: [
				{ x: 1, y: 0, block: { code: 65, fg: 7, bg: 0 } },
				{ x: 2, y: 0, block: { code: 66, fg: 7, bg: 0 } },
			],
		});
		const draws = ws.sent.filter(f => f.type === 9);
		expect(draws).toHaveLength(2);
		expect(draws[0].data.id).toBe(7);

		ws.emit('message', { data: JSON.stringify({ type: 10, data: { nick: 'peer', text: 'yo' } }) });
		expect(pageMessages().at(-1)).toEqual({
			cmd: 'frame',
			type: 10,
			data: { nick: 'peer', text: 'yo' },
		});
	});

	it('dials a typed plaintext server direct from a plain page', () => {
		toWorker({ cmd: 'connect', nick: 'xero', url: 'jam.example/lounge' });
		expect(sockets.at(-1).url).toBe('ws://jam.example:8000/lounge');
	});

	it('routes a plaintext server through the host bridge from a secure page', () => {
		const plain = { ...fakeSelf.location };
		Object.assign(fakeSelf.location, {
			origin: 'https://text.0w.nz',
			protocol: 'https:',
			hostname: 'text.0w.nz',
			host: 'text.0w.nz',
			port: '',
		});
		try {
			toWorker({ cmd: 'connect', nick: 'xero', url: 'ws://jam.example:8000/lounge' });
			const ws = sockets.at(-1);
			expect(ws.url).toBe(
				'wss://text.0w.nz/bridge?host=jam.example&port=8000&room=lounge',
			);
			// a dead bridged dial tells the page which leg to blame, on
			// the error browsers fire first and on the close that follows
			ws.emit('error');
			expect(pageMessages().at(-1)).toEqual({
				cmd: 'error',
				error: 'websocket error',
				bridged: true,
			});
			ws.close();
			expect(pageMessages().at(-1)).toEqual({
				cmd: 'closed',
				wasConnected: false,
				bridged: true,
			});
			// the same-origin default never bridges
			toWorker({ cmd: 'probe' });
			expect(sockets.at(-1).url).toBe('wss://text.0w.nz:443/server');
			// a link-chosen plaintext target is not probed through the
			// bridge: no consent yet, so no outbound dial from the host
			const before = sockets.length;
			fakeSelf.postMessage.mockClear();
			toWorker({ cmd: 'probe', url: 'jam.example/lounge' });
			expect(sockets.length).toBe(before);
			expect(pageMessages().at(-1)).toEqual({ cmd: 'probeResult', found: false });
			// a secure target still probes direct
			toWorker({ cmd: 'probe', url: 'wss://other.example/server' });
			expect(sockets.at(-1).url).toBe('wss://other.example:443/server');
		} finally {
			Object.assign(fakeSelf.location, plain);
		}
	});

	it('gives up on a dial that never answers', () => {
		vi.useFakeTimers();
		try {
			toWorker({ cmd: 'connect', nick: 'xero', url: 'blackhole.example' });
			const ws = sockets.at(-1);
			vi.advanceTimersByTime(14999);
			expect(ws.closed).toBe(false);
			vi.advanceTimersByTime(1);
			expect(ws.closed).toBe(true);
			expect(pageMessages().at(-1)).toEqual({
				cmd: 'closed',
				wasConnected: false,
				bridged: false,
			});
		} finally {
			vi.useRealTimers();
		}
	});

	it('reports refusal and closes', () => {
		toWorker({ cmd: 'connect', nick: 'xero' });
		const ws = sockets.at(-1);
		ws.emit('open');
		ws.emit('message', { data: '{"type":1}' });
		expect(pageMessages().some(m => m.cmd === 'refused')).toBe(true);
	});

	it('reports closes with session awareness', () => {
		toWorker({ cmd: 'connect', nick: 'xero' });
		const ws = sockets.at(-1);
		ws.emit('open');
		ws.emit('message', { data: JSON.stringify({ type: 0, data: { id: 1, doc: {} } }) });
		ws.close();
		expect(pageMessages().at(-1)).toEqual({
			cmd: 'closed',
			wasConnected: true,
			bridged: false,
		});
	});

	it('drops malformed frames without forwarding', () => {
		toWorker({ cmd: 'connect', nick: 'xero' });
		const ws = sockets.at(-1);
		ws.emit('open');
		ws.emit('message', { data: JSON.stringify({ type: 0, data: { id: 1, doc: {} } }) });
		fakeSelf.postMessage.mockClear();
		ws.emit('message', { data: 'not json' });
		ws.emit('message', { data: '{"type":-5}' });
		expect(pageMessages()).toEqual([]);
	});
});

describe('stale socket', () => {
	it('an old socket closing never clobbers a newer connection', () => {
		toWorker({ cmd: 'connect', nick: 'first' });
		const oldWs = sockets.at(-1);
		toWorker({ cmd: 'connect', nick: 'second' });
		const newWs = sockets.at(-1);
		newWs.emit('open');
		newWs.emit('message', { data: JSON.stringify({ type: 0, data: { id: 5, doc: {} } }) });
		fakeSelf.postMessage.mockClear();
		// the OLD socket's async close event arrives late
		oldWs.emit('close', {});
		expect(pageMessages()).toEqual([]); // no spurious 'closed'
		// the new session still works end to end
		newWs.emit('message', { data: JSON.stringify({ type: 10, data: { text: 'alive' } }) });
		expect(pageMessages().at(-1).cmd).toBe('frame');
	});
});
