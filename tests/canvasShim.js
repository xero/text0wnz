import { beforeAll } from 'vitest';

beforeAll(() => {
	HTMLCanvasElement.prototype.getContext = function (type) {
		if (type === '2d') {
			return {
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
