/**
 * Live round trip against the VENDORED vanilla Moebius server
 * (1.0.29, the one the scene runs): the page joins by typing an
 * address into the Connect form, draws, and a raw peer on the same
 * joint sees the DRAW; the peer draws and the page shows it. Also pins
 * the local/chat button handoff and the dead-dial report. Chromium
 * project only, like the bun round trip: one engine runs the full
 * stack, the transport logic is unit-tested engine-neutrally.
 */
import { test, expect } from '@playwright/test';
import { clickTool } from './helpers/editorHelpers.js';
import { spawn } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../..');
const fixture = path.join(repoRoot, 'tests/interop/fixtures/moebius/start.js');

let child = null;
let port = 0;

test.beforeAll(async ({ browserName }) => {
	if (browserName !== 'chromium') {
		return; // every test below skips there; no fixture to boot
	}
	port = 41000 + Math.floor(Math.random() * 10000);
	await new Promise((resolve, reject) => {
		const proc = spawn('node', [fixture, String(port), ''], { stdio: ['ignore', 'pipe', 'pipe']});
		// held from the spawn, not the resolve: a boot that times out
		// must still be killed, or it keeps its port for the whole job
		child = proc;
		const timer = setTimeout(() => {
			proc.kill('SIGKILL');
			reject(new Error('moebius fixture did not boot'));
		}, 15000);
		proc.stdout.on('data', chunk => {
			if (String(chunk).includes('FIXTURE_READY')) {
				clearTimeout(timer);
				resolve(proc);
			}
		});
		proc.on('exit', code => {
			clearTimeout(timer);
			reject(new Error(`moebius fixture exited ${code}`));
		});
	});
});

test.afterAll(() => {
	child?.kill('SIGKILL');
});

/** a raw registered peer on the fixture joint */
const peerJoin = async nick => {
	const ws = new WebSocket(`ws://127.0.0.1:${port}/fixture`);
	await new Promise((resolve, reject) => {
		ws.addEventListener('open', resolve, { once: true });
		ws.addEventListener('error', reject, { once: true });
	});
	const reply = new Promise(resolve => {
		ws.addEventListener(
			'message',
			event => resolve(JSON.parse(event.data)),
			{ once: true },
		);
	});
	ws.send(JSON.stringify({ type: 0, data: { nick, group: '', pass: '' } }));
	const frame = await reply;
	expect(frame.type).toBe(0);
	return { ws, id: frame.data.id };
};

const nextDraw = ws =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('no DRAW arrived')), 8000);
		const onMessage = event => {
			const frame = JSON.parse(event.data);
			if (frame.type === 9) {
				clearTimeout(timer);
				ws.removeEventListener('message', onMessage);
				resolve(frame.data);
			}
		};
		ws.addEventListener('message', onMessage);
	});

const bootPage = async page => {
	await page.goto('/?test');
	await page.waitForSelector('#bodyContainer[data-ready]', {
		state: 'attached',
		timeout: 10000,
	});
	await page.waitForFunction(() => Boolean(window.__t0wnz), null, { timeout: 10000 });
};

const drawAt = async (page, cx, cy) => {
	await page.locator('#brushes').click();
	await page.waitForTimeout(200);
	await clickTool(page, 'halfblock');
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

test.describe('joining a vanilla Moebius server by address', () => {
	test('the Connect form joins, draws both ways, and swaps local for chat', async ({
		page,
		browserName,
	}) => {
		test.skip(browserName !== 'chromium', 'one engine runs the full stack');
		await bootPage(page);
		// working locally: the slot reads local, chat stays shut
		await expect(page.locator('#networkButton')).toBeVisible();
		await expect(page.locator('#chatButton')).toBeHidden();

		await page.locator('#networkButton').click();
		await expect(page.locator('#connectModal')).toBeVisible();
		await page.fill('#connectServer', `127.0.0.1:${port}/fixture`);
		await page.fill('#connectNick', 'xero');
		await page.locator('#connectJoin').click();
		await page.waitForFunction(
			() => window.__t0wnz.State.network?.isConnected?.() === true,
			null,
			{ timeout: 10000 },
		);
		await page.waitForTimeout(400);
		await expect(page.locator('#chatButton')).toBeVisible();
		await expect(page.locator('#networkButton')).toBeHidden();
		// the vanilla 6-bit palette arrived at full brightness: entry 9
		// (bright blue) must not read as a quarter of itself
		const brightBlue = await page.evaluate(() =>
			window.__t0wnz.State.textArtCanvas.getDoc().palette[9] & 0xff);
		expect(brightBlue).toBe(0xff);

		const peer = await peerJoin('peer');
		// peer -> page
		peer.ws.send(
			JSON.stringify({
				type: 9,
				data: { x: 5, y: 3, block: { code: 66, fg: 14, bg: 1 }, id: peer.id },
			}),
		);
		await expect.poll(() => charAt(page, 5, 3), { timeout: 8000 }).toBe(66);

		// page -> peer
		const arriving = nextDraw(peer.ws);
		await drawAt(page, 2, 1);
		const frame = await arriving;
		expect(frame.x).toBe(2);
		expect(frame.y).toBe(1);
		expect(frame.block.code).toBe(await charAt(page, 2, 1));
		peer.ws.close();
	});

	test('a dead address reports in the form instead of stranding the loading modal', async ({
		page,
		browserName,
	}) => {
		test.skip(browserName !== 'chromium', 'one engine runs the full stack');
		await bootPage(page);
		await page.locator('#networkButton').click();
		await page.fill('#connectServer', '127.0.0.1:1/nowhere');
		await page.locator('#connectJoin').click();
		await expect(page.locator('#connectStatus')).toContainText(
			'Could not connect to 127.0.0.1:1/nowhere',
			{ timeout: 10000 },
		);
		await expect(page.locator('#connectModal')).toBeVisible();
		await expect(page.locator('#loadingModal')).toBeHidden();
	});
});
