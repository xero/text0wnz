/**
 * Live collab round trip: two real pages join a spawned bun server
 * (never a shared or public one) through the consent modal, draw in
 * both directions, and verify convergence plus no-self-echo. Chromium
 * project only: one engine exercises the full stack, the transport
 * logic is unit-tested engine-neutrally.
 */
import { test, expect } from '@playwright/test';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const hasBun = (() => {
	try {
		execSync('bun --version', { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();

let child = null;
let scratch = null;
let port = 0;

test.beforeAll(async () => {
	if (!hasBun) {
		return;
	}
	scratch = mkdtempSync(path.join(tmpdir(), 't0wnz-collab-e2e-'));
	port = 21000 + Math.floor(Math.random() * 20000);
	child = spawn(
		'bun',
		[path.join(repoRoot, 'src/js/server/main.js'), String(port)],
		{ cwd: scratch, stdio: ['ignore', 'pipe', 'pipe']},
	);
	const deadline = Date.now() + 15000;
	for (;;) {
		try {
			const res = await fetch(`http://127.0.0.1:${port}/`);
			if (res.status === 426) {
				break;
			}
		} catch {
			// not up yet
		}
		if (Date.now() > deadline) {
			throw new Error('collab server did not come up');
		}
		await new Promise(r => setTimeout(r, 150));
	}
});

test.afterAll(() => {
	child?.kill('SIGKILL');
	if (scratch) {
		rmSync(scratch, { recursive: true, force: true });
	}
});

const joinPage = async (browser, nick) => {
	const context = await browser.newContext();
	const page = await context.newPage();
	await page.addInitScript(n => {
		window.localStorage.setItem('handle', n);
	}, nick);
	await page.goto(`/?test&server=ws://127.0.0.1:${port}/e2eroom`);
	await page.waitForSelector('#bodyContainer[data-ready]', {
		state: 'attached',
		timeout: 10000,
	});
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout: 10000 });
	// the probe finds the server and opens the consent choice
	await page.waitForSelector('#joinCollaboration', {
		state: 'visible',
		timeout: 10000,
	});
	await page.locator('#joinCollaboration').click();
	await page.waitForFunction(
		() => window.__t0wnz.State.network?.isConnected?.() === true,
		null,
		{ timeout: 10000 },
	);
	await page.waitForTimeout(400);
	return { context, page };
};

const drawAt = async (page, cx, cy) => {
	await page.locator('#brushes').click();
	await page.waitForTimeout(200);
	await page.locator('#halfblock').click();
	await page.waitForTimeout(200);
	const point = await page.evaluate(
		([x, y]) => {
			const s = window.__t0wnz.State;
			const rect = document
				.getElementById('canvasContainer')
				.getBoundingClientRect();
			return {
				x: rect.left + x * s.font.getWidth() + s.font.getWidth() / 2,
				y: rect.top + y * s.font.getHeight() + s.font.getHeight() / 4,
			};
		},
		[cx, cy],
	);
	await page.mouse.click(point.x, point.y);
	await page.waitForTimeout(300);
};

const charAt = (page, x, y) =>
	page.evaluate(
		([cx, cy]) => window.__t0wnz.State.textArtCanvas.getBlock(cx, cy).charCode,
		[x, y],
	);

test.describe('collab round trip against a live server', () => {
	test('two pages join, draw both ways, converge, no self-echo', async ({
		browser,
		browserName,
	}) => {
		test.skip(browserName !== 'chromium', 'one engine runs the full stack');
		test.skip(!hasBun, 'bun is required to spawn the server');
		test.slow();

		const a = await joinPage(browser, 'artist-a');
		const b = await joinPage(browser, 'artist-b');

		// A draws; the cell lands locally at once (apply-locally-on-send)
		await drawAt(a.page, 5, 5);
		const drawnA = await charAt(a.page, 5, 5);
		expect(drawnA).not.toBe(0);

		// ...and reaches B through the server
		await expect
			.poll(() => charAt(b.page, 5, 5), { timeout: 10000 })
			.toBe(drawnA);

		// B draws back; A converges
		await drawAt(b.page, 10, 3);
		const drawnB = await charAt(b.page, 10, 3);
		expect(drawnB).not.toBe(0);
		await expect
			.poll(() => charAt(a.page, 10, 3), { timeout: 10000 })
			.toBe(drawnB);

		// no self-echo corruption: A's original cell is still intact
		expect(await charAt(a.page, 5, 5)).toBe(drawnA);

		// chat crosses with the sender's local render on both ends
		await a.page.evaluate(() => {
			window.__t0wnz.State.network.sendChat('hello from a');
		});
		await expect
			.poll(
				() =>
					b.page.evaluate(
						() => document.getElementById('messageWindow')?.textContent ?? '',
					),
				{ timeout: 10000 },
			)
			.toContain('hello from a');

		await a.context.close();
		await b.context.close();
	});

	test('late joiner receives the session document', async ({
		browser,
		browserName,
	}) => {
		test.skip(browserName !== 'chromium', 'one engine runs the full stack');
		test.skip(!hasBun, 'bun is required to spawn the server');
		test.slow();

		const a = await joinPage(browser, 'early');
		await drawAt(a.page, 7, 7);
		const drawn = await charAt(a.page, 7, 7);
		expect(drawn).not.toBe(0);
		await a.page.waitForTimeout(300);

		const late = await joinPage(browser, 'late');
		await expect
			.poll(() => charAt(late.page, 7, 7), { timeout: 10000 })
			.toBe(drawn);

		await a.context.close();
		await late.context.close();
	});

	test('unicode and truecolor cells converge natively (extension suite)', async ({
		browser,
		browserName,
	}) => {
		test.skip(browserName !== 'chromium', 'one engine runs the full stack');
		test.skip(!hasBun, 'bun is required to spawn the server');
		test.slow();

		const a = await joinPage(browser, 'uni-a');
		const b = await joinPage(browser, 'uni-b');

		// both sides negotiated the suite
		expect(
			await a.page.evaluate(() =>
				window.__t0wnz.State.network.extCollab()),
		).toBe(true);

		// A draws a heavy black heart suit in truecolor orange through the
		// editor core (the same path the tools use)
		await a.page.evaluate(async () => {
			const { State } = window.__t0wnz;
			const resolved = await State.textArtCanvas.resolveUnicode([0x2764]);
			const id = resolved.get(0x2764);
			State.textArtCanvas.draw(cb => cb(id, 0xff8800, 0, 4, 2), false);
		});

		// B converges on the REAL cell: same codepoint, exact RGB word
		const cellOnB = () =>
			b.page.evaluate(() => {
				const doc = window.__t0wnz.State.textArtCanvas.getDoc();
				const index = 2 * doc.getColumns() + 4;
				const glyphId = doc.frames[0].glyph[index] & 0xffff;
				return {
					codepoint: doc.glyphTable.get(glyphId)?.codepoint ?? null,
					fg: doc.frames[0].fg[index] >>> 0,
				};
			});
		await expect
			.poll(async () => (await cellOnB()).codepoint, { timeout: 10000 })
			.toBe(0x2764);
		expect((await cellOnB()).fg).toBe(0xff8800);

		// a late vanilla-fidelity check: the late joiner adopts via
		// EXT_SYNC and sees the identical cell
		const late = await joinPage(browser, 'uni-late');
		const cellOnLate = () =>
			late.page.evaluate(() => {
				const doc = window.__t0wnz.State.textArtCanvas.getDoc();
				const index = 2 * doc.getColumns() + 4;
				const glyphId = doc.frames[0].glyph[index] & 0xffff;
				return {
					codepoint: doc.glyphTable.get(glyphId)?.codepoint ?? null,
					fg: doc.frames[0].fg[index] >>> 0,
				};
			});
		await expect
			.poll(async () => (await cellOnLate()).codepoint, { timeout: 10000 })
			.toBe(0x2764);
		expect((await cellOnLate()).fg).toBe(0xff8800);

		await a.context.close();
		await b.context.close();
		await late.context.close();
	});

	test('a server-refused resize recovers through EXT_SYNC (review pin)', async ({
		browser,
		browserName,
	}) => {
		test.skip(browserName !== 'chromium', 'one engine runs the full stack');
		test.skip(!hasBun, 'bun is required to spawn the server');
		test.slow();

		// a second server whose resize wall sits BELOW the client's
		const wallPort = 21000 + Math.floor(Math.random() * 20000);
		const walled = spawn(
			'bun',
			[path.join(repoRoot, 'src/js/server/main.js'), String(wallPort)],
			{
				cwd: scratch,
				stdio: ['ignore', 'pipe', 'pipe'],
				env: { ...process.env, ROOM_MAX_COLUMNS: '100' },
			},
		);
		try {
			const deadline = Date.now() + 15000;
			for (;;) {
				try {
					const res = await fetch(`http://127.0.0.1:${wallPort}/healthz`);
					if (res.ok) {
						break;
					}
				} catch {
					// not up yet
				}
				if (Date.now() > deadline) {
					throw new Error('walled server did not come up');
				}
				await new Promise(r => setTimeout(r, 150));
			}
			const context = await browser.newContext();
			const page = await context.newPage();
			await page.addInitScript(() => {
				window.localStorage.setItem('handle', 'wall-test');
			});
			await page.goto(`/?test&server=ws://127.0.0.1:${wallPort}/wallroom`);
			await page.waitForSelector('#joinCollaboration', {
				state: 'visible',
				timeout: 10000,
			});
			await page.locator('#joinCollaboration').click();
			await page.waitForFunction(
				() => window.__t0wnz.State.network?.extCollab?.() === true,
				null,
				{ timeout: 10000 },
			);
			await page.waitForTimeout(400);
			// resize past the SERVER wall but inside the client wall: the
			// client applies locally, the server refuses with an ack, and
			// sync recovery restores truth. The local-apply read must happen
			// INSIDE the evaluate: once the refusal ack lands, recovery can
			// outrun a second page.evaluate round trip.
			const localColumns = await page.evaluate(() => {
				const { State } = window.__t0wnz;
				State.textArtCanvas.resize(150, 25);
				State.network.sendResize(150, 25);
				return State.textArtCanvas.getColumns();
			});
			expect(localColumns).toBe(150);
			await expect
				.poll(
					() =>
						page.evaluate(() =>
							window.__t0wnz.State.textArtCanvas.getColumns()),
					{ timeout: 15000 },
				)
				.toBe(80);
			await context.close();
		} finally {
			walled.kill('SIGKILL');
		}
	});
});
