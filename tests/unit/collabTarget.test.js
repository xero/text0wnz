/**
 * Address grammar for the connect dialog and the worker: bare
 * host[:port][/room] spellings, explicit urls, the 8000 and 443
 * defaults, and the display spelling round trip.
 */
import { describe, it, expect } from 'vitest';
import {
	MOEBIUS_PORT,
	defaultServerUrl,
	formatTarget,
	parseTarget,
	resolveTransport,
	targetRoom,
	targetToUrl,
} from '../../src/js/client/collabTarget.js';

describe('parseTarget', () => {
	it('reads a bare host as plaintext ws on the Moebius port', () => {
		expect(parseTarget('jam.example')).toEqual({
			protocol: 'ws:',
			host: 'jam.example',
			port: MOEBIUS_PORT,
			path: '',
		});
	});

	it('keeps a typed port and room path', () => {
		expect(parseTarget(' 10.0.0.5:1337/lounge ')).toEqual({
			protocol: 'ws:',
			host: '10.0.0.5',
			port: 1337,
			path: '/lounge',
		});
	});

	it('does not lose a typed :80 to the Moebius default', () => {
		expect(parseTarget('jam.example:80').port).toBe(80);
	});

	it('treats a bare :443 as wss', () => {
		expect(parseTarget('text.0w.nz:443/server')).toEqual({
			protocol: 'wss:',
			host: 'text.0w.nz',
			port: 443,
			path: '/server',
		});
	});

	it('honors explicit urls and their scheme defaults', () => {
		expect(parseTarget('wss://text.0w.nz/server')).toEqual({
			protocol: 'wss:',
			host: 'text.0w.nz',
			port: 443,
			path: '/server',
		});
		expect(parseTarget('ws://jam.example/')).toEqual({
			protocol: 'ws:',
			host: 'jam.example',
			port: 80,
			path: '',
		});
		// an explicit ws on 443 stays plaintext: the user said so
		expect(parseTarget('ws://jam.example:443').protocol).toBe('ws:');
	});

	it('accepts bracketed v6 literals', () => {
		expect(parseTarget('[::1]:8000/fixture')).toEqual({
			protocol: 'ws:',
			host: '[::1]',
			port: 8000,
			path: '/fixture',
		});
	});

	it('collapses doubled slashes so one spelling means one room', () => {
		expect(parseTarget('jam.example//lounge').path).toBe('/lounge');
		expect(parseTarget('jam.example/lounge//').path).toBe('/lounge');
		expect(parseTarget('ws://jam.example:1337//').path).toBe('');
	});

	it('rejects a typed :0 instead of reading it as a default', () => {
		expect(parseTarget('jam.example:0')).toBeNull();
		expect(parseTarget('wss://jam.example:0')).toBeNull();
	});

	it('rejects blanks, junk, and non-strings', () => {
		expect(parseTarget('')).toBeNull();
		expect(parseTarget('   ')).toBeNull();
		expect(parseTarget('not a host')).toBeNull();
		expect(parseTarget('http://jam.example')).toBeNull();
		expect(parseTarget(null)).toBeNull();
		expect(parseTarget(42)).toBeNull();
	});
});

describe('targetToUrl and formatTarget', () => {
	it('builds the dial url with the port always explicit', () => {
		expect(targetToUrl(parseTarget('jam.example'))).toBe(
			'ws://jam.example:8000/',
		);
		expect(targetToUrl(parseTarget('wss://text.0w.nz/server'))).toBe(
			'wss://text.0w.nz:443/server',
		);
	});

	it('round-trips every spelling through its display form', () => {
		for (const typed of [
			'jam.example',
			'jam.example:1337/lounge',
			'jam.example:80',
			'wss://text.0w.nz/server',
			'wss://text.0w.nz:8443/server',
			'ws://jam.example:443/odd',
			'text.0w.nz:443/server',
			'[::1]:8000/fixture',
		]) {
			const target = parseTarget(typed);
			expect(parseTarget(formatTarget(target))).toEqual(target);
		}
	});

	it('drops the default port from the display form', () => {
		expect(formatTarget(parseTarget('jam.example:8000'))).toBe('jam.example');
		expect(formatTarget(parseTarget('wss://text.0w.nz:443/server'))).toBe(
			'wss://text.0w.nz/server',
		);
	});

	it('names the room without its slash', () => {
		expect(targetRoom(parseTarget('jam.example/lounge'))).toBe('lounge');
		expect(targetRoom(parseTarget('jam.example'))).toBe('');
	});
});

describe('defaultServerUrl', () => {
	it('matches the page scheme and fills the default port', () => {
		expect(
			defaultServerUrl({ protocol: 'https:', hostname: 'text.0w.nz', port: '' }),
		).toBe('wss://text.0w.nz:443/server');
		expect(
			defaultServerUrl({ protocol: 'http:', hostname: 'localhost', port: '3000' }),
		).toBe('ws://localhost:3000/server');
	});
});

describe('resolveTransport', () => {
	const http = { protocol: 'http:', hostname: 'localhost', host: 'localhost:8060', port: '8060' };
	const https = { protocol: 'https:', hostname: 'text.0w.nz', host: 'text.0w.nz', port: '' };

	it('dials plaintext servers direct from a plain page', () => {
		expect(resolveTransport(http, 'jam.example/lounge')).toEqual({
			url: 'ws://jam.example:8000/lounge',
			bridged: false,
		});
	});

	it('routes plaintext servers through the host bridge from a secure page', () => {
		expect(resolveTransport(https, 'jam.example/lounge')).toEqual({
			url: 'wss://text.0w.nz/bridge?host=jam.example&port=8000&room=lounge',
			bridged: true,
		});
		expect(resolveTransport(https, 'ws://10.0.0.5:1337')).toEqual({
			url: 'wss://text.0w.nz/bridge?host=10.0.0.5&port=1337&room=',
			bridged: true,
		});
	});

	it('dials secure servers direct from anywhere', () => {
		expect(resolveTransport(https, 'wss://other.example/server')).toEqual({
			url: 'wss://other.example:443/server',
			bridged: false,
		});
		expect(resolveTransport(http, 'other.example:443')).toEqual({
			url: 'wss://other.example:443/',
			bridged: false,
		});
	});

	it('falls back to the same-origin default without a usable url', () => {
		expect(resolveTransport(http, undefined)).toEqual({
			url: 'ws://localhost:8060/server',
			bridged: false,
		});
		expect(resolveTransport(https, 'not a host')).toEqual({
			url: 'wss://text.0w.nz:443/server',
			bridged: false,
		});
	});
});
