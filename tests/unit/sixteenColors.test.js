/**
 * 16colo.rs in-app browser (P6): years -> packs -> pieces navigation
 * against a MOCKED api (no network ever leaves the test), and the open
 * path through a real in-memory pack zip from the mirror.
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
									'x0-art.ans': { file: { tn: { uri: '/pack/x/tn/x0-art.ans.png' } } },
									'readme.exe': { file: {} },
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
		const years = [...document.querySelectorAll('#sixteenList button')];
		expect(years[0].textContent).toContain('2014'); // newest first
		years[0].click();
		await flush();
		const packs = [...document.querySelectorAll('#sixteenList button')];
		expect(packs.map(b => b.textContent)).toContain('blocktronics_wtf4');
		packs.find(b => b.textContent === 'blocktronics_wtf4').click();
		await flush();
		const pieces = [...document.querySelectorAll('#sixteenList .sixteenPiece')];
		expect(pieces).toHaveLength(2);
		const art = pieces.find(p => p.textContent.includes('x0-art.ans'));
		expect(art.querySelector('img').src).toBe(
			'https://16colo.rs/pack/x/tn/x0-art.ans.png',
		);
		// the .exe is visible but not openable
		const exe = pieces.find(p => p.textContent.includes('readme.exe'));
		expect(exe.disabled).toBe(true);

		art.click();
		await flush();
		await flush();
		expect(opened).toHaveLength(1);
		expect(opened[0].name).toBe('x0-art.ans');
		expect(State.modal.close).toHaveBeenCalled();
	});

	it('surfaces API failures in the status line instead of a blank view', async () => {
		fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
		await browser.showPacks(2030, 1);
		expect(document.getElementById('sixteenStatus').textContent).toContain(
			'did not answer',
		);
	});
});
