/**
 * Fixture launcher: boots the VENDORED moebiusXBIN server on the port
 * given as argv[2] with the room path /fixture (password via argv[3]).
 * Prints FIXTURE_READY on stdout once listening.
 */
/* eslint-disable */
// upstream's url.parse (server.js, the upgrade handler) trips Node's
// DEP0169 notice once per boot; the file is vendored verbatim, so the
// launcher mutes it rather than patching the server
process.noDeprecation = true;
const server = require('./server');
const port = parseInt(process.argv[2], 10) || 8000;
const pass = process.argv[3] || '';
server
	.start_joint({ path: 'fixture', file: 'fixture.xb', pass, quiet: true, server_port: port })
	.then(() => console.log('FIXTURE_READY'))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
