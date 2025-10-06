import State from './state.js';

const Toolbar = (() => {
	let currentButton;
	let currentOnBlur;
	let previousButton;
	const tools = {};

	const add = (button, onFocus, onBlur) => {
		const enable = () => {
			closeMenu();
			if (currentButton !== button) {
				// Store previous tool before switching
				if (currentButton !== undefined) {
					previousButton = currentButton;
					currentButton.classList.remove('toolbar-displayed');
				}
				if (currentOnBlur !== undefined) {
					currentOnBlur();
				}
				button.classList.add('toolbar-displayed');
				currentButton = button;
				currentOnBlur = onBlur;
				if (onFocus !== undefined) {
					onFocus();
				}
			} else {
				onFocus();
			}
		};

		button.addEventListener('click', e => {
			e.preventDefault();
			enable();
		});

		// Store tool reference for programmatic access
		tools[button.id] = {
			button: button,
			enable: enable,
			onFocus: onFocus,
			onBlur: onBlur,
		};

		return { enable: enable };
	};

	const switchTool = toolId => {
		if (tools[toolId]) {
			tools[toolId].enable();
		}
		closeMenu();
	};

	const returnToPreviousTool = () => {
		if (previousButton && tools[previousButton.id]) {
			tools[previousButton.id].enable();
		}
		closeMenu();
	};

	const getCurrentTool = () => {
		closeMenu();
		return currentButton ? currentButton.id : null;
	};

	const closeMenu = () => {
		if (State.menu) {
			State.menu.close();
		}
	};

	return {
		add: add,
		switchTool: switchTool,
		returnToPreviousTool: returnToPreviousTool,
		getCurrentTool: getCurrentTool,
	};
})();

export default Toolbar;
