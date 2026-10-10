/**
 * chromium-gl rail (PLAN.md P0 CI task): proves the CI container exposes a
 * working WebGL2 context under SwiftShader BEFORE the P1 GL renderer lands,
 * so renderer work never debugs CI plumbing and renderer regressions at the
 * same time. Once P1 ships, this project forces ?renderer=gl and asserts
 * the GLRenderer is the active implementation.
 */
import { test, expect } from '@playwright/test';

test.describe('chromium-gl environment', () => {
	test('WebGL2 context is creatable and identifies its renderer', async ({ page }) => {
		await page.goto('/');
		const info = await page.evaluate(() => {
			const canvas = document.createElement('canvas');
			const gl = canvas.getContext('webgl2');
			if (!gl) {
				return null;
			}
			const debugExt = gl.getExtension('WEBGL_debug_renderer_info');
			return {
				renderer: debugExt
					? gl.getParameter(debugExt.UNMASKED_RENDERER_WEBGL)
					: gl.getParameter(gl.RENDERER),
				version: gl.getParameter(gl.VERSION),
				maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
			};
		});
		expect(info).not.toBeNull();
		expect(info.version).toContain('WebGL 2.0');
		// Glyph atlas pages (PLAN.md §3.1) need at least 4096px textures
		expect(info.maxTextureSize).toBeGreaterThanOrEqual(4096);
		// In the CI container the launch flags force software GL; goldens
		// rendered there must never silently flip to a hardware driver
		if (process.env.CI) {
			expect(info.renderer).toContain('SwiftShader');
		}
		console.log(`[chromium-gl] renderer: ${info.renderer}`);
	});
});
