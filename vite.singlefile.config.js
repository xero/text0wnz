import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import path from 'node:path';

/**
 * Singlefile-lite souvenir build (PLAN 3.7 #5, souvenir ONLY): the
 * app shell (js + css) inlined into one index.html under
 * dist-singlefile/, ~640KB. Limitations, by design:
 * - fonts and the unicode hex blocks load at runtime, so glyphs render
 *   when the file sits next to a ui/fonts directory (copy one from a
 *   full build) or is served over http
 * - the workers emit as small sidecar files (workers cannot inline):
 *   without them collab stays off and autosave falls back to
 *   IndexedDB, both graceful paths
 * - icons.svg rides as a sidecar (SVG <use> references)
 * - no PWA bits (service worker, manifest), deliberately
 *
 *   bun run bake:singlefile
 */
export default defineConfig({
	root: './src',
	base: './',
	build: {
		emptyOutDir: true,
		outDir: '../dist-singlefile',
		assetsDir: '',
		target: 'es2022',
		minify: 'terser',
		sourcemap: false,
		rolldownOptions: {
			input: {
				index: path.resolve('./src', 'index.html'),
			},
		},
	},
	plugins: [viteSingleFile()],
});
