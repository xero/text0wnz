import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';
import Sitemap from 'vite-plugin-sitemap';
import htmlMinifierTerser from "vite-plugin-html-minifier-terser";
import { existsSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';

export default ({ mode }) => {
	const cacheBuster = () => Date.now().toString();

	// load settings from the .env file or use defaults
	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
	const domain = process.env.VITE_DOMAIN || 'https://text.0w.nz';
	const worker = process.env.VITE_WORKER_FILE || 'websocket.js';
	const uiDir = ((process.env.VITE_UI_DIR || 'ui').replace(/^\/|\/?$/g, '')) + '/';
	const uiDirSafe = uiDir.slice(0, -1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

	return defineConfig({
		root: './src',
		base: './', // output relative urls
		build: {
			emptyOutDir: true,
			outDir: '../dist',
			assetsDir: '', // place all assets relatively to the root of `outDir`
			assetsInlineLimit: 0, // prevent inlined assets
			target: 'es2022',
			minify: 'terser',
			terserOptions: {
				compress: {
					drop_console: false
				}
			},
			sourcemap: process.env.NODE_ENV !== 'production',
			rollupOptions: {
				input: {
					index: path.resolve('./src', 'index.html'),
				},
				output: {
					// hash core file names for cache busting
					entryFileNames: `${uiDir}js/editor-[hash].js`,
					chunkFileNames: `${uiDir}js/[name]-[hash].js`,
					assetFileNames: assetInfo => {
						const assetName = assetInfo.name || assetInfo.names?.[0];
						if (!assetName) return '';
						const info = assetName.split('.');
						const ext = info[info.length - 1];
						// explicit file placement
						if (assetName === 'index.css') {
							return `${uiDir}stylez-[hash].css`;
						}
						if (assetName === 'icons.svg') {
							return `${uiDir}icons-[hash].svg`;
						}
						if (/\.(png|ico|svg)$/.test(assetName)) {
							return `${uiDir}img/[name].${ext}`;
						}
						return `${uiDir}[name].${ext}`;
					},
					// progressively load features
					manualChunks: {
						core: [
							'src/js/client/magicNumbers.js',
							'src/js/client/state.js',
							'src/js/client/storage.js',
							'src/js/client/compression.js',
							'src/js/client/ui.js',
						],
						canvas: [
							'src/js/client/canvas.js',
							'src/js/client/font.js',
							'src/js/client/lazyFont.js',
							'src/js/client/fontCache.js',
						],
						tools: [
							'src/js/client/freehandTools.js',
							'src/js/client/keyboard.js',
							'src/js/client/toolbar.js',
						],
						fileops: ['src/js/client/file.js'],
						network: ['src/js/client/network.js'],
						palette: ['src/js/client/palette.js'],
					}
				},
			},
		},
		plugins: [
			{
				name: 'log-postcss',
				apply: 'build',
				originalCssSize: 0,
				buildStart() {
					const srcCssPath = path.resolve('./src/css', 'style.css');
					if (existsSync(srcCssPath)) {
						const srcStats = statSync(srcCssPath);
						this.originalCssSize = srcStats.size;
					}
				},
				closeBundle() {
					const distCssDir = path.resolve('./dist/ui');
					if (existsSync(distCssDir)) {
						const files = readdirSync(distCssDir);
						const cssFile = files.find(f => f.startsWith('stylez-') && f.endsWith('.css'));

						if (cssFile) {
							const minified = statSync(path.join(distCssDir, cssFile)).size;
							const savings = ((1 - minified / this.originalCssSize) * 100).toFixed(1);
							console.log(`\n\x1b[36m[PostCSS] \x1b[0mBuilding stylesheet\n\x1b[32m✓ \x1b[34mtailwindcss\n\x1b[32m✓ \x1b[34mcssnano \x1b[35m(preset: advanced)\x1b[0m`);
							console.log(`../dist/ui/\x1b[32m${cssFile}\x1b[0m: \x1b[33m${(this.originalCssSize / 1024).toFixed(2)}kb\x1b[0m → \x1b[32m${(minified / 1024).toFixed(2)}kb\x1b[0m (\x1b[36m${savings}% reduction\x1b[0m)\n`);
						}
					}
				}
			},
			htmlMinifierTerser({
				minify: true,
				html5: true,
				quoteCharacter: '"',
				keepClosingSlash: false,
				removeAttributeQuotes: true,
				removeComments: false,
				removeEmptyElements: false,
				removeScriptTypeAttributes: false,
				removeStyleLinkTypeAttributes: false,
			}),
			{
				name: 'log-html-minifier',
				apply: 'build',
				originalSize: 0,
				buildStart() {
					const srcPath = path.resolve('./src', 'index.html');
					const srcStats = statSync(srcPath);
					this.originalSize = srcStats.size;
				},
				closeBundle() {
					const minifiedPath = path.resolve('./dist', 'index.html');
					if (existsSync(minifiedPath)) {
						const minified = statSync(minifiedPath).size;
						const savings = ((1 - minified / this.originalSize) * 100).toFixed(1);
						console.log(`\x1b[36m[htmlMinifierTerser] \x1b[0mCompressing index`);
						console.log(`../dist/\x1b[32mindex.html\x1b[0m: \x1b[33m${(this.originalSize / 1024).toFixed(2)}kb\x1b[0m → \x1b[32m${(minified / 1024).toFixed(2)}kb\x1b[0m (\x1b[36m${savings}% reduction\x1b[0m)\n`);
					}
				}
			},
			viteStaticCopy({
				// move static assets into place
				silent: true,
				targets: [
					{ src: 'LICENSE.txt', dest: '.' },
					{ src: 'humans.txt', dest: '.' },
					{ src: 'img/manifest/favicon.ico', dest: '.' },
					{ src: 'fonts', dest: uiDir },
					{ src: `js/client/${worker}`, dest: uiDir + 'js/' },
				],
			}),
			{
				name: 'log-static-copy',
				apply: 'build',
				originalSize: 0,
				closeBundle() {
					console.log(`\x1b[36m[vite-static-copy] \x1b[0mMoving 5 files recursively`);
					console.log(`../dist/\x1b[32mLICENSE.txt\n\x1b[0m../dist/\x1b[32mhumans.txt\n\x1b[0m../dist/\x1b[32mfavicon.ico\n\x1b[0m../dist/${uiDir}\x1b[32mfonts\x1b[0m/\x1b[33m*\x1b[0m\n../dist/${uiDir}js/\x1b[32m${worker}\x1b[0m\n`);
				}
			},
			Sitemap({
				// generate an xml sitemap and robots.txt file
				hostname: domain,
				changefreq: 'monthly',
				// block all these gross bots and scrapers
				generateRobotsTxt: true,
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
			{
				// build output logging
				name: 'log-sitemap-robots',
				apply: 'build',
				closeBundle() {
					console.log(`\x1b[36m[vite-plugin-sitemap] \x1b[0mGenerating for domain: \x1b[34m${domain}\x1b[0m\n../dist/robots.txt\n../dist/sitemap.xml`);
				}
			},
			VitePWA({
				filename: 'service.js',
				manifestFilename: 'site.webmanifest',
				registerType: 'autoUpdate',
				injectRegister: false,
				includeAssets: ['**/*'],
				precache: ['**/*'],
				manifest: {
					// PWA configuration and metadata
					name: 'teXt0wnz',
					short_name: 'teXt0wnz',
					id: '/',
					scope: '/',
					start_url: '/',
					display: 'standalone',
					description: 'Draw, edit & collaborate in a retro text art editor for ANSI, ASCII, NFO & XBIN with keyboard, mouse, or touch. Offline-first or join real-time sessions',
					dir: 'ltr',
					lang: 'en',
					orientation: 'any',
					background_color: '#000',
					theme_color: '#000',
					display_override: ['window-controls-overlay'], // removes window chrome
					// fav/app icons
					icons: [{
						src: `${uiDir}img/web-app-manifest-512x512.png`,
						sizes: '512x512',
						type: 'image/png',
						purpose: 'any',
					}, {
						src: `${uiDir}img/web-app-manifest-512x512.png`,
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					}, {
						src: `${uiDir}img/web-app-manifest-192x192.png`,
						sizes: '192x192',
						type: 'image/png',
						purpose: 'maskable',
					}, {
						src: `${uiDir}img/apple-touch-icon.png`,
						sizes: '180x180',
						type: 'image/png',
						purpose: 'maskable',
					}, {
						src: `${uiDir}img/favicon-96x96.png`,
						sizes: '96x96',
						type: 'image/png',
						purpose: 'any',
					}, {
						src: `${uiDir}img/android-launchericon-48-48.png`,
						sizes: '48x48',
						type: 'image/png',
						purpose: 'any',
					}],
					// PWA install previews
					screenshots: [{
						src: `${uiDir}img/screenshot-desktop.png`,
						sizes: '3024x1964',
						type: 'image/png',
						platform: 'any',
					}, {
						src: `${uiDir}img/screenshot-mobile.png`,
						sizes: '1140x1520',
						type: 'image/png',
						platform: 'any',
					}, {
						src: `${uiDir}img/screenshot-font-tall.png`,
						sizes: '910x1370',
						type: 'image/png',
						platform: 'any',
						form_factor: 'narrow',
					}, {
						src: `${uiDir}img/screenshot-sauce-tall.png`,
						sizes: '910x1370',
						type: 'image/png',
						platform: 'any',
						form_factor: 'narrow',
					}, {
						src: `${uiDir}img/screenshot-light-wide.png`,
						sizes: '1540x1158',
						type: 'image/png',
						platform: 'any',
						form_factor: 'wide',
					}, {
						src: `${uiDir}img/screenshot-dark-wide.png`,
						sizes: '1540x1158',
						type: 'image/png',
						platform: 'any',
						form_factor: 'wide',
					}],
					version: cacheBuster(),
				},
				workbox: {
					// version bump
					additionalManifestEntries: [
						{ url: '/', revision: cacheBuster() },
					],
					// cache all the things \o/
					globPatterns: ['index.html', '**/*.{js,css,html,ico,png,svg,woff2}'],
					cleanupOutdatedCaches: true,
					clientsClaim: true,
					skipWaiting: true,
					navigateFallback: '/',
					// ok, not all the things...
					navigateFallbackDenylist: [
						/^\/LICENSE.txt/,
						/^\/humans.txt/,
						/^\/robots.txt/,
						/^\/sitemap.xml/,
						/^\/tests/,
					],
					maximumFileSizeToCacheInBytes: 3000000,// 3mb max
					runtimeCaching: [{
						urlPattern: new RegExp(`^\\/${uiDirSafe}\\/img\\/.*\\.(png|svg|ico)$`),
						handler: 'CacheFirst',
						options: { cacheName: 'asset-cache' },
					}, {
						urlPattern: new RegExp(`^\\/${uiDirSafe}\\/js\\/.*\\.js$`),
						handler: 'CacheFirst',
						options: { cacheName: 'app-cache' },
					}, {
						urlPattern: new RegExp(`^\\/${uiDirSafe}\\/.*\\.(css|svg|woff2)$`),
						handler: 'CacheFirst',
						options: { cacheName: 'style-cache' },
					}, {
						urlPattern: /^\/(index\.html)?$/,
						handler: 'CacheFirst',
						options: { cacheName: 'html-cache' },
					}],
				},
			}),
		],
	});
};
