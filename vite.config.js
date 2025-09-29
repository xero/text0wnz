import { defineConfig, loadEnv } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

// Utility to get a version string (timestamp or git commit hash)
function getBuildVersion() {
	// Use timestamp for simplicity, or uncomment for git commit hash
	return Date.now().toString();
	// return require('child_process').execSync('git rev-parse HEAD').toString().trim();
}

export default ({ mode }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
	return defineConfig({
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
					entryFileNames: 'ui/editor.js',
					assetFileNames: (assetInfo) => {
						if (!assetInfo.names || assetInfo.names.length < 1) return '';
						const info = assetInfo.names[0].split('.');
						const ext = info[info.length - 1];
						let res = null;
						switch (assetInfo.names[0]) {
							case 'index.css': res = 'ui/stylez.css'; break;
							case 'icons.svg': res = 'ui/icons.svg'; break;
							case 'favicon-96x96.png': res = 'ui/favicon-96x96.png'; break;
							case 'favicon.ico': res = 'ui/favicon.ico'; break;
							case 'favicon.svg': res = 'ui/favicon.svg'; break;
							case 'logo.png': res = 'ui/logo.png'; break;
							case 'topazplus_1200.woff2': res = 'ui/topazplus_1200.woff2'; break;
							case 'apple-touch-icon.png': res = 'ui/apple-touch-icon.png'; break;
							case 'web-app-manifest-192x192.png': res = 'ui/web-app-manifest-192x192.png'; break;
							case 'web-app-manifest-512x512.png': res = 'ui/web-app-manifest-512x512.png'; break;
						}
						if (res) {
							return res;
						}
						return `ui/[name]-[hash].${ext}`;
					},
				},
			},
		},
		plugins: [
			VitePWA({
				filename: 'service.js',
				manifestFilename: 'ui/manifest.webmanifest',
				registerType: 'autoUpdate',
				injectRegister: false,
				includeAssets: [
					'apple-touch-icon.png',
					'favicon.ico',
					'favicon.svg',
					'favicon-96x96.png',
					'icons.svg',
					'logo.png',
					'topazplus_1200.woff2',
					'web-app-manifest-192x192.png',
					'web-app-manifest-512x512.png',
					process.env.VITE_WORKER_FILE ? `js/client/${process.env.VITE_WORKER_FILE}` : undefined
				].filter(Boolean),
				manifest: {
					name: "teXt.0w.nz",
					short_name: "teXt0wnz",
					start_url: ".",
					display: "standalone",
					background_color: "#000",
					theme_color: "#000",
					icons: [{
						src: "/ui/web-app-manifest-192x192.png",
						sizes: "192x192",
						type: "image/png",
						purpose: "maskable"
					}, {
						src: "/ui/web-app-manifest-512x512.png",
						sizes: "512x512",
						type: "image/png",
						purpose: "maskable"
					}, {
						src: "ui/apple-touch-icon.png",
						sizes: "180x180",
						type: "image/png",
						purpose: "maskable"
					}],
					version: getBuildVersion(),
				},
				workbox: {
					cleanupOutdatedCaches: true,
					clientsClaim: true,
					skipWaiting: true,
					runtimeCaching: [
						{
							urlPattern: /^\/ui\/.*\.(png|svg|gif|woff2?|ttf|otf)$/,
							handler: 'StaleWhileRevalidate',
							options: {
								cacheName: 'asset-cache',
								expiration: {
									maxEntries: 50,
									maxAgeSeconds: 7 * 24 * 60 * 60,
								},
							},
						},
						{
							urlPattern: /^\/ui\/.*\.(js|css)$/,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'dynamic-cache',
							},
						},
						{
							urlPattern: /^\/(index\.html)?$/,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'html-cache',
							},
						},
					],
				},
			}),
			viteStaticCopy({
				targets: [
					{ src: `js/client/${process.env.VITE_WORKER_FILE}`, dest: process.env.VITE_UI_DIR },
					{ src: 'fonts', dest: process.env.VITE_UI_DIR },
				],
			}),
		],
	});
};
