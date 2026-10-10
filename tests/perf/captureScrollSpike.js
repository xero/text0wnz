/**
 * Capture desktop-Chromium numbers for the P1 scroll spike (PLAN.md §4 P1)
 * by driving the in-app spike (src/js/client/scrollSpike.js, ?spike) with
 * Playwright.
 *
 * Usage:
 *   bun bake                 # the spike runs against the production build
 *   bun perf:spike           # writes tests/baselines/p1-scroll-spike.json
 *
 * Numbers are machine-dependent snapshots recorded WITH a hardware
 * descriptor; they are evidence for parameter choices, not a CI gate.
 * Device runs are owner handoffs: open <app>/?spike on the device, fling by
 * hand and/or press "run scripted flings" (PLAN.md O9).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDir = path.join(repoRoot, 'dist');
const outFile = path.join(repoRoot, 'tests/baselines/p1-scroll-spike.json');
const PORT = process.env.PERF_PORT || 8072;

// slack/tolerance sweep: find the smallest slack that never blanks on the
// extreme fling; the two headline docs then run with the default params
const SWEEP = [
	{ slackScreens: 0.5, toleranceScreens: 0.25 },
	{ slackScreens: 1, toleranceScreens: 0.25 },
	{ slackScreens: 1, toleranceScreens: 0.5 },
	{ slackScreens: 1.5, toleranceScreens: 0.5 },
	{ slackScreens: 2, toleranceScreens: 0.5 },
	{ slackScreens: 3, toleranceScreens: 1 },
];

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

		await page.goto(`http://localhost:${PORT}/?spike`, { waitUntil: 'load' });
		await page.waitForSelector('#bodyContainer[data-ready]', {
			state: 'attached',
			timeout: 30000,
		});
		await page.waitForFunction(() => !!window.__t0wnzScrollSpike, null, { timeout: 15000 });

		const measure = async (preset, params) => {
			console.log(`spike: ${preset} slack=${params.slackScreens} tol=${params.toleranceScreens}…`);
			return page.evaluate(
				async ({ preset, params }) => {
					window.__t0wnzScrollSpike.setDoc(preset);
					window.__t0wnzScrollSpike.setParams(params);
					return window.__t0wnzScrollSpike.runScripted();
				},
				{ preset, params },
			);
		};

		const sweep = [];
		for (const params of SWEEP) {
			const result = await measure('80x3000', params);
			sweep.push({
				...params,
				canvasRows: result.params.canvasRows,
				canvasMB: result.params.canvasMB,
				extreme: result.runs.extreme,
				fling: {
					avgFps: result.runs.fling.avgFps,
					reAnchors: result.runs.fling.reAnchors,
					blankFrames: result.runs.fling.blankFrames,
				},
			});
		}

		const defaults = { slackScreens: 1.5, toleranceScreens: 0.5 };
		const main80 = await measure('80x3000', defaults);
		const main240 = await measure('240x3000', defaults);
		await browser.close();

		const baseline = {
			host: hostDescriptor(),
			capturedAt: new Date().toISOString(),
			pattern: main80.pattern,
			machine: main80.machine,
			defaults,
			docs: { '80x3000': main80, '240x3000': main240 },
			sweep,
		};
		mkdirSync(path.dirname(outFile), { recursive: true });
		writeFileSync(outFile, JSON.stringify(baseline, null, '\t') + '\n');
		console.log(`wrote ${path.relative(repoRoot, outFile)}`);
		console.log(JSON.stringify(baseline.sweep, null, 2));
	} finally {
		server.kill();
	}
};

main().catch(error => {
	console.error('spike capture failed:', error);
	process.exit(1);
});
