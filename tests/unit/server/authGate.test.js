import { describe, it, expect } from 'vitest';
import {
	AUTH_GATE_KEYS,
	AUTH_ROOM_BUDGET,
	addressKey,
	clientAddress,
	createAuthGate,
} from '../../../src/js/server/authGate.js';

const headers = map => ({ get: name => map[name] ?? null });

describe('clientAddress', () => {
	it('a direct peer is its own address, whatever it claims', () => {
		const claims = headers({ 'x-real-ip': '6.6.6.6', 'x-forwarded-for': '7.7.7.7' });
		expect(clientAddress('203.0.113.9', claims)).toBe('203.0.113.9');
		expect(clientAddress('::ffff:203.0.113.9', claims)).toBe('203.0.113.9');
	});

	it('a loopback proxy names the client, port and all', () => {
		// the Docker image's Caddy sends {remote}, which keeps the port
		expect(clientAddress('127.0.0.1', headers({ 'x-real-ip': '198.51.100.7:51234' }))).toBe('198.51.100.7');
		expect(clientAddress('::1', headers({ 'x-real-ip': '[2001:db8::7]:443' }))).toBe('2001:db8::7');
		// no X-Real-IP: the hop the proxy appended last
		expect(clientAddress('127.0.0.1', headers({ 'x-forwarded-for': '6.6.6.6, 198.51.100.7' }))).toBe('198.51.100.7');
	});

	it('two forwarded names that disagree count as the proxy itself', () => {
		// Caddy and Apache pass a visitor's X-Real-IP through but append
		// the true hop to X-Forwarded-For
		expect(
			clientAddress('127.0.0.1', headers({ 'x-real-ip': '6.6.6.6', 'x-forwarded-for': '198.51.100.7' })),
		).toBe('127.0.0.1');
		// an nginx setting only X-Real-IP passes a forged X-Forwarded-For on
		expect(
			clientAddress('127.0.0.1', headers({ 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '6.6.6.6' })),
		).toBe('127.0.0.1');
		// both set by the proxy agree, the Docker image's Caddy included
		expect(
			clientAddress('127.0.0.1', headers({ 'x-real-ip': '198.51.100.7:40001', 'x-forwarded-for': '6.6.6.6, 198.51.100.7' })),
		).toBe('198.51.100.7');
	});

	it('TRUST_PROXY extends the trust; garbage falls back to the peer', () => {
		const claim = headers({ 'x-real-ip': '198.51.100.7' });
		expect(clientAddress('172.18.0.2', claim)).toBe('172.18.0.2');
		expect(clientAddress('172.18.0.2', claim, ['172.18.0.2'])).toBe('198.51.100.7');
		expect(clientAddress('127.0.0.1', headers({ 'x-real-ip': 'not an address' }))).toBe('127.0.0.1');
	});
});

describe('addressKey', () => {
	it('never carries the address', () => {
		const key = addressKey('198.51.100.7');
		expect(key).not.toContain('198');
		expect(key).toBe(addressKey('198.51.100.7'));
		expect(key).not.toBe(addressKey('198.51.100.8'));
	});

	it('one /64 is one key, however its addresses are spelled', () => {
		// a subscriber holds the whole /64: per-address keys would hand
		// them endless fresh backoffs
		const key = addressKey('2001:db8:1:2::1');
		expect(addressKey('2001:db8:1:2:ffff:ffff:ffff:ffff')).toBe(key);
		expect(addressKey('2001:0DB8:0001:0002:0:0:0:9')).toBe(key);
		expect(addressKey('2001:db8:1:3::1')).not.toBe(key);
		expect(addressKey('::ffff:198.51.100.7')).toBe(addressKey('198.51.100.7'));
	});
});

describe('createAuthGate', () => {
	it('one guesser cools down alone; the room stays open to others', () => {
		const gate = createAuthGate();
		const t = 1_000_000;
		for (let i = 0; i < 3; i++) {
			expect(gate.open('guesser', t)).toBe(true);
			gate.fail('guesser', t);
		}
		// the third failure opened a window for the guesser only
		expect(gate.open('guesser', t)).toBe(false);
		expect(gate.open('artist', t)).toBe(true);
		expect(gate.open('guesser', t + 500)).toBe(true);
	});

	it('the right password starts a key over', () => {
		const gate = createAuthGate();
		for (let i = 0; i < 3; i++) {
			gate.fail('k', 0);
		}
		expect(gate.open('k', 0)).toBe(false);
		gate.pass('k');
		expect(gate.open('k', 0)).toBe(true);
	});

	it('many addresses together spend one room budget', () => {
		const gate = createAuthGate();
		for (let i = 0; i < AUTH_ROOM_BUDGET; i++) {
			expect(gate.open(`bot${i}`, 0)).toBe(true);
			gate.fail(`bot${i}`, 0);
		}
		expect(gate.open('fresh', 0)).toBe(false);
		// one guess back every 60 / budget seconds
		expect(gate.open('fresh', 60_000 / AUTH_ROOM_BUDGET)).toBe(true);
	});

	it('a spent budget still lets a returning joiner in, and no stranger', () => {
		const gate = createAuthGate();
		gate.pass('artist');
		for (let i = 0; i < AUTH_ROOM_BUDGET; i++) {
			gate.fail(`bot${i}`, 0);
		}
		// an artist reconnecting after a drop mid-attack
		expect(gate.open('artist', 0)).toBe(true);
		expect(gate.open('stranger', 0)).toBe(false);
		// the exemption skips the budget, never the key's own backoff
		for (let i = 0; i < 3; i++) {
			gate.fail('artist', 0);
		}
		expect(gate.open('artist', 0)).toBe(false);
	});

	it('a key that fails again outlives the quiet ones around it', () => {
		const gate = createAuthGate();
		gate.fail('early', 0);
		gate.fail('later', 25_000);
		gate.fail('later', 30_000);
		gate.fail('early', 50_000);
		// at 100s 'later' has been quiet 70s and goes, count and all, even
		// though 'early' entered first; 'early', quiet only 50s, keeps its
		// count, so its third failure opens a cooldown
		gate.fail('early', 100_000);
		expect(gate.open('early', 100_100)).toBe(false);
		gate.fail('later', 100_000);
		expect(gate.open('later', 100_100)).toBe(true);
	});

	it('an operator budget replaces the default, refill rate and all', () => {
		const gate = createAuthGate({ budget: 3 });
		for (let i = 0; i < 3; i++) {
			gate.fail(`bot${i}`, 0);
		}
		expect(gate.open('fresh', 0)).toBe(false);
		expect(gate.open('fresh', 19_999)).toBe(false);
		expect(gate.open('fresh', 20_000)).toBe(true);
		expect(gate.idle(60_000)).toBe(false); // the bots' keys linger
		expect(gate.idle(200_000)).toBe(true);
	});

	it('a full gate sheds keys gone quiet instead of refusing newcomers', () => {
		const gate = createAuthGate();
		// the budget admits a failure every 60 / budget seconds, so a
		// full map is mostly keys that went quiet long ago
		const step = 60_000 / AUTH_ROOM_BUDGET;
		for (let i = 0; i < AUTH_GATE_KEYS; i++) {
			gate.fail(`k${i}`, i * step);
		}
		expect(gate.open('late', AUTH_GATE_KEYS * step)).toBe(true);
	});

	it('goes idle once nothing is left to remember', () => {
		const gate = createAuthGate();
		expect(gate.idle(0)).toBe(true);
		gate.fail('k', 0);
		expect(gate.idle(1000)).toBe(false);
		expect(gate.idle(120_000)).toBe(true);
	});
});
