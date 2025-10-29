import { beforeAll, afterEach } from 'vitest';

// Cache contexts to reduce memory allocation
const contextCache = new WeakMap();

beforeAll(() => {
	HTMLCanvasElement.prototype.getContext = function (type) {
		if (type === '2d') {
			// Reuse cached context if available
			if (contextCache.has(this)) {
				return contextCache.get(this);
			}

			const context = {
				canvas: this,
				fillRect: () => {},
				clearRect: () => {},
				getImageData: (_x, _y, w, h) => ({
					data: new Uint8ClampedArray(w * h * 4),
					width: w,
					height: h,
					colorSpace: 'srgb',
				}),
				putImageData: () => {},
				createImageData: (w, h) => ({
					data: new Uint8ClampedArray(w * h * 4),
					width: w,
					height: h,
					colorSpace: 'srgb',
				}),
				setTransform: () => {},
				drawImage: () => {},
				save: () => {},
				fillText: () => {},
				restore: () => {},
				beginPath: () => {},
				moveTo: () => {},
				lineTo: () => {},
				closePath: () => {},
				stroke: () => {},
				strokeText: () => {},
				translate: () => {},
				scale: () => {},
				rotate: () => {},
				arc: () => {},
				arcTo: () => {},
				quadraticCurveTo: () => {},
				bezierCurveTo: () => {},
				fill: () => {},
				clip: () => {},
				isPointInPath: () => true,
				isPointInStroke: () => true,
				measureText: (text) => ({
					width: text.length * 7,
					actualBoundingBoxAscent: 10,
					actualBoundingBoxDescent: 3,
					fontBoundingBoxAscent: 12,
					fontBoundingBoxDescent: 4,
				}),
				createLinearGradient: () => ({
					addColorStop: () => {},
				}),
				createRadialGradient: () => ({
					addColorStop: () => {},
				}),
				createPattern: () => ({}),
				// Properties
				fillStyle: '',
				strokeStyle: '',
				lineWidth: 1,
				lineCap: 'butt',
				lineJoin: 'miter',
				miterLimit: 10,
				shadowBlur: 0,
				shadowColor: 'rgba(0, 0, 0, 0)',
				shadowOffsetX: 0,
				shadowOffsetY: 0,
				font: '10px sans-serif',
				textAlign: 'start',
				textBaseline: 'alphabetic',
				globalAlpha: 1,
				globalCompositeOperation: 'source-over',
			};

			// Cache the context
			contextCache.set(this, context);
			return context;
		}
		if (type === 'webgl' || type === 'webgl2') {
			return {};
		}
		return null;
	};

	HTMLCanvasElement.prototype.toDataURL = function () {
		return 'data:image/png;base64,';
	};

	HTMLCanvasElement.prototype.toBlob = function (callback) {
		callback(new Blob());
	};
});

// Clean up canvas context cache after each test to prevent memory leaks
afterEach(() => {
	// Note: WeakMap will automatically clean up when canvas elements are garbage collected,
	// but we clear document.body.innerHTML in tests which helps with cleanup
});
