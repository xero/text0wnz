import magicNumbers from './magicNumbers.js';
import State from './state.js';
import { $, $$, createCanvas, createDragDropController } from './ui.js';
import { createTextArtCanvas } from './canvas.js';
import { Load, Save } from './file.js';
import { loadFontFromXBData } from './font.js';
import Toolbar from './toolbar.js';
import {
	toggleFullscreen,
	createModalController,
	createViewportController,
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	onSelectChange,
	createPositionInfo,
	undoAndRedo,
	createPaintShortcuts,
	createGenericController,
	createResolutionController,
	createGrid,
	createToolPreview,
	menuHover,
	enforceMaxBytes,
} from './ui.js';
import {
	createDefaultPalette,
	createPalettePreview,
	createPalettePicker,
} from './palette.js';
import {
	createBrushController,
	createHalfBlockController,
	createShadingController,
	createShadingPanel,
	createCharacterBrushPanel,
	createFillController,
	createLineController,
	createSquareController,
	createShapesController,
	createCircleController,
	createAttributeBrushController,
	createSelectionTool,
	createSampleTool,
} from './freehand_tools.js';
import { createWorkerHandler, createChatController } from './network.js';
import {
	createCursor,
	createSelectionCursor,
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
let previewInfo;
let previewImage;
let sauceGroup;
let sauceAuthor;
let sauceComments;
let navSauce;
let navDarkmode;
let metaTheme;
let saveTimeout;
let mode;

const $$$$ = () => {
	htmlDoc = $$('html');
	bodyContainer = $('body-container');
	canvasContainer = $('canvas-container');
	columnsInput = $('columns-input');
	fontSelect = $('font-select');
	openFile = $('open-file');
	resizeApply = $('resize-apply');
	sauceDone = $('sauce-done');
	sauceTitle = $('sauce-title');
	swapColors = $('swap-colors');
	rowsInput = $('rows-input');
	fontDisplay = $$('#current-font-display kbd');
	changeFont = $('change-font');
	previewInfo = $('font-preview-info');
	previewImage = $('font-preview-image');
	sauceGroup = $('sauce-group');
	sauceAuthor = $('sauce-author');
	sauceComments = $('sauce-comments');
	navSauce = $('navSauce');
	navDarkmode = $('navDarkmode');
	metaTheme = $$('meta[name="theme-color"]');
	saveTimeout = null;
	mode = $$('#navDarkmode kbd');
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
	// init service worker
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
		// init global state and vars
		State.startInitialization();
		$$$$();

		State.title = 'Untitled';
		State.pasteTool = createPasteTool(
			$('cut'),
			$('copy'),
			$('paste'),
			$('delete'),
		);
		State.positionInfo = createPositionInfo($('position-info'));
		State.modal = createModalController($('modal'));

		// Initialize canvas and wait for completion state
		State.textArtCanvas = createTextArtCanvas(canvasContainer, async () => {
			State.selectionCursor = createSelectionCursor(canvasContainer);
			State.cursor = createCursor(canvasContainer);
			State.toolPreview = createToolPreview($('tool-preview'));

			State.waitFor(
				[
					'palette',
					'textArtCanvas',
					'font',
					'modal',
					'cursor',
					'selectionCursor',
					'positionInfo',
					'toolPreview',
					'pasteTool',
				],
				async _deps => {
					await initializeAppComponents();
				},
			);
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
	onClick($('new'), async () => {
		if (confirm('All changes will be lost. Are you sure?')) {
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
					updateFontDisplay();
					bodyContainer.classList.remove('loading');
				});
			});
		}
	});
	onClick($('open'), () => {
		openFile.click();
	});
	onClick($('file-menu'), menuHover);
	onClick($('edit-menu'), menuHover);
	onClick($('save-ansi'), Save.ans);
	onClick($('save-utf8'), Save.utf8);
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

	onClick($('about'), _ => {
		State.modal.open('about');
	});
	onClick($('about-ok'), _ => {
		State.modal.close();
	});
	onClick($('about-dl'), _ => {
		window.location.href = 'https://github.com/xero/text0wnz/releases/latest';
	});
	onClick($('update-reload'), _ => {
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
	createDragDropController(openHandler, bodyContainer);

	onClick(navSauce, () => {
		State.modal.open('sauce');
		keyboard.ignore();
		paintShortcuts.ignore();
		sauceTitle.focus();
		shadeBrush.ignore();
		characterBrush.ignore();
	});

	onClick(sauceDone, () => {
		State.title = sauceTitle.value;
		State.modal.close();
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
	});

	onClick($('sauce-cancel'), () => {
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
	});

	sauceComments.addEventListener('input', enforceMaxBytes);
	onReturn(sauceTitle, sauceDone);
	onReturn(sauceGroup, sauceDone);
	onReturn(sauceAuthor, sauceDone);
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
			keyboard.enable();
			$('keyboard-toolbar').classList.remove('hide');
		},
		() => {
			paintShortcuts.enable();
			keyboard.disable();
			$('keyboard-toolbar').classList.add('hide');
		},
	).enable();
	onClick($('undo'), State.textArtCanvas.undo);
	onClick($('redo'), State.textArtCanvas.redo);
	onClick($('resolution'), () => {
		State.modal.open('resize');
		columnsInput.value = State.textArtCanvas.getColumns();
		rowsInput.value = State.textArtCanvas.getRows();
		keyboard.ignore();
		paintShortcuts.ignore();
		shadeBrush.ignore();
		characterBrush.ignore();
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
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
	});
	onReturn(columnsInput, resizeApply);
	onReturn(rowsInput, resizeApply);
	onClick($('resize-cancel'), () => {
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
	});

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

	const darkToggle = () => {
		htmlDoc.classList.toggle('dark');
		const isDark = htmlDoc.classList.contains('dark');
		navDarkmode.setAttribute('aria-pressed', isDark);
		metaTheme.setAttribute('content', isDark ? '#333333' : '#4f4f4f');
		mode.innerText = (isDark ? 'Night' : 'Light') + ' Mode';
	};
	onClick(navDarkmode, darkToggle);
	window.matchMedia('(prefers-color-scheme: dark)').matches && darkToggle();

	$('zoom-level').addEventListener('change', e => {
		const scaleFactor = Number.isInteger(e.target.value)
			? e.target.value.toFixed(1)
			: e.target.value;
		State.zoom = scaleFactor;
	});

	const updateFontDisplay = () => {
		const currentFont = State.textArtCanvas.getCurrentFontName();
		fontDisplay.textContent = currentFont.replace(/\s\d+x\d+$/, '');
		fontSelect.value = currentFont;
		nav9pt.sync(State.font.getLetterSpacing, State.font.setLetterSpacing);
		navICE.update();
	};

	const updateFontPreview = async fontName => {
		// Load font for preview
		if (fontName === 'XBIN') {
			// Handle XB font preview - render embedded font if available
			const xbFontData = State.textArtCanvas.getXBFontData();
			if (xbFontData && xbFontData.bytes) {
				const xbfont = await loadFontFromXBData(
					xbFontData.bytes,
					xbFontData.width,
					xbFontData.height,
					xbFontData.letterSpacing,
					State.palette,
				);

				// Create a canvas to render the font preview
				const previewCanvas = createCanvas(
					xbFontData.width * 16,
					xbFontData.height * 16,
				);
				const previewCtx = previewCanvas.getContext('2d');

				// Use white foreground on black background for clear visibility
				const foreground = 15; // White
				const background = 0; // Black

				// Render all 256 characters in a 16x16 grid
				for (let y = 0, charCode = 0; y < 16; y++) {
					for (let x = 0; x < 16; x++, charCode++) {
						xbfont.draw(charCode, foreground, background, previewCtx, x, y);
					}
				}
				// Update info and display the rendered font
				previewInfo.textContent =
					'XBIN: embedded ' + xbFontData.width + 'x' + xbFontData.height;
				previewImage.src = previewCanvas.toDataURL();
			} else {
				// No embedded font currently loaded
				previewInfo.textContent = 'XBIN: none';
				previewImage.src = `${State.fontDir}missing.png`;
			}
		} else {
			// Load regular PNG font for preview
			const img = new Image();
			img.onload = () => {
				// Update font info with name and size on same line
				previewInfo.textContent = fontName;
				// Show the entire PNG font file
				previewImage.src = img.src;
			};

			img.onerror = () => {
				// Font loading failed
				previewInfo.textContent = fontName + ' (not found)';
				img.src = `${State.fontDir}missing.png`;
			};
			img.src = `${State.fontDir}${fontName}.png`;
		}
	};

	// Listen for font changes and update display
	['onPaletteChange', 'onFontChange', 'onXBFontLoaded', 'onOpenedFile'].forEach(
		e => {
			document.addEventListener(e, updateFontDisplay);
		},
	);

	onClick(fontDisplay, () => {
		changeFont.click();
	});
	onClick(changeFont, async () => {
		State.modal.open('fonts');
		keyboard.disable();
		await updateFontPreview(fontSelect.value);
	});
	onSelectChange(fontSelect, async () => {
		await updateFontPreview(fontSelect.value);
	});
	onClick($('fonts-apply'), async () => {
		const selectedFont = fontSelect.value;
		await State.textArtCanvas.setFont(selectedFont, () => {
			updateFontDisplay();
			State.network?.sendFontChange?.(selectedFont);
			State.modal.close();
			keyboard.enable();
		});
	});
	const grid = createGrid($('grid'));
	createSettingToggle($('navGrid'), grid.isShown, grid.show);

	const brushes = createBrushController();
	Toolbar.add($('brushes'), brushes.enable, brushes.disable);
	const halfblock = createHalfBlockController();
	Toolbar.add($('halfblock'), halfblock.enable, halfblock.disable);
	const shadeBrush = createShadingController(createShadingPanel(), false);
	Toolbar.add($('shading-brush'), shadeBrush.enable, shadeBrush.disable);
	const characterBrush = createShadingController(
		createCharacterBrushPanel(),
		true,
	);
	Toolbar.add(
		$('character-brush'),
		characterBrush.enable,
		characterBrush.disable,
	);
	const fill = createFillController();
	Toolbar.add($('fill'), fill.enable, fill.disable);
	const attributeBrush = createAttributeBrushController();
	Toolbar.add($('attrib'), attributeBrush.enable, attributeBrush.disable);
	const shapes = createShapesController();
	Toolbar.add($('shapes'), shapes.enable, shapes.disable);
	const line = createLineController();
	Toolbar.add($('line'), line.enable, line.disable);
	const square = createSquareController();
	Toolbar.add($('square'), square.enable, square.disable);
	const circle = createCircleController();
	Toolbar.add($('circle'), circle.enable, circle.disable);
	const view = createViewportController($('viewport-toolbar'));
	Toolbar.add($('navView'), view.enable, view.disable);
	const fonts = createGenericController($('font-toolbar'), $('fonts'));
	Toolbar.add($('fonts'), fonts.enable, fonts.disable);
	const clipboard = createGenericController(
		$('clipboard-toolbar'),
		$('clipboard'),
	);
	Toolbar.add($('clipboard'), clipboard.enable, clipboard.disable);
	State.selectionTool = createSelectionTool();
	Toolbar.add(
		$('selection'),
		() => {
			paintShortcuts.disable();
			State.selectionTool.enable();
		},
		() => {
			paintShortcuts.enable();
			State.selectionTool.disable();
		},
	);
	State.sampleTool = createSampleTool(
		shadeBrush,
		$('shading-brush'),
		characterBrush,
		$('character-brush'),
	);
	Toolbar.add($('sample'), State.sampleTool.enable, State.sampleTool.disable);
	createSettingToggle(
		$('mirror'),
		State.textArtCanvas.getMirrorMode,
		State.textArtCanvas.setMirrorMode,
	);
	updateFontDisplay();

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
			shadeBrush.ignore();
			characterBrush.ignore();
		},
		() => {
			keyboard.unignore();
			paintShortcuts.unignore();
			shadeBrush.unignore();
			characterBrush.unignore();
		},
	);
	createSettingToggle(
		$('chat-button'),
		State.chat.isEnabled,
		State.chat.toggle,
	);
	State.network = createWorkerHandler($('handle-input'));

	// Set up event listeners to save editor state
	document.addEventListener('onTextCanvasUp', save);
	document.addEventListener('keypress', save);
	document.addEventListener('onFontChange', save);
	document.addEventListener('onPaletteChange', save);
	document.addEventListener('onLetterSpacingChange', save);
	document.addEventListener('onIceColorsChange', save);
	document.addEventListener('onOpenedFile', save);
};

// Inject style sheets into the build pipeline for processing
// and proper inclusion in the resulting build
import '../../css/style.css';
// inject manifest imagest into the build pipeline
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
