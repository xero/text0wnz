import State from './state.js';
import { $, $$, createCanvas } from './ui.js';
import { createTextArtCanvas } from './canvas.js';
import { Load, Save } from './file.js';
import Toolbar from './toolbar.js';
import {
	createSettingToggle,
	onClick,
	onReturn,
	onFileChange,
	onSelectChange,
	createPositionInfo,
	showOverlay,
	hideOverlay,
	undoAndRedo,
	createPaintShortcuts,
	createGenericController,
	createResolutionController,
	createGrid,
	createToolPreview,
	menuHover,
	enforceMaxBytes,
} from './ui.js';
import { createDefaultPalette, createPalettePreview, createPalettePicker } from './palette.js';
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
import { createCursor, createSelectionCursor, createKeyboardController, createPasteTool } from './keyboard.js';

let artworkTitle;
let bodyContainer;
let canvasContainer;
let columnsInput;
let fontSelect;
let fontsOverlay;
let openFile;
let resizeApply;
let resizeOverlay;
let sauceDone;
let sauceOverlay;
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
let sauceBytes;
let navSauce;

document.addEventListener('DOMContentLoaded', async () => {
	try {
		State.startInitialization();
		$$$();

		State.title = artworkTitle;
		State.pasteTool = createPasteTool($('cut'), $('copy'), $('paste'), $('delete'));
		State.positionInfo = createPositionInfo($('position-info'));

		// Initialize canvas and wait for completion state
		State.textArtCanvas = createTextArtCanvas(canvasContainer, async () => {
			State.selectionCursor = createSelectionCursor(canvasContainer);
			State.cursor = createCursor(canvasContainer);
			State.toolPreview = createToolPreview($('tool-preview'));

			State.waitFor(
				['palette', 'textArtCanvas', 'font', 'cursor', 'selectionCursor', 'positionInfo', 'toolPreview', 'pasteTool'],
				async _deps => {
					await initializeAppComponents();
				},
			);
		});
	} catch (error) {
		console.error('Error during initialization:', error);
		// Handle initialization failure gracefully
		alert('Failed to initialize the application. Please refresh the page.');
	}
});

const $$$ = () => {
	artworkTitle = $('artwork-title');
	bodyContainer = $('body-container');
	canvasContainer = $('canvas-container');
	columnsInput = $('columns-input');
	fontSelect = $('font-select');
	fontsOverlay = $('fonts-overlay');
	openFile = $('open-file');
	resizeApply = $('resize-apply');
	resizeOverlay = $('resize-overlay');
	sauceDone = $('sauce-done');
	sauceOverlay = $('sauce-overlay');
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
	sauceBytes = $('sauce-bytes');
	navSauce = $('navSauce');
};

const initializeAppComponents = async () => {
	document.addEventListener('keydown', undoAndRedo);
	createResolutionController($('resolution-label'), $('columns-input'), $('rows-input'));
	onClick($('new'), async () => {
		if (confirm('All changes will be lost. Are you sure?') === true) {
			bodyContainer.classList.add('loading');
			State.textArtCanvas.clearXBData(async _ => {
				State.palette = createDefaultPalette();
				palettePicker.updatePalette();
				palettePreview.updatePreview();
				await State.textArtCanvas.setFont('CP437 8x16', () => {
					State.font.setLetterSpacing(false);
					State.textArtCanvas.resize(80, 25);
					State.textArtCanvas.clear();
					State.textArtCanvas.setIceColors(false);
					artworkTitle.value = 'untitled';
					sauceTitle.value = 'untitled';
					sauceGroup.value = '';
					sauceAuthor.value = '';
					sauceComments.value = '';
					sauceBytes.value = '0/16320 bytes';
					// Update font display last
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

	onClick($('edit-menu'), menuHover);
	onClick($('nav-cut'), State.pasteTool.cut);
	onClick($('nav-copy'), State.pasteTool.copy);
	onClick($('nav-paste'), State.pasteTool.paste);
	onClick($('nav-system-paste'), State.pasteTool.systemPaste);
	onClick($('nav-delete'), State.pasteTool.deleteSelection);
	onClick($('nav-undo'), State.textArtCanvas.undo);
	onClick($('nav-redo'), State.textArtCanvas.redo);

	const palettePreview = createPalettePreview($('palette-preview'));
	const palettePicker = createPalettePicker($('palette-picker'));

	onFileChange(openFile, file => {
		bodyContainer.classList.add('loading');
		State.textArtCanvas.clearXBData();
		State.textArtCanvas.clear();
		Load.file(file, async (columns, rows, imageData, iceColors, letterSpacing, fontName) => {
			const indexOfPeriod = file.name.lastIndexOf('.');
			let fileTitle;
			if (indexOfPeriod !== -1) {
				fileTitle = file.name.substring(0, indexOfPeriod);
			} else {
				fileTitle = file.name;
			}
			State.title.value = fileTitle;
			document.title = `text.0w.nz: ${fileTitle}`;
			bodyContainer.classList.remove('loading');

			const applyData = () => {
				State.textArtCanvas.setImageData(columns, rows, imageData, iceColors, letterSpacing);
				palettePicker.updatePalette(); // ANSi
				openFile.value = '';
			};
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
		});
	});

	[artworkTitle, navSauce].forEach(e => {
		onClick(e, () => {
			showOverlay(sauceOverlay);
			keyboard.ignore();
			paintShortcuts.ignore();
			sauceTitle.focus();
			shadeBrush.ignore();
			characterBrush.ignore();
		});
	});

	onClick(sauceDone, () => {
		State.title.value = sauceTitle.value;
		artworkTitle.value = State.title.value;
		hideOverlay(sauceOverlay);
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
	});

	onClick($('sauce-cancel'), () => {
		hideOverlay(sauceOverlay);
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
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
		showOverlay(resizeOverlay);
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
			hideOverlay(resizeOverlay);
		}
		keyboard.unignore();
		paintShortcuts.unignore();
		shadeBrush.unignore();
		characterBrush.unignore();
	});
	onReturn(columnsInput, resizeApply);
	onReturn(rowsInput, resizeApply);
	onClick($('resize-cancel'), () => {
		hideOverlay(resizeOverlay);
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

	const navICE = createSettingToggle($('navICE'), State.textArtCanvas.getIceColors, newIceColors => {
		State.textArtCanvas.setIceColors(newIceColors);
		// Broadcast ice colors change to other users if in collaboration mode
		State.network?.sendIceColorsChange?.(newIceColors);
	});

	const nav9pt = createSettingToggle($('nav9pt'), State.font.getLetterSpacing, newLetterSpacing => {
		State.font.setLetterSpacing(newLetterSpacing);
		// Broadcast letter spacing change to other users if in collaboration mode
		State.network?.sendLetterSpacingChange?.(newLetterSpacing);
	});

	const updateFontDisplay = () => {
		const currentFont = State.textArtCanvas.getCurrentFontName();
		fontDisplay.textContent = currentFont.replace(/\s\d+x\d+$/, '');
		fontSelect.value = currentFont;
		nav9pt.sync(State.font.getLetterSpacing, State.font.setLetterSpacing);
		navICE.update();
	};

	const updateFontPreview = fontName => {
		// Load font for preview
		if (fontName === 'XBIN') {
			// Handle XB font preview - render embedded font if available
			if (State.textArtCanvas.getCurrentFontName() === 'XBIN') {
				// Current font is XBIN, render the embedded font
				const fontWidth = State.font.getWidth();
				const fontHeight = State.font.getHeight();

				// Create a canvas to render the font preview
				const previewCanvas = createCanvas(fontWidth * 16, fontHeight * 16);
				const previewCtx = previewCanvas.getContext('2d');

				// Use white foreground on black background for clear visibility
				const foreground = 15; // White
				const background = 0; // Black

				// Render all 256 characters in a 16x16 grid
				for (let y = 0, charCode = 0; y < 16; y++) {
					for (let x = 0; x < 16; x++, charCode++) {
						State.font.draw(charCode, foreground, background, previewCtx, x, y);
					}
				}

				// Update info and display the rendered font
				previewInfo.textContent = 'XBIN (embedded font) ' + fontWidth + 'x' + fontHeight;
				previewImage.src = previewCanvas.toDataURL();
				previewImage.style.display = 'block';
			} else {
				// No embedded font currently loaded
				previewInfo.textContent = 'XBIN (embedded font - not currently loaded)';
				previewImage.style.display = 'none';
				previewImage.src = '';
			}
		} else {
			// Load regular PNG font for preview
			const img = new Image();
			img.onload = () => {
				// Calculate font dimensions
				const fontWidth = img.width / 16; // 16 characters per row
				const fontHeight = img.height / 16; // 16 rows

				// Update font info with name and size on same line
				previewInfo.textContent = fontName + ' ' + fontWidth + 'x' + fontHeight;

				// Show the entire PNG font file
				previewImage.src = img.src;
				previewImage.style.display = 'block';
			};

			img.onerror = () => {
				// Font loading failed
				previewInfo.textContent = fontName + ' (not found)';
				previewImage.style.display = 'none';
				previewImage.src = '';
			};
			img.src = `${import.meta.env.BASE_URL}${import.meta.env.VITE_FONT_DIR}${fontName}.png`;
		}
	};

	// Listen for font changes and update display
	['onPaletteChange', 'onFontChange', 'onXBFontLoaded', 'onOpenedFile'].forEach(e => {
		document.addEventListener(e, updateFontDisplay);
	});

	onClick(fontDisplay, () => {
		changeFont.click();
	});
	onClick(changeFont, () => {
		showOverlay(fontsOverlay);
		keyboard.disable();
		updateFontPreview(fontSelect.value);
	});
	onSelectChange(fontSelect, () => {
		updateFontPreview(fontSelect.value);
	});
	onClick($('fonts-apply'), async () => {
		const selectedFont = fontSelect.value;
		await State.textArtCanvas.setFont(selectedFont, () => {
			updateFontDisplay();
			State.network?.sendFontChange?.(selectedFont);
			hideOverlay(fontsOverlay);
			keyboard.enable();
		});
	});
	onClick($('fonts-cancel'), () => {
		hideOverlay(fontsOverlay);
	});
	const grid = createGrid($('grid'));
	createSettingToggle($('navGrid'), grid.isShown, grid.show);

	const brushes = createBrushController();
	Toolbar.add($('brushes'), brushes.enable, brushes.disable);
	const halfblock = createHalfBlockController();
	Toolbar.add($('halfblock'), halfblock.enable, halfblock.disable);
	const shadeBrush = createShadingController(createShadingPanel(), false);
	Toolbar.add($('shading-brush'), shadeBrush.enable, shadeBrush.disable);
	const characterBrush = createShadingController(createCharacterBrushPanel(), true);
	Toolbar.add($('character-brush'), characterBrush.enable, characterBrush.disable);
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
	const fonts = createGenericController($('font-toolbar'), $('fonts'));
	Toolbar.add($('fonts'), fonts.enable, fonts.disable);
	const clipboard = createGenericController($('clipboard-toolbar'), $('clipboard'));
	Toolbar.add($('clipboard'), clipboard.enable, clipboard.disable);
	const selection = createSelectionTool();
	Toolbar.add(
		$('selection'),
		() => {
			paintShortcuts.disable();
			selection.enable();
		},
		() => {
			paintShortcuts.enable();
			selection.disable();
		},
	);
	State.sampleTool = createSampleTool(shadeBrush, $('shading-brush'), characterBrush, $('character-brush'));
	Toolbar.add($('sample'), State.sampleTool.enable, State.sampleTool.disable);
	createSettingToggle($('mirror'), State.textArtCanvas.getMirrorMode, State.textArtCanvas.setMirrorMode);
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
	createSettingToggle($('chat-button'), State.chat.isEnabled, State.chat.toggle);
	State.network = createWorkerHandler($('handle-input'));
};

// Inject style sheets into the build pipeline for processing
// and proper inclusion in the resulting build
import '../../css/style.css';
