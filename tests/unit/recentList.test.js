import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRecentList } from '../../src/js/client/recentList.js';

const store = new Map();
beforeEach(() => {
	store.clear();
	vi.stubGlobal('localStorage', {
		getItem: key => store.get(key) ?? null,
		setItem: (key, value) => store.set(key, value),
	});
});

const strings = () =>
	createRecentList('things', 3, value => typeof value === 'string');

describe('createRecentList', () => {
	it('reads empty from nothing, junk, or a throwing store', () => {
		expect(strings().load()).toEqual([]);
		store.set('things', '{not json');
		expect(strings().load()).toEqual([]);
		store.set('things', JSON.stringify({ a: 1 }));
		expect(strings().load()).toEqual([]);
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
		});
		expect(strings().load()).toEqual([]);
		expect(strings().remember('x')).toEqual(['x']);
	});

	it('front-loads, dedupes, filters, and trims', () => {
		const list = strings();
		list.remember('a');
		list.remember('b');
		list.remember('a');
		expect(list.load()).toEqual(['a', 'b']);
		store.set('things', JSON.stringify(['a', 7, 'b', null]));
		expect(list.load()).toEqual(['a', 'b']);
		list.remember('c');
		list.remember('d');
		expect(list.load()).toEqual(['d', 'c', 'a']);
	});
});
