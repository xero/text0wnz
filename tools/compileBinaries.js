/**
 * bun --compile binary matrix (PLAN §3.7 #4): cross-compiles the
 * collab/static server for every supported target and prints MEASURED
 * sizes (the docs quote no figure on purpose; this script is the
 * source of truth). Output lands in build/bin/ (gitignored). Runs
 * under bun:
 *
 *   bun tools/compileBinaries.js            # all targets
 *   bun tools/compileBinaries.js host       # just the host target
 *
 * The binary serves ws collab + bridge + /healthz, and the whole PWA
 * when started with --static dist (or STATIC_DIR). Pin the bun version
 * in CI when this joins a release workflow.
 */
/* global Bun */

import { mkdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'build', 'bin');
const entry = path.join(root, 'src', 'js', 'server', 'main.js');

const TARGETS = [
	'bun-linux-x64',
	'bun-linux-arm64',
	'bun-linux-x64-musl',
	'bun-linux-arm64-musl',
	'bun-darwin-x64',
	'bun-darwin-arm64',
	'bun-windows-x64',
	'bun-windows-arm64',
];

const hostOnly = process.argv[2] === 'host';
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const results = [];
for (const target of hostOnly ? ['host'] : TARGETS) {
	const name = `t0wnz-${target.replace(/^bun-/, '')}`;
	const outfile = path.join(outDir, name);
	const args = [
		'build',
		'--compile',
		'--minify',
		...(target === 'host' ? [] : [`--target=${target}`]),
		entry,
		'--outfile',
		outfile,
	];
	const run = spawnSync('bun', args, { cwd: root, stdio: 'pipe' });
	if (run.status !== 0) {
		const lines = run.stderr.toString().trim().split('\n');
		results.push({ target, size: null, error: lines[lines.length - 1] });
		continue;
	}
	// windows targets gain .exe
	let built = outfile;
	try {
		statSync(built);
	} catch {
		built = `${outfile}.exe`;
	}
	const bytes = statSync(built).size;
	results.push({ target, size: bytes });
}

console.log('\n[binaries] measured sizes (bun ' + Bun.version + '):');
for (const { target, size, error } of results) {
	if (size === null) {
		console.log(`  ${target.padEnd(24)} FAILED: ${error}`);
	} else {
		console.log(`  ${target.padEnd(24)} ${(size / 1024 / 1024).toFixed(1)} MB`);
	}
}
