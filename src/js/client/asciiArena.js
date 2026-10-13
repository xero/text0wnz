/**
 * asciiarena.se in-app browser: tabs for latest releases, artists,
 * crews, and search, opening amiga ascii collys straight into the
 * editor. Lists ride the official /api/v1 (CORS-open, 120 req/min,
 * {data, meta} envelopes, mags already split out of /collys) with
 * ONE exception: the latest rail stays on the legacy /api because
 * v1 has no upload-date sort (sort=date floats the undated year-0
 * block first even descending; reported upstream). FILE BYTES come
 * from the site's /collections raw files, never /collys/{id}/text,
 * whose server-side decode would cost the byte-exact latin-1 the
 * Topaz render needs. Decoding mirrors the site's own rule: scene
 * art full of high bytes is glyph-indexed latin-1 even when it
 * happens to validate as UTF-8. Politeness: every request is
 * user-driven and cached; NOTHING here runs in CI.
 */
import State from './state.js';
import { $ } from './ui.js';
import {
	makeSay,
	fetchCached,
	button,
	countButton,
	pager,
	createTrail,
	createRenderGate,
	countHighBytes,
	validUtf8,
	amigaImportHints,
	baseName,
	isOpenableName,
	isArchiveName,
} from './browserKit.js';
import {
	extractLhaEntry,
	extractZipEntry,
	readLhaEntries,
	readZipEntries,
} from '../core/index';

const SITE = 'https://asciiarena.se';
/** legacy internals: only the latest rail still needs them */
const API = `${SITE}/api`;
const V1 = `${SITE}/api/v1`;

const PAGESIZE = 24;

const createAsciiArena = ({ openFile, onExit }) => {
	const crumb = $('arenaCrumb');
	const list = $('arenaList');
	const status = $('arenaStatus');
	const btnBack = $('arenaBack');
	const searchBox = $('arenaSearch');
	if (!list) {
		return null;
	}

	const cache = {
		pages: new Map(), // list endpoints: cache key -> response json
		dizzes: new Map(), // filename -> preview text (null caches a miss)
	};

	// ------------------------------------------------- tabs and history

	// backing out of the root view returns to the artpacks landing
	const { visit, swap, back, reset } = createTrail(
		btnBack,
		onExit ?? (() => State.modal.open('artpacks')),
	);
	const gate = createRenderGate();

	const TABS = {
		latest: { root: () => showLatest(1), hint: null },
		artist: { root: () => showArtists('', 1), hint: 'filter artists' },
		crew: { root: () => showCrews('', 1), hint: 'filter crews' },
		search: { root: () => showSearch(''), hint: 'search all collys' },
	};
	let tab = 'latest';
	const setTab = name => {
		tab = name;
		// a pending debounced search must not fire into the new tab
		clearTimeout(typing);
		for (const key of Object.keys(TABS)) {
			$(`arenaTab${key[0].toUpperCase()}${key.slice(1)}`)?.classList.toggle(
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
			reset(() => showSearch(q));
		}
	};

	// ----------------------------------------------------------- utils

	const say = makeSay(status);

	const fetchPage = (key, url) => fetchCached(cache.pages, key, url);

	/** v1 lists ride {data, meta} envelopes; legacy rows ride bare */
	const fetchV1 = async (key, path) => {
		const json = await fetchPage(key, `${V1}${path}`);
		return { rows: json.data ?? [], pages: json.meta?.total_pages ?? 1 };
	};

	const clearList = view => {
		// pending previews of a view being torn down must not fetch
		dizWatch?.disconnect();
		list.textContent = '';
		list.dataset.view = view;
	};

	// the server keys each colly's folder on the name before the FIRST
	// dot, not the last (filenames on the site never carry more than
	// one, but the rule matters for matching its layout exactly)
	const dirOf = filename => filename.split('.')[0];

	const rawUrl = (colly, name = colly.filename) =>
		`${SITE}/collections/${encodeURIComponent(colly.dir)}/${encodeURIComponent(name)}`;

	const fetchBytes = async url => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`${response.status} from ${url}`);
		}
		return new Uint8Array(await response.arrayBuffer());
	};

	// latin-1 maps bytes to the first 256 codepoints one to one
	const latin1 = bytes => {
		let out = '';
		for (let i = 0; i < bytes.length; i += 0x8000) {
			out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		}
		return out;
	};

	const sceneText = bytes =>
		(countHighBytes(bytes) < 16 && validUtf8(bytes)
			? new TextDecoder().decode(bytes)
			: latin1(bytes));

	const previewText = bytes => {
		// previews only need the top of the file; a cut multibyte char
		// just tips the decode to latin-1, which previews fine
		const text = sceneText(bytes.subarray(0, 4096));
		// eslint-disable-next-line no-control-regex
		return text.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').trimEnd();
	};

	// ------------------------------------------------------------ cards

	// previews fetch lazily as cards scroll into view: a crew page can
	// hold a hundred collys and most are never looked at
	const dizMeta = new WeakMap();
	let dizWatch = null;
	const watchDiz = (frame, colly) => {
		if (typeof IntersectionObserver === 'undefined') {
			return;
		}
		dizMeta.set(frame, colly);
		dizWatch ??= new IntersectionObserver(
			hits => {
				for (const hit of hits) {
					if (hit.isIntersecting) {
						dizWatch.unobserve(hit.target);
						fillDiz(hit.target);
					}
				}
			},
			{ root: list, rootMargin: '25%' },
		);
		dizWatch.observe(frame);
	};

	const fillDiz = async frame => {
		const colly = dizMeta.get(frame);
		if (!colly) {
			return;
		}
		let text = cache.dizzes.get(colly.filename);
		if (text === undefined) {
			try {
				const response = await fetch(rawUrl(colly, `${colly.filename}.diz`));
				// a 404 means no diz and caches; a thrown fetch is
				// transient and must stay retryable
				text = response.ok
					? previewText(new Uint8Array(await response.arrayBuffer()))
					: null;
				cache.dizzes.set(colly.filename, text);
			} catch {
				text = null;
			}
		}
		if (text && frame.isConnected) {
			const pre = document.createElement('pre');
			pre.textContent = text;
			frame.appendChild(pre);
		}
	};

	const collyCard = colly => {
		const item = document.createElement('button');
		item.className = 'arenaColly';
		const frame = document.createElement('div');
		frame.className = 'dizFrame';
		item.appendChild(frame);
		watchDiz(frame, colly);
		const caption = document.createElement('span');
		caption.textContent = colly.title || colly.filename;
		item.appendChild(caption);
		const year = colly.cdate?.slice(0, 4);
		const subText = [colly.artists, year !== '0000' ? year : null]
			.filter(Boolean)
			.join(' / ');
		if (subText) {
			const sub = document.createElement('span');
			sub.className = 'arenaSub';
			sub.textContent = subText;
			item.appendChild(sub);
		}
		item.addEventListener('click', () => openColly(colly));
		return item;
	};

	const fromApi = row => ({
		filename: row.filename,
		dir: dirOf(row.filename),
		title: row.name,
		artists: row.artists,
		crews: row.crews,
		cdate: row.cdate,
	});

	const fromV1 = row => ({
		filename: row.filename,
		dir: dirOf(row.filename),
		title: row.name,
		artists: (row.artists ?? []).join(', '),
		crews: (row.crews ?? []).join(', '),
		// the card only reads the year; 0000 renders as no year at all
		cdate: String(row.year ?? 0).padStart(4, '0'),
	});

	// v1 already splits diskmags out of /collys server-side; this net
	// still catches oddball formats and the legacy latest rows
	const viewable = row =>
		isOpenableName(row.filename) || isArchiveName(row.filename);

	// ------------------------------------------------------------ views

	const showLatest = async page => {
		const ticket = gate.enter();
		crumb.textContent = 'latest';
		clearList('latest');
		say('loading latest collys...');
		let rows;
		try {
			// legacy endpoint on purpose: v1 cannot sort by upload or
			// release date yet, and this rail is nothing without it
			rows = await fetchPage(
				`l:${page}`,
				`${API}/collys?page=${page}&pagesize=${PAGESIZE}&sort=cdate&asc=D`,
			);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const keep = rows.filter(viewable);
		say(
			keep.length
				? null
				: rows.length
					? 'nothing on this page opens in the editor'
					: 'no collys on record',
		);
		const pages = Math.ceil((rows[0]?.total_count ?? 0) / PAGESIZE);
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showLatest(p)), 'arenaPager'));
		}
		for (const row of keep) {
			list.appendChild(collyCard(fromApi(row)));
		}
	};

	const showArtists = async (filter, page) => {
		const ticket = gate.enter();
		crumb.textContent = filter ? `artists / ${filter}` : 'artists';
		clearList('artists');
		say('loading artists...');
		let got;
		try {
			got = await fetchV1(
				`a:${filter}:${page}`,
				`/artists?page=${page}&per_page=${PAGESIZE}&sort=nick&order=asc${filter ? `&q=${encodeURIComponent(filter)}` : ''}`,
			);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		// logo-only profiles carry no collys: nowhere worth a click
		const keep = got.rows.filter(row => (row.colly_count ?? 0) > 0);
		say(
			keep.length
				? null
				: got.rows.length
					? 'nothing on this page opens in the editor'
					: 'no artists match',
		);
		if (got.pages > 1) {
			list.appendChild(pager(page, got.pages, p => swap(() => showArtists(filter, p)), 'arenaPager'));
		}
		for (const row of keep) {
			// crews are names, not a count: they stack under the nick in
			// the sub style instead of riding the kbd tag
			const el = button(row.nick, () =>
				visit(() => showByArtist(row.nick)), 'arenaItem');
			const crews = (row.crews ?? []).join(', ');
			if (crews) {
				const sub = document.createElement('span');
				sub.className = 'arenaSub';
				sub.textContent = crews;
				el.appendChild(sub);
			}
			list.appendChild(el);
		}
	};

	const showByArtist = async (nick, page = 1) => {
		const ticket = gate.enter();
		crumb.textContent = `artist / ${nick}`;
		clearList('collys');
		say(`loading ${nick}...`);
		let got;
		try {
			got = await fetchV1(
				`va:${nick}:${page}`,
				`/collys?artist=${encodeURIComponent(nick)}&page=${page}&per_page=${PAGESIZE}`,
			);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const keep = got.rows.filter(viewable);
		say(
			keep.length
				? null
				: got.rows.length
					? 'nothing on this page opens in the editor'
					: 'no collys on record for this artist',
		);
		if (got.pages > 1) {
			list.appendChild(pager(page, got.pages, p => swap(() => showByArtist(nick, p)), 'arenaPager'));
		}
		for (const row of keep) {
			list.appendChild(collyCard(fromV1(row)));
		}
	};

	const showCrews = async (filter, page) => {
		const ticket = gate.enter();
		crumb.textContent = filter ? `crews / ${filter}` : 'crews';
		clearList('crews');
		say('loading crews...');
		let got;
		try {
			got = await fetchV1(
				`g:${filter}:${page}`,
				`/crews?page=${page}&per_page=${PAGESIZE}&sort=name&order=asc${filter ? `&q=${encodeURIComponent(filter)}` : ''}`,
			);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		// release_count already excludes mags; zero means the crew is
		// only known through tagged logos and its page would be bare
		const keep = got.rows.filter(row => (row.release_count ?? 0) > 0);
		say(
			keep.length
				? null
				: got.rows.length
					? 'nothing on this page opens in the editor'
					: 'no crews match',
		);
		if (got.pages > 1) {
			list.appendChild(pager(page, got.pages, p => swap(() => showCrews(filter, p)), 'arenaPager'));
		}
		for (const row of keep) {
			list.appendChild(
				countButton(row.name, row.release_count, () =>
					visit(() => showByCrew(row.name)), 'arenaItem'),
			);
		}
	};

	const showByCrew = async (name, page = 1) => {
		const ticket = gate.enter();
		crumb.textContent = `crew / ${name}`;
		clearList('collys');
		say(`loading ${name}...`);
		let got;
		try {
			got = await fetchV1(
				`vc:${name}:${page}`,
				`/collys?crew=${encodeURIComponent(name)}&page=${page}&per_page=${PAGESIZE}`,
			);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const keep = got.rows.filter(viewable);
		say(
			keep.length
				? null
				: got.rows.length
					? 'nothing on this page opens in the editor'
					: 'no collys on record for this crew',
		);
		if (got.pages > 1) {
			list.appendChild(pager(page, got.pages, p => swap(() => showByCrew(name, p)), 'arenaPager'));
		}
		for (const row of keep) {
			list.appendChild(collyCard(fromV1(row)));
		}
	};

	const showSearch = async (query, page = 1) => {
		const ticket = gate.enter();
		crumb.textContent = query ? `search / ${query}` : 'search';
		clearList('collys');
		if (!query) {
			// the stats call only dresses the empty state: a miss there
			// must not block typing a query
			try {
				const json = await fetchPage('stats', `${V1}/stats`);
				const total = (json.data ?? json).collys;
				if (gate.current(ticket)) {
					say(total ? `type to search ${total} collys` : 'type to search the collys');
				}
			} catch {
				if (gate.current(ticket)) {
					say('type to search the collys');
				}
			}
			return;
		}
		say('searching...');
		let got;
		try {
			got = await fetchV1(
				`q:${query}:${page}`,
				`/collys?q=${encodeURIComponent(query)}&page=${page}&per_page=${PAGESIZE}`,
			);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const keep = got.rows.filter(viewable);
		say(
			keep.length
				? null
				: got.rows.length
					? 'nothing on this page opens in the editor'
					: 'no collys match',
		);
		if (got.pages > 1) {
			list.appendChild(pager(page, got.pages, p => swap(() => showSearch(query, p)), 'arenaPager'));
		}
		for (const row of keep) {
			list.appendChild(collyCard(fromV1(row)));
		}
	};

	const showArchive = (colly, entries, extract) => {
		// a sync render still bumps the gate, or a fetch already in
		// flight would paint over this list when it lands
		gate.enter();
		crumb.textContent = colly.filename;
		clearList('archive');
		say(null);
		for (const entry of entries) {
			list.appendChild(
				button(baseName(entry.name), async () => {
					try {
						openBytes(await extract(entry), baseName(entry.name));
					} catch (error) {
						say(`could not open: ${error.message}`, true);
					}
				}, 'arenaItem'),
			);
		}
	};

	// ------------------------------------------------------------ open

	const openBytes = (bytes, name) => {
		say(null);
		State.modal.close();
		openFile(new File([bytes], name), amigaImportHints(bytes));
	};

	// clicking a piece is an explicit open: the editor load itself is
	// never gated, but listings and status lines from a fetch the user
	// has navigated away from must not repaint the current view
	const openArchive = async colly => {
		const ticket = gate.enter();
		say(`fetching ${colly.filename}...`);
		try {
			const bytes = await fetchBytes(rawUrl(colly));
			const isZip = (/\.zip$/i).test(colly.filename);
			const entries = (isZip ? readZipEntries : readLhaEntries)(bytes)
				.filter(e => isOpenableName(e.name));
			const extract = entry => {
				return isZip ? extractZipEntry(bytes, entry) : extractLhaEntry(bytes, entry);
			};
			if (entries.length === 1) {
				openBytes(await extract(entries[0]), baseName(entries[0].name));
				return;
			}
			if (!gate.current(ticket)) {
				return;
			}
			if (!entries.length) {
				say('nothing in this archive opens in the editor', true);
				return;
			}
			// the bytes ride the view thunk, freed when the trail drops it
			visit(() => showArchive(colly, entries, extract));
		} catch (error) {
			if (gate.current(ticket)) {
				say(`could not open: ${error.message}`, true);
			}
		}
	};

	const openColly = async colly => {
		if (isArchiveName(colly.filename)) {
			openArchive(colly);
			return;
		}
		if (!isOpenableName(colly.filename)) {
			say(`the editor cannot open ${colly.filename}`, true);
			return;
		}
		const ticket = gate.enter();
		say(`fetching ${colly.filename}...`);
		try {
			openBytes(await fetchBytes(rawUrl(colly)), colly.filename);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`could not open: ${error.message}`, true);
			}
		}
	};

	// ------------------------------------------------------------ wire

	btnBack?.addEventListener('click', back);
	$('arenaClose')?.addEventListener('click', () => State.modal.close());
	for (const key of Object.keys(TABS)) {
		$(`arenaTab${key[0].toUpperCase()}${key.slice(1)}`)?.addEventListener(
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
		State.modal.open('arena');
		if (!started) {
			started = true;
			setTab('latest');
		}
	};

	return {
		show,
		setTab,
		showLatest,
		showArtists,
		showByArtist,
		showCrews,
		showByCrew,
		showSearch,
	};
};

export { createAsciiArena };
