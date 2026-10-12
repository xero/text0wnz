/**
 * 16colo.rs in-app browser: years -> packs ->
 * pieces with thumbnails, opening straight into the editor. Metadata
 * and thumbnails come from api.16colo.rs and the gallery (the API is
 * CORS-open; thumbs ride plain <img> tags). FILE BYTES come from the
 * owner's GitHub archive mirror (xero/sixteencolors-archive): the
 * gallery host serves no CORS headers for raw files, while
 * raw.githubusercontent.com does; the pack zip fetches once, caches,
 * and single pieces inflate client-side through the core zip reader.
 * Politeness: every request is user-driven and cached; NOTHING here
 * runs in CI.
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

	// ------------------------------------------------------------ views

	const showYears = async () => {
		where = { view: 'years' };
		crumb.textContent = 'years';
		btnBack.disabled = true;
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
					showPacks(Number(year), 1)),
			);
		}
	};

	// every pack preview rides the gallery's normalized diz name; a pack
	// without one 404s and the black frame alone holds the cell
	const packCard = pack => {
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
		item.addEventListener('click', () => showFiles(pack));
		return item;
	};

	const showPacks = async (year, page) => {
		where = { view: 'packs', year, page };
		crumb.textContent = String(year);
		btnBack.disabled = false;
		clearList('packs');
		say(`loading ${year}...`);
		const key = `${year}:${page}`;
		let data;
		try {
			data = cache.packs.get(key) ?? (await fetchJson(`${API}/year/${year}?page=${page}`));
			cache.packs.set(key, data);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
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
			list.appendChild(packCard(pack));
		}
	};

	const pieceCard = (pack, file) => {
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
		item.addEventListener('click', () => openPiece(pack, file));
		return item;
	};

	// greedy shortest-column packing from the API's thumbnail sizes:
	// no measuring, no reflow, reading order stays roughly rowwise
	const layoutPieces = (pack, files) => {
		const count = Math.max(
			Math.floor((list.clientWidth || 600) / COL_WIDTH),
			2,
		);
		const columns = [];
		for (let i = 0; i < count; i++) {
			const el = document.createElement('div');
			el.className = 'sixteenCol';
			columns.push({ el, height: 0 });
			list.appendChild(el);
		}
		for (const file of files) {
			const ratio = file.w && file.h ? file.h / file.w : 1;
			const shortest = columns.reduce((a, b) => (b.height < a.height ? b : a));
			shortest.el.appendChild(pieceCard(pack, file));
			shortest.height += ratio * COL_WIDTH + CAPTION_PX;
		}
	};

	const showFiles = async pack => {
		where = { view: 'files', pack, year: pack.year, page: where.page ?? 1 };
		crumb.textContent = `${pack.year} / ${pack.name}`;
		btnBack.disabled = false;
		clearList('files');
		say(`loading ${pack.name}...`);
		let files;
		try {
			if (!cache.files.has(pack.name)) {
				const data = await fetchJson(`${API}/pack/${encodeURIComponent(pack.name)}`);
				const raw = data.results?.[0]?.files ?? {};
				cache.files.set(
					pack.name,
					Object.entries(raw)
						.filter(([name]) => isOpenable(name))
						.map(([name, info]) => ({
							name,
							tn: info?.file?.tn?.uri ?? null,
							w: info?.file?.tn?.width ?? 0,
							h: info?.file?.tn?.height ?? 0,
							artists: info?.artists ?? [],
						})),
				);
			}
			files = cache.files.get(pack.name);
		} catch (error) {
			say(`16colo.rs did not answer (${error.message})`, true);
			return;
		}
		say(files.length ? null : 'nothing in this pack opens in the editor');
		layoutPieces(pack, files);
	};

	// ------------------------------------------------------------ open

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

	const back = () => {
		if (where.view === 'files') {
			showPacks(where.year, where.page ?? 1);
		} else {
			showYears();
		}
	};

	// column count depends on the modal's width: refit an open files
	// view when the window changes shape
	let refit = 0;
	window.addEventListener('resize', () => {
		clearTimeout(refit);
		refit = setTimeout(() => {
			if (where.view === 'files' && where.pack) {
				showFiles(where.pack);
			}
		}, 150);
	});

	btnBack?.addEventListener('click', back);
	$('sixteenClose')?.addEventListener('click', () => State.modal.close());

	const show = () => {
		State.modal.open('sixteen');
		showYears();
	};

	return { show, showYears, showPacks, showFiles };
};

export { createSixteenColors };
