/**
 * No-op HourlySaver stub: the fixture never persists or backs up.
 * Upstream: app/hourly_saver.js (moebiusXBIN v2.2.0, Apache-2.0).
 */
/* eslint-disable */
class HourlySaver {
	start() {}
	stop() {}
	on() {}
	filename() { return 'noop'; }
	keep_if_changes() { return false; }
}
module.exports = { HourlySaver };
