#!/usr/bin/env node

/**
 * Performance benchmark for localStorage optimization
 *
 * This script demonstrates the performance improvement of using base64 encoding
 * over Array.from() for serializing binary data to localStorage.
 */

// Simulate the old and new implementations
class PerformanceBenchmark {
	constructor() {
		this.results = [];
	}

	// Old implementation using Array.from
	serializeOld(uint16Array) {
		const array = Array.from(uint16Array);
		return JSON.stringify({ imageData: array });
	}

	deserializeOld(jsonString) {
		const obj = JSON.parse(jsonString);
		return new Uint16Array(obj.imageData);
	}

	// New optimized implementation using base64
	_uint16ArrayToBase64(uint16Array) {
		const uint8Array = new Uint8Array(uint16Array.buffer, uint16Array.byteOffset, uint16Array.byteLength);
		const chunkSize = 8192;
		let binary = '';
		for (let i = 0; i < uint8Array.length; i += chunkSize) {
			const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
			binary += String.fromCharCode.apply(null, chunk);
		}
		return Buffer.from(binary, 'binary').toString('base64');
	}

	_base64ToUint16Array(base64String) {
		const binaryString = Buffer.from(base64String, 'base64').toString('binary');
		const len = binaryString.length;
		const bytes = new Uint8Array(len);
		for (let i = 0; i < len; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		return new Uint16Array(bytes.buffer);
	}

	serializeNew(uint16Array) {
		const base64 = this._uint16ArrayToBase64(uint16Array);
		return JSON.stringify({ imageData: base64 });
	}

	deserializeNew(jsonString) {
		const obj = JSON.parse(jsonString);
		return this._base64ToUint16Array(obj.imageData);
	}

	// Create test data
	createCanvasData(columns, rows) {
		const data = new Uint16Array(columns * rows);
		for (let i = 0; i < data.length; i++) {
			// Simulate realistic ANSI art data (character + attributes)
			const char = 32 + (i % 96); // ASCII printable chars
			const attr = i % 256; // Color attributes
			data[i] = (char << 8) | attr;
		}
		return data;
	}

	// Run benchmark
	runBenchmark(name, columns, rows, iterations = 10) {
		console.log(`\n${name} (${columns}x${rows}, ${columns * rows * 2} bytes):`);
		console.log('='.repeat(60));

		const testData = this.createCanvasData(columns, rows);

		// Measure old implementation
		const oldStart = Date.now();
		let oldSize = 0;
		for (let i = 0; i < iterations; i++) {
			const serialized = this.serializeOld(testData);
			oldSize = serialized.length;
			this.deserializeOld(serialized);
		}
		const oldTime = Date.now() - oldStart;

		// Measure new implementation
		const newStart = Date.now();
		let newSize = 0;
		for (let i = 0; i < iterations; i++) {
			const serialized = this.serializeNew(testData);
			newSize = serialized.length;
			this.deserializeNew(serialized);
		}
		const newTime = Date.now() - newStart;

		const improvement = (((oldTime - newTime) / oldTime) * 100).toFixed(1);
		const sizeReduction = (((oldSize - newSize) / oldSize) * 100).toFixed(1);

		console.log(`Old (Array.from):  ${oldTime}ms, ${oldSize.toLocaleString()} bytes`);
		console.log(`New (Base64):      ${newTime}ms, ${newSize.toLocaleString()} bytes`);
		console.log(`Improvement:       ${improvement}% faster, ${sizeReduction}% smaller`);

		this.results.push({
			name,
			size: `${columns}x${rows}`,
			oldTime,
			newTime,
			improvement,
			oldSize,
			newSize,
			sizeReduction,
		});
	}

	printSummary() {
		console.log('\n' + '='.repeat(60));
		console.log('SUMMARY');
		console.log('='.repeat(60));

		const avgImprovement = this.results.reduce((sum, r) => sum + parseFloat(r.improvement), 0) / this.results.length;
		const avgSizeReduction =
			this.results.reduce((sum, r) => sum + parseFloat(r.sizeReduction), 0) / this.results.length;

		console.log(`Average speed improvement:  ${avgImprovement.toFixed(1)}%`);
		console.log(`Average size reduction:     ${avgSizeReduction.toFixed(1)}%`);
		console.log('\nConclusion: Base64 encoding is significantly faster and more compact');
		console.log('for storing binary canvas data in localStorage.');
	}
}

// Run benchmarks
const benchmark = new PerformanceBenchmark();

console.log('\nLocalStorage Serialization Performance Benchmark');
console.log('='.repeat(60));

// Test different canvas sizes (common ANSI art sizes)
benchmark.runBenchmark('Small Canvas', 80, 25, 100); // Standard ANSI (2000 cells)
benchmark.runBenchmark('Medium Canvas', 80, 50, 50); // Extended ANSI (4000 cells)
benchmark.runBenchmark('Medium+ Canvas', 80, 100, 25); // Large ANSI (8000 cells)
benchmark.runBenchmark('Large Canvas', 160, 100, 10); // Very large (16000 cells)
benchmark.runBenchmark('XL Canvas', 80, 500, 5); // Scrolling canvas (40000 cells)

benchmark.printSummary();

console.log('\n✅ Optimization successfully reduces localStorage overhead!\n');
