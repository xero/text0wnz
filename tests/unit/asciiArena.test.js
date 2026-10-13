/**
 * asciiarena.se in-app browser: tabbed navigation (latest, artists,
 * crews, instant index search) against a MOCKED api (no network ever
 * leaves the test), the encoding hints that mirror the site's own
 * decode rule, and the archive colly paths through the core zip and
 * lha readers.
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

/** official v1 list envelope: {data, meta} */
const v1List = (rows, pages = 1) => ({
	ok: true,
	json: async () => ({
		data: rows,
		meta: { page: 1, per_page: 24, total: rows.length, total_pages: pages },
	}),
});

const WOF = {
	id: 1,
	name: 'Wheel of Fortune',
	filename: 'zmb-wof1.txt',
	type: 'ASCII',
	year: 1994,
	artists: ['ZoMbiE'],
	crews: ['Independent'],
};
const LIG = {
	id: 2,
	name: 'Live In Garbage',
	filename: 'c«w-LIG.txt',
	type: 'ASCII',
	year: 0,
	artists: ['Fighter for Future'],
	crews: ['Crew'],
};
const ZIPPACK = {
	id: 3,
	name: 'Zip Pack',
	filename: 'up-pack.zip',
	type: 'ASCII',
	year: 0,
	artists: ['Two', 'ZoMbiE'],
	crews: ['Up Rough'],
};
const LHAPACK = {
	id: 4,
	name: 'Amiga Archive',
	filename: 'oldskool.lha',
	type: 'ASCII',
	year: 0,
	artists: ['Two'],
	crews: ['Up Rough'],
};
/** an oddball format the client-side net must still catch */
const ODDBALL = {
	id: 5,
	name: 'Weird Icon',
	filename: 'weird.info',
	type: 'ASCII',
	year: 0,
	artists: ['Two'],
	crews: ['Up Rough'],
};

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
		// captions carry the title; the sub line drops the 0000 year
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

	it('searches collys through the official api and encodes raw urls as UTF-8', async () => {
		const art = amigaBytes();
		fetchMock.mockImplementation(async url => {
			if (url.endsWith('/api/v1/stats')) {
				return { ok: true, json: async () => ({ data: { collys: 3993 } }) };
			}
			if (url.includes('/api/v1/collys?q=garbage&')) {
				return v1List([LIG]);
			}
			if (url.includes('/api/v1/collys?q=zombie&')) {
				return v1List([WOF, ZIPPACK]);
			}
			if (url.includes('/api/v1/collys?q=nothing%20here&')) {
				return v1List([]);
			}
			if (url === 'https://asciiarena.se/collections/c%C2%ABw-LIG/c%C2%ABw-LIG.txt') {
				return { ok: true, arrayBuffer: async () => art.buffer };
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		browser.setTab('search');
		await flush();
		// the bare tab dresses the empty state with the stats total
		expect(document.getElementById('arenaStatus').textContent).toContain('3993 collys');
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

		search.value = 'zombie';
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect([...document.querySelectorAll('#arenaList .arenaColly')]).toHaveLength(2);

		search.value = 'nothing here';
		search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
		await flush();
		expect([...document.querySelectorAll('#arenaList .arenaColly')]).toHaveLength(0);
		expect(document.getElementById('arenaStatus').textContent).toBe('no collys match');
	});

	it('browses artists into their collys through the official api', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/artists?page=1&per_page=24&sort=nick&order=asc&q=zom')) {
				return v1List([
					{ nick: 'ZoMbiE', crews: ['Independent'], colly_count: 2 },
					// logo-only profile, zero collys: never listed
					{ nick: 'Zombie Ghost', crews: [], colly_count: 0 },
				]);
			}
			if (url.includes('/api/v1/collys?artist=ZoMbiE&')) {
				return v1List([WOF, ZIPPACK]);
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
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual([
			'Wheel of Fortune',
			'Zip Pack',
		]);
	});

	it('browses crews into their collys through the official api', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/crews?page=1&per_page=24&sort=name&order=asc')) {
				return v1List([
					// logo-only placeholder: zero releases, never listed
					{ name: '9 design', release_count: 0, logo_count: 5 },
					{ name: 'Up Rough', release_count: 2, logo_count: 40 },
				]);
			}
			if (url.includes('/api/v1/collys?crew=Up%20Rough&')) {
				return v1List([ZIPPACK, LHAPACK]);
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
		// release_count already excludes mags, so it rides the kbd as-is
		expect(crew.querySelector('kbd').textContent).toBe('2');
		crew.click();
		await flush();
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual([
			'Zip Pack',
			'Amiga Archive',
		]);
	});

	it('says so when a whole page filters down to nothing', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/crews?')) {
				return v1List([{ name: '9 design', release_count: 0, logo_count: 5 }]);
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
			if (url.includes('/api/v1/collys?crew=Up%20Rough&')) {
				return v1List([ZIPPACK, LHAPACK]);
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
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('one.asc');
		expect(opened[0].opts.preferBytes).toBe(true);
	});

	it('lists an lha colly and opens a piece through the core reader', async () => {
		const lha = realColly();
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/collys?artist=Two&')) {
				return v1List([ZIPPACK, LHAPACK]);
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
		expect(opened).toHaveLength(1);
		expect(opened[0].file.name).toBe('iFd-Colly3.txt');
		expect(opened[0].opts.font).toBe('Topaz+ 1200 8x16');
	});

	it('never lists collys in formats the editor cannot open', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/collys?artist=Two&')) {
				return v1List([ZIPPACK, LHAPACK, ODDBALL]);
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByArtist('Two');
		const titles = [...document.querySelectorAll('#arenaList .arenaColly')].map(
			c => c.querySelector('span').textContent,
		);
		// v1 splits diskmags out server-side; the client net still
		// catches oddball formats like amiga .info icons
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
			if (url.includes('/api/v1/collys?artist=ZoMbiE&')) {
				return v1List([WOF, ZIPPACK]);
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

	it('pages a long crew through the api', async () => {
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/collys?crew=Up%20Rough&page=1&')) {
				return v1List([ZIPPACK], 2);
			}
			if (url.includes('/api/v1/collys?crew=Up%20Rough&page=2&')) {
				return v1List([LHAPACK], 2);
			}
			throw new Error(`unexpected fetch ${url}`);
		});
		await browser.showByCrew('Up Rough');
		const steps = document.querySelectorAll('#arenaList .arenaPager button');
		expect(steps).toHaveLength(2);
		expect(steps[0].disabled).toBe(true);
		steps[1].click();
		await flush();
		const cards = [...document.querySelectorAll('#arenaList .arenaColly')];
		expect(cards.map(c => c.querySelector('span').textContent)).toEqual(['Amiga Archive']);
		expect(
			document.querySelectorAll('#arenaList .arenaPager button')[1].disabled,
		).toBe(true);
	});

	it('cancels a pending debounced search on tab switch', async () => {
		vi.useFakeTimers();
		fetchMock.mockImplementation(async url => {
			if (url.includes('/api/v1/artists?')) {
				return v1List([]);
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
			if (url.includes('/api/v1/collys?artist=Two&')) {
				return v1List([ZIPPACK, LHAPACK]);
			}
			if (url.endsWith('/collections/oldskool/oldskool.lha')) {
				await new Promise(resolve => {
					releaseArchive = resolve;
				});
				return { ok: true, arrayBuffer: async () => realColly().buffer };
			}
			if (url.includes('/api/v1/crews?')) {
				return v1List([{ name: 'Up Rough', release_count: 2 }]);
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
			if (url.includes('/api/v1/crews?')) {
				return v1List([{ name: 'Up Rough', release_count: 2 }]);
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
