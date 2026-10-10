/**
 * GL renderer context-loss gate (PLAN.md §3.1: context loss is mandatory to
 * handle; §4 P1 gates). Forces a WebGL context loss + restore through the
 * WEBGL_lose_context extension and asserts the renderer comes back rendering
 * actual pixels. Runs in the chromium-gl project (SwiftShader in CI).
 */
import { test, expect } from '@playwright/test';
import { waitForEditorReady } from '../e2e/helpers/editorHelpers.js';

test('gl renderer survives context loss and restore', async ({ page }) => {
	await page.goto('/?test&renderer=gl');
	await waitForEditorReady(page);
	await page.waitForFunction(() => !!window.__t0wnz, null, { timeout: 10000 });

	const result = await page.evaluate(async () => {
		const canvas = document.getElementById('glRenderCanvas');
		if (!canvas) {
			return { error: 'gl renderer not active' };
		}
		const { State } = window.__t0wnz;

		// Put visible content on the first row (full blocks, white on black)
		State.textArtCanvas.startUndo();
		State.textArtCanvas.draw(callback => {
			for (let x = 0; x < 20; x++) {
				callback(219, 15, 0, x, 0);
			}
		}, false);

		const gl = canvas.getContext('webgl2');
		const ext = gl.getExtension('WEBGL_lose_context');
		if (!ext) {
			return { error: 'WEBGL_lose_context unavailable' };
		}

		// Await the transition events instead of fixed sleeps; loss and
		// restore are asynchronous and can outrun any timer on a loaded
		// SwiftShader runner. The renderer registered its own handlers at
		// init, so they run before these later-added listeners fire.
		const lostEvent = new Promise(resolve =>
			canvas.addEventListener('webglcontextlost', resolve, { once: true }));
		ext.loseContext();
		await lostEvent;
		const lostDuring = gl.isContextLost();
		// restoreContext() is INVALID_OPERATION until the webglcontextlost
		// dispatch fully completes with its default prevented; an awaited
		// listener resumes as a microtask still inside that dispatch, so
		// hop one macrotask before restoring
		await new Promise(resolve => setTimeout(resolve, 0));
		const restoredEvent = new Promise(resolve =>
			canvas.addEventListener('webglcontextrestored', resolve, { once: true }));
		ext.restoreContext();
		await restoredEvent;

		// Repaint synchronously, then sample the backbuffer before the
		// compositor can discard it (preserveDrawingBuffer is false)
		await new Promise(resolve =>
			State.textArtCanvas.redrawEntireImage(null, resolve));
		const probe = document.createElement('canvas');
		probe.width = canvas.width;
		probe.height = Math.min(canvas.height, 64);
		const ctx = probe.getContext('2d');
		ctx.drawImage(canvas, 0, 0);
		const data = ctx.getImageData(0, 0, probe.width, probe.height).data;
		let litPixels = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] || data[i + 1] || data[i + 2]) {
				litPixels++;
			}
		}
		return { lostDuring, restored: !gl.isContextLost(), litPixels };
	});

	expect(result.error).toBeUndefined();
	expect(result.lostDuring).toBe(true);
	expect(result.restored).toBe(true);
	// 20 full-block cells of white pixels must be back on screen
	expect(result.litPixels).toBeGreaterThan(1000);
});
