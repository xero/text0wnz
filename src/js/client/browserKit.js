/**
 * Shared plumbing for the archive browsers (16colo.rs, asciiarena.se).
 * Everything takes its elements and class names as arguments so each
 * browser keeps its own DOM and styling.
 */

/** status line updater bound to one element */
const makeSay = status => (text, isError = false) => {
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

/** memoized fetchJson; the caller owns the map so it owns eviction */
const fetchCached = async (map, key, url) => {
	const data = map.get(key) ?? (await fetchJson(url));
	map.set(key, data);
	return data;
};

const button = (label, onClick, className = '') => {
	const el = document.createElement('button');
	el.textContent = label;
	el.className = className;
	el.addEventListener('click', onClick);
	return el;
};

const countButton = (label, count, onClick, className = '') => {
	const el = button(label, onClick, className);
	const kbd = document.createElement('kbd');
	kbd.textContent = String(count);
	el.appendChild(kbd);
	return el;
};

// both ends always render so the row never shifts; bounds disable
const pager = (page, pages, goPage, className) => {
	const el = document.createElement('div');
	el.className = className;
	const prev = button('< prev', () => goPage(page - 1));
	prev.disabled = page <= 1;
	el.appendChild(prev);
	el.appendChild(
		Object.assign(document.createElement('span'), { textContent: `${page} / ${pages}` }),
	);
	const next = button('next >', () => goPage(page + 1));
	next.disabled = page >= pages;
	el.appendChild(next);
	return el;
};

/** every format Load.file decodes, plus the bare file_id */
const OPENABLE = /\.(ans|ansi|asc|diz|nfo|txt|utf8ans|bin|xb|xbin|tnd|dur|0wnz)$/i;
const ARCHIVE = /\.(zip|lha|lzh)$/i;

const baseName = name => name.split('/').pop();

const isOpenableName = name =>
	OPENABLE.test(name) || (/^file_id$/i).test(baseName(name));

const isArchiveName = name => ARCHIVE.test(name);

/** the font asciiarena itself renders with (TopazPlus a1200) */
const AMIGA_FONT = 'Topaz+ 1200 8x16';

const countHighBytes = bytes => {
	let n = 0;
	for (const b of bytes) {
		if (b > 127) {
			n++;
		}
	}
	return n;
};

const validUtf8 = bytes => {
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		return true;
	} catch {
		return false;
	}
};

// mirrors asciiarena's own decodeReleaseText: a file with 16 or more
// high bytes is scene art whatever UTF-8 validation says, because
// genuine multibyte text always halves the high char count
const amigaImportHints = bytes => ({
	font: AMIGA_FONT,
	preferBytes: countHighBytes(bytes) >= 16 || !validUtf8(bytes),
});

// every view render takes a ticket and checks it after its fetch: a
// stale response must not stomp the view the user has moved on to
const createRenderGate = () => {
	let run = 0;
	return {
		enter: () => ++run,
		current: ticket => ticket === run,
	};
};

// one explicit open in flight per browser, with no UI locking: a
// repeat click on the target already loading is ignored, a click on
// a DIFFERENT target supersedes the old open, aborting any fetch tied
// to the guard's signal. Shared downloads (the 16c zip cache) run
// unsignalled on purpose; currency checks cancel those opens instead.
// Last click wins even when a big archive racing a small file inverts
// completion order
const createOpenGuard = () => {
	let currentKey = null;
	let controller = null;
	return key => {
		if (controller && currentKey === key) {
			return null;
		}
		controller?.abort();
		const mine = new AbortController();
		controller = mine;
		currentKey = key;
		return {
			signal: mine.signal,
			current: () => controller === mine,
			done: () => {
				if (controller === mine) {
					controller = null;
					currentKey = null;
				}
			},
		};
	};
};

// back walks a trail of view thunks: every drill-down pushes the
// view it left, so depth can differ per tab without special cases;
// an exit thunk keeps back live at the root, stepping out of the
// browser entirely instead of going dead
const createTrail = (backButton, exit) => {
	let trail = [];
	let here = () => {};
	const render = () => {
		if (backButton) {
			backButton.disabled = trail.length === 0 && !exit;
		}
		here();
	};
	return {
		visit: thunk => {
			trail.push(here);
			here = thunk;
			render();
		},
		swap: thunk => {
			here = thunk;
			render();
		},
		back: () => {
			if (trail.length) {
				here = trail.pop();
				render();
			} else {
				exit?.();
			}
		},
		reset: thunk => {
			trail = [];
			here = thunk;
			render();
		},
		rerun: () => here(),
	};
};

export {
	makeSay,
	fetchJson,
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
};
