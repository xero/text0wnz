/**
 * The api is MOCKED throughout: no network ever leaves the test.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAsciiArena } from '../../src/js/client/asciiArena.js';
import { buildZip } from '../corpus/zipFixture.js';
import { realColly } from '../corpus/lhaFixture.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: { modal: { open: vi.fn(), close: vi.fn() } } }));

const MARKUP = `
	<button id="arenaTabLatest" class="active">latest</button>
	<button id="arenaTabArtist">artist</button>
	<button id="arenaTabCrew">crew</button>
	<button id="arenaTabSearch">search</button>
	<input id="arenaSearch" class="hide" type="search"/>
	<span id="arenaCrumb"></span>
	<p id="arenaStatus" class="hide"></p>
	<div id="arenaList"></div>
	<button id="arenaBack"></button>
	<button id="arenaClose"></button>
`;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

// stream-backed inflates land on their own schedule: poll until the
// open arrives instead of counting flush turns (ci shards lag)
const settle = async (done, tries = 400) => {
	for (let i = 0; i < tries && !done(); i++) {
		await flush();
	}
};

const INDEX_TSV = [
	'Filename\tPath\tArtist(s)\tCrew(s)\tDescription',
	'zmb-wof1.txt\tcollections/zmb-wof1\tZoMbiE\tIndependent\tWheel of Fortune',
	'c«w-LIG.txt\tcollections/c«w-LIG\tFighter for Future\tCrew\tLive In Garbage',
	'up-pack.zip\tcollections/up-pack\tTwo,ZoMbiE\tUp Rough\tZip Pack',
	'oldskool.lha\tcollections/oldskool\tTwo\tUp Rough\tAmiga Archive',
	'weird.dms\tcollections/weird\tTwo\tUp Rough\tDisk Image',
].join('\n');

// 20 lone high bytes: latin-1 scene art, never valid UTF-8
const amigaBytes = () => {
	const bytes = new TextEncoder().encode('oldskool ascii here!');
	return Uint8Array.from([...bytes, ...new Array(20).fill(0xab)]);
};

describe('asciiarena browser', () => {
	let fetchMock;
	let opened;
	let browser;

	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		opened = [];
		fetchMock = vi.fn(async url => {
			throw new Error(`unexpected fetch ${url}`);
		});
		vi.stubGlobal('fetch', fetchMock);
		browser = createAsciiArena({ openFile: (file, opts) => opened.push({ file, opts }) });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		document.body.innerHTML = '';
	});

	it('shows latest collys and opens one with amiga import hints', async () => {
		const art = amigaBytes();
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/collys?page=1&pagesize=24&sort=cdate&asc=D')) {
				return {
					ok: true,
					json: async () => [
						{
							filename: 'zmb-wof1.txt',
							name: 'Wheel of Fortune',
							artists: 'ZoMbiE',
							crews: 'Independent',
							cdate: '1994-00-00',
							total_count: 50,
						},
						{
							filename: 'fzn-tinf.txt',
							name: 'Textmode Inferno',
							artists: 'FuZioN',
							crews: 'NeoKorteX',
							cdate: '0000-00-00',
							total_count: 50,
						},
						// a disk image the editor cannot open never lists
						{
							filename: 'weird2.dms',
							name: 'Disk Only',
							artists: 'Two',
							crews: 'Up Rough',
							cdate: '1995-00-00',
							total_count: 50,
						},
					],
				};
			}
			if (url === 'https://asciiarena.se/collections/zmb-wof1/zmb-wof1.txt') {
				return { ok: true, arrayBuffer: async () => art.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		browser.show();
		expect(State.modal.open).toHaveBeenCalledWith('arena');
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('latest');
		// back stays live at the root: it exits to the artpacks landing
		expect(document.getElementById('arenaBack').disabled).toBe(false);
		document.getElementById('arenaBack').click();
		expect(State.modal.open).toHaveBeenCalledWith('artpacks');
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards).toHaveLength(2);
		// the sub line drops the 0000 year
		expect(cards[0].querySelector('span').textContent).toBe('Wheel of Fortune');
		expect(cards[0].querySelector('.arenaSub').textContent).toBe('ZoMbiE / 1994');
		expect(cards[1].querySelector('.arenaSub').textContent).toBe('FuZioN');
		// 50 collys at 24 a page paginate
		const steps = document.querySelectorAll('#arenaList .arenaPager button');
		expect(steps).toHaveLength(2);
		expect(steps[0].disabled).toBe(true);

		cards[0].click();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('zmb-wof1.txt');
		// lone high bytes mean scene art: skip the UTF-8 reader, render
		// in the same Topaz the site uses
		expect(opened[0].opts).toEqual({
			font: 'Topaz+ 1200 8x16',
			preferBytes: true,
		});
		expect(State.modal.close).toHaveBeenCalled();
	});

	it('ignores a repeat click on the colly already loading', async () => {
		let release;
		const gatep = new Promise(r => {
			release = r;
		});
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/collys?')) {
				return {
					ok: true,
					json: async () => [
						{
							filename: 'zmb-wof1.txt',
							name: 'Wheel of Fortune',
							artists: 'ZoMbiE',
							crews: '',
							cdate: '1994-00-00',
							total_count: 1,
						},
					],
				};
			}
			if (url.endsWith('/collections/zmb-wof1/zmb-wof1.txt')) {
				await gatep;
				return { ok: true, arrayBuffer: async () => amigaBytes().buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showLatest(1);
		const card = document.querySelector('#arenaList .arenaColly');
		card.click();
		card.click();
		release();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		const rawCalls = fetchMock.mock.calls.filter(c =>
			c[0].includes('/collections/zmb-wof1/'));
		expect(rawCalls).toHaveLength(1);
	});

	it('a different colly supersedes the one still loading', async () => {
		let releaseFirst;
		const firstGate = new Promise(r => {
			releaseFirst = r;
		});
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/collys?')) {
				return {
					ok: true,
					json: async () => [
						{
							filename: 'zmb-wof1.txt',
							name: 'Wheel of Fortune',
							artists: 'ZoMbiE',
							crews: '',
							cdate: '1994-00-00',
							total_count: 2,
						},
						{
							filename: 'fzn-tinf.txt',
							name: 'Textmode Inferno',
							artists: 'FuZioN',
							crews: '',
							cdate: '2026-09-19',
							total_count: 2,
						},
					],
				};
			}
			if (url.endsWith('/collections/zmb-wof1/zmb-wof1.txt')) {
				await firstGate;
				return { ok: true, arrayBuffer: async () => amigaBytes().buffer };
			}
			if (url.endsWith('/collections/fzn-tinf/fzn-tinf.txt')) {
				return { ok: true, arrayBuffer: async () => amigaBytes().buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showLatest(1);
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		cards[0].click();
		cards[1].click();
		await flush();
		await flush();
		// the slow first fetch lands AFTER the second finished: it must
		// not reopen the old colly over the one the user wants
		releaseFirst();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('fzn-tinf.txt');
		// the supersede must abort the first fetch's signal: the
		// plumbing from guard to fetch options is load-bearing
		const zmbCall = fetchMock.mock.calls.find(c =>
			c[0].endsWith('/collections/zmb-wof1/zmb-wof1.txt'));
		expect(zmbCall[1].signal.aborted).toBe(true);
		expect(
			document.getElementById('arenaStatus').classList.contains('error'),
		).toBe(false);
	});

	it('a fast colly beats the slow single-entry archive clicked first', async () => {
		const zip = await buildZip([{ name: 'logos/one.asc', data: amigaBytes() }]);
		let releaseZip;
		const zipGate = new Promise(r => {
			releaseZip = r;
		});
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/collys?')) {
				return {
					ok: true,
					json: async () => [
						{
							filename: 'up-pack.zip',
							name: 'Zip Pack',
							artists: 'Two',
							crews: 'Up Rough',
							cdate: '0000-00-00',
							total_count: 2,
						},
						{
							filename: 'fzn-tinf.txt',
							name: 'Textmode Inferno',
							artists: 'FuZioN',
							crews: '',
							cdate: '2026-09-19',
							total_count: 2,
						},
					],
				};
			}
			if (url.endsWith('/collections/up-pack/up-pack.zip')) {
				await zipGate;
				return { ok: true, arrayBuffer: async () => zip.buffer };
			}
			if (url.endsWith('/collections/fzn-tinf/fzn-tinf.txt')) {
				return { ok: true, arrayBuffer: async () => amigaBytes().buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showLatest(1);
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		cards[0].click();
		cards[1].click();
		await flush();
		await flush();
		// the archive's single entry auto-opens on arrival; superseded,
		// it must not steal a fresh ticket from the winning click
		releaseZip();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('fzn-tinf.txt');
	});

	it('rapid picker entry clicks resolve to the last one', async () => {
		const lha = realColly();
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			if (url.endsWith('/collections/oldskool/oldskool.lha')) {
				return { ok: true, arrayBuffer: async () => lha.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByArtist('Two');
		const card = [...document.querySelectorAll('#arenaList .arenaColly')].find(
			c => c.querySelector('span').textContent === 'Amiga Archive',
		);
		card.click();
		await flush();
		await flush();
		const entries = [...document.querySelectorAll('#arenaList button')];
		expect(entries.map(b => b.textContent)).toEqual([
			'File_ID.DiZ',
			'iFd-Colly3.txt',
		]);
		entries[0].click();
		entries[1].click();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('iFd-Colly3.txt');
	});

	it('keeps the UTF-8 path for ascii-clean files', async () => {
		const art = new TextEncoder().encode('plain ascii colly');
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/collys?')) {
				return {
					ok: true,
					json: async () => [
						{
							filename: 'fzn-tinf.txt',
							name: 'Textmode Inferno',
							artists: 'FuZioN',
							crews: '',
							cdate: '2026-09-19',
							total_count: 1,
						},
					],
				};
			}
			if (url.endsWith('/collections/fzn-tinf/fzn-tinf.txt')) {
				return { ok: true, arrayBuffer: async () => art.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showLatest(1);
		document.querySelector('#arenaList .arenaColly').click();
		await flush();
		expect(opened[0].opts.preferBytes).toBe(false);
		expect(opened[0].opts.font).toBe('Topaz+ 1200 8x16');
	});

	it('searches the whole index instantly and encodes raw urls as UTF-8', async () => {
		const art = amigaBytes();
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			if (url === 'https://asciiarena.se/collections/c%C2%ABw-LIG/c%C2%ABw-LIG.txt') {
				return { ok: true, arrayBuffer: async () => art.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		browser.setTab('search');
		await flush();
		// the bare tab reports the VIEWABLE index size (the dms row is
		// not a colly anyone can open here) and renders nothing
		expect(document.getElementById('arenaStatus').textContent).toContain('4 collys');
		const search = document.getElementById('arenaSearch');
		expect(search.classList.contains('hide')).toBe(false);
		search.value = 'garbage';
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect(document.getElementById('arenaCrumb').textContent).toBe('search / garbage');
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards).toHaveLength(1);
		expect(cards[0].querySelector('span').textContent).toBe('Live In Garbage');
		cards[0].click();
		await flush();
		await flush();
		expect(opened[0].file.name).toBe('c«w-LIG.txt');

		// the index fetched once; the second query reuses it
		search.value = 'zombie';
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect([...document.querySelectorAll('#arenaList .arenaColly')]).toHaveLength(2);

		// a query that only matches unviewable rows comes up empty
		search.value = 'disk image';
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect([...document.querySelectorAll('#arenaList .arenaColly')]).toHaveLength(0);
		expect(document.getElementById('arenaStatus').textContent).toBe('no collys match');
		const indexCalls = fetchMock.mock.calls.filter(c => c[0].endsWith('/api/uhcsearch'));
		expect(indexCalls).toHaveLength(1);
	});

	it('browses artists into their collys through the index', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/artists?page=1&pagesize=24&sort=nick&asc=A&filter=zom')) {
				return {
					ok: true,
					json: async () => [
						{ nick: 'ZoMbiE', crews: 'Independent', total_count: 2 },
						// no viewable colly in the index: never listed
						{ nick: 'Zombie Ghost', crews: '', total_count: 2 },
					],
				};
			}
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showArtists('zom', 1);
		const nicks = [...document.querySelectorAll('#arenaList button')].map(
			b => b.firstChild?.textContent,
		);
		expect(nicks).not.toContain('Zombie Ghost');
		const artist = [...document.querySelectorAll('#arenaList button')].find(
			b => b.firstChild?.textContent === 'ZoMbiE',
		);
		// crews are names, not counts: they stack under the nick in the
		// sub style, never in a kbd tag
		expect(artist.querySelector('kbd')).toBeNull();
		expect(artist.querySelector('.arenaSub').textContent).toBe('Independent');
		artist.click();
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('collys');
		expect(document.getElementById('arenaCrumb').textContent).toBe('artist / ZoMbiE');
		// the comma-split match finds the shared zip colly too
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual([
			'Wheel of Fortune',
			'Zip Pack',
		]);
	});

	it('browses crews into their collys through the index', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/crews?page=1&pagesize=24&sort=name&asc=A')) {
				return {
					ok: true,
					json: async () => [
						// the site's own placeholder rows carry zero works
						{ name: '9 design', releases_cnt: 0, total_count: 2 },
						// the site counts the dms release; the kbd must not
						{ name: 'Up Rough', releases_cnt: 3, total_count: 2 },
					],
				};
			}
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showCrews('', 1);
		const names = [...document.querySelectorAll('#arenaList button')].map(
			b => b.firstChild?.textContent,
		);
		expect(names).not.toContain('9 design');
		const crew = [...document.querySelectorAll('#arenaList button')].find(
			b => b.firstChild?.textContent === 'Up Rough',
		);
		// the count is the viewable tally, not the site's releases_cnt
		expect(crew.querySelector('kbd').textContent).toBe('2');
		// a scrolled list must not bleed its depth into the next view
		document.getElementById('arenaList').scrollTop = 400;
		crew.click();
		await flush();
		expect(document.getElementById('arenaList').scrollTop).toBe(0);
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual([
			'Zip Pack',
			'Amiga Archive',
		]);
	});

	it('says so when a whole page filters down to nothing', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/crews?')) {
				return {
					ok: true,
					json: async () => [{ name: '9 design', releases_cnt: 0, total_count: 1 }],
				};
			}
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showCrews('', 1);
		expect(document.querySelectorAll('#arenaList button')).toHaveLength(0);
		expect(document.getElementById('arenaStatus').textContent).toBe(
			'nothing on this page opens in the editor',
		);
	});

	it('lists a zip colly and opens a piece through the core reader', async () => {
		const zip = await buildZip([
			{ name: 'logos/one.asc', data: amigaBytes() },
			{ name: 'two.txt', data: new TextEncoder().encode('plain') },
		]);
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			if (url.endsWith('/collections/up-pack/up-pack.zip')) {
				return { ok: true, arrayBuffer: async () => zip.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByCrew('Up Rough');
		const card = [...document.querySelectorAll('#arenaList .arenaColly')].find(
			c => c.querySelector('span').textContent === 'Zip Pack',
		);
		card.click();
		await flush();
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('archive');
		expect(document.getElementById('arenaBack').disabled).toBe(false);
		const entries = [...document.querySelectorAll('#arenaList button')];
		expect(entries.map(b => b.textContent)).toEqual(['one.asc', 'two.txt']);
		entries[0].click();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('one.asc');
		expect(opened[0].opts.preferBytes).toBe(true);
	});

	it('lists an lha colly and opens a piece through the core reader', async () => {
		const lha = realColly();
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			if (url.endsWith('/collections/oldskool/oldskool.lha')) {
				return { ok: true, arrayBuffer: async () => lha.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByArtist('Two');
		const card = [...document.querySelectorAll('#arenaList .arenaColly')].find(
			c => c.querySelector('span').textContent === 'Amiga Archive',
		);
		card.click();
		await flush();
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('archive');
		// the readme and the .info icon are not openable and stay hidden
		const entries = [...document.querySelectorAll('#arenaList button')];
		expect(entries.map(b => b.textContent)).toEqual([
			'File_ID.DiZ',
			'iFd-Colly3.txt',
		]);
		entries[1].click();
		await flush();
		await flush();
		await settle(() => opened.length === 1);
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('iFd-Colly3.txt');
		expect(opened[0].opts.font).toBe('Topaz+ 1200 8x16');
	});

	it('never lists collys in formats the editor cannot open', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByArtist('Two');
		const titles = [...document.querySelectorAll('#arenaList .arenaColly')].map(
			c => c.querySelector('span').textContent,
		);
		// the diskmag (.dms disk image) is unviewable: filtered, not
		// listed-then-refused
		expect(titles).toEqual(['Zip Pack', 'Amiga Archive']);
	});

	it('fills diz previews lazily as cards come into view', async () => {
		class FakeIO {
			constructor(onHit) {
				this.onHit = onHit;
			}

			observe(el) {
				this.onHit([{ target: el, isIntersecting: true }]);
			}

			unobserve() {}

			disconnect() {}
		}
		vi.stubGlobal('IntersectionObserver', FakeIO);
		const diz = new TextEncoder().encode('\u001b[31mWheel of Fortune diz\u001b[0m   ');
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			if (url.endsWith('/collections/zmb-wof1/zmb-wof1.txt.diz')) {
				return { ok: true, arrayBuffer: async () => diz.buffer };
			}
			// every other preview misses and leaves its frame black
			if (url.endsWith('.diz')) {
				return { ok: false, status: 404 };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByArtist('ZoMbiE');
		await flush();
		const frames = [...document.querySelectorAll('#arenaList .dizFrame')];
		// ansi color codes strip out of the preview text
		expect(frames[0].querySelector('pre').textContent).toBe('Wheel of Fortune diz');
		expect(frames[1].querySelector('pre')).toBeNull();
	});

	it('shares one index download between concurrent views', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				await flush();
				return { ok: true, text: async () => INDEX_TSV };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await Promise.all([
			browser.showSearch('zombie'),
			browser.showByArtist('Two'),
		]);
		const indexCalls = fetchMock.mock.calls.filter(c =>
			c[0].endsWith('/api/uhcsearch'));
		expect(indexCalls).toHaveLength(1);
	});

	it('cancels a pending debounced search on tab switch', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/artists?')) {
				return { ok: true, json: async () => []};
			}
			if (url.includes('/api/collys?')) {
				return {
					ok: true,
					json: async () => [
						{
							filename: 'zmb-wof1.txt',
							name: 'Wheel of Fortune',
							artists: 'ZoMbiE',
							crews: '',
							cdate: '1994-00-00',
							total_count: 1,
						},
					],
				};
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		browser.setTab('artist');
		const search = document.getElementById('arenaSearch');
		search.value = 'zom';
		search.dispatchEvent(new Event('input'));
		// switch tabs before the 250ms debounce fires
		browser.setTab('latest');
		await vi.advanceTimersByTimeAsync(400);
		vi.useRealTimers();
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('latest');
		expect(document.getElementById('arenaCrumb').textContent).toBe('latest');
	});

	it('drops a stale archive fetch when the user has moved on', async () => {
		let releaseArchive;
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/uhcsearch')) {
				return { ok: true, text: async () => INDEX_TSV };
			}
			if (url.endsWith('/collections/oldskool/oldskool.lha')) {
				await new Promise(resolve => {
					releaseArchive = resolve;
				});
				return { ok: true, arrayBuffer: async () => realColly().buffer };
			}
			if (url.includes('/api/crews?')) {
				return {
					ok: true,
					json: async () => [{ name: 'Up Rough', releases_cnt: 2, total_count: 1 }],
				};
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByArtist('Two');
		const card = [...document.querySelectorAll('#arenaList .arenaColly')].find(
			c => c.querySelector('span').textContent === 'Amiga Archive',
		);
		card.click();
		await flush();
		await browser.showCrews('', 1);
		releaseArchive();
		await flush();
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('crews');
		expect(opened).toHaveLength(0);
	});

	it('drops a stale fetch instead of stomping the current view', async () => {
		let releaseLatest;
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/collys?')) {
				await new Promise(resolve => {
					releaseLatest = resolve;
				});
				return {
					ok: true,
					json: async () => [
						{
							filename: 'late.txt',
							name: 'Late',
							artists: '',
							crews: '',
							cdate: '2020-01-01',
							total_count: 1,
						},
					],
				};
			}
			if (url.includes('/api/crews?')) {
				return {
					ok: true,
					json: async () => [{ name: 'Up Rough', releases_cnt: 2, total_count: 1 }],
				};
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		const latest = browser.showLatest(1);
		await browser.showCrews('', 1);
		releaseLatest();
		await latest;
		await flush();
		const list = document.getElementById('arenaList');
		expect(list.dataset.view).toBe('crews');
		expect([...list.querySelectorAll('.arenaColly')]).toHaveLength(0);
		expect(
			[...list.querySelectorAll('button')].some(
				b => b.firstChild?.textContent === 'Up Rough',
			),
		).toBe(true);
	});

	it('surfaces API failures in the status line as an error state', async () => {
		fetchMock.mockImplementation(async () => ({ ok: false, status: 500 }));
		await browser.showLatest(1);
		const status = document.getElementById('arenaStatus');
		expect(status.textContent).toContain('did not answer');
		expect(status.classList.contains('error')).toBe(true);
		fetchMock.mockImplementation(async () => ({
			ok: true,
			json: async () => [],
		}));
		await browser.showLatest(2);
		expect(status.classList.contains('error')).toBe(false);
	});
});
