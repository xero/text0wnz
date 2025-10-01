import { defineConfig, loadEnv } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';
import Sitemap from 'vite-plugin-sitemap';
import path from 'node:path';

function getBuildVersion() {
	return Date.now().toString();
	// return require('child_process').execSync('git rev-parse HEAD').toString().trim();
}

export default ({ mode }) => {
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
	const domain = process.env.VITE_DOMAIN || 'https://text.0w.nz';
	console.log("Building for domain: ", domain);
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
							case 'icons.svg': res = 'ui/icons-[hash].svg'; break;
							case 'favicon-96x96.png': res = 'ui/favicon-96x96.png'; break;
							case 'favicon.ico': res = 'ui/favicon.ico'; break;
							case 'favicon.svg': res = 'ui/favicon.svg'; break;
							case 'logo.png': res = 'ui/logo.png'; break;
							case 'topazplus_1200.woff2': res = 'ui/topazplus_1200.woff2'; break;
							case 'apple-touch-icon.png': res = 'ui/apple-touch-icon.png'; break;
							case 'android-launchericon-48-48.png': res = 'ui/android-launchericon-48-48.png'; break;
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
				manifestFilename: 'site.webmanifest',
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
					name: 'teXt0wnz',
					short_name: 'teXt0wnz',
					start_url: '/',
					scope: '/',
					display: 'standalone',
					description: 'The online collaborative text art editor. Supporting CP437 ANSI/ASCII, Scene NFO, XBIN/BIN, & UTF8 TXT file types',
					dir: 'ltr',
					lang: 'en',
					orientation: 'any',
					background_color: '#000',
					theme_color: '#000',
					icons: [{
						src: '/ui/web-app-manifest-512x512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable'
					}, {
						src: '/ui/web-app-manifest-192x192.png',
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable'
					}, {
						src: 'ui/apple-touch-icon.png',
						sizes: '180x180',
						type: 'image/png',
						purpose: 'maskable'
					}, {
						src: '/ui/favicon-96x96.png',
						sizes: '96x96',
						type: 'image/png',
						purpose: 'any',
					}, {
						src: '/ui/android-launchericon-48-48.png',
						sizes: '48x48',
						type: 'image/png',
						purpose: 'any',
					}],
					version: getBuildVersion(),
				},
				workbox: {
					cleanupOutdatedCaches: true,
					clientsClaim: true,
					skipWaiting: true,
					navigateFallbackDenylist: [
						/^\/humans.txt/,
						/^\/robots.txt/,
						/^\/sitemap.xml/,
					],
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
						}, {
							urlPattern: /^\/ui\/.*\.(js|css)$/,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'dynamic-cache',
							},
						}, {
							urlPattern: /^\/(index\.html)?$/,
							handler: 'NetworkFirst',
							options: {
								cacheName: 'html-cache',
							},
						},
					],
				},
			}),
			Sitemap({
				hostname: domain,
				generateRobotsTxt: true,
				changefreq: 'monthly',
				robots: [
					{ userAgent: 'Ai2Bot-Dolma', disallow: '/' },
					{ userAgent: 'BLEXBot', disallow: '/' },
					{ userAgent: 'Barkrowler', disallow: '/' },
					{ userAgent: 'Brightbot 1.0', disallow: '/' },
					{ userAgent: 'Bytespider', disallow: '/' },
					{ userAgent: 'CCBot', disallow: '/' },
					{ userAgent: 'CazoodleBot', disallow: '/' },
					{ userAgent: 'Crawlspace', disallow: '/' },
					{ userAgent: 'DOC', disallow: '/' },
					{ userAgent: 'Diffbot', disallow: '/' },
					{ userAgent: 'Download Ninja', disallow: '/' },
					{ userAgent: 'Fetch', disallow: '/' },
					{ userAgent: 'FriendlyCrawler', disallow: '/' },
					{ userAgent: 'Gigabot', disallow: '/' },
					{ userAgent: 'Go-http-client', disallow: '/' },
					{ userAgent: 'HTTrack', disallow: '/' },
					{ userAgent: 'ICC-Crawler', disallow: '/' },
					{ userAgent: 'ISSCyberRiskCrawler', disallow: '/' },
					{ userAgent: 'ImagesiftBot', disallow: '/' },
					{ userAgent: 'IsraBot', disallow: '/' },
					{ userAgent: 'Kangaroo Bot', disallow: '/' },
					{ userAgent: 'MJ12bot', disallow: '/' },
					{ userAgent: 'MSIECrawler', disallow: '/' },
					{ userAgent: 'Mediapartners-Google*', disallow: '/' },
					{ userAgent: 'Meta-ExternalAgent', disallow: '/' },
					{ userAgent: 'Meta-ExternalFetcher', disallow: '/' },
					{ userAgent: 'Microsoft.URL.Control', disallow: '/' },
					{ userAgent: 'NPBot', disallow: '/' },
					{ userAgent: 'Node/simplecrawler', disallow: '/' },
					{ userAgent: 'Nuclei', disallow: '/' },
					{ userAgent: 'Offline Explorer', disallow: '/' },
					{ userAgent: 'Orthogaffe', disallow: '/' },
					{ userAgent: 'PanguBot', disallow: '/' },
					{ userAgent: 'PetalBot', disallow: '/' },
					{ userAgent: 'Riddler', disallow: '/' },
					{ userAgent: 'Scrapy', disallow: '/' },
					{ userAgent: 'SemrushBot-OCOB', disallow: '/' },
					{ userAgent: 'SemrushBot-SWA', disallow: '/' },
					{ userAgent: 'Sidetrade indexer bot', disallow: '/' },
					{ userAgent: 'SiteSnagger', disallow: '/' },
					{ userAgent: 'Teleport', disallow: '/' },
					{ userAgent: 'TeleportPro', disallow: '/' },
					{ userAgent: 'Timpibot', disallow: '/' },
					{ userAgent: 'UbiCrawler', disallow: '/' },
					{ userAgent: 'VelenPublicWebCrawler', disallow: '/' },
					{ userAgent: 'WebCopier', disallow: '/' },
					{ userAgent: 'WebReaper', disallow: '/' },
					{ userAgent: 'WebStripper', disallow: '/' },
					{ userAgent: 'WebZIP', disallow: '/' },
					{ userAgent: 'Webzio-Extended', disallow: '/' },
					{ userAgent: 'WikiDo', disallow: '/' },
					{ userAgent: 'Xenu', disallow: '/' },
					{ userAgent: 'YouBot', disallow: '/' },
					{ userAgent: 'Zao', disallow: '/' },
					{ userAgent: 'Zealbot', disallow: '/' },
					{ userAgent: 'Zoominfobot', disallow: '/' },
					{ userAgent: 'ZyBORG', disallow: '/' },
					{ userAgent: 'cohere-ai', disallow: '/' },
					{ userAgent: 'cohere-training-data-crawler', disallow: '/' },
					{ userAgent: 'dotbot/1.0', disallow: '/' },
					{ userAgent: 'fast', disallow: '/' },
					{ userAgent: 'grub-client', disallow: '/' },
					{ userAgent: 'iaskspider/2.0', disallow: '/' },
					{ userAgent: 'img2dataset', disallow: '/' },
					{ userAgent: 'imgproxy', disallow: '/' },
					{ userAgent: 'k2spider', disallow: '/' },
					{ userAgent: 'larbin', disallow: '/' },
					{ userAgent: 'libwww', disallow: '/' },
					{ userAgent: 'linko', disallow: '/' },
					{ userAgent: 'magpie-crawler', disallow: '/' },
					{ userAgent: 'omgili', disallow: '/' },
					{ userAgent: 'omgilibot', disallow: '/' },
					{ userAgent: 'sitecheck.internetseer.com', disallow: '/' },
					{ userAgent: 'wget', disallow: '/' },
				],
			}),
			viteStaticCopy({
				targets: [
					{ src: `js/client/${process.env.VITE_WORKER_FILE}`, dest: process.env.VITE_UI_DIR },
					{ src: 'fonts', dest: process.env.VITE_UI_DIR },
					{ src: 'img/favicon.ico', dest: '.' },
					{ src: 'humans.txt', dest: '.' },
				],
			}),
		],
	});
};
