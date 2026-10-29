// @ts-check
/**
 * A bounded most-recent-first list in localStorage. Blocked storage
 * and corrupt values both read as empty.
 * @template T
 * @param {string} key
 * @param {number} limit
 * @param {(value: unknown) => value is T} isValid
 */
export const createRecentList = (key, limit, isValid) => {
	/** @returns {T[]} */
	const load = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') ?? [];
			return Array.isArray(parsed) ? parsed.filter(isValid) : [];
		} catch {
			return [];
		}
	};
	/** @param {T} value @returns {T[]} the list as stored */
	const remember = value => {
		const list = [value, ...load().filter(v => v !== value)].slice(0, limit);
		try {
			localStorage.setItem(key, JSON.stringify(list));
		} catch {
			// private windows etc.: recents just don't persist
		}
		return list;
	};
	return { load, remember };
};
