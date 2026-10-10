/**
 * Capture desktop-Chromium perf baselines (PLAN.md P0) by driving the in-app
 * profiling harness (src/js/client/profiler.js, ?profile) with Playwright.
 *
 * Usage:
 *   bun bake                     # the harness profiles the production build
 *   bun perf:baseline            # writes tests/baselines/p0-perf.json
 *
 * Numbers are machine-dependent snapshots recorded WITH a hardware
 * descriptor; they are evidence for before/after comparisons, not a CI gate.
 * On-device (iPad/Android) runs are owner handoffs: open <app>/?profile on
 * the device and press "run all" (PLAN.md O9).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDir = path.join(repoRoot, 'dist');
// PERF_QUERY/PERF_OUT make the same harness capture other renderers, e.g.
//   PERF_QUERY='?profile&renderer=gl' PERF_OUT=tests/baselines/p1-gl-perf.json
const outFile = path.join(
	repoRoot,
	process.env.PERF_OUT || 'tests/baselines/p0-perf.json',
);
const QUERY = process.env.PERF_QUERY || '?profile';
const PORT = process.env.PERF_PORT || 8071;
const PRESET = process.env.PERF_PRESET || '80x3000';

const hostDescriptor = () => ({
	hostname: os.hostname(),
	platform: `${os.platform()} ${os.release()}`,
	arch: os.arch(),
	cpu: os.cpus()[0]?.model || 'unknown',
	cores: os.cpus().length,
	totalMemGB: Math.round(os.totalmem() / 1073741824),
});

const waitForServer = async url => {
	for (let i = 0; i < 50; i++) {
		try {
			const res = await fetch(url);
			if (res.ok) {
				return;
			}
		} catch {
			// not up yet
		}
		await new Promise(resolve => setTimeout(resolve, 200));
	}
	throw new Error(`server at ${url} never came up`);
};

const main = async () => {
	if (!existsSync(path.join(distDir, 'index.html'))) {
		console.error('dist/index.html missing; run `bun bake` first');
		process.exit(1);
	}

	const server = spawn('bunx', ['serve', distDir, '-l', String(PORT)], {
		cwd: repoRoot,
		stdio: 'ignore',
	});
	try {
		await waitForServer(`http://localhost:${PORT}/`);

		let browser;
		try {
			browser = await chromium.launch({ channel: 'chrome', headless: true });
		} catch {
			browser = await chromium.launch({ headless: true });
		}
		const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
		page.on('pageerror', error => console.error('[pageerror]', error.message));

		await page.goto(`http://localhost:${PORT}/${QUERY}`, { waitUntil: 'load' });
		await page.waitForSelector('#bodyContainer[data-ready]', {
			state: 'attached',
			timeout: 30000,
		});
		await page.waitForFunction(() => !!window.__t0wnzProfiler, null, { timeout: 15000 });

		console.log(`profiling preset ${PRESET}… (zoom/repaint scenarios take minutes on v2)`);
		const results = await page.evaluate(
			preset => window.__t0wnzProfiler.runAll(preset),
			PRESET,
		);
		await browser.close();

		const baseline = { host: hostDescriptor(), ...results };
		mkdirSync(path.dirname(outFile), { recursive: true });
		writeFileSync(outFile, JSON.stringify(baseline, null, '\t') + '\n');
		console.log(`wrote ${path.relative(repoRoot, outFile)}`);
		console.log(JSON.stringify(baseline, null, 2));
	} finally {
		server.kill();
	}
};

main().catch(error => {
	console.error('baseline capture failed:', error);
	process.exit(1);
});
