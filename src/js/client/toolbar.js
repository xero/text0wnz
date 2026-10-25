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
			blur();
			tool.button.classList.add('toolbarDisplayed');
			currentButton = tool.button;
			// chrome that mirrors the active tool (group tooltips) hangs
			// off this instead of wrapping every enable path
			document.dispatchEvent(
				new CustomEvent('onToolChange', { detail: { id: tool.button.id } }),
			);
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

			if (!tool.isLoaded) {
				// single flight: a second click mid load must share the one
				// construction or the controller builds and mounts twice
				if (!tool.loading) {
					tool.loading = tool.toolLoader();
				}
				try {
					const loadedTool = await tool.loading;
					if (!tool.isLoaded) {
						tool.onFocus = loadedTool.onFocus;
						tool.onBlur = loadedTool.onBlur;
						tool.isLoaded = true;
						tool.enable = () => {
							closeMenu();
							_activateTool(tool, tool.onFocus);
						};
					}
				} catch (error) {
					tool.loading = null;
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

	// a getter with no side effects: the old closeMenu() here let the
	// history label fallback close the History flyout as it opened
	const getCurrentTool = () => {
		return currentButton ? currentButton.id : null;
	};

	const closeMenu = () => {
		State.flyouts?.close();
	};

	// Escape walks outward: an open flyout first, then the phone
	// drawer, then an active selection, then back to the previous tool
	document.addEventListener('keydown', e => {
		if (e.code === 'Escape') {
			// a native dialog owns Escape while it is open: preventDefault
			// here blocked its close and then dismissed selections or
			// switched tools underneath it
			if (State.modal?.isOpen?.()) {
				return;
			}
			e.preventDefault();
			if (State.flyouts?.closeAndFocus()) {
				return;
			}
			if (State.panels?.closeDrawer?.()) {
				return;
			}
			if (State.selectionBar?.dismiss?.()) {
				return;
			}
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
