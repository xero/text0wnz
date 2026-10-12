/**
 * 16colo.rs in-app browser (PLAN §4 P6, browse+open): years -> packs ->
 * pieces with thumbnails, opening straight into the editor. Metadata
 * and thumbnails come from api.16colo.rs and the gallery (the API is
 * CORS-open; thumbs ride plain <img> tags). FILE BYTES come from the
 * owner's GitHub archive mirror (xero/sixteencolors-archive): the
 * gallery host serves no CORS headers for raw files, while
 * raw.githubusercontent.com does — the pack zip fetches once, caches,
 * and single pieces inflate client-side through the core zip reader.
 * Politeness: every request is user-driven and cached; NOTHING here
 * runs in CI (PLAN §3.6.2 #4 / §4 P0 corpus policy).
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

/** piece extensions the editor can open */
const OPENABLE = /\.(ans|asc|diz|nfo|txt|bin|xb|tnd|dur)$/i;

const createSixteenColors = ({ openFile }) => {
	const crumb = $('sixteenCrumb');
	const list = $('sixteenList');
	const status = $('sixteenStatus');
	const btnBack = $('sixteenBack');
	if (!list) {
		return null;
	}

	const cache = {
		years: null,
		packs: new Map(), // `${year}:${page}` -> results
		files: new Map(), // pack name -> file list
		zips: new Map(), // archive name -> Uint8Array
	};
	/** @type {{view: string, year?: number, page?: number, pack?: object}} */
	let where = { view: 'years' };

	const say = text => {
		status.textContent = text ?? '';
		status.classList.toggle('hide', !text);
	};

	const fetchJson = async url => {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`${response.status} from ${url}`);
		}
		return response.json();
	};

	const clearList = () => {
		list.textContent = '';
	};

	const button = (label, onClick, className = 'sixteenItem') => {
		const el = document.createElement('button');
		el.textContent = label;
		el.className = className;
		el.addEventListener('click', onClick);
		return el;
	};

	// ------------------------------------------------------------ views

	const showYears = async () => {
		where = { view: 'years' };
		crumb.textContent = 'years';
		btnBack.disabled = true;
		clearList();
		say('loading years...');
		try {
			cache.years ??= await fetchJson(`${API}/year`);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`);
			return;
		}
		say(null);
		for (const year of Object.keys(cache.years).reverse()) {
			list.appendChild(
				button(`${year} (${cache.years[year].packs})`, () =>
					showPacks(Number(year), 1)),
			);
		}
	};

	const showPacks = async (year, page) => {
		where = { view: 'packs', year, page };
		crumb.textContent = String(year);
		btnBack.disabled = false;
		clearList();
		say(`loading ${year}...`);
		const key = `${year}:${page}`;
		let data;
		try {
			data = cache.packs.get(key) ?? (await fetchJson(`${API}/year/${year}?page=${page}`));
			cache.packs.set(key, data);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`);
			return;
		}
		say(null);
		const pages = data.page?.pages ?? 1;
		if (pages > 1) {
			const pager = document.createElement('div');
			pager.className = 'sixteenPager';
			if (page > 1) {
				pager.appendChild(button('< prev', () => showPacks(year, page - 1), ''));
			}
			pager.appendChild(
				Object.assign(document.createElement('span'), { textContent: ` ${page}/${pages} ` }),
			);
			if (page < pages) {
				pager.appendChild(button('next >', () => showPacks(year, page + 1), ''));
			}
			list.appendChild(pager);
		}
		for (const pack of data.results ?? []) {
			list.appendChild(button(pack.name, () => showFiles(pack)));
		}
	};

	const showFiles = async pack => {
		where = { view: 'files', pack, year: pack.year };
		crumb.textContent = `${pack.year} / ${pack.name}`;
		btnBack.disabled = false;
		clearList();
		say(`loading ${pack.name}...`);
		let files;
		try {
			if (!cache.files.has(pack.name)) {
				const data = await fetchJson(`${API}/pack/${encodeURIComponent(pack.name)}`);
				const raw = data.results?.[0]?.files ?? {};
				cache.files.set(
					pack.name,
					Object.entries(raw).map(([name, info]) => ({
						name,
						tn: info?.file?.tn?.uri ?? null,
						artists: info?.artists ?? [],
					})),
				);
			}
			files = cache.files.get(pack.name);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`);
			return;
		}
		say(null);
		for (const file of files) {
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
			if (OPENABLE.test(file.name)) {
				item.addEventListener('click', () => openPiece(pack, file));
			} else {
				item.disabled = true;
				item.title = 'not a format the editor opens';
			}
			list.appendChild(item);
		}
	};

	// ------------------------------------------------------------ open

	const openPiece = async (pack, file) => {
		say(`fetching ${pack.archive}...`);
		try {
			if (!cache.zips.has(pack.archive)) {
				const response = await fetch(
					`${MIRROR}/${pack.year}/${pack.archive}`,
				);
				if (!response.ok) {
					throw new Error(
						`the archive mirror has no ${pack.archive} (HTTP ${response.status}); the pack may be newer than the last mirror sync`,
					);
				}
				cache.zips.set(
					pack.archive,
					new Uint8Array(await response.arrayBuffer()),
				);
			}
			const zip = cache.zips.get(pack.archive);
			const entry = findZipEntry(readZipEntries(zip), file.name);
			if (!entry) {
				throw new Error(`${file.name} is not in ${pack.archive}`);
			}
			const bytes = await extractZipEntry(zip, entry);
			say(null);
			State.modal.close();
			openFile(new File([bytes], file.name));
		} catch (error) {
			say(`could not open: ${error.message}`);
		}
	};

	const back = () => {
		if (where.view === 'files') {
			showPacks(where.year, cache.packs.has(`${where.year}:1`) ? 1 : 1);
		} else {
			showYears();
		}
	};

	btnBack?.addEventListener('click', back);
	$('sixteenClose')?.addEventListener('click', () => State.modal.close());

	const show = () => {
		State.modal.open('sixteen');
		showYears();
	};

	return { show, showYears, showPacks, showFiles };
};

export { createSixteenColors };
