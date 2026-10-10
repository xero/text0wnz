// @ts-check
/**
 * Test bridge: exposes internals on window for Playwright (goldens, e2e)
 * and on-device debugging. Loaded ONLY when the page is opened with ?test
 * (see main.js); never part of the normal boot path.
 */
import State from './state.js';
import { Load, Save } from './file.js';

const installTestBridge = () => {
	/** @type {*} */ (window).__t0wnz = { State, Load, Save };
	document.dispatchEvent(new CustomEvent('onTestBridgeReady'));
	console.log('[TestBridge] window.__t0wnz installed');
};

export { installTestBridge };
export default { installTestBridge };
