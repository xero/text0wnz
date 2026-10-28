/**
 * In-test ZIP builder for fixtures (store or deflate entries): the
 * inverse of core/codecs/zip.ts, kept test-side on purpose (the editor
 * never writes zips).
 */
// the runtime's own compressor, not flate.ts, so zip tests read bytes
// the inflater under test did not write (writer/reader pump, since
// jsdom's Blob has no stream())
const deflateRaw = async (bytes: Uint8Array): Promise<Uint8Array> => {
	const cs = new CompressionStream('deflate-raw');
	const writer = cs.writable.getWriter();
	void writer.write(new Uint8Array(bytes));
	void writer.close();
	const chunks: Uint8Array[] = [];
	const reader = cs.readable.getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		chunks.push(value);
	}
	const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
	let at = 0;
	for (const chunk of chunks) {
		out.set(chunk, at);
		at += chunk.length;
	}
	return out;
};

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[n] = c;
	}
	return table;
})();
const crc32 = (bytes: Uint8Array): number => {
	let c = 0xffffffff;
	for (const byte of bytes) {
		c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
};

/** build a real little zip with the given entries */
export const buildZip = async (
	files: Array<{ name: string; data: Uint8Array; store?: boolean }>,
): Promise<Uint8Array> => {
	const chunks: number[] = [];
	const central: number[] = [];
	const push16 = (arr: number[], v: number) =>
		arr.push(v & 0xff, (v >> 8) & 0xff);
	const push32 = (arr: number[], v: number) =>
		arr.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >>> 24) & 0xff);
	for (const file of files) {
		const nameBytes = new TextEncoder().encode(file.name);
		const method = file.store ? 0 : 8;
		const packed = file.store ? file.data : await deflateRaw(file.data);
		const offset = chunks.length;
		push32(chunks, 0x04034b50);
		push16(chunks, 20); // version needed
		push16(chunks, 0x800); // utf-8 names
		push16(chunks, method);
		push16(chunks, 0); // time
		push16(chunks, 0); // date
		push32(chunks, crc32(file.data));
		push32(chunks, packed.length);
		push32(chunks, file.data.length);
		push16(chunks, nameBytes.length);
		push16(chunks, 0); // extra
		chunks.push(...nameBytes, ...packed);
		push32(central, 0x02014b50);
		push16(central, 20);
		push16(central, 20);
		push16(central, 0x800);
		push16(central, method);
		push16(central, 0);
		push16(central, 0);
		push32(central, crc32(file.data));
		push32(central, packed.length);
		push32(central, file.data.length);
		push16(central, nameBytes.length);
		push16(central, 0); // extra
		push16(central, 0); // comment
		push16(central, 0); // disk
		push16(central, 0); // internal attrs
		push32(central, 0); // external attrs
		push32(central, offset);
		central.push(...nameBytes);
	}
	const centralOffset = chunks.length;
	chunks.push(...central);
	push32(chunks, 0x06054b50);
	push16(chunks, 0);
	push16(chunks, 0);
	push16(chunks, files.length);
	push16(chunks, files.length);
	push32(chunks, central.length);
	push32(chunks, centralOffset);
	push16(chunks, 0); // comment length
	return Uint8Array.from(chunks);
};
