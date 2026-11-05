/**
 * journalWorker's message guard (CodeQL js/missing-origin-check).
 * jsdom has no OPFS sync-access handles, so `self` is stubbed to
 * capture the handler, and a same-context message gets an error reply
 * because init cannot find OPFS.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

const fakeSelf = {
	onmessage: null,
	postMessage: vi.fn(),
	location: { origin: 'http://localhost:3000' },
};

beforeAll(async () => {
	vi.stubGlobal('self', fakeSelf);
	const getDirectory = () => Promise.reject(new Error('no opfs in jsdom'));
	vi.stubGlobal('navigator', { storage: { getDirectory } });
	await import('../../src/js/client/journalWorker.js');
});

afterAll(() => {
	vi.unstubAllGlobals();
});

describe('journal worker handler guard', () => {
	it('captured the handler at import', () => {
		expect(typeof fakeSelf.onmessage).toBe('function');
	});

	it('drops messages claiming a foreign origin without replying', async () => {
		await fakeSelf.onmessage({
			origin: 'https://evil.example',
			data: { id: 1, op: 'read' },
		});
		expect(fakeSelf.postMessage).not.toHaveBeenCalled();
	});

	it('drops malformed payloads without replying', async () => {
		await fakeSelf.onmessage({ origin: '', data: 'read' });
		await fakeSelf.onmessage({ origin: '', data: null });
		await fakeSelf.onmessage({ origin: '', data: { id: 2 } });
		expect(fakeSelf.postMessage).not.toHaveBeenCalled();
	});

	it('processes same-context messages and replies', async () => {
		await fakeSelf.onmessage({ origin: '', data: { id: 3, op: 'read' } });
		expect(fakeSelf.postMessage).toHaveBeenCalledWith({
			id: 3,
			ok: false,
			error: 'no opfs in jsdom',
		});
	});
});

describe('journal worker setup', () => {
	it('retries on the next call after a failure, letting go of the handles it opened', async () => {
		// one sync-access handle per file at a time, as OPFS locks them;
		// another tab holds journal.a until it closes
		const open = new Set();
		let lockedElsewhere = 'journal.a';
		const syncHandle = async name => {
			if (open.has(name) || name === lockedElsewhere) {
				throw new Error(`NoModificationAllowedError: ${name}`);
			}
			open.add(name);
			let bytes = new Uint8Array(0);
			return {
				getSize: () => bytes.length,
				read: (out, { at }) => out.set(bytes.subarray(at, at + out.length)),
				write: (data, { at }) => {
					const grown = new Uint8Array(Math.max(bytes.length, at + data.length));
					grown.set(bytes);
					grown.set(data, at);
					bytes = grown;
				},
				truncate: size => {
					bytes = bytes.slice(0, size);
				},
				flush: () => {},
				close: () => open.delete(name),
			};
		};
		const root = { getFileHandle: async name => ({ createSyncAccessHandle: () => syncHandle(name) }) };
		vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
		fakeSelf.postMessage.mockClear();

		await fakeSelf.onmessage({ origin: '', data: { id: 4, op: 'read' } });
		expect(fakeSelf.postMessage).toHaveBeenLastCalledWith({
			id: 4,
			ok: false,
			error: 'NoModificationAllowedError: journal.a',
		});
		lockedElsewhere = null;
		await fakeSelf.onmessage({ origin: '', data: { id: 5, op: 'read' } });
		expect(fakeSelf.postMessage).toHaveBeenLastCalledWith(
			{ id: 5, ok: true, bytes: new Uint8Array(0) },
			expect.any(Array),
		);
	});
});
