// @ts-check
/**
 * Exposes internals on window for Playwright (goldens, e2e) and
 * on-device debugging. Loaded ONLY under ?test (see main.js), never on
 * the normal boot path.
 */
import State from './state.js';
import { Load, Save } from './file.js';

const installTestBridge = () => {
	/** @type {*} */ (window).__t0wnz = { State, Load, Save };
	console.log('[TestBridge] window.__t0wnz installed');
};

export { installTestBridge };
export default { installTestBridge };
