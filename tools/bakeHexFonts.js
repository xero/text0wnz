/**
 * Build-time .hex preprocessing: packs the vendored font sources in
 * assets/hexfonts/ into per-256-codepoint-block binaries under
 * src/fonts/u/ plus a manifest, using the same core module the runtime
 * reads blocks with. Runs under bun (it imports TypeScript):
 *
 *   bun tools/bakeHexFonts.js
 *
 * src/fonts/ is copied wholesale into dist/ui/fonts by vite, so the
 * output ships without any vite wiring. The output is deterministic
 * for a given source set, and every source is sha256-pinned below so
 * a silently altered vendored file fails the build instead of baking
 * unnoticed into the editor.
 */

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	BLOCK_FORMAT_VERSION,
	HEX_CELL_HEIGHT,
	HEX_CELL_WIDTH,
	buildBlocks,
	parseHexFont,
	parseUns2Uni,
} from '../src/js/core/hexfont.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'assets', 'hexfonts');
const outDir = path.join(root, 'src', 'fonts', 'u');

// pinned at vendoring time; see assets/hexfonts/README.md to refresh
const SOURCES = {
	unifont: {
		file: 'unifont_all-18.0.01.hex.gz',
		sha256: '14c96e497466a82e46cf20032ce510e186bdc8658c9158e2290f452cda9bc498',
		gzip: true,
	},
	unscii16: {
		file: 'unscii-16.hex',
		sha256: '2642c8b748fa81f24d76772d70c55faa720d98fadfec8133daf89136c5c8bfb1',
		gzip: false,
	},
	uns2uni: {
		file: 'uns2uni.tr',
		sha256: '1633f65893ae2b2a2cd511f1ca9af9091da1aa2b5c39f848b97ebb1b4da3bd9c',
		gzip: false,
	},
};

/** credits surface in the app; keep in sync with the sources */
const FONT_META = {
	unscii16: {
		label: 'unscii-16',
		version: '2.1',
		author: 'viznut (Ville-Matias Heikkilä)',
		license: 'Public Domain',
		homepage: 'http://viznut.fi/unscii/',
	},
	unifont: {
		label: 'GNU Unifont',
		version: '18.0.01',
		author: 'Roman Czyborra, Paul Hardy, and contributors',
		license: 'SIL Open Font License 1.1',
		homepage: 'https://unifoundry.com/unifont/',
	},
};

const readSource = key => {
	const source = SOURCES[key];
	const raw = readFileSync(path.join(sourceDir, source.file));
	const digest = createHash('sha256').update(raw).digest('hex');
	if (digest !== source.sha256) {
		console.error(`[hexfonts] ${source.file} sha256 mismatch:`);
		console.error(`  pinned ${source.sha256}`);
		console.error(`  actual ${digest}`);
		process.exit(1);
	}
	return (source.gzip ? gunzipSync(raw) : raw).toString('utf8');
};

const bakeFont = (key, text) => {
	const glyphs = parseHexFont(text);
	const blocks = buildBlocks(glyphs);
	const fontDir = path.join(outDir, key);
	mkdirSync(fontDir, { recursive: true });
	let bytes = 0;
	const blockIds = [];
	for (const [blockId, packed] of blocks) {
		const id = blockId.toString(16);
		writeFileSync(path.join(fontDir, `${id}.bin`), packed);
		blockIds.push(id);
		bytes += packed.length;
	}
	console.log(
		`[hexfonts] ${key}: ${glyphs.length} glyphs, ${blocks.size} blocks, ${(bytes / 1024).toFixed(0)}kb`,
	);
	return { glyphs: glyphs.length, blockIds, bytes };
};

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const manifest = {
	formatVersion: BLOCK_FORMAT_VERSION,
	cell: { width: HEX_CELL_WIDTH, height: HEX_CELL_HEIGHT },
	fonts: {},
	uns2uni: [...parseUns2Uni(readSource('uns2uni'))],
};

for (const key of ['unscii16', 'unifont']) {
	const baked = bakeFont(key, readSource(key));
	manifest.fonts[key] = {
		...FONT_META[key],
		glyphs: baked.glyphs,
		blocks: baked.blockIds,
	};
}

writeFileSync(
	path.join(outDir, 'manifest.json'),
	JSON.stringify(manifest),
);
console.log(`[hexfonts] wrote ${path.relative(root, outDir)}/manifest.json`);
