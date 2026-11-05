/**
 * One panel whose sections swap with the selected tool. A tool with
 * settings calls show(section) from its enable, unconditionally, so
 * selecting a tool always reopens an X-closed panel; a tool without
 * settings calls hide(). Placement belongs to the panel manager; this
 * stays the single owner of the persisted settings values, so lazily
 * created controllers can never clobber each other's keys.
 */
import State from './state.js';
import { $ } from './ui.js';

const SETTINGS_KEY = 'toolSettings';

const createToolSettings = () => {
	const panel = $('toolSettings');
	const title = $('toolSettingsTitle');
	const sections = {
		keyboard: { el: $('tsKeyboard'), title: 'Keyboard' },
		line: { el: $('tsLine'), title: 'Line' },
		square: { el: $('tsSquare'), title: 'Square' },
		circle: { el: $('tsCircle'), title: 'Circle' },
		ascii: { el: $('tsAscii'), title: 'Ascii Brush' },
		attrib: { el: $('tsAttrib'), title: 'Color Brush' },
		shading: { el: $('tsShading'), title: 'Shading Brush' },
		character: { el: $('tsCharacter'), title: 'Character Brush' },
	};
	let current = null;

	// a bar has no title strip, so each section carries the tool name
	// itself; the keyboard bar alone goes nameless
	Object.entries(sections).forEach(([name, s]) => {
		if (name === 'keyboard' || !s.el) {
			return;
		}
		const barTitle = document.createElement('B');
		barTitle.className = 'barTitle';
		barTitle.innerText = s.title;
		s.el.prepend(barTitle);
	});

	const readAll = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
			// an array survives the typeof check but drops named keys on
			// stringify, bricking every future write
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
				? parsed
				: {};
		} catch {
			return {};
		}
	};

	// in-session truth lives in memory: a blocked store must not reset
	// a choice made this session when a controller re-reads on enable
	const cache = readAll();

	const get = (key, fallback) => {
		const value = cache[key];
		return value === undefined ? fallback : value;
	};

	// the persisted write still read-modify-writes so keys another tab
	// stored between our writes survive
	const set = (key, value) => {
		cache[key] = value;
		try {
			const all = readAll();
			all[key] = value;
			localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
		} catch {
			// settings just do not persist
		}
	};

	const show = section => {
		const target = sections[section];
		if (!target) {
			return;
		}
		Object.entries(sections).forEach(([name, s]) => {
			s.el.classList.toggle('hide', name !== section);
		});
		title.innerText = target.title;
		// the character map drives its own floating width and resize
		// grip, so the panel flags that section for the CSS
		panel?.classList.toggle('charMap', section === 'character');
		current = section;
		// the section rides along as the tool identity pins key on
		State.panels?.reopen('tool', section);
	};

	const hide = () => {
		current = null;
		State.panels?.layout();
	};

	const hasSection = () => current !== null;

	const mount = (section, element) => {
		sections[section]?.el.appendChild(element);
	};

	return {
		show: show,
		hide: hide,
		hasSection: hasSection,
		mount: mount,
		get: get,
		set: set,
	};
};

export { createToolSettings };
export default { createToolSettings };
