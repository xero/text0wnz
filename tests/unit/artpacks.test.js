/**
 * Artpack browser landing: the single File menu entry opens a picker
 * whose two cards hand off to the 16colo.rs and asciiarena.se
 * browsers, swapping modal sections in place.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createArtpacksLanding } from '../../src/js/client/artpacks.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({ default: { modal: { open: vi.fn(), close: vi.fn() } } }));

const MARKUP = `
	<button id="artpacksSixteen"></button>
	<button id="artpacksArena"></button>
	<button id="artpacksBack" disabled></button>
	<button id="artpacksClose"></button>
`;

describe('artpacks landing', () => {
	let sixteen;
	let arena;
	let landing;

	beforeEach(() => {
		document.body.innerHTML = MARKUP;
		sixteen = { show: vi.fn() };
		arena = { show: vi.fn() };
		landing = createArtpacksLanding({ sixteen, arena });
	});

	afterEach(() => {
		vi.clearAllMocks();
		document.body.innerHTML = '';
	});

	it('opens the artpacks modal on show', () => {
		landing.show();
		expect(State.modal.open).toHaveBeenCalledWith('artpacks');
	});

	it('routes each card to its site browser', () => {
		document.getElementById('artpacksSixteen').click();
		expect(sixteen.show).toHaveBeenCalledTimes(1);
		expect(arena.show).not.toHaveBeenCalled();
		document.getElementById('artpacksArena').click();
		expect(arena.show).toHaveBeenCalledTimes(1);
	});

	it('closes the modal from the close button', () => {
		document.getElementById('artpacksClose').click();
		expect(State.modal.close).toHaveBeenCalledTimes(1);
	});

	it('returns null when the landing markup is missing', () => {
		document.body.innerHTML = '';
		expect(createArtpacksLanding({ sixteen, arena })).toBeNull();
	});
});
