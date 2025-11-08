/**
 * Zoom Control UI Component
 * Allows users to adjust canvas scale factor (0.5x - 4x)
 */
import State from './state.js';

export const createZoomControl = () => {
	const container = document.createElement('div');
	container.className = 'zoomControl';
	container.setAttribute('aria-label', 'Canvas Zoom Control');

	// Label
	const label = document.createElement('label');
	label.textContent = 'Zoom:';
	label.htmlFor = 'zoomSlider';

	// Slider
	const slider = document.createElement('input');
	slider.type = 'range';
	slider.id = 'zoomSlider';
	slider.min = '0.5';
	slider.max = '4';
	slider.step = '0.5';
	slider.value = '1';
	slider.setAttribute('aria-valuemin', '0.5');
	slider.setAttribute('aria-valuemax', '4');
	slider.setAttribute('aria-valuenow', '1');
	slider.setAttribute('aria-label', 'Canvas zoom level');

	// Display
	const display = document.createElement('span');
	display.className = 'zoomDisplay';
	display.textContent = '1.0x';
	display.setAttribute('aria-live', 'polite');

	// Update display and apply zoom
	const updateZoom = value => {
		const scale = parseFloat(value);
		display.textContent = `${scale.toFixed(1)}x`;
		slider.setAttribute('aria-valuenow', value);

		if (State.font && State.font.setScaleFactor) {
			State.font.setScaleFactor(scale);
		}
	};

	// Function to update slider UI from current state
	const updateSliderFromState = () => {
		if (State.font && State.font.getScaleFactor) {
			const currentScale = State.font.getScaleFactor();
			slider.value = currentScale.toString();
			display.textContent = `${currentScale.toFixed(1)}x`;
			slider.setAttribute('aria-valuenow', currentScale.toString());
		}
	};

	// Initialize from current font scale
	State.waitFor('font', updateSliderFromState);

	// Update slider UI when state is restored
	document.addEventListener(
		'onStateRestorationComplete',
		updateSliderFromState,
	);

	// Event listeners
	slider.addEventListener('input', e => {
		// Update display during drag (preview)
		const scale = parseFloat(e.target.value);
		display.textContent = `${scale.toFixed(1)}x`;
	});

	slider.addEventListener('change', e => {
		// Apply zoom on release
		updateZoom(e.target.value);
		// Save immediately to state (don't wait for debounced save)
		if (State.saveToLocalStorage) {
			State.saveToLocalStorage();
		}
	});

	// Keyboard shortcuts
	const handleKeyboardZoom = e => {
		if ((e.ctrlKey || e.metaKey) && e.key === '=') {
			// Ctrl/Cmd + Plus: Zoom in
			e.preventDefault();
			const currentValue = parseFloat(slider.value);
			const newValue = Math.min(4, currentValue + 0.5);
			slider.value = newValue.toString();
			updateZoom(newValue.toString());
			// Save immediately to state
			if (State.saveToLocalStorage) {
				State.saveToLocalStorage();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
			// Ctrl/Cmd + Minus: Zoom out
			e.preventDefault();
			const currentValue = parseFloat(slider.value);
			const newValue = Math.max(0.5, currentValue - 0.5);
			slider.value = newValue.toString();
			updateZoom(newValue.toString());
			// Save immediately to state
			if (State.saveToLocalStorage) {
				State.saveToLocalStorage();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
			// Ctrl/Cmd + 0: Reset to 1x
			e.preventDefault();
			slider.value = '1';
			updateZoom('1');
			// Save immediately to state
			if (State.saveToLocalStorage) {
				State.saveToLocalStorage();
			}
		}
	};

	document.addEventListener('keydown', handleKeyboardZoom);
	container.appendChild(label);
	container.appendChild(display);
	container.appendChild(slider);

	return container;
};
