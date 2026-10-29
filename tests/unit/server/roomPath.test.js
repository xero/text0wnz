// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { roomNameFromPath } from '../../../src/js/server/moebiusServer.js';

describe('roomNameFromPath', () => {
	it('maps the root and the proxy path to the default room', () => {
		// case-insensitive like room names: /SERVER must not become a
		// room literally named "server"
		for (const path of ['/', '//', '/server', '/server/', '/SERVER']) {
			expect(roomNameFromPath(path, 'joint'), path).toBe('joint');
		}
	});

	it('reaches a named room bare or through the proxy prefix', () => {
		expect(roomNameFromPath('/lounge', 'joint')).toBe('lounge');
		expect(roomNameFromPath('/server/lounge', 'joint')).toBe('lounge');
		expect(roomNameFromPath('/server/Lounge/', 'joint')).toBe('lounge');
		// the word itself is never a room name, however it is spelled
		expect(roomNameFromPath('/server/server', 'joint')).toBe('joint');
		expect(roomNameFromPath('/server/SERVER/', 'joint')).toBe('joint');
	});

	it('refuses anything outside the grammar', () => {
		for (const path of [
			'/server/a/b',
			'/a/b',
			'/serverlounge!',
			'/../etc',
			'/' + 'x'.repeat(33),
		]) {
			expect(roomNameFromPath(path, 'joint'), path).toBeNull();
		}
	});
});
