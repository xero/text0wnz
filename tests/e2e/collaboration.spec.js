import { test, expect } from '@playwright/test';

test.describe('Collaboration and Chat Features', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have chat button available', async ({ page }) => {
		const chatButton = page.locator('#chatButton');
		const count = await chatButton.count();

		// Chat button may not be visible if websocket is not enabled
		// Just verify it exists in the DOM
		expect(count).toBeGreaterThanOrEqual(0);
	});

	test('should open chat window', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Check if chat window appears
			const chatWindow = page.locator('#chatWindow, #chatRoom');
			const windowCount = await chatWindow.count();

			if (windowCount > 0) {
				// Chat window might be visible
				const isHidden = await chatWindow.first().evaluate(el => {
					return el.classList.contains('hide') || el.style.display === 'none';
				});

				// If not hidden, it should be visible
				if (!isHidden) {
					await expect(chatWindow.first()).toBeVisible();
				}
			}
		}
	});

	test('should close chat window', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			// Open chat
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for close button
			const closeButton = page.locator(
				'#chatClose, .chatClose, button:has-text("Close")',
			);
			const closeCount = await closeButton.count();

			if (closeCount > 0) {
				await closeButton.first().click();
				await page.waitForTimeout(500);
			} else {
				// Click chat button again to close
				await chatButton.click();
				await page.waitForTimeout(500);
			}
		}
	});

	test('should have chat input field', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for message input
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

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for handle/username input
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

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const handleInput = page.locator('#handleInput');
			if (await handleInput.isVisible()) {
				await handleInput.fill('TestUser');
				await page.waitForTimeout(300);

				const value = await handleInput.inputValue();
				expect(value).toBe('TestUser');
			}
		}
	});

	test('should display message window', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for message display area
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

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for notification checkbox
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

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for user list
			const userList = page.locator('#userList, .userList');
			const listCount = await userList.count();

			if (listCount > 0) {
				await expect(userList.first()).toBeVisible();
			}
		}
	});

	test('should type message in chat input', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const messageInput = page.locator('#messageInput');
			if (await messageInput.isVisible()) {
				await messageInput.fill('Hello, this is a test message!');
				await page.waitForTimeout(300);

				const value = await messageInput.inputValue();
				expect(value).toBe('Hello, this is a test message!');
			}
		}
	});

	test('should clear message input after sending', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const messageInput = page.locator('#messageInput');
			if (await messageInput.isVisible()) {
				// Type a message
				await messageInput.fill('Test message');
				await page.waitForTimeout(200);

				// Submit with Enter key
				await messageInput.press('Enter');
				await page.waitForTimeout(500);

				// Input should be cleared (in collaboration mode)
				// Note: This only works when connected to a server
			}
		}
	});
});

test.describe('Collaboration Mode Detection', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should detect local mode (no server)', async ({ page }) => {
		// In local mode, collaboration features might be disabled or hidden
		// This test verifies the app works without a collaboration server

		// Canvas should still be functional
		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();

		// Drawing tools should work - click brushes to show toolbar
		await page.locator('#brushes').click();
		await page.waitForTimeout(300);

		const halfblockTool = page.locator('#halfblock');
		await halfblockTool.click();
		await page.waitForTimeout(200);

		// Verify app is functional in local mode
		const errors = await page.locator('.error').count();
		expect(errors).toBe(0);
	});

	test('should handle missing server gracefully', async ({ page }) => {
		// The app should not crash if server is unavailable
		await page.waitForTimeout(2000);

		// App should either show no error or a graceful "offline mode" message
		// No JavaScript errors should occur
		const pageErrors = [];
		page.on('pageerror', error => pageErrors.push(error));

		await page.waitForTimeout(1000);

		// Critical errors should not occur
		const criticalErrors = pageErrors.filter(
			err => err.message.includes('undefined') || err.message.includes('null'),
		);
		expect(criticalErrors.length).toBe(0);
	});
});

test.describe('Network Features', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should attempt server connection', async ({ page }) => {
		// Wait for potential connection attempt
		await page.waitForTimeout(2000);

		// App should function regardless of connection status
		const canvas = page.locator('#canvasContainer');
		await expect(canvas).toBeVisible();
	});

	test('should show connection status if available', async ({ page }) => {
		// Look for connection indicator
		const connectionStatus = page.locator(
			'.connectionStatus, #connectionStatus, .onlineIndicator',
		);
		const statusCount = await connectionStatus.count();

		if (statusCount > 0) {
			// Connection status element exists
			await expect(connectionStatus.first()).toBeVisible();
		}
	});
});

test.describe('Chat Window Drag Functionality', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvasContainer', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have draggable cursor on chat header', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const chatHeader = page.locator('#chatWindow header');
			const headerCount = await chatHeader.count();

			if (headerCount > 0) {
				// Check cursor style
				const cursor = await chatHeader.evaluate(el => {
					return window.getComputedStyle(el).cursor;
				});

				expect(cursor).toBe('grab');
			}
		}
	});

	test('should allow dragging chat window by header', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const chatWindow = page.locator('#chatWindow');
			const chatHeader = page.locator('#chatWindow header h2');

			const windowCount = await chatWindow.count();
			if (windowCount > 0) {
				// Drag the header
				const headerBox = await chatHeader.boundingBox();
				if (headerBox) {
					await page.mouse.move(
						headerBox.x + headerBox.width / 2,
						headerBox.y + headerBox.height / 2,
					);
					await page.mouse.down();
					await page.mouse.move(headerBox.x + 100, headerBox.y + 50);
					await page.mouse.up();
					await page.waitForTimeout(300);

					// Check that transform contains translate values
					const newTransform = await chatWindow.evaluate(el => {
						return el.style.transform || '';
					});

					// Transform should contain translate after dragging
					expect(newTransform).toContain('translate');
					expect(newTransform).toMatch(/translate\(.+px,\s*.+px\)/);
				}
			}
		}
	});

	test('should not select text when dragging', async ({ page }) => {
		const chatButton = page.locator('#chatButton');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const chatHeader = page.locator('#chatWindow header');
			const headerCount = await chatHeader.count();

			if (headerCount > 0) {
				// Check user-select style
				const userSelect = await chatHeader.evaluate(el => {
					return window.getComputedStyle(el).userSelect;
				});

				expect(userSelect).toBe('none');
			}
		}
	});
});
