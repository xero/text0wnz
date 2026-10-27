/**
 * Fixture launcher: boots the VENDORED vanilla Moebius server on the
 * port given as argv[2] with the joint path /fixture (password via
 * argv[3]). Prints FIXTURE_READY on stdout once listening.
 *
 * Upstream requires discord.js at load time even when no webhook is
 * configured, so the require hook below hands the verbatim file an
 * inert stand-in instead of adding the dependency.
 */
/* eslint-disable */
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
	if (id === 'discord.js') {
		return {
			WebhookClient: class {
				send() {
					return Promise.resolve();
				}
			},
		};
	}
	return originalRequire.apply(this, arguments);
};
const server = require('./server');
const port = parseInt(process.argv[2], 10) || 8000;
const pass = process.argv[3] || '';
server
	.start_joint({ path: 'fixture', file: 'fixture.ans', pass, quiet: true, server_port: port })
	.then(() => console.log('FIXTURE_READY'))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
