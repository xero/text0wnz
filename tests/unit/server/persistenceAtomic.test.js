/**
 * writeFileAtomic durability contract: the temp file syncs to disk
 * BEFORE the rename makes it the real one, or a power loss can keep
 * the rename and drop the data. Own file: vi.mock on node:fs/promises
 * is hoisted file-wide and the main persistence suite needs real fs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => {
	const handles = [];
	return {
		handles,
		open: vi.fn(async () => {
			const handle = {
				writeFile: vi.fn(async () => {}),
				sync: vi.fn(async () => {}),
				close: vi.fn(async () => {}),
			};
			handles.push(handle);
			return handle;
		}),
		rename: vi.fn(async () => {}),
		rm: vi.fn(async () => {}),
		mkdir: vi.fn(async () => {}),
		copyFile: vi.fn(async () => {}),
		readFile: vi.fn(async () => {
			throw new Error('no reads in this suite');
		}),
		readdir: vi.fn(async () => []),
	};
});

vi.mock('node:fs/promises', () => {
	const mocked = {
		open: h.open,
		rename: h.rename,
		rm: h.rm,
		mkdir: h.mkdir,
		copyFile: h.copyFile,
		readFile: h.readFile,
		readdir: h.readdir,
	};
	return { ...mocked, default: mocked };
});

import { saveRoom } from '../../../src/js/server/persistence.js';
import { createRoom } from '../../../src/js/server/room.js';
import { MoebiusAction as A } from '../../../src/js/core/index';

describe('writeFileAtomic durability', () => {
	beforeEach(() => {
		h.handles.length = 0;
		h.open.mockClear();
		h.rename.mockClear();
	});

	it('syncs the temp file before renaming it into place', async () => {
		const room = createRoom({ name: 'fsync', columns: 2, rows: 1 });
		const client = { send: () => {} };
		room.connect(client, { nick: 'x' });
		room.message(client, {
			type: A.DRAW,
			data: { x: 0, y: 0, block: { code: 65, fg: 7, bg: 0 }, id: 0 },
		});
		await saveRoom(room, '/fake');

		// one temp file per artifact: the envelope and the sidecar
		expect(h.open).toHaveBeenCalledTimes(2);
		expect(h.rename).toHaveBeenCalledTimes(2);
		h.handles.forEach((handle, i) => {
			const write = handle.writeFile.mock.invocationCallOrder[0];
			const sync = handle.sync.mock.invocationCallOrder[0];
			const close = handle.close.mock.invocationCallOrder[0];
			const rename = h.rename.mock.invocationCallOrder[i];
			expect(write).toBeLessThan(sync);
			expect(sync).toBeLessThan(close);
			expect(close).toBeLessThan(rename);
			expect(handle.sync).toHaveBeenCalledTimes(1);
		});
		const targets = h.rename.mock.calls.map(call => call[1]);
		expect(targets.some(t => t.endsWith('.0wnz'))).toBe(true);
		expect(targets.some(t => t.endsWith('.state.json'))).toBe(true);
	});
});
