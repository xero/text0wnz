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
// the top and bottom docks catch a drop this close to the canvas edge
const DOCK_EDGE_PX = 80;
// leaving a bar takes a real pull: a third of the floating height,
// never less than this, measured from where the panel was grabbed
const PULL_MIN_PX = 24;
// a column slot opens at up to this width, or an equal row share
const COLUMN_MAX_PX = 260;
// below this editor width every bar module renders on its own row;
// the ln flag survives for when the screen is wide again
const WIDE_COLUMNS_PX = 768;
// the stacking slot offered to a panel that is not yet a bar
const BAR_SLOT_PX = 52;
const FLOAT_MIN_W = 180;
const FLOAT_MAX_W = 640;
const FLOAT_MIN_H = 120;

// presses on controls never start a drag; the header overrides, but
// its own buttons keep their click behavior
const NO_DRAG =
	'button, input, select, textarea, canvas, summary, a, label, output, ' +
	'form, .depthBar, .segmented, .mapGrip, #minimapScroll, #minimapMenu, ' +
	'#frameStrip, #messageWindow, #userList';

const DEFAULTS = {
	sauce: { t: 'Sauce', dk: 'side', sh: 0, x: 300, y: 60 },
	canvas: { t: 'Canvas', dk: 'side', sh: 0, x: 300, y: 90 },
	pos: { t: 'Cursor', dk: 'side', sh: 0, x: 300, y: 120 },
	zoom: { t: 'Zoom', dk: 'side', sh: 0, x: 300, y: 150 },
	ref: { t: 'Reference Image', dk: 'side', sh: 0, x: 300, y: 180 },
	map: { t: 'Minimap', dk: 'side', sh: 0, x: 300, y: 60, w: 236, h: 340 },
	frames: { t: 'Frames', dk: 'bot', sh: 0, x: 60, y: 560 },
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
	const viewportEl = $('viewport');
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
	const BOXES = {
		side: sidebar,
		top: $('dockTop'),
		bot: $('dockBottom'),
	};

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
					const value = entry[field];
					if (field === 'dk') {
						if (
							value === 0 ||
							value === 'side' ||
							value === 'top' ||
							value === 'bot'
						) {
							MOD[key][field] = value;
						}
					} else if (field === 'ln') {
						if (value === 0 || value === 1) {
							MOD[key][field] = value;
						}
					} else if (
						value !== undefined &&
						typeof value === typeof MOD[key][field]
					) {
						MOD[key][field] = value;
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
		el.classList.toggle('tb', mode === 'tb');
		el.classList.toggle('fl', mode === 'fl');
	};

	// iPadOS WebKit drops the shadow content of external-sprite use
	// nodes when their subtree reparents, re-resolving lazily or never;
	// remounting each one right after a move makes it deterministic
	const refreshUses = el => {
		for (const use of el.querySelectorAll('use')) {
			use.replaceWith(use.cloneNode(false));
		}
	};

	const wideColumns = () => window.innerWidth >= WIDE_COLUMNS_PX;

	/** Rows derive from ORD: a module joins the previous row when its
	 * ln flag is set, the editor is wide, and neither side is big. */
	const buildDock = (box, keys) => {
		if (!box) {
			return;
		}
		const wide = wideColumns();
		const rows = [];
		for (const key of keys) {
			const reg = registry.get(key);
			const prev = rows[rows.length - 1];
			const join =
				wide &&
				MOD[key].ln &&
				prev &&
				!reg.big &&
				!prev.some(other => registry.get(other)?.big) &&
				visibleOf(key);
			if (join) {
				prev.push(key);
			} else {
				rows.push([key]);
			}
		}
		const have = [...box.children].filter(c => c.classList.contains('drow'));
		rows.forEach((row, i) => {
			let rowEl = have[i];
			if (!rowEl) {
				rowEl = document.createElement('div');
				rowEl.className = 'drow';
				box.append(rowEl);
				have.push(rowEl);
			}
			row.forEach((key, j) => {
				const el = registry.get(key).el;
				const cur = [...rowEl.children].filter(c =>
					c.classList.contains('mod'))[j];
				if (cur !== el) {
					rowEl.insertBefore(el, cur || null);
					refreshUses(el);
				}
			});
		});
		for (const extra of have.slice(rows.length)) {
			if (!extra.querySelector('.mod')) {
				extra.remove();
			}
		}
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
		const bars = { top: [], bot: []};
		for (const key of ORD) {
			const reg = registry.get(key);
			if (!reg) {
				continue;
			}
			const m = MOD[key];
			const el = reg.el;
			const vis = visibleOf(key);
			el.hidden = !vis;
			const mode =
				m.dk === 'side'
					? 'dk'
					: (m.dk === 'top' || m.dk === 'bot') && BOXES[m.dk]
							? 'tb'
							: 'fl';
			// bars cannot shade; the flag survives for the next dock
			const shaded = !!m.sh && mode !== 'tb';
			el.classList.toggle('shaded', shaded);
			reg.shade?.setAttribute('aria-expanded', String(!shaded));
			setMode(el, mode);
			if (mode === 'dk') {
				const peers = [...sidebar.children].filter(c =>
					c.classList.contains('mod'));
				const at = peers[sidebarIndex];
				if (at !== el) {
					sidebar.insertBefore(el, at || null);
					refreshUses(el);
				}
				sidebarIndex++;
				el.style.zIndex = '';
				el.classList.remove('focus');
				if (vis) {
					anyDocked = true;
				}
			} else if (mode === 'tb') {
				bars[m.dk].push(key);
				el.style.zIndex = '';
				el.classList.remove('focus');
			} else {
				if (el.parentNode !== container) {
					container.append(el);
					refreshUses(el);
				}
				clampFloat(key, el);
				applyFloatPosition(key, el);
			}
		}
		buildDock(BOXES.top, bars.top);
		buildDock(BOXES.bot, bars.bot);
		applyStack();
		container.classList.toggle('noSidebar', !anyDocked);
		container.classList.toggle('sidebarCollapsed', collapsed && anyDocked);
		syncGrip();
		save();
		// mode-dependent chrome (glyph preview sizing, the character
		// map's reflow) re-measures off this instead of polling classes
		document.dispatchEvent(new CustomEvent('onPanelLayout'));
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
			big: Boolean(cfg.big),
			floatOnly: Boolean(cfg.floatOnly),
			closable: Boolean(cfg.closable),
		};
		el.classList.toggle('grow', reg.grow);
		// a grow module never bars and a floatOnly one never docks, so a
		// saved home that stopped being legal snaps to the nearest one
		if (reg.grow && (MOD[key].dk === 'top' || MOD[key].dk === 'bot')) {
			MOD[key].dk = 'side';
		}
		if (reg.floatOnly) {
			MOD[key].dk = 0;
		}
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
			// own buttons (minimap autoscroll) keep their behavior. A
			// target a control detached mid-dispatch is still a control
			// press, not a strip press
			if (!e.target.isConnected || e.target.closest('button')) {
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

	// ---- drag: any dock <-> floating, reorder inside a dock ----
	let drag = null;
	let placeholder = null;
	let placeholderKind = null;

	const dropPlaceholder = () => {
		if (!placeholder) {
			return;
		}
		const old = placeholder;
		const kind = placeholderKind;
		placeholder = null;
		placeholderKind = null;
		old.classList.add('out');
		old.style[kind === 'col' ? 'width' : 'height'] = '0px';
		setTimeout(() => old.remove(), 220);
	};

	const nextModule = node => {
		while (node && !(node.classList?.contains('mod') && !node.hidden)) {
			node = node.nextElementSibling;
		}
		return node;
	};

	const skipPlaceholders = node => {
		while (node && node.classList?.contains('dph')) {
			node = node.nextElementSibling;
		}
		return node;
	};

	const placeholderMatches = (parent, before, kind) => {
		if (
			!placeholder ||
			placeholderKind !== kind ||
			placeholder.parentNode !== parent
		) {
			return false;
		}
		if (kind === 'side') {
			return nextModule(placeholder.nextElementSibling) === before;
		}
		return skipPlaceholders(placeholder.nextElementSibling) === before;
	};

	// side and stack slots animate height; column slots animate width
	const placeSlot = (parent, before, kind, size) => {
		if (placeholderMatches(parent, before, kind)) {
			return;
		}
		dropPlaceholder();
		const slot = document.createElement('div');
		slot.className = kind === 'col' ? 'dph v' : 'dph';
		parent.insertBefore(slot, before);
		placeholder = slot;
		placeholderKind = kind;
		// two frames: the first paints at zero so the second animates
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				if (placeholder === slot) {
					slot.style[kind === 'col' ? 'width' : 'height'] = `${size}px`;
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
		const reg = registry.get(drag.key);
		if (reg?.floatOnly) {
			return null;
		}
		const rect = sideRect();
		if (e.clientX > rect.left + rect.width * SIDEBAR_DROP_FRACTION) {
			return 'side';
		}
		if (reg?.grow) {
			return null;
		}
		const cv = viewportEl?.getBoundingClientRect();
		if (!cv || e.clientX < cv.left || e.clientX > cv.right) {
			return null;
		}
		// leaving a bar takes a real pull from where it was grabbed;
		// smaller movements keep the panel in its dock
		const pull = Math.max(PULL_MIN_PX, (drag.ghostH || 80) / 3);
		if (drag.fromDock === 'top') {
			return e.clientY - drag.startY < pull
				? 'top'
				: e.clientY > cv.bottom - DOCK_EDGE_PX
					? 'bot'
					: null;
		}
		if (drag.fromDock === 'bot') {
			return drag.startY - e.clientY < pull
				? 'bot'
				: e.clientY < cv.top + DOCK_EDGE_PX
					? 'top'
					: null;
		}
		if (e.clientY < cv.top + DOCK_EDGE_PX) {
			return 'top';
		}
		if (e.clientY > cv.bottom - DOCK_EDGE_PX) {
			return 'bot';
		}
		return null;
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
			drag.fromDock = 'side';
			const slot = document.createElement('div');
			slot.className = 'dph';
			slot.style.transition = 'none';
			slot.style.height = `${Math.min(
				drag.srcHeight,
				registry.get(drag.key).grow ? PLACEHOLDER_GROW_MAX_PX : PLACEHOLDER_MAX_PX,
			)}px`;
			el.before(slot);
			placeholder = slot;
			placeholderKind = 'side';
			void slot.offsetHeight;
			slot.style.transition = '';
		} else if (el.classList.contains('tb')) {
			drag.fromDock = MOD[drag.key].dk;
			// the slot a bar panel leaves behind matches its old footprint:
			// a column gap beside row mates, a whole row when it was alone
			const row = el.parentNode.classList.contains('drow')
				? el.parentNode
				: null;
			const mates = row
				? [...row.children].filter(
						c => c !== el && c.classList.contains('mod') && !c.hidden,
					).length
				: 0;
			const slot = document.createElement('div');
			slot.style.transition = 'none';
			if (mates) {
				slot.className = 'dph v';
				slot.style.width = `${el.offsetWidth}px`;
				row.insertBefore(slot, el);
				placeholderKind = 'col';
			} else {
				slot.className = 'dph';
				slot.style.height = `${Math.min(drag.srcHeight, PLACEHOLDER_MAX_PX)}px`;
				(row || el).parentNode.insertBefore(slot, row || el);
				placeholderKind = 'stack';
			}
			placeholder = slot;
			void slot.offsetHeight;
			slot.style.transition = '';
		}
		setMode(el, 'fl');
		if (el.parentNode !== container) {
			container.append(el);
			refreshUses(el);
		}
		applyFloatPosition(drag.key, el);
		el.classList.add('drag');
		drag.ghostH = el.offsetHeight;
		// grab offsets clamp so the lifted window sits under the pointer
		// even when it shrinks leaving the dock
		drag.grabDX = Math.min(Math.max(drag.grabDX, 10), el.offsetWidth - 30);
		drag.grabDY =
			drag.fromDock === 'top' || drag.fromDock === 'bot'
				? 9
				: Math.min(Math.max(drag.grabDY, 2), Math.max(2, drag.ghostH - 10));
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
		if (!el || el.hidden || !el.matches('.dk, .tb, .fl')) {
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
			startY: e.clientY,
			grabDX: e.clientX - rect.left,
			grabDY: e.clientY - rect.top,
			srcHeight: el.offsetHeight,
			started: false,
			fromDock: null,
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
		BOXES.top?.classList.toggle('dropping', zone === 'top');
		BOXES.bot?.classList.toggle('dropping', zone === 'bot');
		container.classList.toggle('sidebarPeek', zone === 'side');
		el.classList.toggle('over', !!zone);
		// target by the ghost's centre, not the pointer: panels get
		// grabbed by their top edge, so the pointer rides high
		const ghostTop = e.clientY - drag.grabDY;
		const ghostH = Math.min(drag.ghostH || 60, 160);
		const ghostCenterY = ghostTop + ghostH / 2;
		const ghostCenterX = e.clientX - drag.grabDX + el.offsetWidth / 2;
		if (zone === 'side') {
			let before = null;
			for (const child of sidebar.children) {
				if (!child.classList.contains('mod') || child.hidden || child === el) {
					continue;
				}
				const rect = child.getBoundingClientRect();
				if (ghostCenterY < rect.top + rect.height / 2) {
					before = child;
					break;
				}
			}
			placeSlot(
				sidebar,
				before,
				'side',
				Math.min(
					drag.srcHeight,
					registry.get(drag.key).grow ? PLACEHOLDER_GROW_MAX_PX : PLACEHOLDER_MAX_PX,
				),
			);
		} else if (zone === 'top' || zone === 'bot') {
			const box = BOXES[zone];
			const reg = registry.get(drag.key);
			const visibleIn = rowEl =>
				[...rowEl.children].filter(
					c => c.classList.contains('mod') && !c.hidden && c !== el,
				);
			const rows = [...box.children].filter(
				r => r.classList.contains('drow') && visibleIn(r).length,
			);
			// near a row's middle: offer a slot beside its panels; near its
			// edges: stack above or below. Big panels never form columns
			let columnRow = null;
			if (!reg.big && wideColumns()) {
				for (const rowEl of rows) {
					const q = rowEl.getBoundingClientRect();
					const overlap =
						Math.min(q.bottom, ghostTop + ghostH) - Math.max(q.top, ghostTop);
					if (
						overlap >= 0.5 * Math.min(q.height, ghostH) &&
						!visibleIn(rowEl).some(c => registry.get(c.dataset.m)?.big)
					) {
						columnRow = rowEl;
						break;
					}
				}
			}
			if (columnRow) {
				let before = null;
				for (const child of visibleIn(columnRow)) {
					const q = child.getBoundingClientRect();
					if (ghostCenterX < q.left + q.width / 2) {
						before = child;
						break;
					}
				}
				placeSlot(
					columnRow,
					before,
					'col',
					Math.min(
						COLUMN_MAX_PX,
						columnRow.clientWidth / (visibleIn(columnRow).length + 1),
					),
				);
			} else {
				let before = null;
				for (const rowEl of rows) {
					const q = rowEl.getBoundingClientRect();
					if (ghostCenterY < q.top + q.height / 2) {
						before = rowEl;
						break;
					}
				}
				placeSlot(
					box,
					before,
					'stack',
					drag.fromDock === 'top' || drag.fromDock === 'bot'
						? drag.srcHeight
						: BAR_SLOT_PX,
				);
			}
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
		BOXES.top?.classList.remove('dropping');
		BOXES.bot?.classList.remove('dropping');
		container.classList.remove('sidebarPeek');
		promoteRowLead(
			ORD,
			MOD,
			key,
			drag.fromDock === 'top' || drag.fromDock === 'bot'
				? drag.fromDock
				: null,
		);
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
			placeholderKind = null;
			old.remove();
		} else if ((drag.zone === 'top' || drag.zone === 'bot') && placeholder) {
			ORD = ORD.filter(other => other !== key);
			if (placeholderKind === 'col') {
				// a column slot anchors beside its row mates: after the one
				// to its left, or as the row's new lead when dropped first
				let prev = placeholder.previousElementSibling;
				while (prev && !(prev.classList.contains('mod') && !prev.hidden)) {
					prev = prev.previousElementSibling;
				}
				const next = nextModule(placeholder.nextElementSibling);
				if (prev) {
					ORD.splice(ORD.indexOf(prev.dataset.m) + 1, 0, key);
					m.ln = 1;
				} else {
					const at = next ? ORD.indexOf(next.dataset.m) : -1;
					if (at < 0) {
						ORD.push(key);
					} else {
						ORD.splice(at, 0, key);
					}
					if (next) {
						MOD[next.dataset.m].ln = 1;
					}
				}
			} else {
				// a stacking slot anchors before the row that follows it
				let row = placeholder.nextElementSibling;
				while (row && !row.classList.contains('drow')) {
					row = row.nextElementSibling;
				}
				const next = row
					? [...row.children].find(c => c.classList.contains('mod'))
					: null;
				const at = next ? ORD.indexOf(next.dataset.m) : -1;
				if (at < 0) {
					ORD.push(key);
				} else {
					ORD.splice(at, 0, key);
				}
			}
			m.dk = drag.zone;
			const old = placeholder;
			placeholder = null;
			placeholderKind = null;
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

	// content-owned grips (the character map's corner) set a float's
	// width without owning the rest of the module's geometry
	const setFloatWidth = (key, width) => {
		const m = MOD[key];
		const reg = registry.get(key);
		if (!m || !reg) {
			return;
		}
		m.w = Math.min(Math.max(Math.round(width), FLOAT_MIN_W), FLOAT_MAX_W);
		if (reg.el.classList.contains('fl')) {
			applyFloatPosition(key, reg.el);
		}
		save();
	};

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
		setFloatWidth,
		isDocked: key => MOD[key]?.dk === 'side',
		isCollapsed: () => collapsed,
	};
};

export { createPanelManager, promoteRowLead };
export default { createPanelManager, promoteRowLead };
