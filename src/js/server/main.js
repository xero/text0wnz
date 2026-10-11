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
});

// restore the default room's persisted doc (migration path included)
const restoreRoom = async name => {
	const saved = await loadRoomDoc(sessionsDir, name);
	if (saved) {
		server.getRoom(name)?.loadState(saved);
		callout(`restored session '${name}'`);
	}
};
await restoreRoom(config.sessionName);

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
