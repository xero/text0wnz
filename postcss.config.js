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
				zindex: {
					startIndex: 1,
				}
			}],
		}),
	],
};
