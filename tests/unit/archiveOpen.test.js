/**
 * Native archive opens: the picker modal for multi-entry zips and
 * lha collys, the straight-through single-entry path, amiga import
 * hints on lha entries only, and the error states that land in the
 * modal's own status line.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createArchiveOpener, isArchiveFile } from '../../src/js/client/archiveOpen.js';
import { buildZip } from '../corpus/zipFixture.js';
import { realColly } from '../corpus/lhaFixture.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: { modal: { open: vi.fn(), close: vi.fn(), current: vi.fn(() => false) } } }));

const MARKUP = `
	<h2 id="archiveTitle"></h2>
	<p id="archiveStatus" class="hide"></p>
	<div id="archiveList"></div>
	<button id="archiveClose"></button>
`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// a File stand-in: jsdom's File lacks arrayBuffer in some runners
const fakeFile = (name, bytes) => ({
	name,
	arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

describe('native archive opens', () => {
	let opened;
	let opener;

	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		opened = [];
		State.modal.current.mockReturnValue(false);
		opener = createArchiveOpener({ openFile: (file, opts) => opened.push({ file, opts }) });
	});

	afterEach(() => {
		vi.clearAllMocks();
		document.body.innerHTML = '';
	});

	it('recognizes archive files by extension', () => {
		expect(isArchiveFile({ name: 'pack.ZIP' })).toBe(true);
		expect(isArchiveFile({ name: 'colly.lha' })).toBe(true);
		expect(isArchiveFile({ name: 'colly.lzh' })).toBe(true);
		expect(isArchiveFile({ name: 'art.ans' })).toBe(false);
	});

	it('raises the picker for a multi-entry zip and opens plain', async () => {
		const zip = await buildZip([
			{ name: 'logos/one.asc', data: new TextEncoder().encode('one') },
			{ name: 'two.txt', data: new TextEncoder().encode('two') },
			{ name: 'skip.exe', data: new TextEncoder().encode('no') },
		]);
		await opener.open(fakeFile('pack.zip', zip));
		expect(State.modal.open).toHaveBeenCalledWith('archive');
		expect(document.getElementById('archiveTitle').textContent).toBe('pack.zip');
		const entries = [...document.querySelectorAll('#archiveList button')];
		expect(entries.map(b => b.textContent)).toEqual(['one.asc', 'two.txt']);
		State.modal.current.mockReturnValue('archive');
		entries[1].click();
		await flush();
		await flush();
		expect(State.modal.close).toHaveBeenCalled();
		expect(opened[0].file.name).toBe('two.txt');
		// zip entries keep the editor's cp437 defaults: no amiga hints
		expect(opened[0].opts).toEqual({});
	});

	it('opens lha entries with amiga import hints', async () => {
		await opener.open(fakeFile('iFd-Colly3.lha', realColly()));
		const entries = [...document.querySelectorAll('#archiveList button')];
		expect(entries.map(b => b.textContent)).toEqual([
			'File_ID.DiZ',
			'iFd-Colly3.txt',
		]);
		State.modal.current.mockReturnValue('archive');
		entries[1].click();
		await flush();
		expect(opened[0].file.name).toBe('iFd-Colly3.txt');
		expect(opened[0].opts.font).toBe('Topaz+ 1200 8x16');
	});

	it('skips the picker when only one entry opens', async () => {
		const zip = await buildZip([
			{ name: 'solo.ans', data: new TextEncoder().encode('solo') },
			{ name: 'cover.png', data: new TextEncoder().encode('img') },
		]);
		await opener.open(fakeFile('solo.zip', zip));
		await flush();
		expect(State.modal.open).not.toHaveBeenCalled();
		expect(opened[0].file.name).toBe('solo.ans');
	});

	it('reports unreadable archives in the modal status line', async () => {
		await opener.open(fakeFile('junk.lha', new TextEncoder().encode('not an archive')));
		expect(State.modal.open).toHaveBeenCalledWith('archive');
		const status = document.getElementById('archiveStatus');
		expect(status.textContent).toContain('could not read junk.lha');
		expect(status.classList.contains('error')).toBe(true);
	});

	it('reports archives with nothing openable', async () => {
		const zip = await buildZip([{ name: 'cover.png', data: new TextEncoder().encode('img') }]);
		await opener.open(fakeFile('pics.zip', zip));
		const status = document.getElementById('archiveStatus');
		expect(status.textContent).toContain('nothing in pics.zip');
		expect(status.classList.contains('error')).toBe(true);
	});
});
