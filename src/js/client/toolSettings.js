/**
 * The unified tool settings window: one floating panel whose sections
 * swap with the selected tool. A tool with settings calls
 * show(section) from its enable, unconditionally, so selecting a tool
 * always reopens an X-closed window; a tool without settings calls
 * hide(). Also the single owner of the persisted settings values, so
 * lazily created controllers can never clobber each other's keys.
 */
import { $, makePanelFloat } from './ui.js';

const POS_KEY = 'toolSettingsPos';
const SETTINGS_KEY = 'toolSettings';

// keep at least a drag strip's worth of panel reachable when a saved
// position comes back on a smaller viewport (iPad rotation)
const CLAMP_MARGIN = 80;

const createToolSettings = () => {
	const panel = $('toolSettings');
	const title = $('toolSettingsTitle');
	const sections = {
		line: { el: $('tsLine'), title: 'Line' },
		square: { el: $('tsSquare'), title: 'Square' },
		circle: { el: $('tsCircle'), title: 'Circle' },
		ascii: { el: $('tsAscii'), title: 'Ascii Brush' },
		attrib: { el: $('tsAttrib'), title: 'Color Brush' },
	};

	const savePos = (x, y) => {
		try {
			localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
		} catch {
			// private windows etc.: the position just does not persist
		}
	};

	const floater = makePanelFloat(panel, () => panel.classList.add('hide'), { onMoved: savePos });

	const restorePos = () => {
		let pos = null;
		try {
			pos = JSON.parse(localStorage.getItem(POS_KEY));
		} catch {
			return;
		}
		if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
			return;
		}
		const x = Math.min(Math.max(pos.x, 0), window.innerWidth - CLAMP_MARGIN);
		const y = Math.min(Math.max(pos.y, 0), window.innerHeight - CLAMP_MARGIN);
		panel.style.left = x + 'px';
		panel.style.top = y + 'px';
	};

	const readAll = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY));
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch {
			return {};
		}
	};

	const get = (key, fallback) => {
		const value = readAll()[key];
		return value === undefined ? fallback : value;
	};

	// read-modify-write every time: controllers are created lazily, so
	// a snapshot taken at creation would erase keys written in between
	const set = (key, value) => {
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
		panel.classList.remove('hide');
		floater.focus();
	};

	const hide = () => {
		panel.classList.add('hide');
	};

	const mount = (section, element) => {
		sections[section]?.el.appendChild(element);
	};

	restorePos();

	return {
		show: show,
		hide: hide,
		mount: mount,
		get: get,
		set: set,
	};
};

export { createToolSettings };
export default { createToolSettings };
