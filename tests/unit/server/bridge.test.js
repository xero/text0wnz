// @vitest-environment node
/**
 * Bridge lockdowns: private-range denial (DNS
 * rebinding included), port pinning, the fixed-target `local` mode,
 * and the explicit allow list. All pure: DNS is injected.
 */
import { describe, it, expect } from 'vitest';
import {
	isPrivateAddress,
	vetResolvedAddresses,
	resolveBridgeTarget,
	bridgeConfigFromEnv,
	BRIDGE_DEFAULTS,
} from '../../../src/js/server/bridge.js';

describe('isPrivateAddress', () => {
	it('denies every private, loopback, link-local, and CGNAT range', () => {
		for (const ip of [
			'127.0.0.1',
			'127.255.255.254',
			'10.0.0.1',
			'172.16.0.1',
			'172.31.255.255',
			'192.168.1.1',
			'169.254.169.254', // the cloud metadata classic
			'100.64.0.1',
			'0.0.0.0',
			'::1',
			'::',
			'fe80::1',
			'fc00::1',
			'fd12:3456::1',
			'::ffff:10.0.0.1', // v4-mapped v6
			'::ffff:127.0.0.1',
		]) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
	});

	it('allows public addresses', () => {
		for (const ip of [
			'93.184.216.34',
			'8.8.8.8',
			'172.15.0.1',
			'172.32.0.1',
			'100.63.0.1',
			'100.128.0.1',
			'2606:2800:220:1::1',
		]) {
			expect(isPrivateAddress(ip), ip).toBe(false);
		}
	});
});

describe('vetResolvedAddresses', () => {
	it('refuses when ANY resolved address is private (rebinding defense)', () => {
		expect(
			vetResolvedAddresses(['93.184.216.34', '10.0.0.5']).ok,
		).toBe(false);
		expect(vetResolvedAddresses([]).ok).toBe(false);
		const ok = vetResolvedAddresses(['93.184.216.34', '8.8.8.8']);
		expect(ok).toEqual({ ok: true, address: '93.184.216.34' });
	});
});

describe('resolveBridgeTarget', () => {
	const base = { mode: 'off', target: '', port: 8000, allow: []};

	it('off refuses everything (the default)', async () => {
		const result = await resolveBridgeTarget(base, { host: 'example.com' });
		expect(result.ok).toBe(false);
	});

	it('local dials only the fixed target; the request steers nothing', async () => {
		const result = await resolveBridgeTarget(
			{ ...base, mode: 'local', target: 'ws://127.0.0.1:8000/room' },
			{ host: 'evil.example', port: 22, room: 'x' },
		);
		expect(result).toEqual({ ok: true, url: 'ws://127.0.0.1:8000/room' });
	});

	it('port mode pins the port and dials the vetted IP', async () => {
		const resolver = async () => ['93.184.216.34'];
		const result = await resolveBridgeTarget(
			{ ...base, mode: 'port', port: 8000 },
			{ host: 'tiles.example', port: '8000', room: 'lounge' },
			resolver,
		);
		// the dial uses the RESOLVED ip (rebinding moot)
		expect(result).toEqual({
			ok: true,
			url: 'ws://93.184.216.34:8000/lounge',
		});
		// no port named means the pinned one
		const unnamed = await resolveBridgeTarget(
			{ ...base, mode: 'port', port: 8000 },
			{ host: 'tiles.example', port: null, room: '' },
			resolver,
		);
		expect(unnamed).toEqual({ ok: true, url: 'ws://93.184.216.34:8000/' });
		// a port it will not dial is refused, never silently rewritten
		const other = await resolveBridgeTarget(
			{ ...base, mode: 'port', port: 8000 },
			{ host: 'tiles.example', port: '22', room: 'lounge' },
			resolver,
		);
		expect(other.ok).toBe(false);
		expect(other.reason).toMatch(/not allowed/);
	});

	it('port mode refuses private resolutions, ip literals, and rebinders', async () => {
		const privateResolver = async () => ['10.1.2.3'];
		expect(
			(
				await resolveBridgeTarget(
					{ ...base, mode: 'port' },
					{ host: 'internal.example' },
					privateResolver,
				)
			).ok,
		).toBe(false);
		// ip literal: no dns involved, still vetted
		expect(
			(
				await resolveBridgeTarget(
					{ ...base, mode: 'port' },
					{ host: '169.254.169.254' },
				)
			).ok,
		).toBe(false);
		// one public + one private record = refusal
		const rebinder = async () => ['93.184.216.34', '192.168.0.10'];
		expect(
			(
				await resolveBridgeTarget(
					{ ...base, mode: 'port' },
					{ host: 'rebind.example' },
					rebinder,
				)
			).ok,
		).toBe(false);
	});

	it('port mode rejects malformed hosts and rooms', async () => {
		const resolver = async () => ['93.184.216.34'];
		expect(
			(
				await resolveBridgeTarget(
					{ ...base, mode: 'port' },
					{ host: 'bad host!' },
					resolver,
				)
			).ok,
		).toBe(false);
		const weirdRoom = await resolveBridgeTarget(
			{ ...base, mode: 'port' },
			{ host: 'ok.example', room: '../../etc' },
			resolver,
		);
		// a bad room is refused outright: never a path escape, and never
		// a silent swap for the default joint
		expect(weirdRoom).toEqual({ ok: false, reason: 'bad room' });
	});

	it('allow mode admits exactly the listed host:port pairs', async () => {
		const config = {
			...base,
			mode: 'allow',
			allow: ['192.168.1.50:8000', 'tiles.example:9999'],
		};
		// private entry = informed consent, dialed as given
		expect(
			await resolveBridgeTarget(config, {
				host: '192.168.1.50',
				port: '8000',
				room: 'art',
			}),
		).toEqual({ ok: true, url: 'ws://192.168.1.50:8000/art' });
		expect(
			(
				await resolveBridgeTarget(config, {
					host: '192.168.1.50',
					port: '2222',
				})
			).ok,
		).toBe(false);
		expect(
			(await resolveBridgeTarget(config, { host: 'other.example', port: '9999' }))
				.ok,
		).toBe(false);
	});
});

describe('bridgeConfigFromEnv', () => {
	it('defaults to off and parses the allow list', () => {
		expect(bridgeConfigFromEnv({}).mode).toBe('off');
		const config = bridgeConfigFromEnv({
			BRIDGE: 'ALLOW',
			BRIDGE_ALLOW: ' a.example:8000 , b.example:9000 ',
			BRIDGE_PORT: '8123',
		});
		expect(config.mode).toBe('allow');
		expect(config.allow).toEqual(['a.example:8000', 'b.example:9000']);
		expect(config.port).toBe(8123);
		expect(BRIDGE_DEFAULTS.mode).toBe('off');
	});
});

describe('v6 encoding bypasses (review pass)', () => {
	it('denies hex v4-mapped, v4-compatible, and NAT64 encodings', () => {
		for (const ip of [
			'::ffff:7f00:1', // hex v4-mapped loopback
			'::7f00:1', // v4-compatible loopback
			'::127.0.0.1',
			'64:ff9b::7f00:1', // NAT64
			'64:ff9b::192.168.0.1',
		]) {
			expect(isPrivateAddress(ip), ip).toBe(true);
		}
		// global unicast stays public
		expect(isPrivateAddress('2606:2800:220:1::1')).toBe(false);
		expect(isPrivateAddress('2001:db8::1')).toBe(false);
	});
});
