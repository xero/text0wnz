import State from './state.js';

const Toolbar = (() => {
	let currentButton;
	let previousButton;
	const tools = {};

	const blur = () => {
		Object.values(tools).forEach(tool => {
			if (tool.isLoaded) {
				tool.button.classList.remove('toolbarDisplayed');
				if (typeof tool.onBlur === 'function') {
					tool.onBlur();
				}
			}
		});
	};

	const _activateTool = (tool, onFocus) => {
		if (currentButton !== tool.button) {
			if (
				currentButton !== undefined &&
				currentButton.id !== 'shapes' &&
				currentButton.id !== 'brushes'
			) {
				previousButton = currentButton;
			}
			blur(); // Deactivate the current tool
			tool.button.classList.add('toolbarDisplayed');
			currentButton = tool.button;
		}
		if (typeof onFocus === 'function') {
			onFocus();
		}
	};

	const add = (button, onFocus, onBlur) => {
		const tool = {
			button: button,
			onFocus: onFocus,
			onBlur: onBlur,
			isLoaded: true,
		};

		tool.enable = () => {
			closeMenu();
			_activateTool(tool, tool.onFocus);
		};

		button.addEventListener('click', e => {
			e.preventDefault();
			tool.enable();
		});

		tools[button.id] = tool;
		return { enable: tool.enable };
	};

	const addLazy = (button, toolLoader) => {
		const tool = {
			button: button,
			toolLoader: toolLoader,
			isLoaded: false,
		};

		const enable = async () => {
			closeMenu();

			// If the tool is not loaded, load it first.
			if (!tool.isLoaded) {
				try {
					const loadedTool = await tool.toolLoader();
					// Once loaded, update the tool's definition with its actual implementation.
					tool.onFocus = loadedTool.onFocus;
					tool.onBlur = loadedTool.onBlur;
					tool.isLoaded = true;
					tool.enable = () => {
						closeMenu();
						_activateTool(tool, tool.onFocus);
					};
				} catch (error) {
					console.error(`Failed to load tool for ${button.id}:`, error);
					return;
				}
			}
			_activateTool(tool, tool.onFocus);
		};

		tool.enable = enable;

		button.addEventListener('click', e => {
			e.preventDefault();
			tool.enable();
		});

		tools[button.id] = tool;
		return { enable: tool.enable };
	};

	const switchTool = toolId => {
		if (tools[toolId]) {
			tools[toolId].enable();
		}
		closeMenu();
	};

	const returnToPreviousTool = () => {
		if (previousButton) {
			if (State.selectionTool.isMoveMode()) {
				State.selectionTool.toggleMoveMode();
			} else {
				const toolId = previousButton.id;
				if (tools[toolId]) {
					tools[toolId].enable();
				}
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

	// Escape key - return to previous tool
	document.addEventListener('keydown', e => {
		if (e.code === 'Escape') {
			e.preventDefault();
			returnToPreviousTool();
		}
	});

	return {
		add: add,
		addLazy: addLazy,
		switchTool: switchTool,
		returnToPreviousTool: returnToPreviousTool,
		getCurrentTool: getCurrentTool,
	};
})();

export default Toolbar;
