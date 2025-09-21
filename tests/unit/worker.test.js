import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Worker Module Core Logic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('removeDuplicates Algorithm', () => {
		// Test the actual removeDuplicates algorithm from worker.js
		const removeDuplicates = blocks => {
			const indexes = [];
			let index;
			blocks = blocks.reverse();
			blocks = blocks.filter(block => {
				index = block >> 16;
				if (indexes.lastIndexOf(index) === -1) {
					indexes.push(index);
					return true;
				}
				return false;
			});
			return blocks.reverse();
		};

		it('should remove duplicate blocks correctly', () => {
			// Block format: (index << 16) | data
			const blocks = [
				(1 << 16) | 0x41, // Position 1, data 0x41
				(2 << 16) | 0x42, // Position 2, data 0x42
				(1 << 16) | 0x43, // Position 1, data 0x43 (duplicate position)
				(3 << 16) | 0x44, // Position 3, data 0x44
				(2 << 16) | 0x45, // Position 2, data 0x45 (duplicate position)
			];

			const result = removeDuplicates(blocks);

			// Should keep only the last occurrence of each position
			expect(result.length).toBe(3);
			expect(result).toContain((1 << 16) | 0x43); // Last occurrence of position 1
			expect(result).toContain((3 << 16) | 0x44); // Only occurrence of position 3
			expect(result).toContain((2 << 16) | 0x45); // Last occurrence of position 2
		});

		it('should handle empty blocks array', () => {
			const result = removeDuplicates([]);
			expect(result).toEqual([]);
		});

		it('should handle single block', () => {
			const blocks = [(1 << 16) | 0x41];
			const result = removeDuplicates(blocks);
			expect(result).toEqual(blocks);
		});

		it('should preserve order for non-duplicate blocks', () => {
			const blocks = [(1 << 16) | 0x41, (2 << 16) | 0x42, (3 << 16) | 0x43];
			const result = removeDuplicates(blocks);
			// Should maintain original order when no duplicates
			expect(result[0]).toBe((1 << 16) | 0x41);
			expect(result[1]).toBe((2 << 16) | 0x42);
			expect(result[2]).toBe((3 << 16) | 0x43);
			expect(result.length).toBe(3);
		});

		it('should handle all duplicate blocks', () => {
			const blocks = [(1 << 16) | 0x41, (1 << 16) | 0x42, (1 << 16) | 0x43];
			const result = removeDuplicates(blocks);
			expect(result).toEqual([(1 << 16) | 0x43]); // Last occurrence
		});
	});

	describe('Message Processing Logic', () => {
		it('should handle start message data extraction', () => {
			const processStartMessage = data => {
				const msg = data[1];
				const sessionID = data[2];
				const userList = data[3];

				return {
					canvasSettings: {
						columns: msg.columns,
						rows: msg.rows,
						iceColors: msg.iceColors,
						letterSpacing: msg.letterSpacing,
						fontName: msg.fontName,
					},
					sessionID: sessionID,
					users: Object.keys(userList),
					chatHistory: msg.chat || [],
				};
			};

			const startData = [
				'start',
				{
					columns: 80,
					rows: 25,
					iceColors: false,
					letterSpacing: true,
					fontName: 'CP437 8x16',
					chat: [
						['User1', 'Hello'],
						['User2', 'Hi'],
					],
				},
				'session123',
				{ user1: 'User1', user2: 'User2' },
			];

			const result = processStartMessage(startData);

			expect(result.canvasSettings.columns).toBe(80);
			expect(result.canvasSettings.rows).toBe(25);
			expect(result.canvasSettings.iceColors).toBe(false);
			expect(result.canvasSettings.letterSpacing).toBe(true);
			expect(result.canvasSettings.fontName).toBe('CP437 8x16');
			expect(result.sessionID).toBe('session123');
			expect(result.users).toEqual(['user1', 'user2']);
			expect(result.chatHistory).toHaveLength(2);
		});

		it('should handle draw message block conversion', () => {
			const processDraw = (blocks, joint) => {
				const outputBlocks = [];
				let index;
				blocks.forEach(block => {
					index = block >> 16;
					outputBlocks.push([index, block & 0xffff, index % joint.columns, Math.floor(index / joint.columns)]);
				});
				return outputBlocks;
			};

			const joint = { columns: 80, rows: 25 };
			const blocks = [(160 << 16) | 0x41, (161 << 16) | 0x42]; // positions 160, 161

			const result = processDraw(blocks, joint);

			expect(result).toEqual([
				[160, 0x41, 0, 2], // position 160 = x:0, y:2 (160/80=2)
				[161, 0x42, 1, 2], // position 161 = x:1, y:2 (161/80=2, 161%80=1)
			]);
		});

		it('should handle join notification logic', () => {
			const processJoin = (handle, joinSessionID, currentSessionID) => {
				return {
					handle,
					sessionID: joinSessionID,
					showNotification: joinSessionID !== currentSessionID,
				};
			};

			const currentSession = 'session123';

			// Same session - no notification
			const sameSession = processJoin('User1', 'session123', currentSession);
			expect(sameSession.showNotification).toBe(false);

			// Different session - show notification
			const differentSession = processJoin('User2', 'session456', currentSession);
			expect(differentSession.showNotification).toBe(true);
		});

		it('should handle nick notification logic', () => {
			const processNick = (handle, nickSessionID, currentSessionID) => {
				return {
					handle,
					sessionID: nickSessionID,
					showNotification: nickSessionID !== currentSessionID,
				};
			};

			const currentSession = 'session123';

			// Different session - show notification
			const result = processNick('NewNick', 'session456', currentSession);
			expect(result.handle).toBe('NewNick');
			expect(result.sessionID).toBe('session456');
			expect(result.showNotification).toBe(true);

			// Same session - no notification
			const sameSessionResult = processNick('NewNick', 'session123', currentSession);
			expect(sameSessionResult.showNotification).toBe(false);
		});
	});

	describe('Message Format Validation', () => {
		it('should validate WebSocket message format', () => {
			const formatMessage = (cmd, data) => {
				return JSON.stringify([cmd, data]);
			};

			expect(formatMessage('join', 'TestUser')).toBe('["join","TestUser"]');
			expect(formatMessage('chat', 'Hello world')).toBe('["chat","Hello world"]');
			expect(formatMessage('draw', [0x41, 0x42])).toBe('["draw",[65,66]]');

			const settingsMessage = formatMessage('canvasSettings', { columns: 80, rows: 25 });
			expect(JSON.parse(settingsMessage)).toEqual(['canvasSettings', { columns: 80, rows: 25 }]);
		});

		it('should handle JSON parsing with error handling', () => {
			const safeParseMessage = data => {
				try {
					return JSON.parse(data);
				} catch {
					return null;
				}
			};

			expect(safeParseMessage('["valid","json"]')).toEqual(['valid', 'json']);
			expect(safeParseMessage('invalid json{')).toBeNull();
			expect(safeParseMessage('')).toBeNull();
			expect(safeParseMessage(null)).toBeNull();
		});

		it('should validate command types', () => {
			const isValidCommand = cmd => {
				const validCommands = [
					'start',
					'join',
					'nick',
					'draw',
					'chat',
					'part',
					'canvasSettings',
					'resize',
					'fontChange',
					'iceColorsChange',
					'letterSpacingChange',
				];
				return validCommands.includes(cmd);
			};

			expect(isValidCommand('join')).toBe(true);
			expect(isValidCommand('chat')).toBe(true);
			expect(isValidCommand('unknownCommand')).toBe(false);
			expect(isValidCommand('')).toBe(false);
			expect(isValidCommand(null)).toBe(false);
		});
	});

	describe('WebSocket State Management', () => {
		it('should validate WebSocket ready states', () => {
			const WEBSOCKET_STATES = {
				CONNECTING: 0,
				OPEN: 1,
				CLOSING: 2,
				CLOSED: 3,
			};

			const canSend = readyState => readyState === WEBSOCKET_STATES.OPEN;

			expect(canSend(WEBSOCKET_STATES.CONNECTING)).toBe(false);
			expect(canSend(WEBSOCKET_STATES.OPEN)).toBe(true);
			expect(canSend(WEBSOCKET_STATES.CLOSING)).toBe(false);
			expect(canSend(WEBSOCKET_STATES.CLOSED)).toBe(false);
		});

		it('should handle connection URL validation', () => {
			const validateWebSocketURL = url => {
				try {
					const wsURL = new URL(url);
					return {
						isValid: wsURL.protocol === 'ws:' || wsURL.protocol === 'wss:',
						protocol: wsURL.protocol,
						hostname: wsURL.hostname,
						port: wsURL.port,
					};
				} catch {
					return { isValid: false };
				}
			};

			expect(validateWebSocketURL('ws://localhost:1337').isValid).toBe(true);
			expect(validateWebSocketURL('wss://example.com:8080').isValid).toBe(true);
			expect(validateWebSocketURL('http://localhost:1337').isValid).toBe(false);
			expect(validateWebSocketURL('invalid-url').isValid).toBe(false);
		});
	});

	describe('Canvas Settings Processing', () => {
		it('should extract canvas settings from messages', () => {
			const extractSettings = msg => {
				return {
					columns: msg.columns,
					rows: msg.rows,
					iceColors: msg.iceColors,
					letterSpacing: msg.letterSpacing,
					fontName: msg.fontName,
				};
			};

			const input = {
				columns: 120,
				rows: 40,
				iceColors: true,
				letterSpacing: false,
				fontName: 'CP437 8x8',
				extraField: 'ignored',
			};

			const result = extractSettings(input);

			expect(result.columns).toBe(120);
			expect(result.rows).toBe(40);
			expect(result.iceColors).toBe(true);
			expect(result.letterSpacing).toBe(false);
			expect(result.fontName).toBe('CP437 8x8');
			expect(result.extraField).toBeUndefined();
		});

		it('should handle resize validation', () => {
			const validateResize = data => {
				return {
					columns: data.columns,
					rows: data.rows,
					isValid: Number.isInteger(data.columns) && Number.isInteger(data.rows) && data.columns > 0 && data.rows > 0,
				};
			};

			expect(validateResize({ columns: 80, rows: 25 }).isValid).toBe(true);
			expect(validateResize({ columns: -1, rows: 25 }).isValid).toBe(false);
			expect(validateResize({ columns: 80.5, rows: 25 }).isValid).toBe(false);
		});

		it('should handle font change validation', () => {
			const validateFontChange = data => {
				return {
					fontName: data.fontName,
					isValid: typeof data.fontName === 'string' && data.fontName.length > 0,
				};
			};

			expect(validateFontChange({ fontName: 'CP437 8x8' }).isValid).toBe(true);
			expect(validateFontChange({ fontName: '' }).isValid).toBe(false);
			expect(validateFontChange({ fontName: null }).isValid).toBe(false);
		});

		it('should handle boolean setting validation', () => {
			const validateBooleanSetting = (data, settingName) => {
				return {
					[settingName]: data[settingName],
					isValid: typeof data[settingName] === 'boolean',
				};
			};

			expect(validateBooleanSetting({ iceColors: true }, 'iceColors').isValid).toBe(true);
			expect(validateBooleanSetting({ iceColors: 'true' }, 'iceColors').isValid).toBe(false);
			expect(validateBooleanSetting({ letterSpacing: false }, 'letterSpacing').isValid).toBe(true);
		});
	});

	describe('Error Handling and Edge Cases', () => {
		it('should handle malformed data gracefully', () => {
			const processData = data => {
				try {
					if (typeof data === 'string') {
						const parsed = JSON.parse(data);
						return { success: true, data: parsed };
					}
					return { success: true, data: data };
				} catch (error) {
					return { success: false, error: error.message };
				}
			};

			expect(processData('["valid","json"]').success).toBe(true);
			expect(processData('invalid{').success).toBe(false);
			expect(processData(null).success).toBe(true);
			expect(processData(undefined).success).toBe(true);
		});

		it('should truncate long error messages', () => {
			const formatErrorMessage = data => {
				const maxLength = 100;
				if (typeof data === 'string' && data.length > maxLength) {
					return data.slice(0, maxLength) + '...[truncated]';
				}
				return String(data);
			};

			const longString = 'a'.repeat(150);
			const result = formatErrorMessage(longString);

			expect(result.length).toBeLessThanOrEqual(115); // 100 + '...[truncated]'
			expect(result).toContain('...[truncated]');
		});

		it('should handle binary data processing', () => {
			const isBinaryData = data => {
				return (
					data instanceof ArrayBuffer ||
					data instanceof Uint8Array ||
					(typeof data === 'object' && data !== null && typeof data.byteLength === 'number')
				);
			};

			expect(isBinaryData(new ArrayBuffer(8))).toBe(true);
			expect(isBinaryData(new Uint8Array(8))).toBe(true);
			expect(isBinaryData('string')).toBe(false);
			expect(isBinaryData({})).toBe(false);
			expect(isBinaryData(null)).toBe(false);
		});
	});
});
