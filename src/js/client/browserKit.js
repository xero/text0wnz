/**
 * Shared plumbing for the in-app archive browsers (16colo.rs,
 * asciiarena.se): status line, cached JSON fetches, list widgets, and
 * the back trail. Everything takes its elements and class names as
 * arguments so each browser keeps its own DOM and styling.
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

/** a list button whose count or detail rides a dim kbd tag */
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

// back walks a trail of view thunks: every drill-down pushes the
// view it left, so depth can differ per tab without special cases
const createTrail = backButton => {
	let trail = [];
	let here = () => {};
	const render = () => {
		if (backButton) {
			backButton.disabled = trail.length === 0;
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

export { makeSay, fetchJson, fetchCached, button, countButton, pager, createTrail };
