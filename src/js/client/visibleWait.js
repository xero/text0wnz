// @ts-check
// iOS freezes a hidden tab's fetches, workers, and sockets along with
// its timers, so a wait that ran on while hidden would expire on
// return before the thawed work could answer. These clocks count only
// the time the page is visible. Kept out of ui.js, which several
// suites mock wholesale.

/**
 * Calls `onExpire` once the page has been visible for `ms` in all.
 * @param {() => void} onExpire
 * @param {number} ms
 * @returns {() => void} cancels the wait
 */
export const visibleTimeout = (onExpire, ms) => {
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let timer;
	let left = ms;
	let armedAt = 0;
	let armed = false;
	const onVisibility = () => {
		if (document.hidden && armed) {
			armed = false;
			clearTimeout(timer);
			left -= Date.now() - armedAt;
		} else if (!document.hidden && !armed) {
			armed = true;
			armedAt = Date.now();
			timer = setTimeout(fire, left);
		}
	};
	const cancel = () => {
		clearTimeout(timer);
		document.removeEventListener('visibilitychange', onVisibility);
	};
	const fire = () => {
		cancel();
		onExpire();
	};
	onVisibility();
	document.addEventListener('visibilitychange', onVisibility);
	return cancel;
};

/**
 * True once `promise` settles, false when `ms` of visible time runs
 * out first. A rejection counts as settled.
 * @param {Promise<unknown>} promise
 * @param {number} ms
 * @returns {Promise<boolean>}
 */
export const settlesWithin = (promise, ms) =>
	new Promise(resolve => {
		const cancel = visibleTimeout(() => resolve(false), ms);
		const done = () => {
			cancel();
			resolve(true);
		};
		promise.then(done, done);
	});
