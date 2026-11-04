/**
 * The night toggle's icon answers hover like the rest of the rail, and
 * a browser that blocks site storage still boots in the OS theme: the
 * head script paints before main.js runs, so it alone decides.
 */
import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers/editorHelpers.js';

const isDark = page =>
	page.evaluate(() => document.documentElement.classList.contains('dark'));

test.describe('dark mode', () => {
	test('the toggle lights its sun and beams on hover', async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
		const hovers = await page.evaluate(
			() => window.matchMedia('(hover: hover) and (pointer: fine)').matches,
		);
		test.skip(!hovers, 'the hover rules apply to a fine hovering pointer only');

		const toggle = page.locator('#navDarkmode');
		if (!(await toggle.isVisible())) {
			await page.locator('#navView').click();
		}
		await expect(toggle).toBeVisible();
		const paint = () =>
			toggle.evaluate(el => ({
				sun: window.getComputedStyle(el.querySelector('.sun')).fill,
				beams: window.getComputedStyle(el.querySelector('.sunBeams')).stroke,
			}));
		await page.mouse.move(0, 0);
		const idle = await paint();

		await toggle.hover();
		await expect
			.poll(async () => {
				const lit = await paint();
				return lit.sun !== idle.sun && lit.beams !== idle.beams;
			})
			.toBe(true);
	});

	for (const [scheme, dark] of [
		['dark', true],
		['light', false],
	]) {
		test(`blocked storage boots in the OS ${scheme} theme`, async ({ page }) => {
			await page.emulateMedia({ colorScheme: scheme });
			await page.addInitScript(() => {
				Object.defineProperty(window, 'localStorage', {
					configurable: true,
					get() {
						throw new window.DOMException('The operation is insecure.', 'SecurityError');
					},
				});
			});
			await page.goto('/', { waitUntil: 'domcontentloaded' });
			expect(await isDark(page)).toBe(dark);
		});
	}
});
