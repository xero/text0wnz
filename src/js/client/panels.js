/**
 * The module registry: one data object says where every movable panel
 * lives and one layout() applies it. Drag, shade, close, focus, dock,
 * and reset all mutate the data and call layout(); the DOM is never
 * the source of truth. Persists under one versioned key with a
 * tolerant merge, so new modules never reset a saved layout.
 */
import { $ } from './ui.js';

const LAYOUT_KEY = 'panelLayout';
const LAYOUT_VERSION = 2;
const LEGACY_TOOL_POS_KEY = 'toolSettingsPos';

// z bands: floating modules 40+, drag ghost 90, selection bar 150,
// flyouts and menus 200, toasts 210; dialogs ride the top layer
const FLOAT_BASE_Z = 40;

const DRAG_THRESHOLD_PX = 6;
// a drop reads as sidebar once the pointer is a quarter of the way in
const SIDEBAR_DROP_FRACTION = 0.25;
// a collapsed or empty sidebar reopens as a drop target on this strip
const COLLAPSED_DROP_PX = 250;
const PLACEHOLDER_MAX_PX = 300;
const PLACEHOLDER_GROW_MAX_PX = 180;
const FLOAT_MIN_W = 180;
const FLOAT_MAX_W = 640;
const FLOAT_MIN_H = 120;

// presses on controls never start a drag; the header overrides, but
// its own buttons keep their click behavior
const NO_DRAG =
	'button, input, select, textarea, canvas, summary, a, label, output, ' +
	'form, .depthBar, .segmented, #minimapScroll, #minimapMenu, ' +
	'#frameStrip, #messageWindow, #userList';

const DEFAULTS = {
	sauce: { t: 'Sauce', dk: 'side', sh: 0, x: 300, y: 60 },
	canvas: { t: 'Canvas', dk: 'side', sh: 0, x: 300, y: 90 },
	pos: { t: 'Cursor', dk: 'side', sh: 0, x: 300, y: 120 },
	zoom: { t: 'Zoom', dk: 'side', sh: 0, x: 300, y: 150 },
	ref: { t: 'Reference Image', dk: 'side', sh: 0, x: 300, y: 180 },
	map: { t: 'Minimap', dk: 'side', sh: 0, x: 300, y: 60, w: 236, h: 340 },
	frames: { t: 'Frames', dk: 0, sh: 0, x: 60, y: 560 },
	tool: { t: 'Tool Settings', dk: 0, sh: 0, x: 58, y: 54, hid: 0 },
	chat: { t: 'Chat', dk: 0, sh: 0, x: 380, y: 54 },
};
const MODULE_KEYS = Object.keys(DEFAULTS);
const PERSISTED_FIELDS = ['dk', 'sh', 'x', 'y', 'w', 'h', 'hid', 'ln'];

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

const writeLayout = patch => {
	try {
		localStorage.setItem(
			LAYOUT_KEY,
			JSON.stringify({ ...readLayout(), ...patch, v: LAYOUT_VERSION }),
		);
	} catch {
		// private windows etc.: the layout just does not persist
	}
};

/**
 * When the module that led a dock row leaves it, the next module of
 * that row inherits the lead so the rest of the row stays together.
 * Rows only render in the top and bottom docks, but the bookkeeping
 * is dock-agnostic. Pure over (ORD, MOD); mutates MOD flags only.
 */
const promoteRowLead = (ORD, MOD, key, fromDock) => {
	if (!fromDock || MOD[key]?.ln) {
		return;
	}
	const next = ORD.slice(ORD.indexOf(key) + 1).find(
		other => MOD[other]?.dk === fromDock,
	);
	if (next && MOD[next].ln) {
		MOD[next].ln = 0;
	}
};

const mergeOrder = saved => {
	if (!Array.isArray(saved)) {
		return [...MODULE_KEYS];
	}
	return [
		...saved.filter(key => MODULE_KEYS.includes(key)),
		...MODULE_KEYS.filter(key => !saved.includes(key)),
	];
};

const cloneDefaults = () => JSON.parse(JSON.stringify(DEFAULTS));

const createPanelManager = () => {
	const container = $('bodyContainer');
	const sidebar = $('sidebar');
	const grip = $('sidebarGrip');
	// real elements only: unit harnesses stub the DOM lookups, and a
	// manager built over stubs would throw from its async layout calls
	if (
		!container ||
		!sidebar ||
		typeof container.querySelector !== 'function' ||
		typeof sidebar.insertBefore !== 'function'
	) {
		return null;
	}

	const registry = new Map();
	const MOD = cloneDefaults();
	let ORD = [...MODULE_KEYS];
	let ZO = [...MODULE_KEYS];
	let collapsed = false;
	let focused = 'tool';

	const restore = () => {
		const saved = readLayout();
		if (saved.MOD && typeof saved.MOD === 'object') {
			for (const key of MODULE_KEYS) {
				const entry = saved.MOD[key];
				if (!entry || typeof entry !== 'object') {
					continue;
				}
				for (const field of PERSISTED_FIELDS) {
					if (typeof entry[field] === typeof MOD[key][field]) {
						MOD[key][field] = entry[field];
					} else if (
						(field === 'dk' && (entry[field] === 0 || entry[field] === 'side')) ||
						(field === 'ln' && typeof entry[field] === 'number')
					) {
						MOD[key][field] = entry[field];
					}
				}
			}
		}
		ORD = mergeOrder(saved.ORD);
		ZO = mergeOrder(saved.ZO);
		collapsed = saved.sidebarCollapsed === true;
		// the retired single-window position key folds in once
		try {
			const legacy = JSON.parse(localStorage.getItem(LEGACY_TOOL_POS_KEY));
			if (
				legacy &&
				typeof legacy.x === 'number' &&
				typeof legacy.y === 'number' &&
				!saved.MOD?.tool
			) {
				MOD.tool.x = legacy.x;
				MOD.tool.y = legacy.y;
			}
			localStorage.removeItem(LEGACY_TOOL_POS_KEY);
		} catch {
			// unreadable legacy key: defaults stand
		}
	};

	const save = () => {
		const persisted = {};
		for (const key of MODULE_KEYS) {
			persisted[key] = {};
			for (const field of PERSISTED_FIELDS) {
				if (MOD[key][field] !== undefined) {
					persisted[key][field] = MOD[key][field];
				}
			}
		}
		writeLayout({ MOD: persisted, ORD, ZO, sidebarCollapsed: collapsed });
	};

	const visibleOf = key => {
		const reg = registry.get(key);
		if (!reg) {
			return false;
		}
		if (reg.closable && MOD[key].hid) {
			return false;
		}
		return reg.visible();
	};

	const setMode = (el, mode) => {
		el.classList.toggle('dk', mode === 'dk');
		el.classList.toggle('fl', mode === 'fl');
	};

	const clampFloat = (key, el) => {
		const m = MOD[key];
		// fully reachable: the whole width stays on screen, and enough
		// height to grab the title bar again
		const width = el?.offsetWidth || 236;
		m.x = Math.min(Math.max(m.x, 0), Math.max(0, window.innerWidth - width));
		m.y = Math.min(Math.max(m.y, 0), Math.max(0, window.innerHeight - 30));
	};

	const applyFloatPosition = (key, el) => {
		const m = MOD[key];
		el.style.setProperty('--mx', `${m.x}px`);
		el.style.setProperty('--my', `${m.y}px`);
		if (m.w) {
			el.style.setProperty('--mw', `${m.w}px`);
		}
		if (m.h) {
			el.style.setProperty('--mh', `${m.h}px`);
		}
	};

	const applyStack = () => {
		for (const key of MODULE_KEYS) {
			const reg = registry.get(key);
			if (!reg || !reg.el.classList.contains('fl')) {
				continue;
			}
			reg.el.style.zIndex = String(FLOAT_BASE_Z + ZO.indexOf(key));
			reg.el.classList.toggle('focus', key === focused);
		}
	};

	const syncGrip = () => {
		if (!grip) {
			return;
		}
		const label = collapsed ? 'Show Sidebar' : 'Hide Sidebar';
		grip.setAttribute('aria-expanded', String(!collapsed));
		grip.setAttribute('aria-label', label);
		grip.title = label;
	};

	const layout = () => {
		let sidebarIndex = 0;
		let anyDocked = false;
		for (const key of ORD) {
			const reg = registry.get(key);
			if (!reg) {
				continue;
			}
			const m = MOD[key];
			const el = reg.el;
			const vis = visibleOf(key);
			el.hidden = !vis;
			el.classList.toggle('shaded', !!m.sh);
			reg.shade?.setAttribute('aria-expanded', String(!m.sh));
			const docked = m.dk === 'side' && !reg.floatOnly;
			setMode(el, docked ? 'dk' : 'fl');
			if (docked) {
				const peers = [...sidebar.children].filter(c =>
					c.classList.contains('mod'));
				const at = peers[sidebarIndex];
				if (at !== el) {
					sidebar.insertBefore(el, at || null);
				}
				sidebarIndex++;
				el.style.zIndex = '';
				el.classList.remove('focus');
				if (vis) {
					anyDocked = true;
				}
			} else {
				if (el.parentNode !== container) {
					container.append(el);
				}
				clampFloat(key, el);
				applyFloatPosition(key, el);
			}
		}
		applyStack();
		container.classList.toggle('noSidebar', !anyDocked);
		container.classList.toggle('sidebarCollapsed', collapsed && anyDocked);
		syncGrip();
		save();
	};

	const focus = key => {
		const reg = registry.get(key);
		if (!reg || !reg.el.classList.contains('fl')) {
			return;
		}
		focused = key;
		ZO = [...ZO.filter(other => other !== key), key];
		applyStack();
		save();
	};

	const flash = key => {
		requestAnimationFrame(() => {
			const reg = registry.get(key);
			if (!reg || reg.el.hidden) {
				return;
			}
			const el = reg.el;
			if (el.classList.contains('fl')) {
				focus(key);
			}
			el.classList.remove('flash');
			void el.offsetWidth;
			el.classList.add('flash');
			if (el.classList.contains('dk')) {
				// docked off-screen in a scrolled sidebar: bring it into view
				const rect = el.getBoundingClientRect();
				const host = sidebar.getBoundingClientRect();
				if (rect.top < host.top) {
					sidebar.scrollTop += rect.top - host.top;
				} else if (rect.bottom > host.bottom) {
					sidebar.scrollTop += Math.min(
						rect.bottom - host.bottom,
						rect.top - host.top,
					);
				}
			}
		});
	};

	const toggleShade = key => {
		MOD[key].sh = MOD[key].sh ? 0 : 1;
		layout();
	};

	const reopen = key => {
		const reg = registry.get(key);
		if (!reg) {
			return;
		}
		if (reg.closable) {
			MOD[key].hid = 0;
		}
		layout();
		flash(key);
	};

	const close = key => {
		const reg = registry.get(key);
		if (!reg?.closable) {
			return;
		}
		MOD[key].hid = 1;
		layout();
	};

	const reset = () => {
		const fresh = cloneDefaults();
		for (const key of MODULE_KEYS) {
			Object.assign(MOD[key], fresh[key]);
		}
		ORD = [...MODULE_KEYS];
		ZO = [...MODULE_KEYS];
		collapsed = false;
		layout();
	};

	const register = (key, cfg = {}) => {
		const el = cfg.el ?? container.querySelector(`.mod[data-m="${key}"]`);
		if (
			!el ||
			typeof el.querySelector !== 'function' ||
			!MODULE_KEYS.includes(key)
		) {
			return;
		}
		const reg = {
			el,
			header: el.querySelector('.modHeader'),
			shade: el.querySelector('.modShade'),
			closeBtn: el.querySelector('.modClose'),
			visible: cfg.visible ?? (() => true),
			grow: Boolean(cfg.grow),
			floatOnly: Boolean(cfg.floatOnly),
			closable: Boolean(cfg.closable),
		};
		el.classList.toggle('grow', reg.grow);
		registry.set(key, reg);
		reg.shade?.addEventListener('click', e => {
			e.stopPropagation();
			toggleShade(key);
		});
		reg.closeBtn?.addEventListener('click', e => {
			e.stopPropagation();
			close(key);
		});
		reg.header?.addEventListener('click', e => {
			// anywhere on a docked divider strip shades, but the strip's
			// own buttons (minimap autoscroll) keep their behavior
			if (e.target.closest('button')) {
				return;
			}
			if (el.classList.contains('dk')) {
				toggleShade(key);
			}
		});
		reg.header?.addEventListener('dblclick', e => {
			if (el.classList.contains('fl') && !e.target.closest('button')) {
				toggleShade(key);
			}
		});
	};

	const setVisible = (key, fn) => {
		const reg = registry.get(key);
		if (reg && typeof fn === 'function') {
			reg.visible = fn;
		}
	};

	// ---- focus: any press in a floating module lifts it ----
	container.addEventListener(
		'pointerdown',
		e => {
			const el = e.target.closest?.('.mod.fl');
			if (el && !el.classList.contains('focus')) {
				focus(el.dataset.m);
			}
		},
		true,
	);

	container.addEventListener('animationend', e => {
		e.target.classList?.remove('flash');
	});

	// ---- sidebar grip ----
	grip?.addEventListener('click', () => {
		collapsed = !collapsed;
		layout();
	});

	// ---- drag: sidebar <-> floating, reorder inside the sidebar ----
	let drag = null;
	let placeholder = null;

	const dropPlaceholder = () => {
		if (!placeholder) {
			return;
		}
		const old = placeholder;
		placeholder = null;
		old.classList.add('out');
		old.style.height = '0px';
		setTimeout(() => old.remove(), 220);
	};

	const nextModule = node => {
		while (node && !(node.classList?.contains('mod') && !node.hidden)) {
			node = node.nextElementSibling;
		}
		return node;
	};

	const placeholderTo = (before, height) => {
		if (
			placeholder &&
			placeholder.parentNode === sidebar &&
			nextModule(placeholder.nextElementSibling) === before
		) {
			return;
		}
		dropPlaceholder();
		const slot = document.createElement('div');
		slot.className = 'dph';
		sidebar.insertBefore(slot, before);
		placeholder = slot;
		// two frames: the first paints height 0 so the second animates
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (placeholder === slot) {
					slot.style.height = `${height}px`;
				}
			});
		});
	};

	const sideRect = () => {
		if (
			collapsed ||
			container.classList.contains('noSidebar') ||
			container.classList.contains('sidebarPeek')
		) {
			return { left: window.innerWidth - COLLAPSED_DROP_PX, width: COLLAPSED_DROP_PX };
		}
		const rect = sidebar.getBoundingClientRect();
		return { left: rect.left, width: rect.width || COLLAPSED_DROP_PX };
	};

	const zoneFor = e => {
		if (registry.get(drag.key)?.floatOnly) {
			return null;
		}
		const rect = sideRect();
		return e.clientX > rect.left + rect.width * SIDEBAR_DROP_FRACTION
			? 'side'
			: null;
	};

	const startDrag = () => {
		drag.started = true;
		try {
			container.setPointerCapture(drag.pointerId);
		} catch {
			// the pointer lifted between down and threshold; the up handler
			// still ends the drag through events that bubble here
		}
		const el = drag.el;
		if (el.classList.contains('dk')) {
			drag.fromSide = true;
			const slot = document.createElement('div');
			slot.className = 'dph';
			slot.style.transition = 'none';
			slot.style.height = `${Math.min(
				drag.srcHeight,
				registry.get(drag.key).grow ? PLACEHOLDER_GROW_MAX_PX : PLACEHOLDER_MAX_PX,
			)}px`;
			el.before(slot);
			placeholder = slot;
			void slot.offsetHeight;
			slot.style.transition = '';
		}
		setMode(el, 'fl');
		if (el.parentNode !== container) {
			container.append(el);
		}
		applyFloatPosition(drag.key, el);
		el.classList.add('drag');
		drag.ghostH = el.offsetHeight;
		// grab offsets clamp so the lifted window sits under the pointer
		// even when it shrinks leaving the dock
		drag.grabDX = Math.min(Math.max(drag.grabDX, 10), el.offsetWidth - 30);
		drag.grabDY = Math.min(Math.max(drag.grabDY, 2), Math.max(2, drag.ghostH - 10));
	};

	container.addEventListener('pointerdown', e => {
		if (e.button > 0 || drag) {
			return;
		}
		const gripEl = e.target.closest?.('.modResize');
		if (gripEl) {
			const el = gripEl.closest('.mod');
			const m = MOD[el.dataset.m];
			drag = {
				resize: true,
				key: el.dataset.m,
				el,
				x0: e.clientX,
				y0: e.clientY,
				w0: m.w || el.offsetWidth,
				h0: m.h || el.offsetHeight,
				pointerId: e.pointerId,
			};
			try {
				container.setPointerCapture(e.pointerId);
			} catch {
				// no capture: moves that bubble here still resize
			}
			e.preventDefault();
			return;
		}
		const el = e.target.closest?.('.mod');
		if (!el || el.hidden || !el.matches('.dk, .fl')) {
			return;
		}
		if (e.target.closest('.modShade, .modClose')) {
			return;
		}
		const inHeader = e.target.closest('.modHeader');
		if (inHeader && e.target.closest('button')) {
			return;
		}
		if (!inHeader && e.target.closest(NO_DRAG)) {
			return;
		}
		const rect = el.getBoundingClientRect();
		drag = {
			key: el.dataset.m,
			el,
			x0: e.clientX,
			y0: e.clientY,
			grabDX: e.clientX - rect.left,
			grabDY: e.clientY - rect.top,
			srcHeight: el.offsetHeight,
			started: false,
			fromSide: false,
			pointerId: e.pointerId,
		};
		if (!inHeader) {
			e.preventDefault();
		}
	});

	container.addEventListener('pointermove', e => {
		if (!drag) {
			return;
		}
		if (drag.resize) {
			const m = MOD[drag.key];
			m.w = Math.min(
				Math.max(drag.w0 + e.clientX - drag.x0, FLOAT_MIN_W),
				FLOAT_MAX_W,
			);
			m.h = Math.min(
				Math.max(drag.h0 + e.clientY - drag.y0, FLOAT_MIN_H),
				Math.max(FLOAT_MIN_H, window.innerHeight - m.y - 8),
			);
			applyFloatPosition(drag.key, drag.el);
			return;
		}
		if (!drag.started) {
			if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < DRAG_THRESHOLD_PX) {
				return;
			}
			startDrag();
		}
		const el = drag.el;
		el.style.setProperty('--mx', `${e.clientX - drag.grabDX}px`);
		el.style.setProperty('--my', `${e.clientY - drag.grabDY}px`);
		const zone = zoneFor(e);
		drag.zone = zone;
		sidebar.classList.toggle('dropping', zone === 'side');
		container.classList.toggle('sidebarPeek', zone === 'side');
		el.classList.toggle('over', zone === 'side');
		if (zone === 'side') {
			// target by the ghost's centre, not the pointer: panels get
			// grabbed by their top edge, so the pointer rides high
			const ghostTop = e.clientY - drag.grabDY;
			const ghostCenter = ghostTop + Math.min(drag.ghostH || 60, 160) / 2;
			let before = null;
			for (const child of sidebar.children) {
				if (!child.classList.contains('mod') || child.hidden || child === el) {
					continue;
				}
				const rect = child.getBoundingClientRect();
				if (ghostCenter < rect.top + rect.height / 2) {
					before = child;
					break;
				}
			}
			placeholderTo(
				before,
				Math.min(
					drag.srcHeight,
					registry.get(drag.key).grow ? PLACEHOLDER_GROW_MAX_PX : PLACEHOLDER_MAX_PX,
				),
			);
		} else {
			dropPlaceholder();
		}
	});

	const endDrag = () => {
		if (!drag) {
			return;
		}
		if (drag.resize) {
			drag = null;
			save();
			return;
		}
		if (!drag.started) {
			drag = null;
			return;
		}
		const { key, el } = drag;
		const m = MOD[key];
		el.classList.remove('drag', 'over');
		sidebar.classList.remove('dropping');
		container.classList.remove('sidebarPeek');
		promoteRowLead(ORD, MOD, key, m.dk !== 'side' && m.dk !== 0 ? m.dk : null);
		m.ln = 0;
		if (drag.zone === 'side' && placeholder) {
			collapsed = false;
			ORD = ORD.filter(other => other !== key);
			const next = nextModule(placeholder.nextElementSibling);
			const at = next ? ORD.indexOf(next.dataset.m) : -1;
			if (at < 0) {
				ORD.push(key);
			} else {
				ORD.splice(at, 0, key);
			}
			m.dk = 'side';
			const old = placeholder;
			placeholder = null;
			old.remove();
		} else {
			dropPlaceholder();
			m.dk = 0;
			m.x = parseFloat(el.style.getPropertyValue('--mx')) || m.x;
			m.y = parseFloat(el.style.getPropertyValue('--my')) || m.y;
			focused = key;
			ZO = [...ZO.filter(other => other !== key), key];
		}
		drag = null;
		layout();
	};
	container.addEventListener('pointerup', endDrag);
	container.addEventListener('pointercancel', endDrag);

	// floats clamp back into reach when the window shrinks
	let resizeTimer = 0;
	window.addEventListener('resize', () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(layout, 100);
	});

	restore();

	return {
		register,
		setVisible,
		layout,
		focus,
		flash,
		reopen,
		close,
		reset,
		toggleShade,
		isDocked: key => MOD[key]?.dk === 'side',
		isCollapsed: () => collapsed,
	};
};

export { createPanelManager, promoteRowLead };
export default { createPanelManager, promoteRowLead };
