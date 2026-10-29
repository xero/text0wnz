// @ts-check
/**
 * Shared guard for postMessage receivers (CodeQL
 * js/missing-origin-check). Every channel this app listens on is
 * same-origin by construction: dedicated workers can only be created
 * from same-origin scripts and their messages carry an empty origin,
 * a Worker object only relays its own worker, and a service worker
 * registration is same-origin with its page. The guard pins that
 * invariant anyway, dropping any message that claims a foreign origin
 * or carries a non-object payload before handler logic runs. The
 * workers are vite-bundled modules, so they import this one copy.
 */

/**
 * An origin-less channel (a dedicated worker) passes. Callers still
 * validate the fields they use.
 *
 * @param {MessageEvent} event
 * @returns {boolean}
 */
export const trustedMessage = event => {
	if (event.origin && event.origin !== self.location.origin) {
		return false;
	}
	return typeof event.data === 'object' && event.data !== null;
};
