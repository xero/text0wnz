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

		ext.loseContext();
		await new Promise(resolve => setTimeout(resolve, 100));
		const lostDuring = gl.isContextLost();
		ext.restoreContext();
		// the restore handler rebuilds all GL state and repaints
		await new Promise(resolve => setTimeout(resolve, 300));

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
