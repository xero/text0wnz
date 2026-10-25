/**
 * Server entry: Moebius-native superset server on Bun.serve.
 * Loads persisted room docs (native .0wnz, or legacy v2 .bin as the
 * migration), autosaves dirty rooms on the configured interval with
 * hourly sha1-deduped backups, and saves on SIGINT AND SIGTERM
 * (docker stop sends SIGTERM).
 */

import path from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { parseArgs } from './config.js';

// `main.js healthcheck [port]`: distroless images have no shell, so the
// server binary doubles as its own Docker HEALTHCHECK probe
if (process.argv[2] === 'healthcheck') {
	const healthPort = Number(process.argv[3] ?? process.env.PORT ?? 1337);
	try {
		const res = await fetch(`http://127.0.0.1:${healthPort}/healthz`);
		process.exit(res.ok ? 0 : 1);
	} catch {
		process.exit(1);
	}
}
import { callout } from './utils.js';
import { createMoebiusServer } from './moebiusServer.js';
import { bridgeConfigFromEnv } from './bridge.js';
import { saveRoom, backupRoom, loadRoomDoc, removeRoomFiles } from './persistence.js';

const sessionsDirEarly = path.resolve('./sessions');

/** lazy per-room restore: EVERY room loads its persisted doc on
 * creation, not just the default; otherwise a named room boots blank
 * and its next autosave overwrites the saved art */
const restoreRoomState = room =>
	// the RETURNED promise gates connects server-side, so no client can
	// adopt the blank boot doc (or draw over the saved one) mid-load
	loadRoomDoc(sessionsDirEarly, room.name)
		.then(saved => {
			if (saved && !room.isDirty()) {
				room.loadState(saved);
				callout(`restored session '${room.name}'`);
			}
		})
		.catch(error =>
			console.error(`[Server] restore failed for ${room.name}:`, error));

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
	maxColumns: config.maxColumns,
	maxRows: config.maxRows,
	staticDir: config.staticDir,
	debug: config.debug,
	bridge: bridgeConfigFromEnv(),
	tls,
	log: config.debug ? console.log : () => {},
	onRoomCreate: restoreRoomState,
	// an emptied dirty room persists before the server GCs it; a
	// BLANK one (throwaway name, no art, no chat) leaves nothing,
	// or client-chosen names grow disk and the hash map forever
	onRoomEmpty: async room => {
		if (room.isBlank()) {
			await removeRoomFiles(sessionsDir, room.name);
			lastBackupHashes.delete(room.name);
			return;
		}
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
