import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';
import path from 'node:path';

export default defineConfig({
	root: './src',
	build: {
		emptyOutDir: true,
		outDir: '../dist',
		assetsDir: '', // Place all assets in the root of `outDir`
		assetsInlineLimit: 0, // Prevent inlined assets
		target: 'es2022',
		sourcemap: process.env.NODE_ENV !== 'production',
		rollupOptions: {
			input: {
				index: path.resolve('./src', 'index.html'),
			},
			output: {
				entryFileNames: 'ui/editor-[hash].js',
				assetFileNames: (assetInfo) => {
					if (!assetInfo.names || assetInfo.names.length < 1) return '';
					const info = assetInfo.names[0].split('.');
					const ext = info[info.length - 1];
					let res = null;
					switch (assetInfo.names[0]) {
						case 'index.css': res = 'ui/stylez-[hash].css'; break;
						case 'apple-touch-icon.png': res = 'ui/apple-touch-icon.png'; break;
						case 'chat.png': res = 'ui/chat.png'; break;
						case 'done.png': res = 'ui/done.png'; break;
						case 'face.png': res = 'ui/face.png'; break;
						case 'favicon-96x96.png': res = 'ui/favicon-96x96.png'; break;
						case 'favicon.ico': res = 'ui/favicon.ico'; break;
						case 'favicon.svg': res = 'ui/favicon.svg'; break;
						case 'icons.svg': res = 'ui/icons-[hash].svg'; break;
						case 'move_border.gif': res = 'ui/move_border.gif'; break;
						case 'selection_border.gif': res = 'ui/selection_border.gif'; break;
						case 'site.webmanifest': res = 'ui/site.webmanifest'; break;
						case 'web-app-manifest-192x192.png': res = 'ui/web-app-manifest-192x192.png'; break;
						case 'web-app-manifest-512x512.png': res = 'ui/web-app-manifest-512x512.png'; break;
					}
					if (res) {
						return res;
					}
					if (/\.(png|jpe?g|gif|svg|webp|webm|mp3)$/.test(assetInfo.names[0])) {
						return `ui/img/[name]-[hash].${ext}`;
					}
					if (/\.(woff|woff2|eot|ttf|otf)$/.test(assetInfo.names[0])) {
						return `ui/fonts/[name]-[hash].${ext}`;
					}
					return `ui/[name]-[hash].${ext}`;
				},
			},
		},
	},
	plugins: [
		viteStaticCopy({
			targets: [
				{ src: 'js/client/worker.js', dest: 'ui' },
				{ src: 'fonts', dest: 'ui' },
			],
		}),
	],
});
