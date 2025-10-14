/**
 * Simple compression utilities for localStorage
 * Using a lightweight implementation that doesn't require external dependencies
 */

export const Compression = {
	/**
	 * Simple RLE compression for Uint16Array data
	 */
	compressUint16Array(array) {
		if (!array || !array.length) {
			return null;
		}

		const result = [];
		let currentValue = array[0];
		let count = 1;

		for (let i = 1; i < array.length; i++) {
			if (array[i] === currentValue && count < 65535) {
				count++;
			} else {
				result.push(count, currentValue);
				currentValue = array[i];
				count = 1;
			}
		}

		// Don't forget the last run
		result.push(count, currentValue);

		// If compression isn't effective, return null
		if (result.length >= array.length) {
			return null; // Indicate no compression benefit
		}

		return new Uint32Array(result);
	},

	/**
	 * Decompress RLE data back to Uint16Array
	 */
	decompressToUint16Array(compressed, outputLength) {
		if (!compressed || !compressed.length) {
			return null;
		}

		const result = new Uint16Array(outputLength);
		let outputIndex = 0;

		for (let i = 0; i < compressed.length; i += 2) {
			const count = compressed[i];
			const value = compressed[i + 1];

			for (let j = 0; j < count; j++) {
				result[outputIndex++] = value;
			}
		}

		return result;
	},

	/**
	 * Convert compressed data to base64 for storage
	 */
	compressedToBase64(compressed) {
		const bytes = new Uint8Array(compressed.buffer);
		return btoa(
			Array.from(bytes)
				.map(byte => String.fromCharCode(byte))
				.join(''),
		);
	},

	/**
	 * Convert base64 back to compressed data
	 */
	base64ToCompressed(base64) {
		const binaryString = atob(base64);
		const bytes = new Uint8Array(binaryString.length);

		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}

		return new Uint32Array(bytes.buffer);
	},
};
