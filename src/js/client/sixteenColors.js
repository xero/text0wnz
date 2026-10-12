/**
 * 16colo.rs in-app browser: tabs for years, crews, artists, and pack
 * search, drilling into packs and pieces with thumbnails and opening
 * straight into the editor. Metadata and thumbnails come from
 * api.16colo.rs and the gallery (the API is CORS-open; thumbs ride
 * plain <img> tags). FILE BYTES come from the owner's GitHub archive
 * mirror (xero/sixteencolors-archive): the gallery host serves no CORS
 * headers for raw files, while raw.githubusercontent.com does; the
 * pack zip fetches once, caches, and single pieces inflate client-side
 * through the core zip reader. Politeness: every request is
 * user-driven and cached; NOTHING here runs in CI.
 */
import State from './state.js';
import { $ } from './ui.js';
import {
	extractZipEntry,
	findZipEntry,
	readZipEntries,
} from '../core/index';

const API = 'https://api.16colo.rs/v1';
const GALLERY = 'https://16colo.rs';
const MIRROR =
	'https://raw.githubusercontent.com/xero/sixteencolors-archive/master';

/** piece extensions the editor can open, plus the bare file_id */
const OPENABLE = /\.(ans|asc|diz|nfo|txt|bin|xb|tnd|dur)$/i;
const isOpenable = name => OPENABLE.test(name) || (/^file_id$/i).test(name);

/** column the masonry packs around, thumbnail width plus padding */
const COL_WIDTH = 196;
/** caption + padding under each thumbnail, for column balancing */
const CAPTION_PX = 36;

const createSixteenColors = ({ openFile }) => {
	const crumb = $('sixteenCrumb');
	const list = $('sixteenList');
	const status = $('sixteenStatus');
	const btnBack = $('sixteenBack');
	const searchBox = $('sixteenSearch');
	if (!list) {
		return null;
	}

	const cache = {
		years: null,
		pages: new Map(), // list endpoints: cache key -> response json
		packs: new Map(), // pack name -> {year, archive, files}
		zips: new Map(), // archive name -> Uint8Array
	};
	/** @type {{view: string, year?: number, pack?: object, name?: string}} */
	let where = { view: 'years' };

	// ------------------------------------------------- tabs and history

	// back walks a trail of view thunks: every drill-down pushes the
	// view it left, so depth can differ per tab without special cases
	let trail = [];
	let here = () => showYears();
	const renderHere = () => {
		btnBack.disabled = trail.length === 0;
		here();
	};
	const visit = thunk => {
		trail.push(here);
		here = thunk;
		renderHere();
	};
	const swap = thunk => {
		here = thunk;
		renderHere();
	};
	const back = () => {
		if (trail.length) {
			here = trail.pop();
			renderHere();
		}
	};

	const TABS = {
		year: { root: () => showYears(), hint: null },
		crew: { root: () => showCrews('', 1), hint: 'filter crews' },
		artist: { root: () => showArtists('', 1), hint: 'filter artists' },
		search: { root: () => showPackSearch('', 1), hint: 'search packs' },
	};
	let tab = 'year';
	const setTab = name => {
		tab = name;
		for (const key of Object.keys(TABS)) {
			$(`sixteenTab${key[0].toUpperCase()}${key.slice(1)}`)?.classList.toggle(
				'active',
				key === name,
			);
		}
		if (searchBox) {
			searchBox.value = '';
			searchBox.classList.toggle('hide', !TABS[name].hint);
			searchBox.placeholder = TABS[name].hint ?? '';
		}
		trail = [];
		here = TABS[name].root;
		renderHere();
	};

	const applySearch = () => {
		const q = searchBox.value.trim();
		trail = [];
		if (tab === 'artist') {
			here = () => showArtists(q, 1);
		} else if (tab === 'crew') {
			here = () => showCrews(q, 1);
		} else {
			here = () => showPackSearch(q, 1);
		}
		renderHere();
	};

	// ----------------------------------------------------------- utils

	const say = (text, isError = false) => {
		status.textContent = text ?? '';
		status.classList.toggle('hide', !text);
		status.classList.toggle('error', Boolean(text) && isError);
	};

	const fetchJson = async url => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`${response.status} from ${url}`);
		}
		return response.json();
	};

	const fetchPage = async (key, url) => {
		const data = cache.pages.get(key) ?? (await fetchJson(url));
		cache.pages.set(key, data);
		return data;
	};

	const clearList = view => {
		list.textContent = '';
		list.dataset.view = view;
	};

	const button = (label, onClick, className = 'sixteenItem') => {
		const el = document.createElement('button');
		el.textContent = label;
		el.className = className;
		el.addEventListener('click', onClick);
		return el;
	};

	const pager = (page, pages, goPage) => {
		const el = document.createElement('div');
		el.className = 'sixteenPager';
		if (page > 1) {
			el.appendChild(button('< prev', () => goPage(page - 1), ''));
		}
		el.appendChild(
			Object.assign(document.createElement('span'), { textContent: ` ${page}/${pages} ` }),
		);
		if (page < pages) {
			el.appendChild(button('next >', () => goPage(page + 1), ''));
		}
		return el;
	};

	/** one pack's metadata and openable files, fetched once */
	const loadPack = async name => {
		if (!cache.packs.has(name)) {
			const data = await fetchJson(`${API}/pack/${encodeURIComponent(name)}`);
			const rec = data.results?.[0] ?? {};
			cache.packs.set(name, {
				year: rec.year,
				archive: rec.archive ?? null,
				files: Object.entries(rec.files ?? {})
					.filter(([fileName]) => isOpenable(fileName))
					.map(([fileName, info]) => ({
						name: fileName,
						tn: info?.file?.tn?.uri ?? null,
						w: info?.file?.tn?.width ?? 0,
						h: info?.file?.tn?.height ?? 0,
						artists: info?.artists ?? [],
					})),
			});
		}
		return cache.packs.get(name);
	};

	// ------------------------------------------------------------ cards

	// every pack preview rides the gallery's normalized diz name; a pack
	// without one 404s and the black frame alone holds the cell
	const packCard = (pack, withYear = false) => {
		const item = document.createElement('button');
		item.className = 'sixteenPack';
		const frame = document.createElement('div');
		frame.className = 'dizFrame';
		const img = document.createElement('img');
		img.loading = 'lazy';
		img.src = `${GALLERY}/pack/${encodeURIComponent(pack.name)}/tn/FILE_ID.DIZ.png`;
		img.alt = pack.name;
		img.addEventListener('error', () => img.remove());
		frame.appendChild(img);
		const caption = document.createElement('span');
		caption.textContent = pack.name;
		item.appendChild(frame);
		item.appendChild(caption);
		if (withYear && pack.year) {
			const sub = document.createElement('span');
			sub.className = 'sixteenSub';
			sub.textContent = String(pack.year);
			item.appendChild(sub);
		}
		item.addEventListener('click', () => visit(() => showFiles(pack)));
		return item;
	};

	const pieceCard = (file, onOpen) => {
		const item = document.createElement('button');
		item.className = 'sixteenPiece';
		if (file.tn) {
			const img = document.createElement('img');
			img.loading = 'lazy';
			img.src = GALLERY + file.tn;
			img.alt = file.name;
			item.appendChild(img);
		}
		const caption = document.createElement('span');
		caption.textContent = file.name;
		item.appendChild(caption);
		item.addEventListener('click', onOpen);
		return item;
	};

	// greedy shortest-column packing from the API's thumbnail sizes:
	// no measuring, no reflow, reading order stays roughly rowwise
	const layoutPieces = (container, files, openWith) => {
		const count = Math.max(
			Math.floor((list.clientWidth || 600) / COL_WIDTH),
			2,
		);
		const columns = [];
		for (let i = 0; i < count; i++) {
			const el = document.createElement('div');
			el.className = 'sixteenCol';
			columns.push({ el, height: 0 });
			container.appendChild(el);
		}
		for (const file of files) {
			const ratio = file.w && file.h ? file.h / file.w : 1;
			const shortest = columns.reduce((a, b) => (b.height < a.height ? b : a));
			shortest.el.appendChild(pieceCard(file, () => openWith(file)));
			shortest.height += ratio * COL_WIDTH + CAPTION_PX;
		}
	};

	// ------------------------------------------------------------ views

	const showYears = async () => {
		where = { view: 'years' };
		crumb.textContent = 'years';
		clearList('years');
		say('loading years...');
		try {
			cache.years ??= await fetchJson(`${API}/year`);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		say(null);
		for (const year of Object.keys(cache.years).reverse()) {
			list.appendChild(
				button(`${year} (${cache.years[year].packs})`, () =>
					visit(() => showPacks(Number(year), 1))),
			);
		}
	};

	const showPacks = async (year, page) => {
		where = { view: 'packs', year };
		crumb.textContent = String(year);
		clearList('packs');
		say(`loading ${year}...`);
		let data;
		try {
			data = await fetchPage(
				`y:${year}:${page}`,
				`${API}/year/${year}?page=${page}`,
			);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		say(null);
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showPacks(year, p))));
		}
		for (const pack of data.results ?? []) {
			list.appendChild(packCard(pack));
		}
	};

	const showPackSearch = async (query, page) => {
		where = { view: 'packsearch', name: query };
		crumb.textContent = query ? `search / ${query}` : 'all packs';
		clearList('packsearch');
		say('searching packs...');
		let data;
		try {
			data = await fetchPage(
				`p:${query}:${page}`,
				`${API}/pack?page=${page}${query ? `&filter=${encodeURIComponent(query)}` : ''}`,
			);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		const results = data.results ?? [];
		say(results.length ? null : 'no packs match');
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showPackSearch(query, p))));
		}
		for (const pack of results) {
			list.appendChild(packCard(pack, true));
		}
	};

	const showArtists = async (filter, page) => {
		where = { view: 'artists', name: filter };
		crumb.textContent = filter ? `artists / ${filter}` : 'artists';
		clearList('artists');
		say('loading artists...');
		let data;
		try {
			data = await fetchPage(
				`a:${filter}:${page}`,
				`${API}/artist?page=${page}${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`,
			);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		const results = data.results ?? [];
		say(results.length ? null : 'no artists match');
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showArtists(filter, p))));
		}
		for (const row of results) {
			const name = row.artist?.name;
			if (!name) {
				continue;
			}
			list.appendChild(
				button(`${name} (${row.artist.releases ?? 0})`, () =>
					visit(() => showArtistWorks(name))),
			);
		}
	};

	const showArtistWorks = async name => {
		where = { view: 'artistworks', name };
		crumb.textContent = `artist / ${name}`;
		clearList('artistworks');
		say(`loading ${name}...`);
		let data;
		try {
			data = await fetchPage(
				`aw:${name}`,
				`${API}/artist/${encodeURIComponent(name)}`,
			);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		say(null);
		const years = Object.keys(data.results ?? {}).sort((a, b) => b - a);
		for (const year of years) {
			for (const [packName, entry] of Object.entries(data.results[year])) {
				const section = document.createElement('section');
				section.className = 'sixteenWorks';
				const head = button(
					entry.group ? `${year} / ${packName} (${entry.group})` : `${year} / ${packName}`,
					() => visit(() => showFiles({ name: packName, year: Number(year) })),
					'sixteenWorksHead',
				);
				section.appendChild(head);
				const body = document.createElement('div');
				body.className = 'sixteenWorksBody';
				const pieces = (entry.files ?? [])
					.filter(f => isOpenable(f.file))
					.map(f => ({ name: f.file, tn: f.tn ?? null, w: 0, h: 0 }));
				layoutPieces(body, pieces, file => openVia(packName, file));
				section.appendChild(body);
				list.appendChild(section);
			}
		}
	};

	const showCrews = async (filter, page) => {
		where = { view: 'crews', name: filter };
		crumb.textContent = filter ? `crews / ${filter}` : 'crews';
		clearList('crews');
		say('loading crews...');
		let data;
		try {
			data = await fetchPage(
				`g:${filter}:${page}`,
				`${API}/group?page=${page}${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`,
			);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		const results = data.results ?? [];
		say(results.length ? null : 'no crews match');
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showCrews(filter, p))));
		}
		for (const row of results) {
			// each crew rides as a single-key object: {tag: {releases, ...}}
			const [tag, info] = Object.entries(row)[0] ?? [];
			if (!tag) {
				continue;
			}
			list.appendChild(
				button(`${tag} (${info?.releases ?? 0})`, () =>
					visit(() => showCrewPacks(tag))),
			);
		}
	};

	const showCrewPacks = async tag => {
		where = { view: 'crewpacks', name: tag };
		crumb.textContent = `crew / ${tag}`;
		clearList('crewpacks');
		say(`loading ${tag}...`);
		let data;
		try {
			data = await fetchPage(
				`gp:${tag}`,
				`${API}/group/${encodeURIComponent(tag)}`,
			);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		const byYear = data.results?.packs ?? {};
		const years = Object.keys(byYear).sort((a, b) => b - a);
		say(years.length ? null : 'no packs on record for this crew');
		for (const year of years) {
			for (const packName of byYear[year]) {
				list.appendChild(packCard({ name: packName, year: Number(year) }, true));
			}
		}
	};

	const showFiles = async pack => {
		where = { view: 'files', pack };
		crumb.textContent = pack.name;
		clearList('files');
		say(`loading ${pack.name}...`);
		let info;
		try {
			info = await loadPack(pack.name);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		const year = pack.year ?? info.year;
		crumb.textContent = `${year} / ${pack.name}`;
		say(info.files.length ? null : 'nothing in this pack opens in the editor');
		layoutPieces(list, info.files, file =>
			openPiece(
				{ name: pack.name, year, archive: pack.archive ?? info.archive },
				file,
			));
	};

	// ------------------------------------------------------------ open

	/** open from views that only know the pack's name */
	const openVia = async (packName, file) => {
		say(`loading ${packName}...`);
		let info;
		try {
			info = await loadPack(packName);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		openPiece({ name: packName, year: info.year, archive: info.archive }, file);
	};

	const openPiece = async (pack, file) => {
		if (!pack.archive) {
			say('16colo.rs lists no zip for this pack, so it cannot be opened here', true);
			return;
		}
		// the mirror strips spaces from archive names on sync
		const zipName = pack.archive.replace(/\s+/g, '');
		say(`fetching ${zipName}...`);
		try {
			if (!cache.zips.has(zipName)) {
				const response = await fetch(
					`${MIRROR}/${pack.year}/${encodeURIComponent(zipName)}`,
				);
				if (!response.ok) {
					throw new Error(
						`the archive mirror has no ${zipName} (HTTP ${response.status}); the pack may be newer than the last mirror sync`,
					);
				}
				cache.zips.set(
					zipName,
					new Uint8Array(await response.arrayBuffer()),
				);
				// a browsing session must not hoard every pack it touched
				while (cache.zips.size > 3) {
					cache.zips.delete(cache.zips.keys().next().value);
				}
			}
			const zip = cache.zips.get(zipName);
			const entry = findZipEntry(readZipEntries(zip), file.name);
			if (!entry) {
				throw new Error(`${file.name} is not in ${zipName}`);
			}
			const bytes = await extractZipEntry(zip, entry);
			say(null);
			State.modal.close();
			openFile(new File([bytes], file.name));
		} catch (error) {
			say(`could not open: ${error.message}`, true);
		}
	};

	// ------------------------------------------------------------ wire

	// column count depends on the modal's width: refit an open masonry
	// view when the window changes shape
	let refit = 0;
	window.addEventListener('resize', () => {
		clearTimeout(refit);
		refit = setTimeout(() => {
			if (where.view === 'files' || where.view === 'artistworks') {
				here();
			}
		}, 150);
	});

	btnBack?.addEventListener('click', back);
	$('sixteenClose')?.addEventListener('click', () => State.modal.close());
	for (const key of Object.keys(TABS)) {
		$(`sixteenTab${key[0].toUpperCase()}${key.slice(1)}`)?.addEventListener(
			'click',
			() => setTab(key),
		);
	}
	let typing = 0;
	searchBox?.addEventListener('input', () => {
		clearTimeout(typing);
		typing = setTimeout(applySearch, 250);
	});
	searchBox?.addEventListener('keydown', event => {
		if (event.key === 'Enter') {
			clearTimeout(typing);
			applySearch();
		}
	});

	const show = () => {
		State.modal.open('sixteen');
		setTab('year');
	};

	return {
		show,
		showYears,
		showPacks,
		showFiles,
		showArtists,
		showArtistWorks,
		showCrews,
		showCrewPacks,
		showPackSearch,
		setTab,
	};
};

export { createSixteenColors };
