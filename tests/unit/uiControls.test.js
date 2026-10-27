import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	enforceMaxBytes,
	websocketUI,
	toggleFullscreen,
	armFullscreenIcon,
	createModalController,
} from '../../src/js/client/ui.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		textArtCanvas: {
			undo: vi.fn(),
			redo: vi.fn(),
			getColumns: vi.fn(() => 80),
			getRows: vi.fn(() => 25),
		},
		palette: {
			getForegroundColor: vi.fn(() => 7),
			getBackgroundColor: vi.fn(() => 0),
			setForegroundColor: vi.fn(),
		},
		font: {
			getWidth: vi.fn(() => 8),
			getHeight: vi.fn(() => 16),
			draw: vi.fn(),
			drawWithAlpha: vi.fn(),
		},
		network: { isConnected: vi.fn(() => false) },
		menus: { close: vi.fn() },
	},
}));

describe('UI Controls and Controllers', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
		vi.clearAllMocks();
	});

	afterEach(() => {
		document.body.innerHTML = '';
		vi.restoreAllMocks();
	});

	describe('enforceMaxBytes', () => {
		it('should truncate comments when they exceed max bytes', () => {
			const sauceComments = document.createElement('textarea');
			sauceComments.id = 'sauceComments';
			sauceComments.value = 'x'.repeat(20000); // Way over the limit

			const sauceBytes = document.createElement('input');
			sauceBytes.id = 'sauceBytes';

			document.body.appendChild(sauceComments);
			document.body.appendChild(sauceBytes);

			enforceMaxBytes();

			expect(sauceComments.value.length).toBeLessThanOrEqual(16320);
			expect(sauceBytes.value).toMatch(/\d+\/16320 bytes/);
		});

		it('should not modify comments when under max bytes', () => {
			const originalValue = 'Short comment';
			const sauceComments = document.createElement('textarea');
			sauceComments.id = 'sauceComments';
			sauceComments.value = originalValue;

			const sauceBytes = document.createElement('input');
			sauceBytes.id = 'sauceBytes';

			document.body.appendChild(sauceComments);
			document.body.appendChild(sauceBytes);

			enforceMaxBytes();

			expect(sauceComments.value).toBe(originalValue);
		});
	});

	describe('websocketUI', () => {
		// the stylesheet gates .includedForWebsocket and
		// .excludedForWebsocket on this one attribute; inline display
		// writes are gone (they lost to the sauce panel's id rule)
		it('marks the document collab-on when show is true', () => {
			websocketUI(true);
			expect(document.documentElement.dataset.collab).toBe('on');
		});

		it('marks the document collab-off when show is false', () => {
			websocketUI(false);
			expect(document.documentElement.dataset.collab).toBe('off');
		});
	});

	describe('toggleFullscreen', () => {
		it('should request fullscreen when not in fullscreen', () => {
			document.fullscreenEnabled = true;
			document.fullscreenElement = null;
			document.documentElement.requestFullscreen = vi.fn();

			toggleFullscreen();

			expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
		});

		it('should exit fullscreen when in fullscreen', () => {
			document.fullscreenEnabled = true;
			document.fullscreenElement = document.documentElement;
			document.exitFullscreen = vi.fn();

			toggleFullscreen();

			expect(document.exitFullscreen).toHaveBeenCalled();
		});
	});

	describe('armFullscreenIcon', () => {
		const makeChip = () => {
			const button = document.createElement('div');
			const svg = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'svg',
			);
			const use = document.createElementNS(
				'http://www.w3.org/2000/svg',
				'use',
			);
			use.setAttribute('href', 'img/icons.svg#expand');
			svg.appendChild(use);
			button.appendChild(svg);
			return button;
		};

		// the helper remounts the use node (the iPadOS swap fix), so
		// assertions re-query it and stay agnostic of the baked base
		const href = button => button.querySelector('use').getAttribute('href');

		it('follows the document fullscreen state, not the click', () => {
			const button = makeChip();
			document.fullscreenElement = null;
			armFullscreenIcon(button);
			expect(href(button)).toContain('#expand');
			const mounted = button.querySelector('use');
			// F11 or an OS gesture: no button click, the event alone
			document.fullscreenElement = document.documentElement;
			document.dispatchEvent(new Event('fullscreenchange'));
			expect(href(button)).toContain('#contract');
			// the swap remounted the node instead of mutating it in place
			expect(button.querySelector('use')).not.toBe(mounted);
			document.fullscreenElement = null;
			document.dispatchEvent(new Event('fullscreenchange'));
			expect(href(button)).toContain('#expand');
		});

		it('syncs the glyph at arm time for a browser already fullscreen', () => {
			const button = makeChip();
			document.fullscreenElement = document.documentElement;
			armFullscreenIcon(button);
			expect(href(button)).toContain('#contract');
			document.fullscreenElement = null;
		});
	});

	describe('createModalController', () => {
		it('should create modal controller with required methods', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'charset',
				'export',
				'artpacks',
				'sixteen',
				'arena',
				'archive',
				'plugin',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}Modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const controller = createModalController(modal);

			expect(controller).toHaveProperty('isOpen');
			expect(controller).toHaveProperty('open');
			expect(controller).toHaveProperty('close');
			expect(controller).toHaveProperty('error');
			expect(controller).toHaveProperty('focusEvents');
		});

		it('should open specified modal', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			const aboutModal = document.createElement('div');
			aboutModal.id = 'aboutModal';
			aboutModal.classList.add('hide');
			document.body.appendChild(aboutModal);

			[
				'resize',
				'fonts',
				'sauce',
				'charset',
				'export',
				'artpacks',
				'sixteen',
				'arena',
				'archive',
				'plugin',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}Modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const controller = createModalController(modal);
			controller.open('about');

			expect(aboutModal.classList.contains('hide')).toBe(false);
			expect(modal.showModal).toHaveBeenCalled();
		});

		it('should close modal after timeout', () => {
			vi.useFakeTimers();

			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();
			modal.open = false;

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'charset',
				'export',
				'artpacks',
				'sixteen',
				'arena',
				'archive',
				'plugin',
				'choice',
				'update',
				'loading',
				'warning',
				'tutorials',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}Modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const controller = createModalController(modal);

			controller.open('about');
			controller.close();

			vi.advanceTimersByTime(800);

			expect(modal.close).toHaveBeenCalled();

			vi.useRealTimers();
		});

		it('should handle error messages', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'charset',
				'export',
				'artpacks',
				'sixteen',
				'arena',
				'archive',
				'plugin',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}Modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const errorModal = document.createElement('div');
			errorModal.id = 'errorModal';
			errorModal.classList.add('hide');
			document.body.appendChild(errorModal);

			const controller = createModalController(modal);
			controller.error('Test error message');

			expect(modalError.innerHTML).toBe('Test error message');
		});

		it('should handle focus events', () => {
			const modal = document.createElement('dialog');
			modal.showModal = vi.fn();
			modal.close = vi.fn();

			[
				'about',
				'resize',
				'fonts',
				'sauce',
				'charset',
				'export',
				'artpacks',
				'sixteen',
				'arena',
				'archive',
				'plugin',
				'websocket',
				'choice',
				'update',
				'loading',
				'warning',
			].forEach(name => {
				const section = document.createElement('div');
				section.id = `${name}Modal`;
				section.classList.add('hide');
				document.body.appendChild(section);
			});

			const modalError = document.createElement('div');
			modalError.id = 'modalError';
			document.body.appendChild(modalError);

			const onFocus = vi.fn();
			const onBlur = vi.fn();

			const controller = createModalController(modal);
			controller.focusEvents(onFocus, onBlur);

			const aboutModal = document.createElement('div');
			aboutModal.id = 'aboutModal';
			aboutModal.classList.add('hide');
			document.body.appendChild(aboutModal);

			controller.open('about');
			expect(onFocus).toHaveBeenCalled();
		});
	});
});
