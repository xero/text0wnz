import State from './state.js';
import { loadFontFromXBData } from './font.js';
import { getZoomController } from './zoom.js';
import { mirrorCharCode } from '../core/index';

const D = document,
			$ = D.getElementById.bind(D),
			$$ = D.querySelector.bind(D),
			$$$ = D.querySelectorAll.bind(D),
			has = (i, c) => !!i && i.classList.contains(c),
			classList = (el, className, add = true) => {
				if (!el || !el.classList) {
					return;
				}
				add ? el.classList.add(className) : el.classList.remove(className);
			};

const createCanvas = (width, height) => {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
};

const toggleFullscreen = () => {
	const isFullscreenEnabled =
		document.fullscreenEnabled || document.webkitFullscreenEnabled;

	if (!isFullscreenEnabled) {
		console.warn('[UI] Fullscreen not supported');
		$('fullscreen').classList.add('disabled');
		// the view-flyout chip mirrors the menu item, disabled included
		$('navFullscreen')?.classList?.add('disabled');
		return;
	}

	try {
		const fullscreenElement =
			document.fullscreenElement ||
			document.webkitFullscreenElement ||
			document.webkitCurrentFullScreenElement; // Safari specific

		if (fullscreenElement) {
			if (document.exitFullscreen) {
				document.exitFullscreen();
			} else if (document.webkitExitFullscreen) {
				document.webkitExitFullscreen();
			} else if (document.webkitCancelFullScreen) {
				document.webkitCancelFullScreen(); // Older Safari
			}
		} else {
			const element = document.documentElement;

			if (element.requestFullscreen) {
				element.requestFullscreen();
			} else if (element.webkitRequestFullscreen) {
				element.webkitRequestFullscreen();
			} else if (element.webkitRequestFullScreen) {
				element.webkitRequestFullScreen(); // Older Safari (capital S)
			}
		}
	} catch {
		console.error('[UI] Failed toggling fullscreen mode');
	}
};

/** keep a fullscreen chip's icon honest: the browser can enter or
 * leave fullscreen without the button (F11, Esc, OS gestures), so the
 * glyph follows the document state, never the click */
const armFullscreenIcon = button => {
	if (!button?.querySelector('use')) {
		return;
	}
	const sync = () => {
		const active =
			document.fullscreenElement ||
			document.webkitFullscreenElement ||
			document.webkitCurrentFullScreenElement;
		// remountUse replaces the node (the iPadOS swap fix), so the
		// chip's use is re-queried every sync, never captured
		remountUse(
			button.querySelector('use'),
			iconHref(active ? 'contract' : 'expand'),
		);
	};
	document.addEventListener('fullscreenchange', sync);
	document.addEventListener('webkitfullscreenchange', sync);
	sync();
};

const createModalController = modal => {
	const modals = [
		$('aboutModal'),
		$('resizeModal'),
		$('fontsModal'),
		$('sauceModal'),
		$('charsetModal'),
		$('exportModal'),
		$('artpacksModal'),
		$('sixteenModal'),
		$('arenaModal'),
		$('archiveModal'),
		$('pluginModal'),
		$('choiceModal'),
		$('connectModal'),
		$('updateModal'),
		$('loadingModal'),
		$('warningModal'),
		$('errorModal'),
		$('tutorialsModal'),
		// a missing section must not poison the arithmetic: queued()
		// counts hidden sections against the list length, and a null
		// entry can never read as hidden, wedging every close forever
	].filter(Boolean);
	let current = false;
	let closingTimeout = null;
	let transitionHandler = null;
	let backdropHandler = null;
	let cleanupHandler = null;
	let focus = () => {};
	let blur = () => {};

	const cancelPendingClose = () => {
		if (closingTimeout) {
			clearTimeout(closingTimeout);
			closingTimeout = null;
		}
		if (transitionHandler) {
			modal.removeEventListener('transitionend', transitionHandler);
			transitionHandler = null;
		}
	};

	const focusEvents = (onFocus, onBlur) => {
		focus = onFocus;
		blur = onBlur;
	};

	const currentScreen = () => current;

	const clear = () => modals.forEach(s => classList(s, 'hide'));

	// the two boot modals have a fixed order: the update question
	// outranks the collab invitation, because accepting it reloads the
	// page and the invitation returns fresh. Whichever yields is never
	// lost: a late update takes the choice modal's place and hands it
	// back on dismissal, and a choice arriving under a live update
	// waits here instead of replacing it
	let deferredChoice = false;

	const open = name => {
		if (
			name === 'choice' &&
			current === 'update' &&
			modal.open &&
			!closingTimeout &&
			!transitionHandler
		) {
			deferredChoice = true;
			return;
		}
		if (
			name === 'update' &&
			current === 'choice' &&
			modal.open &&
			!closingTimeout &&
			!transitionHandler
		) {
			// mid-close means the user already answered the invitation; an
			// update landing in that window must not resurrect it
			deferredChoice = true;
		}
		if (name !== 'update' && name !== 'choice') {
			// any other screen replacing the pair ends the boot handoff: a
			// stranded flag would hand a long-dead invitation back behind a
			// menu-opened update modal much later
			deferredChoice = false;
		}
		current = name;
		const section = name + 'Modal';
		if ($(section)) {
			if (closingTimeout || transitionHandler) {
				cancelPendingClose();
				classList(modal, 'closing', false);
			}
			clear();
			focus();
			classList($(section), 'hide', false);
			modal.showModal();
			// the old backdrop handler must go first: stacked copies make
			// one backdrop tap run close() several times over
			if (typeof backdropHandler === 'function') {
				backdropHandler();
				backdropHandler = null;
			}
			if (name !== 'update') {
				backdropHandler = onClick(modal, e => {
					if (e.target === modal) {
						close();
					}
				});
			}
		} else {
			// never recurse when the error modal ITSELF is the unknown
			console.error(`Unknown modal: ${section}`);
			if (name !== 'error') {
				error(`Unknown modal: <kbd>${section}</kbd>`);
			}
		}
	};

	const queued = () => {
		let i = 0;
		modals.forEach(s => {
			if (has(s, 'hide')) {
				i++;
			}
		});
		return i !== modals.length - 1 ? true : false;
	};

	const close = () => {
		if (typeof backdropHandler === 'function') {
			backdropHandler();
			backdropHandler = null;
		}
		if (typeof cleanupHandler === 'function') {
			cleanupHandler();
			cleanupHandler = null;
		}
		// the update question answered with a dismissal hands the stage
		// back to the collab invitation it interrupted (accepting never
		// lands here: the page reloads on controllerchange instead).
		// current drops first or the deferral guard would re-defer the
		// very handback it exists to deliver
		if (current === 'update' && deferredChoice) {
			deferredChoice = false;
			current = false;
			open('choice');
			return;
		}
		// a second close while one is pending must not re-register: the
		// overwritten handler would outlive cancelPendingClose and close
		// every future open the moment its enter transition ends
		if (!queued() && !transitionHandler && !closingTimeout) {
			classList(modal, 'closing');
			const finishClose = () => {
				cancelPendingClose();
				blur();
				classList(modal, 'closing', false);
				modal.close();
				current = false;
			};
			transitionHandler = e => {
				if (e.target === modal) {
					finishClose();
				}
			};
			modal.addEventListener('transitionend', transitionHandler);
			// fallback for environments without transitions
			closingTimeout = setTimeout(finishClose, 700);
		}
	};

	const loading = (message = 'Reinitializing editor state...') => {
		if (current !== 'loading') {
			$('loadingMsg').innerHTML = message;
		}
		open('loading');
	};

	const error = message => {
		const el = $('modalError');
		if (el) {
			el.innerHTML = message;
		}
		open('error');
	};

	const onClose = handler => {
		cleanupHandler = handler;
	};

	$$$('.close').forEach(b => onClick(b, _ => close()));

	// Escape fires the dialog's native cancel, which would slam it shut
	// past the closing transition, the cleanup handlers, and the
	// deferred-choice handback; route it through close() instead
	modal.addEventListener('cancel', e => {
		e.preventDefault();
		close();
	});

	return {
		isOpen: () => modal.open,
		current: currentScreen,
		open: open,
		close: close,
		error: error,
		focusEvents: focusEvents,
		loading: loading,
		onClose: onClose,
	};
};

const createSettingToggle = (el, getter, setter) => {
	let currentSetting;
	let g = getter;
	let s = setter;

	const update = () => {
		currentSetting = g();
		if (currentSetting) {
			el.classList.add('enabled');
		} else {
			el.classList.remove('enabled');
		}
	};

	const sync = (getter, setter) => {
		g = getter;
		s = setter;
		update();
	};

	const changeSetting = e => {
		e.preventDefault();
		currentSetting = !currentSetting;
		s(currentSetting);
		update();
	};

	el.addEventListener('click', changeSetting);
	update();

	return {
		sync: sync,
		update: update,
	};
};

// an Enter keydown this close after compositionend is the IME's
// commit stroke, not a request to act: WebKit hands it over in the
// same cycle, while a human commit-then-send double press sits well
// above 50ms, and on engines without a beforeinput fallback a window
// any wider would swallow that second press
const IME_COMMIT_WINDOW_MS = 40;

/* Android IMEs skip keypress and leave e.code empty for the action
   key, so Enter activation listens on keydown by e.key, with a
   beforeinput fallback for keyboards that only commit the press
   through the input pipeline. An Enter that lands while composing
   belongs to the IME: Chrome flags it isComposing, but WebKit fires
   compositionend first and hands over a bare keydown (keyCode still
   229) right after, so a fresh compositionend or a 229 mutes it too;
   a muted keydown keeps its default, and a real action key then still
   arrives through beforeinput. Cancelled keydowns never reach
   beforeinput, so the paths cannot double-fire. In a textarea a line
   break is content, never submission, so only the keydown path acts
   there and soft keyboards keep their newline. */
const onEnter = (el, fn) => {
	let composedAt = 0;
	el.addEventListener('compositionend', () => {
		composedAt = Date.now();
	});
	el.addEventListener('keydown', e => {
		if (
			e.altKey ||
			e.ctrlKey ||
			e.metaKey ||
			e.key !== 'Enter' ||
			e.isComposing ||
			e.keyCode === 229 ||
			Date.now() - composedAt < IME_COMMIT_WINDOW_MS
		) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		fn(e);
	});
	el.addEventListener('beforeinput', e => {
		if (
			e.inputType === 'insertLineBreak' &&
			!e.isComposing &&
			el.tagName !== 'TEXTAREA'
		) {
			e.preventDefault();
			e.stopPropagation();
			fn(e);
		}
	});
};

const onReturn = (el, target) => {
	onEnter(el, () => target.click());
};

const onClick = (el, func) => {
	const handler = e => {
		if (el.tagName === 'A' || el.tagName === 'BUTTON') {
			e.preventDefault();
		}
		func(e, el);
	};
	el.addEventListener('click', handler);
	return () => el.removeEventListener('click', handler);
};

const onFileChange = (el, func) => {
	el.addEventListener('change', e => {
		if (e.target.files.length > 0) {
			func(e.target.files[0]);
		}
	});
};

const createPositionInfo = el => {
	const row = document.createElement('div');
	row.className = 'cursorReadout';
	const colLabel = document.createElement('span');
	colLabel.textContent = 'col';
	const colValue = document.createElement('b');
	colValue.textContent = '1';
	const rowLabel = document.createElement('span');
	rowLabel.textContent = 'row';
	const rowButton = document.createElement('button');
	rowButton.type = 'button';
	rowButton.title = 'Jump to row';
	rowButton.textContent = '1';
	const total = document.createElement('i');
	row.append(colLabel, colValue, rowLabel, rowButton, total);

	const depth = document.createElement('div');
	depth.className = 'depthBar';
	depth.title = 'Scroll depth: drag to scroll';
	const fill = document.createElement('i');
	const mark = document.createElement('s');
	depth.append(fill, mark);

	el.append(row, depth);

	const viewport = $('viewport');
	const stripPos = $('topStripPos');
	const rowCount = () => State.textArtCanvas?.getRows?.() ?? 0;

	const update = (x, y) => {
		colValue.textContent = String(x + 1);
		rowButton.textContent = String(y + 1);
		if (stripPos) {
			stripPos.textContent = `${x + 1},${y + 1}`;
		}
	};

	const refreshTotal = () => {
		const rows = rowCount();
		total.textContent = rows ? `/ ${rows}` : '';
	};

	const syncDepth = () => {
		if (!viewport) {
			return;
		}
		const height = viewport.scrollHeight || 1;
		const top = Math.min(1, viewport.scrollTop / height);
		const bottom = Math.min(
			1,
			(viewport.scrollTop + viewport.clientHeight) / height,
		);
		fill.style.width = `${bottom * 100}%`;
		mark.style.left = `calc(${top * 100}% - 1px)`;
	};

	[
		'onTextCanvasSizeChange',
		'onFontChange',
		'onXBFontLoaded',
		'onOpenedFile',
		'onLetterSpacingChange',
	].forEach(e =>
		document.addEventListener(e, () => {
			refreshTotal();
			syncDepth();
		}));

	if (viewport) {
		viewport.addEventListener('scroll', syncDepth, { passive: true });

		let scrubbing = false;
		const scrub = e => {
			const rect = depth.getBoundingClientRect();
			const fraction = Math.min(
				Math.max((e.clientX - rect.left) / rect.width, 0),
				1,
			);
			viewport.scrollTop =
				fraction * viewport.scrollHeight - viewport.clientHeight / 2;
		};
		depth.addEventListener('pointerdown', e => {
			scrubbing = true;
			depth.setPointerCapture(e.pointerId);
			scrub(e);
		});
		depth.addEventListener('pointermove', e => {
			if (scrubbing) {
				scrub(e);
			}
		});
		const scrubEnd = () => {
			scrubbing = false;
		};
		depth.addEventListener('pointerup', scrubEnd);
		depth.addEventListener('pointercancel', scrubEnd);

		const jumpTo = targetRow => {
			const rows = rowCount();
			const container = $('canvasContainer');
			if (!rows || !container) {
				return;
			}
			const clamped = Math.min(Math.max(targetRow, 1), rows);
			// the canvas sits below a container margin, so anchor row math
			// in content space like the scroll snap in main.js does
			const offY =
				container.getBoundingClientRect().top -
				viewport.getBoundingClientRect().top +
				viewport.scrollTop;
			viewport.scrollTop =
				offY +
				((clamped - 1) / rows) * container.clientHeight -
				viewport.clientHeight / 3;
		};

		rowButton.addEventListener('click', () => {
			const input = document.createElement('input');
			input.type = 'text';
			input.inputMode = 'numeric';
			input.setAttribute('aria-label', 'Jump to Row');
			input.value = rowButton.textContent;
			rowButton.replaceWith(input);
			input.select();
			let finished = false;
			const done = go => {
				if (finished) {
					return;
				}
				finished = true;
				if (go) {
					const target = parseInt(input.value, 10);
					if (!isNaN(target)) {
						jumpTo(target);
					}
				}
				input.replaceWith(rowButton);
			};
			// the keyboard tool and shortcut maps listen on document:
			// keys typed here must never paint glyphs or fire actions
			input.addEventListener('keydown', e => {
				e.stopPropagation();
				if (e.key === 'Enter') {
					done(true);
				}
				if (e.key === 'Escape') {
					done(false);
				}
			});
			input.addEventListener('keypress', e => e.stopPropagation());
			input.addEventListener('keyup', e => e.stopPropagation());
			input.addEventListener('blur', () => {
				if (input.isConnected) {
					done(true);
				}
			});
		});
	}

	refreshTotal();
	syncDepth();

	return { update: update };
};

const viewportTap = view => {
	// on the canvas the gesture recognizer owns taps; this layer takes
	// only margin taps, so both never undo the same tap
	const maxTapDuration = 300;
	let touchStartTime = 0;
	let eligible = false;

	view.addEventListener('touchstart', event => {
		State.flyouts?.close();
		// judge EVERY touch, not just the one that fired this event, or
		// one finger on the canvas and one off undoes here AND in the
		// canvas gesture recognizer
		const anyOnCanvas = [...event.touches].some(
			touch =>
				typeof touch.target?.closest === 'function' &&
				touch.target.closest('#canvasContainer') !== null,
		);
		eligible = event.touches.length === 2 && !anyOnCanvas;
		if (eligible) {
			touchStartTime = Date.now();
		}
	});

	view.addEventListener('touchend', event => {
		// evaluate on the LAST lift: real fingers rarely leave in the
		// same event frame, so requiring changedTouches === 2 would
		// almost never fire on hardware
		const remaining = event.touches?.length ?? 0;
		if (
			eligible &&
			remaining === 0 &&
			Date.now() - touchStartTime < maxTapDuration
		) {
			State.textArtCanvas.undo();
		}
		if (remaining === 0) {
			eligible = false;
		}
	});

	view.addEventListener('touchcancel', () => {
		eligible = false;
	});
};

/**
 * Document-level shortcut handlers must stay inert on text-entry
 * surfaces (chat, SAUCE fields, shape-toolbar selects), or typing
 * fires app actions underneath.
 * @param {EventTarget | null} t
 */
const isTextEntry = t => {
	const tag = /** @type {{tagName?: string}} */ (t)?.tagName;
	return (
		tag === 'SELECT' ||
		tag === 'INPUT' ||
		tag === 'TEXTAREA' ||
		/** @type {{isContentEditable?: boolean}} */ (t)?.isContentEditable ===
		true
	);
};

const undoAndRedo = e => {
	if (isTextEntry(e.target)) {
		// native text-field undo belongs to the field
		return;
	}
	if (
		(e.ctrlKey || e.metaKey) &&
		!e.shiftKey &&
		!e.altKey &&
		e.code === 'KeyZ'
	) {
		// the shift check keeps Ctrl+Shift+Z, a redo, from undoing
		e.preventDefault();
		State.textArtCanvas.undo();
	} else if (
		(e.ctrlKey && !e.shiftKey && e.code === 'KeyY') ||
		((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyZ')
	) {
		e.preventDefault();
		State.textArtCanvas.redo();
	}
};

const createPaintShortcuts = keyPair => {
	let ignored = false;

	const isConnected = e =>
		!State.network ||
		!State.network.isConnected() ||
		!keyPair[e.key].classList.contains('excludedForWebsocket');

	const keyDown = e => {
		if (isTextEntry(e.target)) {
			// the shape toolbars put selects inside tool buttons: typing
			// in one must configure it, never fire a paint shortcut
			return;
		}
		if (!ignored) {
			if (!e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
				if (e.key >= '0' && e.key <= '7') {
					const color = parseInt(e.key, 10);
					const currentColor = State.palette.getForegroundColor();
					if (currentColor === color) {
						State.palette.setForegroundColor(color + 8);
					} else {
						State.palette.setForegroundColor(color);
					}
				} else {
					if (keyPair[e.key] !== undefined) {
						if (isConnected(e)) {
							e.preventDefault();
							keyPair[e.key].click();
						}
					}
				}
			}
		}
	};

	const keyDownWithCtrl = e => {
		if (isTextEntry(e.target)) {
			// a field keeps its own Ctrl keys: Ctrl+A selects all, never
			// the attribute brush
			return;
		}
		if (!ignored) {
			if (e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
				if (keyPair[e.key] !== undefined) {
					if (isConnected(e)) {
						e.preventDefault();
						keyPair[e.key].click();
					}
				}
			}
		}
	};

	document.addEventListener('keydown', keyDownWithCtrl);

	const enable = () => {
		document.addEventListener('keydown', keyDown);
	};

	const disable = () => {
		document.removeEventListener('keydown', keyDown);
	};

	const ignore = () => {
		ignored = true;
	};

	const unignore = () => {
		ignored = false;
	};

	enable();

	return {
		enable: enable,
		disable: disable,
		ignore: ignore,
		unignore: unignore,
	};
};


/**
 * The bake hashes icons.svg and rewrites every static use href, so a
 * hardcoded sprite path only resolves in dev. Steal the baked base
 * from any sprite reference already in the DOM and swap fragments.
 */
let iconBase = null;
const iconHref = name => {
	iconBase ??=
		document
			.querySelector('use[href*=".svg#"]')
			?.getAttribute('href')
			.split('#')[0] ?? 'img/icons.svg';
	return `${iconBase}#${name}`;
};

// iPadOS WebKit drops external-sprite use content when a subtree
// reparents or its href swaps, re-resolving lazily or never; cloning
// the node back in is the one deterministic fix
const remountUse = (use, href) => {
	const fresh = use.cloneNode(false);
	if (href) {
		fresh.setAttribute('href', href);
	}
	use.replaceWith(fresh);
};

const remountUses = el => {
	for (const use of el.querySelectorAll('use')) {
		remountUse(use);
	}
};

const iconSvg = name => {
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
	use.setAttribute('href', iconHref(name));
	svg.appendChild(use);
	return svg;
};

/**
 * Options are {value, label, glyph?, icon?}. set() moves the selection
 * without firing onChange, so controllers can restore persisted values
 * silently.
 */
const createSegmentedControl = (id, options, onChange) => {
	const group = document.createElement('DIV');
	group.id = id;
	group.classList.add('segmented');
	group.setAttribute('role', 'radiogroup');
	let current = options[0]?.value;
	let enabled = true;
	const order = options.map(opt => opt.value);
	const buttons = new Map();

	const paint = () => {
		buttons.forEach((btn, value) => {
			const on = value === current;
			btn.classList.toggle('enabled', on);
			btn.setAttribute('aria-checked', on ? 'true' : 'false');
			// a napping control must drop out of the tab order too, or
			// the keyboard reaches what pointer-events: none fences off
			btn.tabIndex = enabled && on ? 0 : -1;
		});
	};

	const select = value => {
		if (!enabled || value === current || !buttons.has(value)) {
			return;
		}
		current = value;
		paint();
		if (typeof onChange === 'function') {
			onChange(current);
		}
	};

	options.forEach(opt => {
		const btn = document.createElement('BUTTON');
		btn.type = 'button';
		btn.classList.add('segment');
		btn.setAttribute('role', 'radio');
		btn.dataset.value = String(opt.value);
		if (opt.glyph) {
			const glyph = document.createElement('SAMP');
			glyph.textContent = opt.glyph;
			btn.appendChild(glyph);
		}
		if (opt.icon) {
			btn.appendChild(iconSvg(opt.icon));
		}
		const label = document.createElement('SPAN');
		label.textContent = opt.label;
		btn.appendChild(label);
		btn.addEventListener('click', _ => select(opt.value));
		buttons.set(opt.value, btn);
		group.appendChild(btn);
	});

	group.addEventListener('keydown', e => {
		if (!enabled) {
			return;
		}
		let step = 0;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			step = 1;
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			step = -1;
		}
		if (step === 0) {
			return;
		}
		e.preventDefault();
		const next =
			order[(order.indexOf(current) + step + order.length) % order.length];
		select(next);
		buttons.get(next)?.focus();
	});

	paint();

	return {
		getElement: () => group,
		value: () => current,
		set: value => {
			if (buttons.has(value)) {
				current = value;
				paint();
			}
		},
		setEnabled: on => {
			enabled = Boolean(on);
			group.classList.toggle('dimmed', !enabled);
			group.setAttribute('aria-disabled', enabled ? 'false' : 'true');
			paint();
		},
	};
};

const createGrid = el => {
	let canvases = [];
	let enabled = false;

	const createCanvases = () => {
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		const columns = State.textArtCanvas.getColumns();
		const rows = State.textArtCanvas.getRows();
		const canvasWidth = fontWidth * columns;
		const canvasHeight = fontHeight * 25;
		canvases = [];
		for (let i = 0; i < Math.floor(rows / 25); i++) {
			const canvas = createCanvas(canvasWidth, canvasHeight);
			canvases.push(canvas);
		}
		if (rows % 25 !== 0) {
			const canvas = createCanvas(canvasWidth, fontHeight * (rows % 25));
			canvases.push(canvas);
		}
	};

	const renderGrid = canvas => {
		const columns = State.textArtCanvas.getColumns();
		const rows = Math.min(State.textArtCanvas.getRows(), 25);
		const fontWidth = canvas.width / columns;
		const fontHeight = State.font.getHeight();
		const ctx = canvas.getContext('2d');
		const imageData = ctx.createImageData(canvas.width, canvas.height);
		const byteWidth = canvas.width * 4;
		const darkGray = new Uint8Array([63, 63, 63, 255]);
		for (let y = 0; y < rows; y += 1) {
			for (
				let x = 0, i = y * fontHeight * byteWidth;
				x < canvas.width;
				x += 1, i += 4
			) {
				imageData.data.set(darkGray, i);
			}
		}
		for (let x = 0; x < columns; x += 1) {
			for (
				let y = 0, i = x * fontWidth * 4;
				y < canvas.height;
				y += 1, i += byteWidth
			) {
				imageData.data.set(darkGray, i);
			}
		}
		ctx.putImageData(imageData, 0, 0);
	};

	const createGrid = () => {
		createCanvases();
		renderGrid(canvases[0]);
		el.appendChild(canvases[0]);
		for (let i = 1; i < canvases.length; i++) {
			canvases[i].getContext('2d').drawImage(canvases[0], 0, 0);
			el.appendChild(canvases[i]);
		}
	};

	const destroyGrid = () => {
		// remove() tolerates canvases a failed build never appended,
		// where removeChild would throw and wedge every later resize
		canvases.forEach(canvas => {
			canvas.remove();
		});
		canvases = [];
	};

	const resize = () => {
		if (canvases.length > 0) {
			destroyGrid();
		}
		if (enabled) {
			createGrid();
		}
	};

	document.addEventListener('onTextCanvasSizeChange', resize);
	document.addEventListener('onLetterSpacingChange', resize);
	document.addEventListener('onFontChange', resize);
	document.addEventListener('onScaleFactorChange', resize);
	document.addEventListener('onOpenedFile', resize);

	const isShown = () => {
		return enabled;
	};

	const show = turnOn => {
		if (enabled && !turnOn) {
			el.classList.remove('enabled');
			enabled = false;
			destroyGrid();
		} else if (!enabled && turnOn) {
			if (canvases.length === 0) {
				createGrid();
			}
			el.classList.add('enabled');
			enabled = true;
		}
		try {
			localStorage.setItem('gridVisible', String(enabled));
		} catch {
			// storage blocked: the preference just does not persist
		}
	};

	let stored = null;
	try {
		stored = localStorage.getItem('gridVisible');
	} catch {
		// storage blocked: default wins
	}
	if (stored === 'true') {
		// the boot font races this restore: build now when it already
		// landed, otherwise its onFontChange rebuild draws the first grid
		try {
			show(true);
		} catch {
			el.classList.add('enabled');
			enabled = true;
		}
	}

	return {
		isShown: isShown,
		show: show,
	};
};

const createToolPreview = el => {
	let canvases = [];
	let ctxs = [];
	let fontWidth = 0;
	let fontHeight = 0;
	let columns = 0;
	let rows = 0;

	const updateDimensions = () => {
		fontWidth = State.font.getWidth();
		fontHeight = State.font.getHeight();
		columns = State.textArtCanvas.getColumns();
		rows = State.textArtCanvas.getRows();
	};

	// Preview canvases are created lazily, one 25-row chunk at a time,
	// so a tall document never allocates a full overlay stack up front
	const getOrCreateCtx = ctxIndex => {
		if (ctxs[ctxIndex]) {
			return ctxs[ctxIndex];
		}
		const chunkRows = Math.min(25, rows - ctxIndex * 25);
		const canvas = createCanvas(fontWidth * columns, fontHeight * chunkRows);
		canvas.style.position = 'absolute';
		canvas.style.left = '0px';
		canvas.style.top = ctxIndex * 25 * fontHeight + 'px';
		el.appendChild(canvas);
		canvases[ctxIndex] = canvas;
		ctxs[ctxIndex] = canvas.getContext('2d');
		return ctxs[ctxIndex];
	};

	const resize = () => {
		canvases.forEach(canvas => {
			el.removeChild(canvas);
		});
		canvases = [];
		ctxs = [];
		updateDimensions();
	};

	const drawOneHalfBlock = (foreground, x, y) => {
		const halfBlockY = y % 2;
		const textY = Math.floor(y / 2);
		const ctxIndex = Math.floor(textY / 25);
		if (ctxIndex >= 0 && ctxIndex < Math.ceil(rows / 25)) {
			State.font.drawWithAlpha(
				halfBlockY === 0 ? 223 : 220,
				foreground,
				getOrCreateCtx(ctxIndex),
				x,
				textY % 25,
			);
		}
	};

	const drawHalfBlock = (foreground, x, y) => {
		drawOneHalfBlock(foreground, x, y);
		// mirror mode draws the reflected half on COMMIT (editor core);
		// the ghost has to say so beforehand, for every shape tool at once
		if (State.textArtCanvas.getMirrorMode?.()) {
			const mirrorX = State.textArtCanvas.getMirrorX(x);
			if (mirrorX !== x && mirrorX >= 0 && mirrorX < columns) {
				drawOneHalfBlock(foreground, mirrorX, y);
			}
		}
	};

	const drawOneGlyph = (charCode, foreground, x, y) => {
		const ctxIndex = Math.floor(y / 25);
		if (ctxIndex >= 0 && ctxIndex < Math.ceil(rows / 25)) {
			State.font.drawWithAlpha(
				charCode,
				foreground,
				getOrCreateCtx(ctxIndex),
				x,
				y % 25,
			);
		}
	};

	const drawGlyph = (charCode, foreground, x, y) => {
		drawOneGlyph(charCode, foreground, x, y);
		// commit mirroring lives in the editor core and flips the glyph;
		// the ghost has to match both the position and the flip
		if (State.textArtCanvas.getMirrorMode?.()) {
			const mirrorX = State.textArtCanvas.getMirrorX(x);
			if (mirrorX !== x && mirrorX >= 0 && mirrorX < columns) {
				drawOneGlyph(mirrorCharCode(charCode), foreground, mirrorX, y);
			}
		}
	};

	const clear = () => {
		for (let i = 0; i < ctxs.length; i++) {
			if (ctxs[i]) {
				ctxs[i].clearRect(0, 0, canvases[i].width, canvases[i].height);
			}
		}
	};

	updateDimensions();
	el.classList.add('enabled');

	document.addEventListener('onTextCanvasSizeChange', resize);
	document.addEventListener('onLetterSpacingChange', resize);
	document.addEventListener('onFontChange', resize);
	// Zoom dispatches onScaleFactorChange only (not onFontChange); without
	// this, the chunk canvases keep stale metrics and a preview crossing a
	// 25-row boundary draws its lower part into a mispositioned canvas
	document.addEventListener('onScaleFactorChange', resize);
	document.addEventListener('onOpenedFile', resize);

	return {
		clear: clear,
		drawHalfBlock: drawHalfBlock,
		drawGlyph: drawGlyph,
	};
};

const getUtf8Bytes = str => {
	return new TextEncoder().encode(str).length;
};

const enforceMaxBytes = () => {
	const SAUCE_MAX_BYTES = 16320;
	const sauceComments = $('sauceComments');
	let val = sauceComments.value;
	let bytes = getUtf8Bytes(val);
	while (bytes > SAUCE_MAX_BYTES) {
		val = val.slice(0, -1);
		bytes = getUtf8Bytes(val);
	}
	if (val !== sauceComments.value) {
		sauceComments.value = val;
	}
	$('sauceBytes').value = `${bytes}/${SAUCE_MAX_BYTES} bytes`;
};

const createResolutionController = (lbl, txtC, txtR) => {
	[
		'onTextCanvasSizeChange',
		'onFontChange',
		'onXBFontLoaded',
		'onOpenedFile',
	].forEach(e => {
		document.addEventListener(e, _ => {
			const cols = State.textArtCanvas.getColumns();
			const rows = State.textArtCanvas.getRows();
			lbl.innerText = `${cols}x${rows}`;
			txtC.value = cols;
			txtR.value = rows;
		});
	});
};

const createDragDropController = (handler, el) => {
	let dragCounter = 0;
	document.addEventListener('dragenter', e => {
		e.preventDefault();
		dragCounter++;
		el.style.display = 'flex';
	});
	document.addEventListener('dragover', e => {
		e.preventDefault();
	});
	document.addEventListener('dragleave', e => {
		e.preventDefault();
		dragCounter--;
		if (dragCounter === 0) {
			el.style.display = 'none';
		}
	});
	document.addEventListener('drop', e => {
		e.preventDefault();
		dragCounter = 0;
		el.style.display = 'none';
		// collab lockout: opening a file mid-session replaces the local
		// doc with content peers never see (the Open menu item is hidden
		// while connected for the same reason)
		if (State.network?.isConnected?.() === true) {
			return;
		}
		const files = e.dataTransfer?.files;
		if (files && files.length > 0) {
			handler(files[0]);
		}
	});
};

const createFontSelect = (el, lbl, img, btn) => {
	const listbox = el;
	const previewInfo = lbl;
	const previewImage = img;

	function getOptions() {
		return Array.from(listbox.querySelectorAll('[role="option"]'));
	}
	function getValue() {
		const selected = getOptions().find(
			opt => opt.getAttribute('aria-selected') === 'true',
		);
		return selected ? selected.dataset.value || selected.textContent : null;
	}
	function setValue(value) {
		const options = getOptions();
		const idx = options.findIndex(opt => opt.dataset.value === value);
		if (idx === -1) {
			return false;
		}
		updateSelection(idx);
		return true;
	}
	function setFocus() {
		setTimeout(() => {
			listbox.focus();
			const options = getOptions();
			const idx = options.findIndex(opt => opt.dataset.value === getValue());
			options[idx].scrollIntoView({ block: 'nearest' });
		}, 100);
	}
	function updateSelection(idx) {
		const options = getOptions();
		options.forEach((opt, i) => {
			const isSelected = i === idx;
			opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
			opt.classList.toggle('focused', isSelected);
		});
		listbox.setAttribute('aria-activedescendant', options[idx].id);
		options[idx].scrollIntoView({ block: 'nearest' });
		focusedIdx = idx;
		updateFontPreview(getValue());
	}
	async function updateFontPreview(fontName) {
		if (fontName === 'XBIN') {
			const xbFontData = State.textArtCanvas.getXBFontData();
			if (xbFontData && xbFontData.bytes) {
				const xbfont = await loadFontFromXBData(
					xbFontData.bytes,
					xbFontData.width,
					xbFontData.height,
					xbFontData.letterSpacing,
					State.palette,
				);
				const previewCanvas = createCanvas(
					xbFontData.width * 16,
					xbFontData.height * 16,
				);
				const previewCtx = previewCanvas.getContext('2d');
				const foreground = 15,
							background = 0;
				for (let y = 0, charCode = 0; y < 16; y++) {
					for (let x = 0; x < 16; x++, charCode++) {
						xbfont.draw(charCode, foreground, background, previewCtx, x, y);
					}
				}
				previewInfo.textContent =
					'XBIN: embedded ' + xbFontData.width + 'x' + xbFontData.height;
				previewImage.src = previewCanvas.toDataURL();
			} else {
				previewInfo.textContent = 'XBIN: none';
				previewImage.src = `${State.fontDir}missing.png`;
			}
		} else {
			const image = new Image();
			image.onload = () => {
				previewInfo.textContent = fontName;
				previewImage.src = image.src;
			};
			image.onerror = () => {
				previewInfo.textContent = fontName + ' (not found)';
				image.src = `${State.fontDir}missing.png`;
			};
			image.src = `${State.fontDir}${fontName}.png`;
		}
	}
	listbox.addEventListener('keydown', e => {
		const options = getOptions();
		if (e.key === 'ArrowDown' && focusedIdx < options.length - 1) {
			e.preventDefault();
			updateSelection(++focusedIdx);
		} else if (e.key === 'ArrowUp' && focusedIdx > 0) {
			e.preventDefault();
			updateSelection(--focusedIdx);
		} else if (e.key === 'Home') {
			e.preventDefault();
			updateSelection((focusedIdx = 0));
		} else if (e.key === 'End') {
			e.preventDefault();
			updateSelection((focusedIdx = options.length - 1));
		} else if (e.key === ' ' || e.key === 'Enter') {
			e.preventDefault();
			btn.click();
		}
	});
	getOptions().forEach((opt, i) => {
		opt.addEventListener('click', () => {
			updateSelection(i);
			updateFontPreview(getValue());
		});
	});
	listbox.addEventListener('focus', () => updateSelection(focusedIdx));
	listbox.addEventListener('blur', () =>
		getOptions().forEach(opt => opt.classList.remove('focused')));

	const FAVORITES_KEY = 'fontFavorites';
	const favorites = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY)) ?? [];
			return Array.isArray(parsed)
				? parsed.filter(value => typeof value === 'string')
				: [];
		} catch {
			return [];
		}
	};
	const saveFavorites = values => {
		try {
			localStorage.setItem(FAVORITES_KEY, JSON.stringify(values));
		} catch {
			// storage blocked: favorites just don't persist
		}
	};
	const originalOptionFor = value =>
		getOptions().find(
			opt =>
				!opt.classList.contains('favoriteOption') &&
				opt.dataset.value === value,
		);
	const rebuildFavorites = () => {
		const selected = getValue();
		listbox
			.querySelectorAll('.favoriteOption, .favoritesLabel')
			.forEach(node => node.remove());
		const values = favorites().filter(value => originalOptionFor(value));
		if (values.length > 0) {
			const label = document.createElement('li');
			label.className = 'groupLabel favoritesLabel';
			label.setAttribute('role', 'presentation');
			label.textContent = 'Favorites';
			const nodes = [label];
			values.forEach((value, i) => {
				const clone = originalOptionFor(value).cloneNode(true);
				clone.classList.add('favoriteOption');
				clone.classList.remove('focused');
				clone.id = `fontFav-${i}`;
				clone.setAttribute('aria-selected', 'false');
				clone.addEventListener('click', () => {
					updateSelection(getOptions().indexOf(clone));
				});
				nodes.push(clone);
			});
			listbox.prepend(...nodes);
		}
		if (selected !== null) {
			setValue(selected);
		}
	};
	const toggleFavorite = () => {
		const value = getValue();
		if (value === null) {
			return false;
		}
		const values = favorites();
		const at = values.indexOf(value);
		if (at >= 0) {
			values.splice(at, 1);
		} else {
			values.push(value);
		}
		saveFavorites(values);
		rebuildFavorites();
		return values.includes(value);
	};
	const isFavorite = () => favorites().includes(getValue());

	let focusedIdx = getOptions().findIndex(
		opt => opt.getAttribute('aria-selected') === 'true',
	);
	if (focusedIdx < 0) {
		focusedIdx = 0;
	}
	updateSelection(focusedIdx);
	updateFontPreview(getValue());
	rebuildFavorites();

	return {
		focus: setFocus,
		getValue: getValue,
		setValue: setValue,
		toggleFavorite: toggleFavorite,
		isFavorite: isFavorite,
	};
};

/**
 * Routed through the zoom controller so pinch, wheel, keys, and
 * buttons all share the same clamped stepping and focal anchoring.
 */
const createZoomControl = () => {
	const zoomOut = $('zoomOut');
	const zoomIn = $('zoomIn');
	const display = $('zoomValue');
	if (!zoomOut || !zoomIn || !display) {
		return null;
	}

	const format = scale =>
		`${Number.isInteger(scale) ? scale : parseFloat(scale.toFixed(2))}x`;

	const current = () => State.font?.getScaleFactor?.() ?? 1;

	const refresh = () => {
		display.textContent = format(current());
	};

	const nudge = direction => {
		const zoom = getZoomController();
		if (zoom) {
			if (direction > 0) {
				zoom.zoomIn();
			} else {
				zoom.zoomOut();
			}
		} else if (State.font?.setScaleFactor) {
			State.font.setScaleFactor(
				Math.min(4, Math.max(0.5, current() + direction * 0.5)),
			);
		}
		refresh();
		if (State.saveToLocalStorage) {
			State.saveToLocalStorage();
		}
	};

	zoomOut.addEventListener('click', () => nudge(-1));
	zoomIn.addEventListener('click', () => nudge(1));

	State.waitFor('font', refresh);
	document.addEventListener('onStateRestorationComplete', refresh);
	// pinch and wheel zoom change the scale outside the buttons; mirror it
	document.addEventListener('onScaleFactorChange', refresh);

	const handleKeyboardZoom = e => {
		if ((e.ctrlKey || e.metaKey) && e.key === '=') {
			e.preventDefault();
			nudge(1);
		} else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
			e.preventDefault();
			nudge(-1);
		}
	};
	document.addEventListener('keydown', handleKeyboardZoom);

	refresh();
	return { refresh: refresh };
};

const websocketUI = show => {
	// one attribute, the stylesheet does the rest: inline display
	// writes cannot both hide and reveal elements whose own rules set
	// display (the chat button is a flex column in the sauce panel)
	D.documentElement.dataset.collab = show ? 'on' : 'off';
};

export {
	$,
	$$,
	$$$,
	createCanvas,
	toggleFullscreen,
	armFullscreenIcon,
	createModalController,
	createSettingToggle,
	onClick,
	onEnter,
	onReturn,
	onFileChange,
	createPositionInfo,
	undoAndRedo,
	isTextEntry,
	viewportTap,
	createPaintShortcuts,
	createSegmentedControl,
	iconHref,
	iconSvg,
	remountUse,
	remountUses,
	createGrid,
	createToolPreview,
	enforceMaxBytes,
	createResolutionController,
	createDragDropController,
	createFontSelect,
	createZoomControl,
	websocketUI,
};
