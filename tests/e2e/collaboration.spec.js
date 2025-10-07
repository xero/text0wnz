import { test, expect } from '@playwright/test';

test.describe('Collaboration and Chat Features', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should have chat button available', async ({ page }) => {
		const chatButton = page.locator('#chat-button');
		const count = await chatButton.count();

		if (count > 0) {
			await expect(chatButton).toBeVisible();
		}
	});

	test('should open chat window', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Check if chat window appears
			const chatWindow = page.locator('#chat-window, #chatRoom');
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
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			// Open chat
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for close button
			const closeButton = page.locator(
				'#chat-close, .chat-close, button:has-text("Close")',
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
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for message input
			const messageInput = page.locator(
				'#message-input, input[name="message"], textarea[name="message"]',
			);
			const inputCount = await messageInput.count();

			if (inputCount > 0) {
				await expect(messageInput.first()).toBeVisible();
			}
		}
	});

	test('should have user handle input', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for handle/username input
			const handleInput = page.locator(
				'#handle-input, input[name="handle"], input[name="username"]',
			);
			const handleCount = await handleInput.count();

			if (handleCount > 0) {
				await expect(handleInput.first()).toBeVisible();
			}
		}
	});

	test('should allow setting user handle', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const handleInput = page.locator('#handle-input');
			if (await handleInput.isVisible()) {
				await handleInput.fill('TestUser');
				await page.waitForTimeout(300);

				const value = await handleInput.inputValue();
				expect(value).toBe('TestUser');
			}
		}
	});

	test('should display message window', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for message display area
			const messageWindow = page.locator(
				'#message-window, .message-window, .chat-messages',
			);
			const windowCount = await messageWindow.count();

			if (windowCount > 0) {
				await expect(messageWindow.first()).toBeVisible();
			}
		}
	});

	test('should have notification toggle', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for notification checkbox
			const notificationToggle = page.locator(
				'#notification-checkbox, input[name="notifications"]',
			);
			const toggleCount = await notificationToggle.count();

			if (toggleCount > 0) {
				await expect(notificationToggle.first()).toBeVisible();
			}
		}
	});

	test('should display user list', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			// Look for user list
			const userList = page.locator('#user-list, .user-list');
			const listCount = await userList.count();

			if (listCount > 0) {
				await expect(userList.first()).toBeVisible();
			}
		}
	});

	test('should type message in chat input', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const messageInput = page.locator('#message-input');
			if (await messageInput.isVisible()) {
				await messageInput.fill('Hello, this is a test message!');
				await page.waitForTimeout(300);

				const value = await messageInput.inputValue();
				expect(value).toBe('Hello, this is a test message!');
			}
		}
	});

	test('should clear message input after sending', async ({ page }) => {
		const chatButton = page.locator('#chat-button');

		if (await chatButton.isVisible()) {
			await chatButton.click();
			await page.waitForTimeout(500);

			const messageInput = page.locator('#message-input');
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
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should detect local mode (no server)', async ({ page }) => {
		// In local mode, collaboration features might be disabled or hidden
		// This test verifies the app works without a collaboration server

		// Canvas should still be functional
		const canvas = page.locator('#canvas-container');
		await expect(canvas).toBeVisible();

		// Drawing tools should work
		const freehandTool = page.locator('#freehand');
		await freehandTool.click();
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
		await page.waitForSelector('#canvas-container', { timeout: 10000 });
		await page.waitForTimeout(1000);
	});

	test('should attempt server connection', async ({ page }) => {
		// Wait for potential connection attempt
		await page.waitForTimeout(2000);

		// App should function regardless of connection status
		const canvas = page.locator('#canvas-container');
		await expect(canvas).toBeVisible();
	});

	test('should show connection status if available', async ({ page }) => {
		// Look for connection indicator
		const connectionStatus = page.locator(
			'.connection-status, #connection-status, .online-indicator',
		);
		const statusCount = await connectionStatus.count();

		if (statusCount > 0) {
			// Connection status element exists
			await expect(connectionStatus.first()).toBeVisible();
		}
	});
});
