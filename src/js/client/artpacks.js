/**
 * Artpack browser landing: one File menu entry fronts both artpack
 * sites; each card hands off to that site's own browser modal.
 */
import State from './state.js';
import { $ } from './ui.js';

const createArtpacksLanding = ({ sixteen, arena }) => {
	const cardSixteen = $('artpacksSixteen');
	const cardArena = $('artpacksArena');
	if (!cardSixteen || !cardArena) {
		return null;
	}

	// the site browsers open their own modal section, replacing the
	// landing in place with no close transition between them
	cardSixteen.addEventListener('click', () => sixteen?.show());
	cardArena.addEventListener('click', () => arena?.show());
	$('artpacksClose')?.addEventListener('click', () => State.modal.close());

	const show = () => State.modal.open('artpacks');

	return { show };
};

export { createArtpacksLanding };
