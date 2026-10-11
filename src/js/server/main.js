/**
 * Server entry (P4): Moebius-native superset server on Bun.serve
 * (O10). Loads persisted room docs (native .0wnz, or legacy v2 .bin as
 * the migration), autosaves dirty rooms on the configured interval
 * with hourly sha1-deduped backups, and saves on SIGINT AND SIGTERM
 * (docker stop sends SIGTERM; the v2 server only listened for SIGINT
 * and lost up to a save interval of work).
 */

import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from './config.js';
import { callout } from './utils.js';
import { createMoebiusServer } from './moebiusServer.js';
import { bridgeConfigFromEnv } from './bridge.js';
import { saveRoom, backupRoom, loadRoomDoc } from './persistence.js';

const sessionsDirEarly = path.resolve('./sessions');

/** lazy per-room restore: EVERY room loads its persisted doc on
 * creation, not just the default (a named room used to boot blank and
 * its next autosave overwrote the saved art - review finding) */
const restoreRoomState = room => {
	loadRoomDoc(sessionsDirEarly, room.name)
		.then(saved => {
			// a draw that beat the async load wins; never clobber it
			if (saved && !room.isDirty()) {
				room.loadState(saved);
				callout(`restored session '${room.name}'`);
			}
		})
		.catch(error =>
			console.error(`[Server] restore failed for ${room.name}:`, error));
};

const config = parseArgs();
const sessionsDir = path.resolve('./sessions');
const lastBackupHashes = new Map();

let tls;
if (config.ssl) {
	const cert = path.join(config.sslDir, 'letsencrypt-domain.pem');
	const key = path.join(config.sslDir, 'letsencrypt-domain.key');
	if (existsSync(cert) && existsSync(key)) {
		tls = { cert: readFileSync(cert, 'utf8'), key: readFileSync(key, 'utf8') };
	} else {
		console.warn('[Server] --ssl set but certificates missing; plain http');
	}
}

const server = createMoebiusServer({
	port: config.port,
	plainPort: config.plainPort,
	sessionName: config.sessionName,
	pass: config.pass,
	roomPasswords: config.roomPasswords,
	debug: config.debug,
	bridge: bridgeConfigFromEnv(),
	tls,
	log: config.debug ? console.log : () => {},
	onRoomCreate: restoreRoomState,
	// an emptied dirty room persists before the server GCs it
	onRoomEmpty: async room => {
		const bytes = await saveRoom(room, sessionsDir);
		await backupRoom(sessionsDir, room.name, bytes, lastBackupHashes);
	},
});

// eagerly create (and thereby restore) the default room
server.getRoom(config.sessionName);

const saveAll = async () => {
	for (const room of server.rooms.values()) {
		if (!room.isDirty()) {
			continue;
		}
		try {
			const bytes = await saveRoom(room, sessionsDir);
			await backupRoom(sessionsDir, room.name, bytes, lastBackupHashes);
		} catch (error) {
			console.error(`[Server] save failed for ${room.name}:`, error);
		}
	}
};

const saveTimer = setInterval(saveAll, config.saveInterval);

const shutdown = async signal => {
	callout(`${signal}: saving sessions`);
	clearInterval(saveTimer);
	await saveAll();
	await server.stop();
	process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

callout(
	`teXt0wnz collab server on :${server.port}` +
	(server.plainPort ? ` + plaintext :${server.plainPort}` : ''),
);
