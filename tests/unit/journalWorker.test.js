/**
 * journalWorker message handler guard: the flagged CodeQL surface
 * (js/missing-origin-check). OPFS sync-access handles do not exist in
 * jsdom, so these tests stub `self` to capture the handler and prove
 * the guard drops untrusted or malformed messages silently while
 * same-context messages still reach the op table (and get a reply,
 * here an error reply because init cannot find OPFS).
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
