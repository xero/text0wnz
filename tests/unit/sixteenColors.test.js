/**
 * The 16colo.rs api is MOCKED (no network ever leaves the test); the
 * open path runs through a real in-memory pack zip.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSixteenColors } from '../../src/js/client/sixteenColors.js';
import { buildZip } from '../corpus/zipFixture.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: { modal: { open: vi.fn(), close: vi.fn() } } }));

const MARKUP = `
	<button id="sixteenTabYear" class="active">year</button>
	<button id="sixteenTabCrew">crew</button>
	<button id="sixteenTabArtist">artist</button>
	<button id="sixteenTabSearch">search</button>
	<input id="sixteenSearch" class="hide" type="search"/>
	<span id="sixteenCrumb"></span>
	<p id="sixteenStatus" class="hide"></p>
	<div id="sixteenList"></div>
	<button id="sixteenBack"></button>
	<button id="sixteenClose"></button>
`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// stream-backed inflates land on their own schedule: poll until the
// open arrives instead of counting flush turns (ci shards lag)
const settle = async (done, tries = 400) => {
	for (let i = 0; i < tries && !done(); i++) {
		await flush();
	}
};

describe('sixteen colors browser', () => {
	let fetchMock;
	let opened;
	let browser;

	beforeEach(async () => {
		document.body.innerHTML = MARKUP;
		opened = [];
		const artBytes = new TextEncoder().encode('\u001b[31mhi');
		// both openable pieces live in the zip, or the supersede test
		// would pass vacuously when the first click fails extraction
		const zip = await buildZip([
			{ name: 'x0-art.ans', data: artBytes },
			{ name: 'FILE_ID', data: new TextEncoder().encode('diz art') },
		]);
		fetchMock = vi.fn(async url => {
			if (url.endsWith('/year')) {
				return {
					ok: true,
					// the empty year is a site placeholder: never listed
					json: async () => ({ 1996: { packs: 2 }, 2014: { packs: 1 }, 2020: { packs: 0 } }),
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
								archive: 'blocktronics_wtf4.zip',
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
		// back stays live at the root: it exits to the artpacks landing
		expect(document.getElementById('sixteenBack').disabled).toBe(false);
		const years = [...document.querySelectorAll('#sixteenList button')];
		expect(years[0].textContent).toContain('2014'); // newest first
		expect(years.map(y => y.textContent).join()).not.toContain('2020');
		// a scrolled list must not bleed its depth into the next view
		list.scrollTop = 400;
		years[0].click();
		await flush();
		expect(list.dataset.view).toBe('packs');
		expect(list.scrollTop).toBe(0);
		expect(document.getElementById('sixteenBack').disabled).toBe(false);
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
		expect(document.getElementById('sixteenCrumb').textContent).toBe(
			'2014 / blocktronics_wtf4',
		);
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
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].name).toBe('x0-art.ans');
		expect(State.modal.close).toHaveBeenCalled();

		// back retraces files -> packs -> years, then exits to the landing
		document.getElementById('sixteenBack').click();
		await flush();
		expect(list.dataset.view).toBe('packs');
		document.getElementById('sixteenBack').click();
		await flush();
		expect(list.dataset.view).toBe('years');
		expect(document.getElementById('sixteenBack').disabled).toBe(false);
		document.getElementById('sixteenBack').click();
		expect(State.modal.open).toHaveBeenCalledWith('artpacks');
	});

	it('a different piece supersedes the one still loading', async () => {
		let releaseZip;
		const zipGate = new Promise(r => {
			releaseZip = r;
		});
		const realImpl = fetchMock.getMockImplementation();
		fetchMock.mockImplementation(async url => {
			if (url.includes('raw.githubusercontent.com')) {
				await zipGate;
			}
			return realImpl(url);
		});
		browser.show();
		await flush();
		[...document.querySelectorAll('#sixteenList button')]
			.find(b => b.textContent.includes('2014'))
			.click();
		await flush();
		document
			.querySelector('#sixteenList .sixteenPack')
			.click();
		await flush();
		const pieces = [...document.querySelectorAll('#sixteenList .sixteenPiece')];
		// first click stalls on the zip; the second must win, and both
		// clicks share ONE download because the cache holds the promise
		pieces.find(p => p.textContent.includes('FILE_ID')).click();
		await flush();
		pieces.find(p => p.textContent.includes('x0-art.ans')).click();
		releaseZip();
		await flush();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].name).toBe('x0-art.ans');
		const mirrorCalls = fetchMock.mock.calls.filter(c =>
			c[0].includes('raw.githubusercontent.com'));
		expect(mirrorCalls).toHaveLength(1);
	});

	it('resumes the current view when shown again mid-session', async () => {
		browser.show();
		await flush();
		const list = document.getElementById('sixteenList');
		[...document.querySelectorAll('#sixteenList button')]
			.find(b => b.textContent.includes('2014'))
			.click();
		await flush();
		expect(list.dataset.view).toBe('packs');
		// a later show (after opening a piece, say) must not reset
		browser.show();
		await flush();
		expect(State.modal.open).toHaveBeenLastCalledWith('sixteen');
		expect(list.dataset.view).toBe('packs');
	});

	it('browses artists and opens a piece by hydrating its pack', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/artist?page=1&filter=aven')) {
				return {
					ok: true,
					json: async () => ({
						page: { pages: 2, page: 1 },
						results: [
							{ artist: { name: 'avenger', releases: 373 } },
							// zero-release profiles are site placeholders
							{ artist: { name: 'avenue ghost', releases: 0 } },
						],
					}),
				};
			}
			if (url.includes('/artist/avenger')) {
				return {
					ok: true,
					json: async () => ({
						results: {
							1998: {
								bmbook16: {
									group: 'maiden brazil',
									files: [
										{ file: 'AVE-TUTP.ANS', tn: '/pack/bmbook16/tn/AVE-TUTP.ANS.png' },
										{ file: 'cover.png', tn: '/pack/bmbook16/tn/cover.png' },
									],
								},
								// a gif-only release: no section at all
								mist1198: {
									group: 'mistigris',
									files: [{ file: 'AVE-ANIM.GIF', tn: '/pack/mist1198/tn/AVE-ANIM.GIF.png' }],
								},
							},
						},
					}),
				};
			}
			if (url.includes('/pack/bmbook16')) {
				return {
					ok: true,
					json: async () => ({
						results: [
							{
								year: 1998,
								archive: 'bmbook16.zip',
								files: { 'AVE-TUTP.ANS': { file: {} } },
							},
						],
					}),
				};
			}
			if (url.includes('raw.githubusercontent.com')) {
				expect(url).toContain('/1998/bmbook16.zip');
				return { ok: false, status: 404 };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showArtists('aven', 1);
		const names = [...document.querySelectorAll('#sixteenList button')].map(
			b => b.firstChild?.textContent,
		);
		expect(names).not.toContain('avenue ghost');
		// the release count rides a kbd tag beside the name
		const artist = [...document.querySelectorAll('#sixteenList button')].find(
			b => b.firstChild?.textContent === 'avenger',
		);
		expect(artist).toBeTruthy();
		expect(artist.querySelector('kbd').textContent).toBe('373');
		artist.click();
		await flush();
		const list = document.getElementById('sixteenList');
		expect(list.dataset.view).toBe('artistworks');
		// one section: the gif-only mistigris release leaves no header
		const heads = document.querySelectorAll('.sixteenWorksHead');
		expect(heads).toHaveLength(1);
		expect(heads[0].textContent).toBe('1998 / bmbook16 (maiden brazil)');
		// the png never renders, only openable works do
		const pieces = [...document.querySelectorAll('.sixteenWorksBody .sixteenPiece')];
		expect(pieces.map(p => p.textContent)).toEqual(['AVE-TUTP.ANS']);
		pieces[0].click();
		await flush();
		await flush();
		// the open path resolved year and archive through the pack API
		const mirrored = fetchMock.mock.calls
			.map(c => c[0])
			.filter(u => u.includes('raw.githubusercontent.com'));
		expect(mirrored).toHaveLength(1);
	});

	it('browses crews into their packs by year', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/group?page=1')) {
				return {
					ok: true,
					json: async () => ({
						page: { pages: 1, page: 1 },
						results: [
							{ mistigris: { releases: 160 } },
							// zero-release crews are site placeholders
							{ 'ghost crew': { releases: 0 } },
						],
					}),
				};
			}
			if (url.includes('/group/mistigris')) {
				return {
					ok: true,
					json: async () => ({ results: { packs: { 2017: ['mist0117'], 2018: ['mist0118']} } }),
				};
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showCrews('', 1);
		const tags = [...document.querySelectorAll('#sixteenList button')].map(
			b => b.firstChild?.textContent,
		);
		expect(tags).not.toContain('ghost crew');
		const crew = [...document.querySelectorAll('#sixteenList button')].find(
			b => b.firstChild?.textContent === 'mistigris',
		);
		expect(crew.querySelector('kbd').textContent).toBe('160');
		crew.click();
		await flush();
		const list = document.getElementById('sixteenList');
		expect(list.dataset.view).toBe('crewpacks');
		const cards = [...document.querySelectorAll('#sixteenList .sixteenPack')];
		// newest year first, each card carries its year and diz preview
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual([
			'mist0118',
			'mist0117',
		]);
		expect(cards[0].querySelector('.sixteenSub').textContent).toBe('2018');
		expect(cards[0].querySelector('.dizFrame img').src).toBe(
			'https://16colo.rs/pack/mist0118/tn/FILE_ID.DIZ.png',
		);
	});

	it('searches packs globally from the search tab', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/pack?page=1&filter=acdu')) {
				return {
					ok: true,
					json: async () => ({
						page: { pages: 2, page: 1 },
						results: [{ year: 1993, name: 'acdu0193', archive: 'acdu0193.zip' }],
					}),
				};
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		browser.setTab('search');
		const search = document.getElementById('sixteenSearch');
		expect(search.classList.contains('hide')).toBe(false);
		search.value = 'acdu';
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect(document.getElementById('sixteenCrumb').textContent).toBe(
			'search / acdu',
		);
		const cards = [...document.querySelectorAll('#sixteenList .sixteenPack')];
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual(['acdu0193']);
		expect(cards[0].querySelector('.sixteenSub').textContent).toBe('1993');
		// the pager keeps both ends in the row, disabling at the bounds
		const steps = document.querySelectorAll('#sixteenList .sixteenPager button');
		expect(steps).toHaveLength(2);
		expect(steps[0].disabled).toBe(true);
		expect(steps[1].disabled).toBe(false);
	});

	it('strips spaces from the archive name, as the mirror sync does', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/pack/fire')) {
				return {
					ok: true,
					json: async () => ({
						results: [
							{
								year: 2023,
								archive: 'fire 2024-ansi-calendar.zip',
								files: { 'cal.ans': { file: {} } },
							},
						],
					}),
				};
			}
			if (url.includes('raw.githubusercontent.com')) {
				expect(url).toContain('/2023/fire2024-ansi-calendar.zip');
				return { ok: false, status: 404 };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showFiles({ year: 2023, name: 'fire' });
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
