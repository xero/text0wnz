/**
 * asciiarena.se in-app browser. Everything rides the site's public
 * JSON api and its /collections raw files, both CORS-open, so no proxy
 * or mirror is involved. Search runs client-side over the one-shot
 * uhcsearch index instead of paging the api per keystroke. Decoding
 * mirrors the site's own rule: scene art full of high bytes is
 * glyph-indexed latin-1 even when it happens to validate as UTF-8.
 * Politeness: every request is user-driven and cached; NOTHING here
 * runs in CI.
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
	createOpenGuard,
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
const API = `${SITE}/api`;

const PAGESIZE = 24;
/** instant search renders at most this many diz cards per query */
const RESULT_CAP = 120;

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
		index: null, // uhcsearch rows promise, fetched once per session
		dizzes: new Map(), // filename -> preview text (null caches a miss)
		// ensureViewable adds viewableFor/viewable: index rows identity
		// and the artist/crew tallies derived from them
	};

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

	const say = makeSay(status);

	const fetchPage = (key, url) => fetchCached(cache.pages, key, url);

	const clearList = view => {
		// pending previews of a view being torn down must not fetch
		dizWatch?.disconnect();
		list.textContent = '';
		list.dataset.view = view;
		// every view reads from the top; the pane otherwise keeps the
		// scroll depth of whatever list stood here before
		list.scrollTop = 0;
	};

	// the server keys each colly's folder on the name before the FIRST
	// dot, not the last (filenames on the site never carry more than
	// one, but the rule matters for matching its layout exactly)
	const dirOf = filename => filename.split('.')[0];

	const rawUrl = (colly, name = colly.filename) =>
		`${SITE}/collections/${encodeURIComponent(colly.dir)}/${encodeURIComponent(name)}`;

	const fetchBytes = async (url, signal) => {
		const response = await fetch(url, { signal });
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

	const fromIndex = row => ({
		filename: row.filename,
		dir: row.dir,
		title: row.title,
		artists: row.artists,
		crews: row.crews,
		cdate: null,
	});

	const parseIndex = text =>
		text
			.split('\n')
			.slice(1)
			.map(line => line.split('\t'))
			.filter(cols => cols.length >= 5 && cols[0])
			.map(cols => ({
				filename: cols[0],
				dir: cols[1].replace(/^collections\//, ''),
				artists: cols[2],
				crews: cols[3],
				title: cols[4].trimEnd(),
			}));

	// the cache holds the in-flight promise, not the parsed rows, so
	// concurrent views share one download of the whole-archive dump; a
	// failure clears it so the next view retries
	const ensureIndex = () => {
		cache.index ??= (async () => {
			const response = await fetch(`${API}/uhcsearch`);
			if (!response.ok) {
				throw new Error(`${response.status} from ${API}/uhcsearch`);
			}
			return parseIndex(await response.text());
		})().catch(error => {
			cache.index = null;
			throw error;
		});
		return cache.index;
	};

	const listNames = csv =>
		csv
			.split(',')
			.map(s => s.trim().toLowerCase())
			.filter(Boolean);

	// a colly earns a listing only if the editor can do something
	// with it: open it directly or crack it as an archive; diskmag
	// releases ride .dms disk images, unreadable here. The filename
	// defaults defensively: one malformed api row must not take the
	// whole view down with it
	const viewable = row => {
		const name = row.filename ?? '';
		return isOpenableName(name) || isArchiveName(name);
	};

	// artists and crews qualify by what their destination view will
	// actually show: at least one viewable colly in the index; the
	// crew tally doubles as the honest count beside the name
	const ensureViewable = async () => {
		const rows = await ensureIndex();
		if (cache.viewableFor !== rows) {
			const artists = new Set();
			const crews = new Map();
			for (const row of rows) {
				if (!viewable(row)) {
					continue;
				}
				for (const nick of listNames(row.artists)) {
					artists.add(nick);
				}
				for (const name of listNames(row.crews)) {
					crews.set(name, (crews.get(name) ?? 0) + 1);
				}
			}
			cache.viewableFor = rows;
			cache.viewable = { artists, crews };
		}
		return cache.viewable;
	};

	const showLatest = async page => {
		const ticket = gate.enter();
		crumb.textContent = 'latest';
		clearList('latest');
		say('loading latest collys...');
		let rows;
		try {
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
		let rows, who;
		try {
			// the index degrades soft: a dead dump must not kill browsing
			[rows, who] = await Promise.all([
				fetchPage(
					`a:${filter}:${page}`,
					`${API}/artists?page=${page}&pagesize=${PAGESIZE}&sort=nick&asc=A${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`,
				),
				ensureViewable().catch(() => null),
			]);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const keep = who
			? rows.filter(row => who.artists.has(row.nick?.toLowerCase() ?? ''))
			: rows;
		say(
			keep.length
				? null
				: rows.length
					? 'nothing on this page opens in the editor'
					: 'no artists match',
		);
		const pages = Math.ceil((rows[0]?.total_count ?? 0) / PAGESIZE);
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showArtists(filter, p)), 'arenaPager'));
		}
		for (const row of keep) {
			// crews are names, not a count: they stack under the nick in
			// the sub style instead of riding the kbd tag
			const el = button(row.nick, () =>
				visit(() => showByArtist(row.nick)), 'arenaItem');
			if (row.crews) {
				const sub = document.createElement('span');
				sub.className = 'arenaSub';
				sub.textContent = row.crews;
				el.appendChild(sub);
			}
			list.appendChild(el);
		}
	};

	const showByArtist = async nick => {
		const ticket = gate.enter();
		crumb.textContent = `artist / ${nick}`;
		clearList('collys');
		say(`loading ${nick}...`);
		let rows;
		try {
			const needle = nick.toLowerCase();
			rows = (await ensureIndex()).filter(r =>
				viewable(r) && listNames(r.artists).includes(needle));
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		say(rows.length ? null : 'no collys on record for this artist');
		for (const row of rows) {
			list.appendChild(collyCard(fromIndex(row)));
		}
	};

	const showCrews = async (filter, page) => {
		const ticket = gate.enter();
		crumb.textContent = filter ? `crews / ${filter}` : 'crews';
		clearList('crews');
		say('loading crews...');
		let rows, who;
		try {
			// the index degrades soft: a dead dump must not kill browsing
			[rows, who] = await Promise.all([
				fetchPage(
					`g:${filter}:${page}`,
					`${API}/crews?page=${page}&pagesize=${PAGESIZE}&sort=name&asc=A${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`,
				),
				ensureViewable().catch(() => null),
			]);
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		// the count beside a crew is what its page will really show
		const count = row =>
			(who
				? (who.crews.get(row.name?.toLowerCase() ?? '') ?? 0)
				: (row.releases_cnt ?? 0));
		const keep = rows.filter(row => count(row) > 0);
		say(
			keep.length
				? null
				: rows.length
					? 'nothing on this page opens in the editor'
					: 'no crews match',
		);
		const pages = Math.ceil((rows[0]?.total_count ?? 0) / PAGESIZE);
		if (pages > 1) {
			list.appendChild(pager(page, pages, p => swap(() => showCrews(filter, p)), 'arenaPager'));
		}
		for (const row of keep) {
			list.appendChild(
				countButton(row.name, count(row), () =>
					visit(() => showByCrew(row.name)), 'arenaItem'),
			);
		}
	};

	const showByCrew = async name => {
		const ticket = gate.enter();
		crumb.textContent = `crew / ${name}`;
		clearList('collys');
		say(`loading ${name}...`);
		let rows;
		try {
			const needle = name.toLowerCase();
			rows = (await ensureIndex()).filter(r =>
				viewable(r) && listNames(r.crews).includes(needle));
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		say(rows.length ? null : 'no collys on record for this crew');
		for (const row of rows) {
			list.appendChild(collyCard(fromIndex(row)));
		}
	};

	const showSearch = async query => {
		const ticket = gate.enter();
		crumb.textContent = query ? `search / ${query}` : 'search';
		clearList('collys');
		say('loading the colly index...');
		let index;
		try {
			index = await ensureIndex();
		} catch (error) {
			if (gate.current(ticket)) {
				say(`asciiarena.se did not answer (${error.message})`, true);
			}
			return;
		}
		if (!gate.current(ticket)) {
			return;
		}
		const pool = index.filter(viewable);
		if (!query) {
			say(`type to search ${pool.length} collys`);
			return;
		}
		const needle = query.toLowerCase();
		const rows = pool.filter(r =>
			[r.filename, r.title, r.artists, r.crews].some(f =>
				f.toLowerCase().includes(needle)));
		if (!rows.length) {
			say('no collys match');
			return;
		}
		say(
			rows.length > RESULT_CAP
				? `${rows.length} collys match, showing the first ${RESULT_CAP}`
				: null,
		);
		for (const row of rows.slice(0, RESULT_CAP)) {
			list.appendChild(collyCard(fromIndex(row)));
		}
	};

	// clicking a piece is an explicit open, raced through the guard:
	// the LAST click wins, a repeat click on the loading piece is a
	// no-op, and stale fetches neither open nor repaint anything
	const openGuard = createOpenGuard();

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
					// picker entries race like any other open: last wins
					const op = openGuard(`open:${colly.filename}/${entry.name}`);
					if (!op) {
						return;
					}
					try {
						const bytes = await extract(entry);
						if (!op.current()) {
							return;
						}
						openBytes(bytes, baseName(entry.name));
					} catch (error) {
						if (op.current()) {
							say(`could not open: ${error.message}`, true);
						}
					} finally {
						op.done();
					}
				}, 'arenaItem'),
			);
		}
	};

	const openBytes = (bytes, name) => {
		say(null);
		State.modal.close();
		openFile(new File([bytes], name), amigaImportHints(bytes));
	};

	const openArchive = async colly => {
		const op = openGuard(`open:${colly.filename}`);
		if (!op) {
			return;
		}
		const ticket = gate.enter();
		say(`fetching ${colly.filename}...`);
		try {
			const bytes = await fetchBytes(rawUrl(colly), op.signal);
			if (!op.current()) {
				return;
			}
			const isZip = (/\.zip$/i).test(colly.filename);
			const entries = (isZip ? readZipEntries : readLhaEntries)(bytes)
				.filter(e => isOpenableName(e.name));
			const extract = entry => {
				return isZip ? extractZipEntry(bytes, entry) : extractLhaEntry(bytes, entry);
			};
			if (entries.length === 1) {
				const only = await extract(entries[0]);
				// the extract awaits too: a newer click during the inflate
				// must not let this one steal a fresher open ticket
				if (!op.current()) {
					return;
				}
				openBytes(only, baseName(entries[0].name));
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
			if (op.current() && gate.current(ticket)) {
				say(`could not open: ${error.message}`, true);
			}
		} finally {
			op.done();
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
		const op = openGuard(`open:${colly.filename}`);
		if (!op) {
			return;
		}
		const ticket = gate.enter();
		say(`fetching ${colly.filename}...`);
		try {
			const bytes = await fetchBytes(rawUrl(colly), op.signal);
			if (!op.current()) {
				return;
			}
			openBytes(bytes, colly.filename);
		} catch (error) {
			if (op.current() && gate.current(ticket)) {
				say(`could not open: ${error.message}`, true);
			}
		} finally {
			op.done();
		}
	};

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
