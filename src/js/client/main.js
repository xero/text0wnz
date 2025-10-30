import magicNumbers from './magicNumbers.js';
import State from './state.js';
import Toolbar from './toolbar.js';
import { Load, Save } from './file.js';
import { createTextArtCanvas } from './canvas.js';
import { createWorkerHandler, createChatController } from './network.js';
import { FontCache } from './fontCache.js';
import {
	$,
	$$,
	createDragDropController,
	toggleFullscreen,
	createModalController,
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	createPositionInfo,
	undoAndRedo,
	viewportTap,
	createPaintShortcuts,
	createGenericController,
	createResolutionController,
	createGrid,
	createToolPreview,
	createMenuController,
	enforceMaxBytes,
	createFontSelect,
} from './ui.js';
import {
	createDefaultPalette,
	createPalettePreview,
	createPalettePicker,
} from './palette.js';
// Only import keyboard tools statically (default mode)
import {
	createCursor,
	createSelectionCursor,
	createSelectionTool,
	createKeyboardController,
	createPasteTool,
} from './keyboard.js';

let htmlDoc;
let bodyContainer;
let canvasContainer;
let columnsInput;
let fontSelect;
let openFile;
let resizeApply;
let sauceDone;
let sauceTitle;
let swapColors;
let rowsInput;
let fontDisplay;
let changeFont;
let applyFont;
let previewInfo;
let previewImage;
let sauceGroup;
let sauceAuthor;
let sauceComments;
let navSauce;
let navDarkmode;
let metaTheme;
let saveTimeout;
let reload;

const $$$$ = () => {
	htmlDoc = $$('html');
	bodyContainer = $('body-container');
	canvasContainer = $('canvas-container');
	columnsInput = $('columns-input');
	openFile = $('open-file');
	resizeApply = $('resize-apply');
	sauceDone = $('sauce-done');
	sauceTitle = $('sauce-title');
	swapColors = $('swap-colors');
	rowsInput = $('rows-input');
	fontDisplay = $$('#current-font-display kbd');
	changeFont = $('change-font');
	applyFont = $('fonts-apply');
	previewInfo = $('font-preview-info');
	previewImage = $('font-preview-image');
	sauceGroup = $('sauce-group');
	sauceAuthor = $('sauce-author');
	sauceComments = $('sauce-comments');
	navSauce = $('navSauce');
	navDarkmode = $('navDarkmode');
	metaTheme = $$('meta[name="theme-color"]');
	saveTimeout = null;
	reload = $('update-reload');
};

// Debounce to avoid saving too frequently during drawing
const save = () => {
	if (saveTimeout) {
		clearTimeout(saveTimeout);
	}
	saveTimeout = setTimeout(() => {
		State.saveToLocalStorage();
		saveTimeout = null;
	}, 300);
};

document.addEventListener('DOMContentLoaded', async () => {
	// Initialize service worker
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('/service.js').then(reg => {
			if (reg.waiting) {
				// New SW is waiting to activate
				reg.waiting.postMessage({ type: 'SKIP_WAITING' });
			}
			reg.onupdatefound = () => {
				const installingWorker = reg.installing;
				installingWorker.onstatechange = () => {
					if (installingWorker.state === 'installed') {
						if (navigator.serviceWorker.controller) {
							State.modal.open('update');
						}
					}
				};
			};
		});
	}

	try {
		// Start preloading fonts in the background first
		FontCache.preloadCommonFonts();

		// Initialize global state and variables
		State.startInitialization();
		$$$$();

		// Tier 1: Core UI and Canvas (most critical)
		State.modal = createModalController($('modal'));
		State.palette = createDefaultPalette();
		State.pasteTool = createPasteTool(
			$('cut'),
			$('copy'),
			$('paste'),
			$('delete'),
		);
		// Create canvas but defer heavy initialization
		State.textArtCanvas = createTextArtCanvas(canvasContainer, () => {
			// Remove loading state immediately after canvas is minimally ready
			bodyContainer.classList.remove('loading');

			// Tier 2: use setTimeout to allow UI to respond
			setTimeout(() => {
				State.positionInfo = createPositionInfo($('position-info'));
				State.selectionCursor = createSelectionCursor(canvasContainer);
				State.cursor = createCursor(canvasContainer);
				State.selectionTool = createSelectionTool();

				// Tier 3: Secondary tools - defer with requestIdleCallback
				const initSecondaryTools = () => {
					State.toolPreview = createToolPreview($('tool-preview'));
					State.title = 'Untitled';

					// Once everything is ready...
					State.waitFor(
						[
							'palette',
							'textArtCanvas',
							'font',
							'modal',
							'cursor',
							'selectionCursor',
							'selectionTool',
							'positionInfo',
							'toolPreview',
							'pasteTool',
						],
						async _deps => {
							await initializeAppComponents();
						},
					);
				};

				// Use requestIdleCallback if available, otherwise defer with timeout
				if ('requestIdleCallback' in window) {
					requestIdleCallback(initSecondaryTools);
				} else {
					setTimeout(initSecondaryTools, 100);
				}
			}, 0);
		});
	} catch (error) {
		console.error('[Main] Error during initialization:', error);
		alert('Failed to initialize the application. Please refresh the page.');
	}
});

const initializeAppComponents = async () => {
	State.restoreStateFromLocalStorage();
	document.addEventListener('keydown', undoAndRedo);
	createResolutionController(
		$('resolution-label'),
		$('columns-input'),
		$('rows-input'),
	);
	State.menus = createMenuController(
		[$('file-menu'), $('edit-menu')],
		canvasContainer,
	);
	onClick($('new'), () => {
		State.modal.open('warning');
	});
	onClick($('warning-yes'), async () => {
		bodyContainer.classList.add('loading');
		// Clear localStorage when creating a new file
		State.clearLocalStorage();
		State.textArtCanvas.clearXBData(async _ => {
			State.palette = createDefaultPalette();
			palettePicker.updatePalette();
			palettePreview.updatePreview();
			await State.textArtCanvas.setFont('CP437 8x16', () => {
				State.font.setLetterSpacing(false);
				State.textArtCanvas.resize(80, 25);
				State.textArtCanvas.clear();
				State.textArtCanvas.setIceColors(false);
				bodyContainer.classList.remove('loading');
				State.modal.close();
			});
		});
	});
	onClick($('open'), () => {
		openFile.click();
	});
	onClick($('save-ansi'), Save.ans);
	onClick($('save-utf8'), Save.utf8);
	onClick($('save-plaintext'), Save.plainText);
	onClick($('save-bin'), Save.bin);
	onClick($('save-xbin'), Save.xb);
	onClick($('save-png'), Save.png);
	onClick($('cut'), State.pasteTool.cut);
	onClick($('copy'), State.pasteTool.copy);
	onClick($('paste'), State.pasteTool.paste);
	onClick($('system-paste'), State.pasteTool.systemPaste);
	onClick($('delete'), State.pasteTool.deleteSelection);
	onClick($('nav-cut'), State.pasteTool.cut);
	onClick($('nav-copy'), State.pasteTool.copy);
	onClick($('nav-paste'), State.pasteTool.paste);
	onClick($('nav-system-paste'), State.pasteTool.systemPaste);
	onClick($('nav-delete'), State.pasteTool.deleteSelection);
	onClick($('nav-undo'), State.textArtCanvas.undo);
	onClick($('nav-redo'), State.textArtCanvas.redo);

	// Credz
	onClick($('about'), _ => {
		State.modal.open('about');
	});
	onClick($('about-dl'), _ => {
		window.location.href = 'https://github.com/xero/text0wnz/releases/latest';
	});
	onClick($('about-privacy'), _ => {
		window.location.href =
			'https://github.com/xero/teXt0wnz/blob/main/docs/privacy.md';
	});

	onClick($('update'), _ => {
		State.modal.open('update');
	});
	onClick(reload, _ => {
		State.clearLocalStorage();
		if ('caches' in window) {
			window.caches.keys().then(keys => {
				Promise.all(keys.map(key => window.caches.delete(key))).then(() => {
					window.location.reload();
				});
			});
		} else {
			window.location.reload();
		}
	});
	onReturn(reload, reload);

	const palettePreview = createPalettePreview($('palette-preview'));
	const palettePicker = createPalettePicker($('palette-picker'));

	const openHandler = file => {
		bodyContainer.classList.add('loading');
		State.textArtCanvas.clearXBData();
		State.textArtCanvas.clear();
		Load.file(
			file,
			async (columns, rows, imageData, iceColors, letterSpacing, fontName) => {
				const indexOfPeriod = file.name.lastIndexOf('.');
				let fileTitle;
				if (indexOfPeriod !== -1) {
					fileTitle = file.name.substring(0, indexOfPeriod);
				} else {
					fileTitle = file.name;
				}
				State.title = fileTitle;
				bodyContainer.classList.remove('loading');

				const applyData = () => {
					State.textArtCanvas.setImageData(
						columns,
						rows,
						imageData,
						iceColors,
						letterSpacing,
					);
					palettePicker.updatePalette(); // ANSi
					openFile.value = '';
				};

				const isNFOFile = file.name.toLowerCase().endsWith('.nfo');
				if (isNFOFile) {
					await State.textArtCanvas.setFont(magicNumbers.NFO_FONT, applyData);
					return; // Exit early since callback will be called from setFont
				}
				const isXBFile = file.name.toLowerCase().endsWith('.xb');
				if (fontName && !isXBFile) {
					// Only handle non-XB files here, as XB files handle font loading internally
					const appFontName = Load.sauceToAppFont(fontName.trim());
					if (appFontName) {
						await State.textArtCanvas.setFont(appFontName, applyData);
						return; // Exit early since callback will be called from setFont
					}
				}
				applyData(); // Apply data without font change
				palettePicker.updatePalette(); // XB
			},
		);
	};
	onFileChange(openFile, openHandler);
	createDragDropController(openHandler, $('dragdrop'));

	onClick(navSauce, () => {
		State.menus.close();
		State.modal.open('sauce');
	});

	onClick(sauceDone, () => {
		State.title = sauceTitle.value;
		State.modal.close();
	});

	sauceComments.addEventListener('input', enforceMaxBytes);
	onReturn(sauceTitle, sauceDone);
	onReturn(sauceGroup, sauceDone);
	onReturn(sauceAuthor, sauceDone);
	onReturn(sauceComments, sauceDone);
	const paintShortcuts = createPaintShortcuts({
		d: $('default-color'),
		q: swapColors,
		k: $('keyboard'),
		f: $('brushes'),
		b: $('character-brush'),
		n: $('fill'),
		a: $('attrib'),
		g: $('navGrid'),
		i: $('navICE'),
		m: $('mirror'),
	});
	const keyboard = createKeyboardController();
	Toolbar.add(
		$('keyboard'),
		() => {
			paintShortcuts.disable();
			State.menus.close();
			keyboard.enable();
			$('keyboard-toolbar').classList.remove('hide');
		},
		() => {
			paintShortcuts.enable();
			keyboard.disable();
			State.menus.close();
			$('keyboard-toolbar').classList.add('hide');
		},
	).enable();
	Toolbar.add(
		$('selection'),
		() => {
			paintShortcuts.disable();
			State.menus.close();
			State.selectionTool.enable();
			$('selection-toolbar').classList.remove('hide');
		},
		() => {
			paintShortcuts.enable();
			State.selectionTool.disable();
			$('selection-toolbar').classList.add('hide');
		},
	);

	onClick($('undo'), State.textArtCanvas.undo);
	onClick($('redo'), State.textArtCanvas.redo);
	onClick($('resolution'), () => {
		State.menus.close();
		State.modal.open('resize');
		columnsInput.value = State.textArtCanvas.getColumns();
		rowsInput.value = State.textArtCanvas.getRows();
		columnsInput.focus();
	});
	onClick(resizeApply, () => {
		const columnsValue = parseInt(columnsInput.value, 10);
		const rowsValue = parseInt(rowsInput.value, 10);
		if (!isNaN(columnsValue) && !isNaN(rowsValue)) {
			State.textArtCanvas.resize(columnsValue, rowsValue);
			// Broadcast resize to other users if in collaboration mode
			State.network?.sendResize?.(columnsValue, rowsValue);
			State.modal.close();
		}
	});
	onReturn(columnsInput, resizeApply);
	onReturn(rowsInput, resizeApply);

	// Edit action menu items
	onClick($('insert-row'), keyboard.insertRow);
	onClick($('delete-row'), keyboard.deleteRow);
	onClick($('insert-column'), keyboard.insertColumn);
	onClick($('delete-column'), keyboard.deleteColumn);
	onClick($('erase-row'), keyboard.eraseRow);
	onClick($('erase-row-start'), keyboard.eraseToStartOfRow);
	onClick($('erase-row-end'), keyboard.eraseToEndOfRow);
	onClick($('erase-column'), keyboard.eraseColumn);
	onClick($('erase-column-start'), keyboard.eraseToStartOfColumn);
	onClick($('erase-column-end'), keyboard.eraseToEndOfColumn);
	onClick($('fullscreen'), toggleFullscreen);

	onClick($('default-color'), () => {
		State.palette.setForegroundColor(7);
		State.palette.setBackgroundColor(0);
	});
	onClick(swapColors, () => {
		const tempForeground = State.palette.getForegroundColor();
		State.palette.setForegroundColor(State.palette.getBackgroundColor());
		State.palette.setBackgroundColor(tempForeground);
	});
	onClick($('palette-preview'), () => {
		const tempForeground = State.palette.getForegroundColor();
		State.palette.setForegroundColor(State.palette.getBackgroundColor());
		State.palette.setBackgroundColor(tempForeground);
	});

	const navICE = createSettingToggle(
		$('navICE'),
		State.textArtCanvas.getIceColors,
		newIceColors => {
			State.textArtCanvas.setIceColors(newIceColors);
			// Broadcast ice colors change to other users if in collaboration mode
			State.network?.sendIceColorsChange?.(newIceColors);
		},
	);

	const nav9pt = createSettingToggle(
		$('nav9pt'),
		State.font.getLetterSpacing,
		newLetterSpacing => {
			State.font.setLetterSpacing(newLetterSpacing);
			// Broadcast letter spacing change to other users if in collaboration mode
			State.network?.sendLetterSpacingChange?.(newLetterSpacing);
		},
	);

	fontSelect = createFontSelect(
		$('font-select'),
		previewInfo,
		previewImage,
		applyFont,
	);

	const updateFontDisplay = () => {
		const currentFont = State.textArtCanvas.getCurrentFontName();
		fontDisplay.textContent = currentFont.replace(/\s\d+x\d+$/, '');
		fontSelect.setValue(currentFont);
		nav9pt.sync(State.font.getLetterSpacing, State.font.setLetterSpacing);
		navICE.update();
	};
	['onPaletteChange', 'onFontChange', 'onXBFontLoaded', 'onOpenedFile'].forEach(
		e => {
			document.addEventListener(e, updateFontDisplay);
		},
	);
	onClick(fontDisplay, () => {
		State.menus.close();
		changeFont.click();
	});
	onClick(changeFont, async () => {
		State.menus.close();
		State.modal.open('fonts');
		fontSelect.focus();
	});
	onClick(applyFont, async () => {
		const selectedFont = fontSelect.getValue();
		await State.textArtCanvas.setFont(selectedFont, () => {
			State.network?.sendFontChange?.(selectedFont);
			State.modal.close();
		});
	});

	const grid = createGrid($('grid'));
	createSettingToggle($('navGrid'), grid.isShown, grid.show);

	// Lazy load tools - they'll be loaded when first clicked
	// Brushes are most common after keyboard, so we'll lazy load them
	Toolbar.addLazy($('brushes'), async () => {
		const { createBrushController } = await import('./freehandTools.js');
		const brushes = createBrushController();
		return {
			onFocus: brushes.enable,
			onBlur: brushes.disable,
			enable: brushes.enable,
		};
	});

	Toolbar.addLazy($('halfblock'), async () => {
		const { createHalfBlockController } = await import('./freehandTools.js');
		const halfblock = createHalfBlockController();
		return {
			onFocus: halfblock.enable,
			onBlur: halfblock.disable,
			enable: halfblock.enable,
		};
	});

	// Track loaded brush tools for modal focus events
	let shadeBrush = null;
	let characterBrush = null;

	Toolbar.addLazy($('shading-brush'), async () => {
		const { createShadingController, createShadingPanel } = await import(
			'./freehandTools.js'
		);
		shadeBrush = createShadingController(createShadingPanel(), false);
		return {
			onFocus: shadeBrush.enable,
			onBlur: shadeBrush.disable,
			enable: shadeBrush.enable,
			ignore: shadeBrush.ignore,
			unignore: shadeBrush.unignore,
		};
	});

	Toolbar.addLazy($('character-brush'), async () => {
		const { createShadingController, createCharacterBrushPanel } = await import(
			'./freehandTools.js'
		);
		characterBrush = createShadingController(createCharacterBrushPanel(), true);
		return {
			onFocus: characterBrush.enable,
			onBlur: characterBrush.disable,
			enable: characterBrush.enable,
			ignore: characterBrush.ignore,
			unignore: characterBrush.unignore,
		};
	});

	Toolbar.addLazy($('fill'), async () => {
		const { createFillController } = await import('./freehandTools.js');
		const fill = createFillController();
		return {
			onFocus: fill.enable,
			onBlur: fill.disable,
			enable: fill.enable,
		};
	});

	Toolbar.addLazy($('attrib'), async () => {
		const { createAttributeBrushController } = await import(
			'./freehandTools.js'
		);
		const attributeBrush = createAttributeBrushController();
		return {
			onFocus: attributeBrush.enable,
			onBlur: attributeBrush.disable,
			enable: attributeBrush.enable,
		};
	});

	Toolbar.addLazy($('shapes'), async () => {
		const { createShapesController } = await import('./freehandTools.js');
		const shapes = createShapesController();
		return {
			onFocus: shapes.enable,
			onBlur: shapes.disable,
			enable: shapes.enable,
		};
	});

	Toolbar.addLazy($('line'), async () => {
		const { createLineController } = await import('./freehandTools.js');
		const line = createLineController();
		return {
			onFocus: line.enable,
			onBlur: line.disable,
			enable: line.enable,
		};
	});

	Toolbar.addLazy($('square'), async () => {
		const { createSquareController } = await import('./freehandTools.js');
		const square = createSquareController();
		return {
			onFocus: square.enable,
			onBlur: square.disable,
			enable: square.enable,
		};
	});

	Toolbar.addLazy($('circle'), async () => {
		const { createCircleController } = await import('./freehandTools.js');
		const circle = createCircleController();
		return {
			onFocus: circle.enable,
			onBlur: circle.disable,
			enable: circle.enable,
		};
	});
	const fonts = createGenericController($('font-toolbar'), $('fonts'));
	Toolbar.add($('fonts'), fonts.enable, fonts.disable);
	const clipboard = createGenericController(
		$('clipboard-toolbar'),
		$('clipboard'),
	);
	Toolbar.add($('clipboard'), clipboard.enable, clipboard.disable);

	Toolbar.addLazy($('sample'), async () => {
		// Sample tool depends on shading brushes, so we need to ensure they're loaded
		const { createSampleTool } = await import('./freehandTools.js');

		// If brushes aren't loaded yet, we need to load them first
		if (!shadeBrush) {
			const { createShadingController, createShadingPanel } = await import(
				'./freehandTools.js'
			);
			shadeBrush = createShadingController(createShadingPanel(), false);
		}
		if (!characterBrush) {
			const { createShadingController, createCharacterBrushPanel } =
				await import('./freehandTools.js');
			characterBrush = createShadingController(
				createCharacterBrushPanel(),
				true,
			);
		}

		State.sampleTool = createSampleTool(
			shadeBrush,
			$('shading-brush'),
			characterBrush,
			$('character-brush'),
		);
		return {
			onFocus: State.sampleTool.enable,
			onBlur: State.sampleTool.disable,
			enable: State.sampleTool.enable,
		};
	});
	createSettingToggle(
		$('mirror'),
		State.textArtCanvas.getMirrorMode,
		State.textArtCanvas.setMirrorMode,
	);

	State.modal.focusEvents(
		() => {
			keyboard.ignore();
			paintShortcuts.ignore();
			// Only ignore if the brushes are loaded
			if (shadeBrush && shadeBrush.ignore) {
				shadeBrush.ignore();
			}
			if (characterBrush && characterBrush.ignore) {
				characterBrush.ignore();
			}
		},
		() => {
			keyboard.unignore();
			paintShortcuts.unignore();
			// Only unignore if the brushes are loaded
			if (shadeBrush && shadeBrush.unignore) {
				shadeBrush.unignore();
			}
			if (characterBrush && characterBrush.unignore) {
				characterBrush.unignore();
			}
		},
	);

	updateFontDisplay();

	viewportTap($('viewport'));

	// Initialize chat before creating network handler
	State.chat = createChatController(
		$('chat-button'),
		$('chat-window'),
		$('message-window'),
		$('user-list'),
		$('handle-input'),
		$('message-input'),
		$('message-send'),
		$('notification-checkbox'),
		() => {
			keyboard.ignore();
			paintShortcuts.ignore();
			// Only ignore if the brushes are loaded
			if (shadeBrush && shadeBrush.ignore) {
				shadeBrush.ignore();
			}
			if (characterBrush && characterBrush.ignore) {
				characterBrush.ignore();
			}
		},
		() => {
			keyboard.unignore();
			paintShortcuts.unignore();
			// Only unignore if the brushes are loaded
			if (shadeBrush && shadeBrush.unignore) {
				shadeBrush.unignore();
			}
			if (characterBrush && characterBrush.unignore) {
				characterBrush.unignore();
			}
		},
	);
	createSettingToggle(
		$('chat-button'),
		State.chat.isEnabled,
		State.chat.toggle,
	);
	State.network = createWorkerHandler($('handle-input'));

	const darkToggle = () => {
		htmlDoc.classList.toggle('dark');
		const isDark = htmlDoc.classList.contains('dark');
		navDarkmode.setAttribute('aria-pressed', isDark);
		metaTheme.setAttribute('content', isDark ? '#333333' : '#4f4f4f');
	};
	onClick(navDarkmode, darkToggle);
	window.matchMedia('(prefers-color-scheme: dark)').matches && darkToggle();

	// Set up event listeners to save editor state
	document.addEventListener('onTextCanvasUp', save);
	document.addEventListener('keypress', save);
	document.addEventListener('onFontChange', save);
	document.addEventListener('onPaletteChange', save);
	document.addEventListener('onLetterSpacingChange', save);
	document.addEventListener('onIceColorsChange', save);
	document.addEventListener('onOpenedFile', save);
};

// Inject style sheets and manifest images into the build pipeline
// for processing and proper inclusion in the resulting build
import '../../css/style.css';
import '../../img/logo.png';
import '../../img/manifest/android-launchericon-48-48.png';
import '../../img/manifest/apple-touch-icon.png';
import '../../img/manifest/favicon-96x96.png';
import '../../img/manifest/favicon.ico';
import '../../img/manifest/favicon.svg';
import '../../img/manifest/screenshot-dark-wide.png';
import '../../img/manifest/screenshot-desktop.png';
import '../../img/manifest/screenshot-font-tall.png';
import '../../img/manifest/screenshot-light-wide.png';
import '../../img/manifest/screenshot-mobile.png';
import '../../img/manifest/screenshot-sauce-tall.png';
import '../../img/manifest/web-app-manifest-192x192.png';
import '../../img/manifest/web-app-manifest-512x512.png';
