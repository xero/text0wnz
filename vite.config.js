import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';
import Sitemap from 'vite-plugin-sitemap';
import htmlMinifierTerser from "vite-plugin-html-minifier-terser";
import { copyFileSync, existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

export default ({ mode }) => {
	const cacheBuster = () => Date.now().toString();

	process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
	const domain = process.env.VITE_DOMAIN || 'https://text.0w.nz';
	const uiDir = ((process.env.VITE_UI_DIR || 'ui').replace(/^\/|\/?$/g, '')) + '/';

	// source sizes and the out dir for the build hooks live here:
	// rolldown gives each plugin hook a fresh `this`
	let originalCssSize = 0;
	let originalHtmlSize = 0;
	let outDir;

	const staticTargets = [
		{ src: 'humans.txt', dest: '.' },
		// v4 keeps the src path in dest by default, flatten single files
		{ src: 'img/manifest/favicon.ico', dest: '.', rename: { stripBase: true } },
		{ src: 'fonts', dest: uiDir },
		{ src: 'ansi', dest: '.' },
	];

	return defineConfig({
		root: './src',
		base: './',
		// page-context caches (fontCache) key their generation on this so
		// a deploy invalidates them; the SW precache versions separately
		define: {
			__BUILD_STAMP__: JSON.stringify(cacheBuster()),
		},
		build: {
			emptyOutDir: true,
			outDir: '../dist',
			assetsDir: '',
			assetsInlineLimit: 0,
			target: 'es2022',
			minify: 'terser',
			terserOptions: {
				compress: {
					drop_console: false
				}
			},
			sourcemap: process.env.NODE_ENV !== 'production',
			rolldownOptions: {
				input: {
					index: path.resolve('./src', 'index.html'),
				},
				output: {
					entryFileNames: `${uiDir}js/editor-[hash].js`,
					chunkFileNames: `${uiDir}js/[name]-[hash].js`,
					assetFileNames: assetInfo => {
						const assetName = assetInfo.names?.[0];
						if (!assetName) return '';
						const info = assetName.split('.');
						const ext = info[info.length - 1];
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
					codeSplitting: {
						// core & canvas import each other, so each chunk keeps to
						// only its listed modules
						includeDependenciesRecursively: false,
						groups: [
							// also holds vite's dynamic import helper, otherwise it
							// lands in the entry chunk & tools imports the editor back
							{ name: 'core', test: /[\\/]src[\\/]js[\\/]client[\\/](magicNumbers|state|storage|ui)\.js$|vite[\\/]preload-helper/ },
							{ name: 'canvas', test: /[\\/]src[\\/]js[\\/]client[\\/](canvas|font|lazyFont|fontCache)\.js$/ },
							{ name: 'tools', test: /[\\/]src[\\/]js[\\/]client[\\/](freehandTools|keyboard|toolbar)\.js$/ },
							{ name: 'fileops', test: /[\\/]src[\\/]js[\\/]client[\\/]file\.js$/ },
							{ name: 'network', test: /[\\/]src[\\/]js[\\/]client[\\/]network\.js$/ },
							{ name: 'palette', test: /[\\/]src[\\/]js[\\/]client[\\/]palette\.js$/ },
						],
					},
				},
			},
		},
		plugins: [
			{
				name: 'log-postcss',
				apply: 'build',
				buildStart() {
					const srcCssPath = path.resolve('./src/css', 'style.css');
					if (existsSync(srcCssPath)) {
						const srcStats = statSync(srcCssPath);
						originalCssSize = srcStats.size;
					}
				},
				closeBundle() {
					const distCssDir = path.resolve('./dist/ui');
					if (existsSync(distCssDir)) {
						const files = readdirSync(distCssDir);
						const cssFile = files.find(f => f.startsWith('stylez-') && f.endsWith('.css'));

						if (cssFile) {
							const minified = statSync(path.join(distCssDir, cssFile)).size;
							const savings = ((1 - minified / originalCssSize) * 100).toFixed(1);
							console.log(`\n\x1b[36m[PostCSS] \x1b[0mBuilding stylesheet\n\x1b[32m✓ \x1b[34mtailwindcss\n\x1b[32m✓ \x1b[34mcssnano \x1b[35m(preset: advanced)\x1b[0m`);
							console.log(`../dist/ui/\x1b[32m${cssFile}\x1b[0m: \x1b[33m${(originalCssSize / 1024).toFixed(2)}kb\x1b[0m → \x1b[32m${(minified / 1024).toFixed(2)}kb\x1b[0m (\x1b[36m${savings}% reduction\x1b[0m)\n`);
						}
					}
				}
			},
			{
				// the favicon hrefs hardcode ./ui/, so without this a custom
				// VITE_UI_DIR breaks every icon link while the assets move with it
				name: 'ui-dir-hrefs',
				transformIndexHtml: html =>
					uiDir === 'ui/' ? html : html.replaceAll('"./ui/', `"./${uiDir}`),
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
				buildStart() {
					const srcPath = path.resolve('./src', 'index.html');
					const srcStats = statSync(srcPath);
					originalHtmlSize = srcStats.size;
				},
				closeBundle() {
					const minifiedPath = path.resolve('./dist', 'index.html');
					if (existsSync(minifiedPath)) {
						const minified = statSync(minifiedPath).size;
						const savings = ((1 - minified / originalHtmlSize) * 100).toFixed(1);
						console.log(`\x1b[36m[htmlMinifierTerser] \x1b[0mCompressing index`);
						console.log(`../dist/\x1b[32mindex.html\x1b[0m: \x1b[33m${(originalHtmlSize / 1024).toFixed(2)}kb\x1b[0m → \x1b[32m${(minified / 1024).toFixed(2)}kb\x1b[0m (\x1b[36m${savings}% reduction\x1b[0m)\n`);
					}
				}
			},
			viteStaticCopy({ silent: true, targets: staticTargets }),
			{
				name: 'log-static-copy',
				apply: 'build',
				configResolved(config) {
					outDir = path.resolve(config.root, config.build.outDir);
				},
				// static copy srcs resolve against the vite root (src/), and a
				// '../' src either lands outside dist or copies onto itself
				writeBundle() {
					copyFileSync(path.resolve('LICENSE.txt'), path.join(outDir, 'LICENSE.txt'));
				},
				closeBundle() {
					// the copy runs silent, so log what landed, not what was asked
					const landed = [{ src: 'LICENSE.txt', dest: '.' }, ...staticTargets]
						.map(({ src, dest }) => path.join(dest, path.basename(src)))
						.filter(file => existsSync(path.join(outDir, file)));
					console.log(`\x1b[36m[vite-static-copy] \x1b[0mMoving ${landed.length} files recursively`);
					for (const file of landed) {
						const tree = statSync(path.join(outDir, file)).isDirectory();
						console.log(`../dist/${path.dirname(file) === '.' ? '' : `${path.dirname(file)}/`}\x1b[32m${path.basename(file)}\x1b[0m${tree ? '/\x1b[33m*\x1b[0m' : ''}`);
					}
					console.log('');
				}
			},
			Sitemap({
				hostname: domain,
				changefreq: 'monthly',
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
				name: 'log-sitemap-robots',
				apply: 'build',
				closeBundle() {
					console.log(`\x1b[36m[vite-plugin-sitemap] \x1b[0mGenerating for domain: \x1b[34m${domain}\x1b[0m\n../dist/robots.txt\n../dist/sitemap.xml`);
				}
			},
			VitePWA({
				strategies: 'injectManifest',
				srcDir: '.',
				filename: 'service.js',
				manifestFilename: 'site.webmanifest',
				registerType: 'autoUpdate',
				injectRegister: false,
				includeAssets: ['**/*'],
				manifest: {
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
					share_target: {
						action: '/open',
						method: 'POST',
						enctype: 'multipart/form-data',
						params: {
							title: 'title',
							text: 'text',
							files: [{
								name: 'file',
								accept: [
									'.ans',
									'.ansi',
									'.xb',
									'.xbin',
									'.bin',
									'.txt',
									'.nfo',
									'.diz',
									'.utf8ans',
									'text/plain',
									'text/*',
									'application/octet-stream'
								]
							}
							]
						}
					},
					file_handlers: [
						{
							action: '/',
							name: 'Text Art Files',
							accept: {
								'text/plain': ['.txt'],
								'application/zip': ['.zip'],
								'application/octet-stream': [
									'.ans',
									'.ansi',
									'.asc',
									'.bin',
									'.xb',
									'.xbin',
									'.nfo',
									'.diz',
									'.utf8ans',
									'.lha',
									'.lzh'
								],
								'text/*': []
							}
						}
					],
					launch_handler: {
						client_mode: 'focus-existing',
					},
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
				// injectManifest mode reads these from `injectManifest`; a
				// `workbox` block is silently ignored
				injectManifest: {
					globPatterns: [
						'**/*.{js,css,html,woff2}',
						// derived from VITE_UI_DIR like every emitted path, or a
						// custom ui dir silently drops these from the precache
						`${uiDir}*.svg`,
						'favicon.ico',
						`${uiDir}img/favicon.ico`,
					],
					// opt-in instrumentation (?test/?profile flags): a normal
					// session never loads these chunks, so they stay out of
					// every visitor's PWA install
					globIgnores: [
						'**/scrollSpike-*.js',
						'**/profiler-*.js',
						'**/testBridge-*.js',
					],
					maximumFileSizeToCacheInBytes: 3000000,// 3mb max
					manifestTransforms: [
						entries => ({
							manifest: entries.map(entry => {
								if (entry.url !== 'index.html' || entry.revision) {
									return entry;
								}
								// vite revisions assets by filename hash, but
								// index.html keeps its name across builds, so it
								// needs a content revision or workbox never
								// re-fetches it
								let revision;
								try {
									revision = createHash('md5')
										.update(readFileSync(path.resolve(process.cwd(), 'dist/index.html')))
										.digest('hex');
								} catch {
									revision = cacheBuster();
								}
								return { ...entry, revision };
							}),
						}),
					],
				},
			}),
		],
	});
};
