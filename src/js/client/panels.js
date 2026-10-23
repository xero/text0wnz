/**
 * Panel layout shell. Owns the one persisted layout key, versioned so
 * the module registry can grow it without resetting saved layouts, and
 * the sidebar grip that collapses the right column.
 */
import { $ } from './ui.js';

const LAYOUT_KEY = 'panelLayout';
const LAYOUT_VERSION = 1;

const readLayout = () => {
	try {
		const parsed = JSON.parse(localStorage.getItem(LAYOUT_KEY));
		// an array survives the typeof check but drops named keys on
		// stringify, bricking every future write
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
			? parsed
			: {};
	} catch {
		return {};
	}
};

// read-modify-write so keys another writer stored between our writes
// survive; a blocked store means the layout just does not persist
const writeLayout = patch => {
	try {
		localStorage.setItem(
			LAYOUT_KEY,
			JSON.stringify({ ...readLayout(), ...patch, v: LAYOUT_VERSION }),
		);
	} catch {
		// private windows etc.
	}
};

const createSidebarGrip = () => {
	const grip = $('sidebarGrip');
	const container = $('bodyContainer');
	if (!grip || !container) {
		return null;
	}

	const apply = collapsed => {
		container.classList.toggle('sidebarCollapsed', collapsed);
		grip.setAttribute('aria-expanded', String(!collapsed));
		const label = collapsed ? 'Show Sidebar' : 'Hide Sidebar';
		grip.setAttribute('aria-label', label);
		grip.title = label;
	};

	apply(readLayout().sidebarCollapsed === true);

	grip.addEventListener('click', () => {
		const collapsed = !container.classList.contains('sidebarCollapsed');
		apply(collapsed);
		writeLayout({ sidebarCollapsed: collapsed });
	});

	return { isCollapsed: () => container.classList.contains('sidebarCollapsed') };
};

export { createSidebarGrip, readLayout, writeLayout };
export default { createSidebarGrip, readLayout, writeLayout };
