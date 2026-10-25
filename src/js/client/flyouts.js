/**
 * Rail flyouts: panels that anchor beside their opener at z 200. Each
 * flyout is a fixed element that only shows and hides, never reparents,
 * so ids, listeners, and WebKit sprite content all survive. The first
 * click on a group opens its flyout without switching tools, the same
 * button or any outside press closes it, arrows walk the items, and
 * Escape closes and hands focus back to the opener.
 */

import { isPhone } from './panels.js';
import State from './state.js';

const ITEM_SELECTOR = 'button, .toolButton, .menuItem, summary, [tabindex]';

const createFlyoutManager = () => {
	let open = null;

	const close = () => {
		if (!open) {
			return false;
		}
		open.el.hidden = true;
		// the opener wears flyOpen while its flyout shows, so chrome can
		// light it (the rail's menu button) apart from the tool logic
		open.from?.classList?.remove('flyOpen');
		open = null;
		return true;
	};

	const closeAndFocus = () => {
		const from = open?.from;
		if (!close()) {
			return false;
		}
		from?.focus?.();
		return true;
	};

	const place = (el, from, opts, anchorRect) => {
		if (opts.at) {
			// context menus land at the pointer, clamped on screen
			el.style.left = `${Math.round(
				Math.min(
					Math.max(opts.at.x, 8),
					Math.max(8, window.innerWidth - el.offsetWidth - 8),
				),
			)}px`;
			el.style.top = `${Math.round(
				Math.min(
					Math.max(opts.at.y, 8),
					Math.max(8, window.innerHeight - el.offsetHeight - 8),
				),
			)}px`;
			return;
		}
		const r = anchorRect ?? from.getBoundingClientRect();
		if (isPhone() && from.closest?.('aside')) {
			// the rail rides the bottom edge on phones, so its flyouts
			// open upward, centered over the opener and clamped on screen
			const width = el.offsetWidth;
			el.style.left = `${Math.round(
				Math.min(
					Math.max(r.left + r.width / 2 - width / 2, 8),
					Math.max(8, window.innerWidth - width - 8),
				),
			)}px`;
			el.style.top = `${Math.max(8, Math.round(r.top - el.offsetHeight - 6))}px`;
			return;
		}
		if (opts.flush) {
			// the File/Edit menu sits flush with the app's top edge and
			// the rail's right edge, no gap
			el.style.left = `${Math.round(r.right)}px`;
			el.style.top = '0px';
			return;
		}
		const height = el.offsetHeight;
		el.style.left = `${Math.round(r.right + 4)}px`;
		el.style.top = `${Math.min(
			Math.max(Math.round(r.top), 8),
			Math.max(8, window.innerHeight - height - 8),
		)}px`;
	};

	const show = (id, el, from, opts = {}) => {
		// measure the opener BEFORE close(): a flyout chained from inside
		// the closing one (the phone ++ chip) reads a 0,0 rect once its
		// host is hidden and lands detached at the screen corner
		const anchorRect = from?.getBoundingClientRect?.();
		close();
		open = { id, el, from };
		from?.classList?.add('flyOpen');
		el.hidden = false;
		place(el, from, opts, anchorRect);
		opts.onOpen?.();
		// divs need a tabindex before focus() lands, and the active item
		// is where arrow keys should start
		const items = el.querySelectorAll(ITEM_SELECTOR);
		for (const item of items) {
			if (!item.hasAttribute('tabindex')) {
				item.tabIndex = -1;
			}
		}
		const target =
			el.querySelector('.toolbarDisplayed, .enabled, .on') || items[0];
		target?.focus?.({ preventScroll: true });
	};

	const toggle = (id, el, from, opts = {}) => {
		if (open?.id === id) {
			close();
			return false;
		}
		show(id, el, from, opts);
		return true;
	};

	const isOpen = id => (id === undefined ? !!open : open?.id === id);

	// capture phase: a press outside the open flyout closes it before
	// the press does anything else, except on the opener, whose own
	// click handler owns the toggle
	document.addEventListener(
		'pointerdown',
		e => {
			if (!open || open.el.contains(e.target)) {
				return;
			}
			if (open.from === e.target || open.from?.contains?.(e.target)) {
				return;
			}
			close();
		},
		true,
	);

	document.addEventListener('keydown', e => {
		if (!open) {
			return;
		}
		// a dialog on top owns the keyboard: the trap used to
		// preventDefault Tab and aim focus at the inert flyout underneath,
		// stranding keyboard users inside the modal
		if (State.modal?.isOpen?.()) {
			return;
		}
		// div and article rows have no native key activation; buttons,
		// links, and summaries do, and a second click would double-fire
		if (
			(e.key === 'Enter' || e.key === ' ') &&
			open.el.contains(document.activeElement)
		) {
			const item = document.activeElement;
			if (
				item.matches?.(ITEM_SELECTOR) &&
				!['BUTTON', 'A', 'SUMMARY', 'INPUT'].includes(item.tagName)
			) {
				e.preventDefault();
				e.stopPropagation();
				item.click();
				return;
			}
		}
		const arrow = e.key === 'ArrowDown' || e.key === 'ArrowUp';
		if (arrow || e.key === 'Tab') {
			// visibility by markup (hidden panes wear .hide, folded groups
			// hide their children but not their summary), not layout:
			// offsetParent reads null in the layoutless test DOM
			const items = [...open.el.querySelectorAll(ITEM_SELECTOR)].filter(
				item => {
					if (item.closest('.hide, [hidden]')) {
						return false;
					}
					const folded = item.closest('details:not([open])');
					return !folded || (item.tagName === 'SUMMARY' && item.parentElement === folded);
				},
			);
			const at = items.indexOf(document.activeElement);
			if (arrow && at === -1 && !open.el.contains(document.activeElement)) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			const back = e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey);
			// Tab is trapped: from outside it re-enters at an end, inside
			// it cycles, so focus can never wander out behind the flyout
			const target =
				at === -1
					? items[back ? items.length - 1 : 0]
					: items[(at + (back ? -1 : 1) + items.length) % items.length];
			target?.focus?.();
		}
	});

	return {
		toggle,
		show,
		close,
		closeAndFocus,
		isOpen,
	};
};

export { createFlyoutManager };
export default { createFlyoutManager };
