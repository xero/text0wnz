import tailwindcss from '@tailwindcss/postcss';
import cssnano from 'cssnano';

export default {
	plugins: [
		tailwindcss,
		cssnano({
			preset: ['advanced', {
				convertValues: {
					length: false,
					time: true,
				},
				discardComments: {
					removeAll: true,
				},
				normalizeCharset: {
					add: false,
				},
				// the panel stack assigns z-index inline from js, so rebasing
				// the stylesheet's values breaks the layering contract
				zindex: false
			}],
		}),
	],
};
