const Toolbar = (() => {
	let currentButton;
	let currentOnBlur;
	let previousButton;
	const tools = {};

	const add = (divButton, onFocus, onBlur) => {
		const enable = () => {
			if (currentButton !== divButton) {
				// Store previous tool before switching
				if (currentButton !== undefined) {
					previousButton = currentButton;
					currentButton.classList.remove('toolbar-displayed');
				}
				if (currentOnBlur !== undefined) {
					currentOnBlur();
				}
				divButton.classList.add('toolbar-displayed');
				currentButton = divButton;
				currentOnBlur = onBlur;
				if (onFocus !== undefined) {
					onFocus();
				}
			} else {
				onFocus();
			}
		};

		divButton.addEventListener('click', e => {
			e.preventDefault();
			enable();
		});

		// Store tool reference for programmatic access
		tools[divButton.id] = {
			button: divButton,
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
	};

	const returnToPreviousTool = () => {
		if (previousButton && tools[previousButton.id]) {
			tools[previousButton.id].enable();
		}
	};

	const getCurrentTool = () => {
		return currentButton ? currentButton.id : null;
	};

	return {
		add: add,
		switchTool: switchTool,
		returnToPreviousTool: returnToPreviousTool,
		getCurrentTool: getCurrentTool,
	};
})();

export default Toolbar;
