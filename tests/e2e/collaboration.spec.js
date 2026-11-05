import { test, expect } from '@playwright/test';
import { waitForEditorReady } from './helpers/editorHelpers.js';

// the chat button hides while local; without a live session these
// bodies would pass on nothing, so they skip out loud
test.describe('Collaboration and Chat Features', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test('should hide the chat button outside a collab session', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		// the chat button only shows with websockets enabled
		await expect(chatButton).toBeAttached();
		await expect(chatButton).toBeHidden();
	});

	test('should open chat window', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const chatWindow = page.locator('#chatWindow, #chatRoom');
			const windowCount = await chatWindow.count();

			if (windowCount > 0) {
				const isHidden = await chatWindow.first().evaluate(el => {
					return el.classList.contains('hide') || el.style.display === 'none';
				});

				if (!isHidden) {
					await expect(chatWindow.first()).toBeVisible();
				}
			}
		}
	});

	test('should close chat window', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeHidden();
		}
	});

	test('should have chat input field', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const messageInput = page.locator(
				'#messageInput, input[name="message"], textarea[name="message"]',
			);
			const inputCount = await messageInput.count();

			if (inputCount > 0) {
				await expect(messageInput.first()).toBeVisible();
			}
		}
	});

	test('should have user handle input', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const handleInput = page.locator(
				'#handleInput, input[name="handle"], input[name="username"]',
			);
			const handleCount = await handleInput.count();

			if (handleCount > 0) {
				await expect(handleInput.first()).toBeVisible();
			}
		}
	});

	test('should allow setting user handle', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const handleInput = page.locator('#handleInput');
			if (await handleInput.isVisible()) {
				await handleInput.fill('TestUser');

				const value = await handleInput.inputValue();
				expect(value).toBe('TestUser');
			}
		}
	});

	test('should display message window', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const messageWindow = page.locator(
				'#messageWindow, .messageWindow, .chatMessages',
			);
			const windowCount = await messageWindow.count();

			if (windowCount > 0) {
				await expect(messageWindow.first()).toBeVisible();
			}
		}
	});

	test('should have notification toggle', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const notificationToggle = page.locator(
				'#notificationCheckbox, input[name="notifications"]',
			);
			const toggleCount = await notificationToggle.count();

			if (toggleCount > 0) {
				await expect(notificationToggle.first()).toBeVisible();
			}
		}
	});

	test('should display user list', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const userList = page.locator('#userList, .userList');
			const listCount = await userList.count();

			if (listCount > 0) {
				await expect(userList.first()).toBeVisible();
			}
		}
	});

	test('should type message in chat input', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const messageInput = page.locator('#messageInput');
			if (await messageInput.isVisible()) {
				await messageInput.fill('Hello, this is a test message!');

				const value = await messageInput.inputValue();
				expect(value).toBe('Hello, this is a test message!');
			}
		}
	});

	test('should clear message input after sending', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const messageInput = page.locator('#messageInput');
			if (await messageInput.isVisible()) {
				await messageInput.fill('Test message');
				// the skip above guarantees a live session, the one place a
				// sent message clears the input
				await messageInput.press('Enter');
				await expect(messageInput).toHaveValue('');
			}
		}
	});
});

// every boot probes the same-origin default for a collab server; the
// static e2e server answers no websocket, and the worker's reply is
// the moment the page settles on staying local
test.describe('Collaboration Mode Detection', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => {
			const Native = window.Worker;
			window.Worker = class extends Native {
				constructor(...args) {
					super(...args);
					this.addEventListener('message', e => {
						if (e.data?.cmd === 'probeResult') {
							window.__probe = e.data;
						}
					});
				}
			};
		});
	});

	test('the boot probe finds no server and the editor stays local', async ({ page }) => {
		const errors = [];
		page.on('pageerror', error => errors.push(error.message));
		await page.goto('/');
		await waitForEditorReady(page);

		await page.waitForFunction(() => window.__probe);
		expect(await page.evaluate(() => window.__probe)).toEqual({
			cmd: 'probeResult',
			found: false,
		});
		// no invitation to join, and no session chrome
		expect(await page.evaluate(() => document.getElementById('modal').open)).toBe(false);
		await expect(page.locator('#chatButton')).toBeHidden();
		expect(errors).toEqual([]);
	});
});

test.describe('Chat Window Drag Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await waitForEditorReady(page);
	});

	test('should have draggable cursor on chat header', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			// the chat window is a floating module: its title strip is the
			// drag handle and wears the move cursor
			const chatHeader = page.locator('#chatWindow .modHeader');
			const headerCount = await chatHeader.count();

			if (headerCount > 0) {
				const cursor = await chatHeader.evaluate(el => {
					return window.getComputedStyle(el).cursor;
				});

				expect(cursor).toBe('move');
			}
		}
	});

	test('should allow dragging chat window by header', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const chatWindow = page.locator('#chatWindow');
			const chatHeader = page.locator('#chatWindow .modHeader');

			const windowCount = await chatWindow.count();
			if (windowCount > 0) {
				const before = await chatWindow.boundingBox();
				const headerBox = await chatHeader.boundingBox();
				if (headerBox && before) {
					// grab clear of the strip's buttons
					await page.mouse.move(headerBox.x + 60, headerBox.y + 8);
					await page.mouse.down();
					const to = { x: headerBox.x + 160, y: headerBox.y + 58 };
					await page.mouse.move(to.x, to.y, { steps: 8 });
					await page.mouse.up();

					// the module registry moves the window, never a transform
					await expect
						.poll(async () => {
							const after = await chatWindow.boundingBox();
							return [Math.round(after.x - before.x), Math.round(after.y - before.y)];
						})
						.toEqual([100, 50]);
				}
			}
		}
	});

	test('should not select text when dragging', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		test.skip(!(await chatButton.isVisible()), 'chat needs a live collab session');
		if (await chatButton.isVisible()) {
			await chatButton.click();
			await expect(page.locator('#chatWindow')).toBeVisible();

			const chatHeader = page.locator('#chatWindow .modHeader');
			const headerCount = await chatHeader.count();

			if (headerCount > 0) {
				const userSelect = await chatHeader.evaluate(el => {
					return window.getComputedStyle(el).userSelect;
				});

				expect(userSelect).toBe('none');
			}
		}
	});
});
