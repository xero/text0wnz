import { vi } from 'vitest';

// one ui.js mock for every freehand suite: a new ui export lands here
// once instead of in three hand-synced copies
export const createUiMock = () => ({
	iconHref: vi.fn(name => `img/icons.svg#${name}`),
	iconSvg: vi.fn(() =>
		document.createElementNS('http://www.w3.org/2000/svg', 'svg')),
	createSegmentedControl: vi.fn((id, options, onChange) => {
		let current = options[0]?.value;
		const el = {
			id: id,
			style: {},
			classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
			appendChild: vi.fn(),
		};
		return {
			getElement: () => el,
			value: () => current,
			set: value => {
				current = value;
			},
			select: value => {
				current = value;
				if (onChange) {
					onChange(value);
				}
			},
			setEnabled: vi.fn(),
		};
	}),
	$: vi.fn(_ => {
		const mockElement = {
			style: { display: 'block' },
			classList: {
				add: vi.fn(),
				remove: vi.fn(),
				contains: vi.fn(() => false),
				toggle: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			click: vi.fn(),
			appendChild: vi.fn(),
			removeChild: vi.fn(),
			insertBefore: vi.fn(),
			append: vi.fn(),
			getBoundingClientRect: vi.fn(() => ({
				left: 0,
				top: 0,
				width: 100,
				height: 100,
			})),
			value: 'mock',
			innerText: 'mock',
			textContent: 'mock',
			width: 100,
			height: 100,
			firstChild: {
				style: {},
				classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() },
			},
		};
		return mockElement;
	}),
	$$: vi.fn(() => ({ textContent: 'mock' })),
	createCanvas: vi.fn((width, height) => {
		const mockCanvas = {
			width: width || 100,
			height: height || 100,
			style: {},
			classList: {
				add: vi.fn(),
				remove: vi.fn(),
				toggle: vi.fn(),
			},
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			remove: vi.fn(),
			getContext: vi.fn(() => ({
				createImageData: vi.fn(() => ({
					data: new Uint8ClampedArray(4),
					width: 1,
					height: 1,
				})),
				putImageData: vi.fn(),
				drawImage: vi.fn(),
				clearRect: vi.fn(),
				fillRect: vi.fn(),
				strokeRect: vi.fn(),
				strokeStyle: '',
				lineWidth: 1,
			})),
			toDataURL: vi.fn(() => 'data:image/png;base64,mock'),
			contains: vi.fn(() => false),
		};
		return mockCanvas;
	}),
	createToggleButton: vi.fn((_label1, _label2, _callback1, _callback2) => ({
		id: 'mock-toggle',
		getElement: vi.fn(() => ({
			appendChild: vi.fn(),
			style: {},
		})),
		setStateOne: vi.fn(),
		setStateTwo: vi.fn(),
	})),
});
