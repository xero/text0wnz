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
	makeSay,
	fetchJson,
	fetchCached,
	button,
	countButton,
	pager,
	createTrail,
	createRenderGate,
	createOpenGuard,
	isOpenableName,
} from './browserKit.js';
import {
	extractZipEntry,
	findZipEntry,
	readZipEntries,
} from '../core/index';

const API = 'https://api.16colo.rs/v1';
const GALLERY = 'https://16colo.rs';
const MIRROR =
	'https://raw.githubusercontent.com/xero/sixteencolors-archive/master';

const isOpenable = isOpenableName;

/** column the masonry packs around, thumbnail width plus padding */
const COL_WIDTH = 196;
/** caption + padding under each thumbnail, for column balancing */
const CAPTION_PX = 36;

const createSixteenColors = ({ openFile, onExit }) => {
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

	// backing out of the root view returns to the artpacks landing
	const { visit, swap, back, reset, rerun } = createTrail(
		btnBack,
		onExit ?? (() => State.modal.open('artpacks')),
	);
	const gate = createRenderGate();

	const TABS = {
		year: { root: () => showYears(), hint: null },
		crew: { root: () => showCrews('', 1), hint: 'filter crews' },
		artist: { root: () => showArtists('', 1), hint: 'filter artists' },
		search: { root: () => showPackSearch('', 1), hint: 'search packs' },
	};
	let tab = 'year';
	const setTab = name => {
		tab = name;
		// a pending debounced search must not fire into the new tab
		clearTimeout(typing);
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
		reset(TABS[name].root);
	};

	const applySearch = () => {
		const q = searchBox.value.trim();
		if (tab === 'artist') {
			reset(() => showArtists(q, 1));
		} else if (tab === 'crew') {
			reset(() => showCrews(q, 1));
		} else {
			reset(() => showPackSearch(q, 1));
		}
	};

	// ----------------------------------------------------------- utils

	const say = makeSay(status);

	const fetchPage = (key, url) => fetchCached(cache.pages, key, url);

	const clearList = view => {
		list.textContent = '';
		list.dataset.view = view;
		// every view reads from the top; the pane otherwise keeps the
		// scroll depth of whatever list stood here before
		list.scrollTop = 0;
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
		const ticket = gate.enter();
		where = { view: 'years' };
		crumb.textContent = 'years';
		clearList('years');
		say('loading years...');
		try {
			cache.years ??= await fetchJson(`${API}/year`);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		say(null);
		for (const year of Object.keys(cache.years).reverse()) {
			// an empty year leads nowhere worth a click
			if (!cache.years[year]?.packs) {
				continue;
			}
			list.appendChild(
				countButton(year, cache.years[year].packs, () =>
					visit(() => showPacks(Number(year), 1)), 'sixteenItem'),
			);
		}
	};

	const showPacks = async (year, page) => {
		const ticket = gate.enter();
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
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		say(null);
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showPacks(year, p)), 'sixteenPager'));
		}
		for (const pack of data.results ?? []) {
			list.appendChild(packCard(pack));
		}
	};

	const showPackSearch = async (query, page) => {
		const ticket = gate.enter();
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
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const results = data.results ?? [];
		say(results.length ? null : 'no packs match');
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showPackSearch(query, p)), 'sixteenPager'));
		}
		for (const pack of results) {
			list.appendChild(packCard(pack, true));
		}
	};

	const showArtists = async (filter, page) => {
		const ticket = gate.enter();
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
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const results = data.results ?? [];
		// zero-release profiles lead nowhere worth a click
		const rows = results.filter(
			row => row.artist?.name && (row.artist.releases ?? 0) > 0,
		);
		say(
			rows.length
				? null
				: results.length
					? 'nothing on this page opens in the editor'
					: 'no artists match',
		);
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showArtists(filter, p)), 'sixteenPager'));
		}
		for (const row of rows) {
			const name = row.artist.name;
			list.appendChild(
				countButton(name, row.artist.releases, () =>
					visit(() => showArtistWorks(name)), 'sixteenItem'),
			);
		}
	};

	const showArtistWorks = async name => {
		const ticket = gate.enter();
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
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const years = Object.keys(data.results ?? {}).sort((a, b) => b - a);
		let shown = 0;
		for (const year of years) {
			for (const [packName, entry] of Object.entries(data.results[year])) {
				const pieces = (entry.files ?? [])
					.filter(f => isOpenable(f.file))
					.map(f => ({ name: f.file, tn: f.tn ?? null, w: 0, h: 0 }));
				// a release of nothing but filtered formats (gif subs and
				// the like) must not leave a bare header behind
				if (!pieces.length) {
					continue;
				}
				shown++;
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
				layoutPieces(body, pieces, file => openVia(packName, file));
				section.appendChild(body);
				list.appendChild(section);
			}
		}
		say(shown ? null : 'none of this artist\'s releases open in the editor');
	};

	const showCrews = async (filter, page) => {
		const ticket = gate.enter();
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
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const results = data.results ?? [];
		// each crew rides as a single-key object: {tag: {releases, ...}};
		// zero-release crews lead nowhere worth a click
		const rows = results
			.map(row => Object.entries(row)[0] ?? [])
			.filter(([tag, info]) => tag && (info?.releases ?? 0) > 0);
		say(
			rows.length
				? null
				: results.length
					? 'nothing on this page opens in the editor'
					: 'no crews match',
		);
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showCrews(filter, p)), 'sixteenPager'));
		}
		for (const [tag, info] of rows) {
			list.appendChild(
				countButton(tag, info.releases, () =>
					visit(() => showCrewPacks(tag)), 'sixteenItem'),
			);
		}
	};

	const showCrewPacks = async tag => {
		const ticket = gate.enter();
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
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
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
		const ticket = gate.enter();
		where = { view: 'files', pack };
		crumb.textContent = pack.name;
		clearList('files');
		say(`loading ${pack.name}...`);
		let info;
		try {
			info = await loadPack(pack.name);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`16colo.rs did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
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

	// the LAST clicked piece wins: a repeat click on the loading piece
	// is a no-op, a different piece supersedes it. The zip download
	// itself is never aborted: cache.zips holds the PROMISE, so
	// sibling pieces and superseded clicks share one transfer and a
	// multi-MB pack never downloads twice
	const openGuard = createOpenGuard();

	const fetchZip = (year, zipName) => {
		if (!cache.zips.has(zipName)) {
			const download = (async () => {
				const response = await fetch(
					`${MIRROR}/${year}/${encodeURIComponent(zipName)}`,
				);
				if (!response.ok) {
					throw new Error(
						`the archive mirror has no ${zipName} (HTTP ${response.status}); the pack may be newer than the last mirror sync`,
					);
				}
				return new Uint8Array(await response.arrayBuffer());
			})().catch(error => {
				// a failed download must not cache: the next click retries
				cache.zips.delete(zipName);
				throw error;
			});
			cache.zips.set(zipName, download);
			// a browsing session must not hoard every pack it touched
			while (cache.zips.size > 3) {
				cache.zips.delete(cache.zips.keys().next().value);
			}
		}
		return cache.zips.get(zipName);
	};

	const openPiece = async (pack, file) => {
		if (!pack.archive) {
			say('16colo.rs lists no zip for this pack, so it cannot be opened here', true);
			return;
		}
		const op = openGuard(`open:${pack.name}/${file.name}`);
		if (!op) {
			return;
		}
		// the mirror strips spaces from archive names on sync
		const zipName = pack.archive.replace(/\s+/g, '');
		say(`fetching ${zipName}...`);
		try {
			const zip = await fetchZip(pack.year, zipName);
			if (!op.current()) {
				return;
			}
			const entry = findZipEntry(readZipEntries(zip), file.name);
			if (!entry) {
				throw new Error(`${file.name} is not in ${zipName}`);
			}
			const bytes = await extractZipEntry(zip, entry);
			if (!op.current()) {
				return;
			}
			say(null);
			State.modal.close();
			openFile(new File([bytes], file.name));
		} catch (error) {
			if (op.current()) {
				say(`could not open: ${error.message}`, true);
			}
		} finally {
			op.done();
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
				rerun();
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

	// the view DOM survives modal closes, so reopening mid-session
	// resumes wherever the artist left off; only the first show seeds
	let started = false;
	const show = () => {
		State.modal.open('sixteen');
		if (!started) {
			started = true;
			setTab('year');
		}
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
