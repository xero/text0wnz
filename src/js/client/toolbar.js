import State from './state.js';

const Toolbar = (() => {
	let currentButton;
	let currentOnBlur;
	let previousButton;
	const tools = {};
	const lazyTools = {};

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

	const addLazy = (button, toolLoader) => {
		let toolLoaded = false;
		let loadedTool = null;

		const enable = async () => {
			closeMenu();

			// Load the tool on first use
			if (!toolLoaded) {
				try {
					loadedTool = await toolLoader();
					toolLoaded = true;

					// Update the tools registry with the loaded tool
					tools[button.id] = {
						button: button,
						enable: loadedTool.enable,
						onFocus: loadedTool.onFocus,
						onBlur: loadedTool.onBlur,
					};
				} catch (error) {
					console.error(`Failed to load tool for ${button.id}:`, error);
					return;
				}
			}

			// Now enable the loaded tool
			if (loadedTool && loadedTool.enable) {
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
					currentOnBlur = loadedTool.onBlur;
					if (loadedTool.onFocus !== undefined) {
						loadedTool.onFocus();
					}
				} else if (loadedTool.onFocus) {
					loadedTool.onFocus();
				}
			}
		};

		button.addEventListener('click', e => {
			e.preventDefault();
			enable();
		});

		// Store lazy tool reference
		lazyTools[button.id] = {
			button: button,
			enable: enable,
			loader: toolLoader,
		};

		return { enable: enable };
	};

	const switchTool = toolId => {
		// Check both regular and lazy tools
		if (tools[toolId]) {
			tools[toolId].enable();
		} else if (lazyTools[toolId]) {
			lazyTools[toolId].enable();
		}
		closeMenu();
	};

	const returnToPreviousTool = () => {
		if (previousButton) {
			const toolId = previousButton.id;
			if (tools[toolId]) {
				tools[toolId].enable();
			} else if (lazyTools[toolId]) {
				lazyTools[toolId].enable();
			}
		}
		closeMenu();
	};

	const getCurrentTool = () => {
		closeMenu();
		return currentButton ? currentButton.id : null;
	};

	const closeMenu = () => {
		if (State.menus) {
			State.menus.close();
		}
	};

	return {
		add: add,
		addLazy: addLazy,
		switchTool: switchTool,
		returnToPreviousTool: returnToPreviousTool,
		getCurrentTool: getCurrentTool,
	};
})();

export default Toolbar;
