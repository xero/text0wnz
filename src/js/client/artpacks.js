import State from './state.js';
import { $ } from './ui.js';

const createArtpacksLanding = ({ sixteen, arena }) => {
	const cardSixteen = $('artpacksSixteen');
	const cardArena = $('artpacksArena');
	if (!cardSixteen || !cardArena) {
		return null;
	}

	/** @type {'sixteen'|'arena'|null} where browsing last left off */
	let current = null;

	// the site browsers open their own modal section, replacing the
	// landing in place with no close transition between them
	cardSixteen.addEventListener('click', () => {
		current = 'sixteen';
		sixteen?.show();
	});
	cardArena.addEventListener('click', () => {
		current = 'arena';
		arena?.show();
	});
	$('artpacksClose')?.addEventListener('click', () => State.modal.close());

	const showLanding = () => {
		current = null;
		State.modal.open('artpacks');
	};

	const show = () => {
		if (current === 'sixteen') {
			sixteen?.show();
		} else if (current === 'arena') {
			arena?.show();
		} else {
			showLanding();
		}
	};

	return { show, showLanding };
};

export { createArtpacksLanding };
