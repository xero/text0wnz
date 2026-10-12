/**
 * 16colo.rs in-app browser: years -> packs -> pieces navigation
 * against a MOCKED api (no network ever leaves the test), and the
 * open path through a real in-memory pack zip from the mirror.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSixteenColors } from '../../src/js/client/sixteenColors.js';
import { buildZip } from '../corpus/zipFixture.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: { modal: { open: vi.fn(), close: vi.fn() } } }));

const MARKUP = `
	<strong id="sixteenCrumb"></strong>
	<p id="sixteenStatus" class="hide"></p>
	<div id="sixteenList"></div>
	<button id="sixteenBack"></button>
	<button id="sixteenClose"></button>
`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('sixteen colors browser', () => {
	let fetchMock;
	let opened;
	let browser;

	beforeEach(async () => {
		document.body.innerHTML = MARKUP;
		opened = [];
		const artBytes = new TextEncoder().encode('\u001b[31mhi');
		const zip = await buildZip([{ name: 'x0-art.ans', data: artBytes }]);
		fetchMock = vi.fn(async url => {
			if (url.endsWith('/year')) {
				return {
					ok: true,
					json: async () => ({ 1996: { packs: 2 }, 2014: { packs: 1 } }),
				};
			}
			if (url.includes('/year/2014')) {
				return {
					ok: true,
					json: async () => ({
						page: { pages: 1, page: 1 },
						results: [
							{
								year: 2014,
								name: 'blocktronics_wtf4',
								archive: 'blocktronics_wtf4.zip',
							},
						],
					}),
				};
			}
			if (url.includes('/pack/blocktronics_wtf4')) {
				return {
					ok: true,
					json: async () => ({
						results: [
							{
								year: 2014,
								files: {
									'x0-art.ans': { file: { tn: { uri: '/pack/x/tn/x0-art.ans.png', width: 180, height: 556 } } },
									'FILE_ID': { file: {} },
									'readme.exe': { file: {} },
									'promo.png': { file: { tn: { uri: '/pack/x/tn/promo.png', width: 180, height: 90 } } },
								},
							},
						],
					}),
				};
			}
			if (url.includes('raw.githubusercontent.com')) {
				expect(url).toContain('/2014/blocktronics_wtf4.zip');
				return { ok: true, arrayBuffer: async () => zip.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		browser = createSixteenColors({ openFile: file => opened.push(file) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
	});

	it('walks years -> packs -> pieces and opens through the mirror zip', async () => {
		browser.show();
		expect(State.modal.open).toHaveBeenCalledWith('sixteen');
		await flush();
		const list = document.getElementById('sixteenList');
		expect(list.dataset.view).toBe('years');
		const years = [...document.querySelectorAll('#sixteenList button')];
		expect(years[0].textContent).toContain('2014'); // newest first
		years[0].click();
		await flush();
		expect(list.dataset.view).toBe('packs');
		const packs = [...document.querySelectorAll('#sixteenList .sixteenPack')];
		expect(packs.map(b => b.textContent)).toContain('blocktronics_wtf4');
		// every pack previews through the gallery's normalized diz name,
		// inside a black frame that holds the cell when the load fails
		const card = packs.find(b => b.textContent === 'blocktronics_wtf4');
		expect(card.querySelector('.dizFrame img').src).toBe(
			'https://16colo.rs/pack/blocktronics_wtf4/tn/FILE_ID.DIZ.png',
		);
		card.click();
		await flush();
		expect(list.dataset.view).toBe('files');
		// pieces pack into balanced columns, unopenable files are gone
		expect(document.querySelectorAll('#sixteenList .sixteenCol').length)
			.toBeGreaterThanOrEqual(2);
		const pieces = [...document.querySelectorAll('#sixteenList .sixteenPiece')];
		expect(pieces.map(p => p.querySelector('span').textContent)).toEqual([
			'x0-art.ans',
			'FILE_ID',
		]);
		const art = pieces.find(p => p.textContent.includes('x0-art.ans'));
		expect(art.querySelector('img').src).toBe(
			'https://16colo.rs/pack/x/tn/x0-art.ans.png',
		);

		art.click();
		await flush();
		await flush();
		expect(opened).toHaveLength(1);
		expect(opened[0].name).toBe('x0-art.ans');
		expect(State.modal.close).toHaveBeenCalled();
	});

	it('strips spaces from the archive name, as the mirror sync does', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/pack/fire')) {
				return {
					ok: true,
					json: async () => ({ results: [{ year: 2023, files: { 'cal.ans': { file: {} } } }]}),
				};
			}
			if (url.includes('raw.githubusercontent.com')) {
				expect(url).toContain('/2023/fire2024-ansi-calendar.zip');
				return { ok: false, status: 404 };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showFiles({
			year: 2023,
			name: 'fire',
			archive: 'fire 2024-ansi-calendar.zip',
		});
		document.querySelector('#sixteenList .sixteenPiece').click();
		await flush();
		const mirrored = fetchMock.mock.calls
			.map(c => c[0])
			.filter(u => u.includes('raw.githubusercontent.com'));
		expect(mirrored).toHaveLength(1);
	});

	it('refuses to open from a pack the API lists no archive for', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/pack/ansipics')) {
				return {
					ok: true,
					json: async () => ({ results: [{ year: 1990, files: { 'old.ans': { file: {} } } }]}),
				};
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showFiles({ year: 1990, name: 'ansipics' });
		document.querySelector('#sixteenList .sixteenPiece').click();
		await flush();
		const status = document.getElementById('sixteenStatus');
		expect(status.textContent).toContain('no zip');
		expect(status.classList.contains('error')).toBe(true);
		const mirrored = fetchMock.mock.calls
			.map(c => c[0])
			.filter(u => u.includes('raw.githubusercontent.com'));
		expect(mirrored).toHaveLength(0);
	});

	it('surfaces API failures in the status line as an error state', async () => {
		fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
		await browser.showPacks(2030, 1);
		const status = document.getElementById('sixteenStatus');
		expect(status.textContent).toContain('did not answer');
		expect(status.classList.contains('error')).toBe(true);
		// a later success clears the error state
		fetchMock.mockImplementation(async () => ({
			ok: true,
			json: async () => ({ page: { pages: 1 }, results: []}),
		}));
		await browser.showPacks(2030, 1);
		expect(status.classList.contains('error')).toBe(false);
	});
});
