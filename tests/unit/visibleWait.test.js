import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { settlesWithin, visibleTimeout } from '../../src/js/client/visibleWait.js';

describe('visibleWait', () => {
	let hidden;
	const turn = value => {
		hidden = value;
		document.dispatchEvent(new Event('visibilitychange'));
	};

	beforeEach(() => {
		vi.useFakeTimers();
		hidden = false;
		Object.defineProperty(document, 'hidden', {
			configurable: true,
			get: () => hidden,
		});
	});

	afterEach(() => {
		delete document.hidden;
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe('visibleTimeout', () => {
		it('expires after the visible time alone adds up', async () => {
			const expire = vi.fn();
			visibleTimeout(expire, 10000);
			await vi.advanceTimersByTimeAsync(4000);
			turn(true);
			await vi.advanceTimersByTimeAsync(60000);
			turn(false);
			await vi.advanceTimersByTimeAsync(5999);
			expect(expire).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(expire).toHaveBeenCalledTimes(1);
		});

		it('armed on a hidden page, starts counting once the page shows', async () => {
			const expire = vi.fn();
			turn(true);
			visibleTimeout(expire, 1000);
			await vi.advanceTimersByTimeAsync(60000);
			expect(expire).not.toHaveBeenCalled();
			turn(false);
			await vi.advanceTimersByTimeAsync(1000);
			expect(expire).toHaveBeenCalledTimes(1);
		});

		it('a repeated visibility event counts each stretch once', async () => {
			const expire = vi.fn();
			visibleTimeout(expire, 1000);
			await vi.advanceTimersByTimeAsync(600);
			turn(false);
			turn(true);
			turn(true);
			await vi.advanceTimersByTimeAsync(5000);
			turn(false);
			await vi.advanceTimersByTimeAsync(399);
			expect(expire).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(expire).toHaveBeenCalledTimes(1);
		});

		it('a cancel stops the wait and lets go of the page', async () => {
			const expire = vi.fn();
			const cancel = visibleTimeout(expire, 1000);
			const remove = vi.spyOn(document, 'removeEventListener');
			cancel();
			turn(true);
			turn(false);
			await vi.advanceTimersByTimeAsync(5000);
			expect(expire).not.toHaveBeenCalled();
			expect(remove).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
			expect(vi.getTimerCount()).toBe(0);
		});

		it('a cancel after the wait fired changes nothing, and no stretch re-arms it', async () => {
			const expire = vi.fn();
			const cancel = visibleTimeout(expire, 1000);
			await vi.advanceTimersByTimeAsync(1000);
			cancel();
			turn(true);
			turn(false);
			await vi.advanceTimersByTimeAsync(5000);
			expect(expire).toHaveBeenCalledTimes(1);
			expect(vi.getTimerCount()).toBe(0);
		});

		// a throttled timer can still be queued when the page hides, so the
		// visible time counted can pass the whole wait
		it('a page hidden once its time ran out fires as soon as it shows', async () => {
			const expire = vi.fn();
			visibleTimeout(expire, 1000);
			vi.setSystemTime(Date.now() + 1500);
			turn(true);
			await vi.advanceTimersByTimeAsync(60000);
			expect(expire).not.toHaveBeenCalled();
			turn(false);
			await vi.advanceTimersByTimeAsync(0);
			expect(expire).toHaveBeenCalledTimes(1);
		});
	});

	describe('settlesWithin', () => {
		it('is true for a settle inside the visible time, a rejection included', async () => {
			let finish;
			const fulfilled = settlesWithin(new Promise(resolve => (finish = resolve)), 10000);
			const rejected = settlesWithin(Promise.reject(new Error('load failed')), 10000);
			await vi.advanceTimersByTimeAsync(9000);
			turn(true);
			await vi.advanceTimersByTimeAsync(60000);
			turn(false);
			finish();
			expect(await fulfilled).toBe(true);
			expect(await rejected).toBe(true);
			expect(vi.getTimerCount()).toBe(0);
		});

		it('is false once the visible time runs out first', async () => {
			const result = vi.fn();
			settlesWithin(new Promise(() => {}), 10000).then(result);
			await vi.advanceTimersByTimeAsync(9999);
			expect(result).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(1);
			expect(result).toHaveBeenCalledWith(false);
		});
	});
});
