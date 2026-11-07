/**
 * Archive and movie fixtures built in node, so specs carry no binary
 * blobs and every byte is visible in the source.
 */
import { crc32, deflateRawSync, gzipSync } from 'node:zlib';

/** the smallest zip the reader opens: one deflated entry */
export const zipOf = (name, data) => {
	const body = deflateRawSync(data);
	const file = Buffer.from(name);
	const crc = crc32(data);
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(20, 4);
	local.writeUInt16LE(8, 8);
	local.writeUInt32LE(crc, 14);
	local.writeUInt32LE(body.length, 18);
	local.writeUInt32LE(data.length, 22);
	local.writeUInt16LE(file.length, 26);
	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(20, 4);
	central.writeUInt16LE(20, 6);
	central.writeUInt16LE(8, 10);
	central.writeUInt32LE(crc, 16);
	central.writeUInt32LE(body.length, 20);
	central.writeUInt32LE(data.length, 24);
	central.writeUInt16LE(file.length, 28);
	const entries = Buffer.concat([local, file, body]);
	const directory = Buffer.concat([central, file]);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(1, 8);
	end.writeUInt16LE(1, 10);
	end.writeUInt32LE(directory.length, 12);
	end.writeUInt32LE(entries.length, 16);
	return Buffer.concat([entries, directory, end]);
};

/** a durdraw v8 movie, one frame per array of lines */
export const durOf = (...frames) =>
	gzipSync(
		Buffer.from(
			JSON.stringify({
				DurMovie: {
					formatVersion: 8,
					colorFormat: '256',
					encoding: 'utf-8',
					columns: 40,
					lines: frames[0].length,
					framerate: 8,
					frames: frames.map(lines => ({
						delay: 0,
						contents: lines.map(line => line.padEnd(40)),
					})),
				},
			}),
		),
	);

/** hand the open-file input a file built in memory */
export const openBuffer = (page, name, buffer) =>
	page.locator('#openFile').setInputFiles({
		name,
		mimeType: 'application/octet-stream',
		buffer,
	});
