/**
 * The File Open picker's accept list is the system dialog's filter: a
 * format the manual promises but the list omits is greyed out in the
 * picker even though drag and drop opens it. Pin the promise.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const html = readFileSync(
	path.resolve(import.meta.dirname, '../../src/index.html'),
	'utf8',
);
const accept = html.match(/id="openFile"[^>]*accept="([^"]+)"/)?.[1] ?? '';
const listed = new Set(accept.split(','));

describe('File Open accept list', () => {
	it('names every format the manual says File > Open loads', () => {
		for (const ext of [
			'.ans',
			'.asc',
			'.nfo',
			'.bin',
			'.xb',
			'.tnd',
			'.dur',
			'.0wnz',
			'.txt',
			'.diz',
			'.zip',
			'.lha',
			'.lzh',
		]) {
			expect(listed.has(ext), `${ext} missing from the picker`).toBe(true);
		}
	});
});
