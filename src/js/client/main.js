import magicNumbers from './magicNumbers.js';
import State from './state.js';
import Toolbar from './toolbar.js';
import { Load, Save } from './file.js';
import { createTextArtCanvas } from './canvas.js';
import { createWorkerHandler, createChatController } from './network.js';
import { trustedMessage } from './messageGuard.js';
import { createZoomController } from './zoom.js';
import { createGestureGuard } from './gestureGuard.js';
import { createCharsetPicker } from './charsetPicker.js';
import { createColorPanel } from './colorPanel.js';
import { createFramesPanel } from './frames.js';
import { createMinimap } from './minimap.js';
import { createSixteenColors } from './sixteenColors.js';
import { createAsciiArena } from './asciiArena.js';
import { createArtpacksLanding } from './artpacks.js';
import { createArchiveOpener, isArchiveFile } from './archiveOpen.js';
import { createPluginManager } from './plugins.js';
import { createReferenceImage } from './referenceImage.js';
import { createToolSettings } from './toolSettings.js';
import { FontCache } from './fontCache.js';
import {
	$,
	$$,
	$$$,
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
	createViewportController,
	createGenericController,
	createResolutionController,
	createGrid,
	createToolPreview,
	createMenuController,
	enforceMaxBytes,
	createFontSelect,
	createZoomControl,
	makePanelFloat,
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

const CACHE_ID = 'text0wnz-shared-files';
const CACHE_DATA = '/shared-file-data';

let htmlDoc;
let bodyContainer;
let canvasContainer;
let viewport;
let columnsInput;
let fontSelect;
let openFile;
let referenceImage;
let refToggle;
let refFloat;
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
let lblDarkmode;
let metaTheme;
let saveTimeout;
let reload;
let swRegistration = null;
let updateAccepted = false;
let palettePicker;
let pendingFile = null;
let navFullscreen;
let archiveOpener = null;

const $$$$ = () => {
	htmlDoc = $$('html');
	bodyContainer = $('bodyContainer');
	canvasContainer = $('canvasContainer');
	viewport = $('viewport');
	columnsInput = $('columnsInput');
	openFile = $('openFile');
	resizeApply = $('resizeApply');
	sauceDone = $('sauceDone');
	sauceTitle = $('sauceTitle');
	swapColors = $('swapColors');
	rowsInput = $('rowsInput');
	fontDisplay = $$('#currentFontDisplay kbd');
	changeFont = $('changeFont');
	applyFont = $('fontsApply');
	previewInfo = $('fontPreviewInfo');
	previewImage = $('fontPreviewImage');
	sauceGroup = $('sauceGroup');
	sauceAuthor = $('sauceAuthor');
	sauceComments = $('sauceComments');
	navSauce = $('navSauce');
	navDarkmode = $('navDarkmode');
	lblDarkmode = $('mode');
	metaTheme = $$('meta[name="theme-color"]');
	saveTimeout = null;
	reload = $('updateReload');
	navFullscreen = $('fullscreen');
};

const isImageFile = file => {
	if (file.type?.startsWith('image/')) {
		return true;
	}
	const ext = file.name.split('.').pop().toLowerCase();
	return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif'].includes(ext);
};

// loads are not serialized, so completion order can invert click
// order: every open takes a generation ticket and a stale ticket
// applies NOTHING. A repeat click on the file already in flight is
// ignored outright (the key clears when its parse lands, or when any
// different open supersedes it)
let openSeq = 0;
let openInFlight = null;
// applyData's own dispatch must not cancel the open that fired it;
// every OTHER new document (File > New, a collab join) obsoletes any
// parse still in flight, or its late callback would stamp the old
// file over the fresh canvas
let dispatchingOwnOpen = false;
document.addEventListener('onNewDocument', () => {
	if (!dispatchingOwnOpen) {
		openSeq++;
		openInFlight = null;
	}
});

const openHandler = (file, opts = {}) => {
	// images trace, they do not parse: route them to the reference
	// overlay instead of dumping their bytes into the canvas as text.
	// iOS widens the picker's accept to */* so they cannot be filtered
	// out of the dialog itself
	if (isImageFile(file) && referenceImage) {
		referenceImage.load(file);
		referenceImage.setOpen(true);
		refToggle?.update();
		refFloat?.focus();
		openFile.value = '';
		return;
	}
	// archives unpack client-side; multi-entry ones raise a picker.
	// created on first use: a PWA launch can deliver a file before the
	// idle-time init tier builds the opener
	if (isArchiveFile(file)) {
		archiveOpener ??= createArchiveOpener({ openFile: openHandler });
		archiveOpener?.open(file);
		openFile.value = '';
		return;
	}
	// lastModified keeps two same-sized files (two packs' FILE_ID.DIZ)
	// from colliding; browser repeat clicks dedupe upstream in the
	// open guards, so the fresh timestamp there costs nothing
	const openKey = `${file.name}:${file.size}:${file.lastModified ?? 0}`;
	if (openInFlight === openKey) {
		return;
	}
	const seq = ++openSeq;
	openInFlight = openKey;
	bodyContainer.classList.add('loading');
	State.textArtCanvas.clearXBData();
	State.textArtCanvas.clear();
	// a parser throw must not wedge the in-flight key or the loading
	// veil; the canvas was already cleared, that loss is honest
	const onError = error => {
		console.error('[App] could not open file:', error);
		if (seq === openSeq) {
			openInFlight = null;
			bodyContainer.classList.remove('loading');
			// chromium fires no change event when the picker re-selects
			// the same filename, so a failed open must clear the input
			// or it cannot be retried at all
			openFile.value = '';
			if (State.modal.isOpen() && State.modal.current() === 'loading') {
				State.modal.close();
			}
		}
	};
	Load.file(
		file,
		async (
			columns,
			rows,
			imageData,
			iceColors,
			letterSpacing,
			fontName,
			docNative,
		) => {
			if (seq !== openSeq) {
				return;
			}
			openInFlight = null;
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
				// a newer open can land while this one awaits its font
				if (seq !== openSeq) {
					return;
				}
				if (docNative) {
					// tnd/dur/0wnz: plane-native load keeps truecolor and
					// frames; legacy consumers read the lossy u16 mirror
					State.textArtCanvas.setDocData(docNative);
				} else {
					State.textArtCanvas.setImageData(
						columns,
						rows,
						imageData,
						iceColors,
						letterSpacing,
					);
				}
				// the reset event fires only on REAL loads: onOpenedFile
				// also rides buffer swaps (row ops, collab resyncs) which
				// must never re-home the cursor, selection, or minimap
				dispatchingOwnOpen = true;
				document.dispatchEvent(new CustomEvent('onNewDocument'));
				dispatchingOwnOpen = false;
				palettePicker.updatePalette(); // ANSi
				openFile.value = '';
				viewport.scrollLeft = viewport.scrollTop = 0;
			};

			const closeModal = () => {
				// a superseded open must not yank the winner's modal
				if (seq !== openSeq) {
					return;
				}
				// current is the controller's accessor, not a field: the
				// old reference compare never matched and left the
				// loading modal up after every file load
				if (State.modal.isOpen() && State.modal.current() === 'loading') {
					State.modal.close();
				}
			};
			const isSceneFile =
				file.name.toLowerCase().endsWith('.nfo') ||
				file.name.toLowerCase().endsWith('.diz');
			// an archive browser's font hint beats the NFO heuristic (an
			// amiga diz wants Topaz, not Topaz-437) but never SAUCE: the
			// author's record wins over the source's house style
			// a stale open's font must never land on the winning doc
			const fontWanted = () => seq === openSeq;
			if (isSceneFile && !opts.font) {
				await State.textArtCanvas.setFont(
					magicNumbers.NFO_FONT,
					applyData,
					undefined,
					fontWanted,
				);
				return; // setFont runs applyData
			}
			const isXBFile = file.name.toLowerCase().endsWith('.xb');
			if (fontName && !isXBFile) {
				// XB files handle font loading internally
				const appFontName = Load.sauceToAppFont(fontName.trim());
				if (appFontName) {
					await State.textArtCanvas.setFont(
						appFontName,
						applyData,
						undefined,
						fontWanted,
					);
					closeModal();
					return; // setFont runs applyData
				}
			}
			if (opts.font && !isXBFile) {
				await State.textArtCanvas.setFont(
					opts.font,
					applyData,
					undefined,
					fontWanted,
				);
				closeModal();
				return; // setFont runs applyData
			}
			applyData();
			palettePicker.updatePalette(); // XB
			closeModal();
		},
		{ ...opts, onError },
	);
};

const handleLaunchFiles = () => {
	if ('launchQueue' in window) {
		window.launchQueue.setConsumer(async launchParams => {
			if (!launchParams.files || launchParams.files.length === 0) {
				return;
			}
			const fileHandle = launchParams.files[0];
			try {
				const file = await fileHandle.getFile();
				if (
					State.textArtCanvas &&
					!bodyContainer?.classList.contains('loading')
				) {
					openHandler(file);
				} else {
					pendingFile = file;
				}
			} catch (error) {
				console.error('[App] Error reading launched file:', error);
			}
		});
	}
};
handleLaunchFiles();

const handleFileShare = async () => {
	try {
		const cache = await caches.open(CACHE_ID);
		const response = await cache.match(CACHE_DATA);

		if (response) {
			const filename = response.headers.get('X-Filename') || 'untitled.txt';
			const fileSize = response.headers.get('X-File-Size') || '0';
			const blob = await response.blob();
			const file = new File([blob], filename, {
				type:
					response.headers.get('Content-Type') || 'application/octet-stream',
			});
			return { file, filename, fileSize };
		}

		return null;
	} catch (error) {
		console.error('[Error] Failed checking for shared file:', error);
		return null;
	}
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
	saveUndoOnIdle();
};

// Undo history is heavy; persist it only once editing goes idle
let undoSaveTimeout = null;
const saveUndoOnIdle = () => {
	if (undoSaveTimeout) {
		clearTimeout(undoSaveTimeout);
	}
	undoSaveTimeout = setTimeout(() => {
		undoSaveTimeout = null;
		if ('requestIdleCallback' in window) {
			requestIdleCallback(() => State.saveUndoHistory());
		} else {
			State.saveUndoHistory();
		}
	}, 3000);
};

const fetchTutorial = async url => {
	try {
		const res = await fetch('./ansi/' + url);
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} ${res.statusText}`);
		}
		const blob = await res.blob();
		const cd = res.headers.get('Content-Disposition') || '';
		let filename = '';
		const fnMatch =
			cd.match(/filename\*=UTF-8''([^;\r\n]+)/i) ||
			cd.match(/filename="?([^";\r\n]+)"?/i);
		if (fnMatch) {
			filename = decodeURIComponent(fnMatch[1]);
		} else {
			const urlPath = new URL(url, location.href).pathname;
			filename = urlPath.split('/').pop() || 'remote-file';
		}
		const file = new File([blob], filename, { type: 'application/octet-stream' });

		if (
			typeof openHandler === 'function' &&
			State?.textArtCanvas &&
			!bodyContainer?.classList.contains('loading')
		) {
			State.modal.loading('Reloading editor from file...');
			openHandler(file);
		} else {
			pendingFile = file;
		}
	} catch (err) {
		console.error('Failed to fetch/open remote file:', err);
	}
};

const isIOS = (/iPad|iPhone|iPod/).test(navigator.userAgent);

// dvh tracks Safari's url bar but not the fullscreen title bar: that
// chrome shrinks the window while the layout viewport, dvh, and even
// innerHeight go stale, leaving pannable slack above the header. the
// visualViewport is the one honest height, so it feeds the body
// sizing var, and a pan that settles off origin snaps back flush.
// not gated on isIOS: iPadOS masquerades as macOS in its default
// desktop-site mode, and elsewhere this is a no-op
const lockVisualViewport = () => {
	const vv = window.visualViewport;
	if (!vv) {
		return;
	}
	let settle = 0;
	const apply = () => {
		if (vv.scale !== 1) {
			return;
		}
		htmlDoc.style.setProperty('--app-height', `${vv.height}px`);
		clearTimeout(settle);
		settle = setTimeout(() => {
			if (vv.scale === 1 && (vv.pageTop !== 0 || vv.offsetTop !== 0)) {
				window.scrollTo(0, 0);
			}
		}, 150);
	};
	vv.addEventListener('resize', apply);
	vv.addEventListener('scroll', apply);
	apply();
};

const handleIOS = () => {
	const isWindowed =
		window.navigator.standalone ||
		window.matchMedia('(display-mode: standalone)').matches ||
		window.matchMedia('(display-mode: window-controls-overlay)').matches;
	const isMaximized =
		window.innerWidth >= window.screen.availWidth &&
		window.innerHeight >= window.screen.availHeight * 0.95;
	const isWebkitFullscreen = !!(
		document.webkitFullscreenElement || document.webkitCurrentFullScreenElement
	);
	const needsPadding = isWebkitFullscreen || (isWindowed && !isMaximized);
	htmlDoc.classList.toggle('ios', needsPadding);
	navFullscreen.classList.toggle('disabled', isWindowed);
};

document.addEventListener('DOMContentLoaded', async () => {
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.register('service.js').then(reg => {
			swRegistration = reg;
			if (reg.waiting && navigator.serviceWorker.controller) {
				// a new worker is already waiting: ask instead of activating
				// under a live session (activation evicts the old assets this
				// page may still lazy-load)
				State.modal.open('update');
			} else if (reg.waiting) {
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

		// reload exactly once after the user accepts an update and the new
		// worker takes control; recovery claims by wedged-page repair also
		// fire controllerchange, so gate on the explicit acceptance
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (updateAccepted) {
				updateAccepted = false;
				window.location.reload();
			}
		});

		navigator.serviceWorker.addEventListener('message', async event => {
			if (!trustedMessage(event)) {
				return;
			}
			if (event.data.type === 'RECOVERY_PING') {
				// prove this page is alive so the recovering worker leaves
				// its session alone instead of force-reloading it
				event.source?.postMessage({ type: 'RECOVERY_PONG' });
				return;
			}
			if (event.data.type === 'SHARED_FILE_READY') {
				console.log('[Share] File shared:', event.data.filename);
				const waitForApp = () => {
					return new Promise(resolve => {
						if (State.textArtCanvas && openHandler) {
							resolve();
						} else {
							setTimeout(() => waitForApp().then(resolve), 100);
						}
					});
				};
				await waitForApp();
				const sharedFileData = await handleFileShare();
				if (sharedFileData) {
					pendingFile = sharedFileData.file;
					openHandler(pendingFile);
					pendingFile = null;
					caches
						.open(CACHE_ID)
						.then(cache => cache.delete(CACHE_DATA))
						.catch(error =>
							console.error(
								'[Error] Failed to cleanup shared file cache:',
								error,
							));
				}
			}
		});
	}

	try {
		FontCache.preloadCommonFonts();

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
		State.textArtCanvas = createTextArtCanvas(canvasContainer, () => {
			// drop the loading state as soon as the canvas is minimally ready
			bodyContainer.classList.remove('loading');

			// Tier 2: use setTimeout to allow UI to respond
			setTimeout(() => {
				State.positionInfo = createPositionInfo($('positionInfo'));
				State.selectionCursor = createSelectionCursor(canvasContainer);
				State.cursor = createCursor(canvasContainer);
				State.selectionTool = createSelectionTool();

				// zoom controller first (pinch/wheel/focal anchoring), then
				// the slider UI that routes through it
				const viewportElement = $('viewport');
				if (viewportElement) {
					createZoomController(viewportElement);
					// chrome pinches drive editor zoom too, never the page
					createGestureGuard(canvasContainer);
				}
				const zoomControlContainer = $('zoomControl');
				if (zoomControlContainer) {
					const zoomControl = createZoomControl();
					const icon = zoomControlContainer.querySelector?.('svg');
					if (icon) {
						zoomControl.querySelector('.zoomTop')?.prepend(icon);
					}
					zoomControlContainer.appendChild(zoomControl);
				}

				// Tier 3: Secondary tools - defer with requestIdleCallback
				const initSecondaryTools = () => {
					State.toolPreview = createToolPreview($('toolPreview'));
					State.title = 'Untitled';

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
							// Signal that every control is wired up (used by e2e tests)
							bodyContainer.dataset.ready = 'true';
							// Opt-in instrumentation, never part of the normal boot path
							const toolParams = new URLSearchParams(window.location.search);
							if (toolParams.has('test')) {
								import('./testBridge.js').then(m => m.installTestBridge());
							}
							if (toolParams.has('profile')) {
								import('./profiler.js').then(m => m.installProfiler());
							}
							if (toolParams.has('spike')) {
								import('./scrollSpike.js').then(m => m.installScrollSpike());
							}
						},
					);
				};

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
	// a pending launch file wins over the autosave restore
	if (!pendingFile) {
		State.restoreStateFromLocalStorage().then(() => {
			// the restore's loading modal clobbers a pending update prompt,
			// and one cancel would then pin the old worker's stale chunks
			// through every future reload: re-offer once the modal is free
			const reofferUpdate = () => {
				if (!swRegistration?.waiting || !navigator.serviceWorker.controller) {
					return;
				}
				if (State.modal.current()) {
					setTimeout(reofferUpdate, 1000);
					return;
				}
				State.modal.open('update');
			};
			reofferUpdate();
		});
	}
	// iOS quirks
	if (isIOS) {
		openFile.setAttribute('accept', '*/*');
		// track state to offset traffic lights
		handleIOS();
		document.addEventListener('webkitfullscreenchange', handleIOS);
		window.addEventListener('resize', handleIOS);
	}
	lockVisualViewport();

	document.addEventListener('keydown', undoAndRedo);
	createResolutionController(
		$('resolutionLabel'),
		$('columnsInput'),
		$('rowsInput'),
	);
	State.menus = createMenuController(
		[
			{
				button: $('fileMenu'),
				menu: $('fileList'),
			},
			{
				button: $('editMenu'),
				menu: $('editList'),
			},
		],
		canvasContainer,
		viewport,
	);
	onClick($('new'), () => {
		State.modal.open('warning');
	});
	onClick($('warningYes'), async () => {
		bodyContainer.classList.add('loading');
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
				// New is a real load: ride the same reset event as the
				// file openers instead of hand-copying a subset of it
				document.dispatchEvent(new CustomEvent('onNewDocument'));
				viewport.scrollLeft = viewport.scrollTop = 0;
				bodyContainer.classList.remove('loading');
				State.modal.close();
			});
		});
	});
	onClick($('open'), () => {
		openFile.click();
	});
	// both artpack site browsers open straight into the editor; one
	// landing modal fronts them from a single File menu entry and
	// remembers which site the artist was last inside
	// exitToLanding closes over artpacks before its const below exists;
	// safe because createTrail only calls it from user-driven back()
	const exitToLanding = () => artpacks?.showLanding();
	const sixteen = createSixteenColors({
		openFile: openHandler,
		onExit: exitToLanding,
	});
	const arena = createAsciiArena({
		openFile: openHandler,
		onExit: exitToLanding,
	});
	const artpacks = createArtpacksLanding({ sixteen, arena });
	onClick($('browseArtpacks'), () => artpacks?.show());

	// native zip and lha opens route through the same unpack path
	archiveOpener ??= createArchiveOpener({ openFile: openHandler });

	// ES-module plugin surface (durdraw lineage)
	const pluginManager = createPluginManager();
	onClick($('pluginsMenu'), () => pluginManager?.show());

	// reference-image overlay for tracing
	referenceImage = createReferenceImage();
	if (referenceImage) {
		refFloat = makePanelFloat($('refPanel'), () => {
			referenceImage.setOpen(false);
			refToggle.update();
		});
		refToggle = createSettingToggle(
			$('navRef'),
			referenceImage.isOpen,
			open => {
				referenceImage.setOpen(open);
				if (open) {
					refFloat.focus();
				}
			},
		);
	}
	onClick($('saveAnsi'), Save.ans);
	onClick($('saveUtf8'), Save.utf8);
	onClick($('saveUtf8Blink'), Save.utf8Blink);
	onClick($('savePlaintext'), Save.plainText);
	onClick($('saveBin'), Save.bin);
	onClick($('saveXbin'), Save.xb);
	onClick($('saveTundra'), Save.tnd);
	onClick($('saveDur'), Save.dur);
	onClick($('saveAnsimation'), Save.ansimation);
	onClick($('saveTimelapse'), Save.timelapse);
	onClick($('saveOwnz'), Save.ownz);
	onClick($('savePng'), Save.png);
	onClick($('cut'), State.pasteTool.cut);
	onClick($('copy'), State.pasteTool.copy);
	onClick($('paste'), State.pasteTool.paste);
	onClick($('systemPaste'), State.pasteTool.systemPaste);
	onClick($('delete'), State.pasteTool.deleteSelection);
	onClick($('navCut'), State.pasteTool.cut);
	onClick($('navCopy'), State.pasteTool.copy);
	onClick($('navPaste'), State.pasteTool.paste);
	onClick($('navPasteTransparent'), State.pasteTool.pasteTransparent);
	onClick($('navPasteUnder'), State.pasteTool.pasteUnder);
	onClick($('navSystemPaste'), State.pasteTool.systemPaste);
	onClick($('navDelete'), State.pasteTool.deleteSelection);
	onClick($('navUndo'), State.textArtCanvas.undo);
	onClick($('navRedo'), State.textArtCanvas.redo);

	// charset picker (durdraw lineage)
	const charsetPicker = createCharsetPicker();
	onClick($('charsetPicker'), charsetPicker.show);

	// extended colors: the strip's 256/RGB expansion panel
	createColorPanel();

	// frames timeline + playback + onion skin; the toolbar buttons ride
	// createSettingToggle so the 'enabled' highlight persists across
	// toolbar view switches, like the grid button
	const framesPanel = createFramesPanel();
	if (framesPanel) {
		const framesFloat = makePanelFloat($('framesPanel'), () => {
			framesPanel.setOpen(false);
			framesToggle.update();
		});
		const framesToggle = createSettingToggle(
			$('navFrames'),
			framesPanel.isOpen,
			open => {
				framesPanel.setOpen(open);
				if (open) {
					framesFloat.focus();
				}
			},
		);
	}

	// a partial cell may only ever render at the BOTTOM edge: once any
	// scroll settles, nudge the viewport onto a row boundary in content
	// space (the canvas sits below a container margin). Aligned settles
	// rewrite nothing, so the snap cannot re-trigger itself.
	const vpScroller = $('viewport');
	if (vpScroller) {
		let snapTimer = 0;
		vpScroller.addEventListener(
			'scroll',
			() => {
				clearTimeout(snapTimer);
				snapTimer = setTimeout(() => {
					const fh = State.font?.getHeight();
					const container = $('canvasContainer');
					if (!fh || !container) {
						return;
					}
					const offY =
						container.getBoundingClientRect().top -
						vpScroller.getBoundingClientRect().top +
						vpScroller.scrollTop;
					const snapped =
						offY + Math.round((vpScroller.scrollTop - offY) / fh) * fh;
					if (Math.abs(snapped - vpScroller.scrollTop) >= 1) {
						vpScroller.scrollTop = Math.max(0, snapped);
					}
				}, 150);
			},
			{ passive: true },
		);
	}

	// minimap (GL-only)
	const minimap = createMinimap();
	if (minimap) {
		createSettingToggle($('navMinimap'), minimap.isVisible, visible =>
			(visible ? minimap.show() : minimap.hide()));
	}

	// Credz
	onClick($('about'), _ => {
		State.modal.open('about');
	});
	onClick($('aboutDl'), _ => {
		window.location.href = 'https://github.com/xero/text0wnz/releases/latest';
	});
	onClick($('aboutPrivacy'), _ => {
		window.location.href =
			'https://github.com/xero/teXt0wnz/blob/main/docs/privacy.md';
	});

	onClick($('help'), _ => {
		window.open('https://github.com/xero/text0wnz/wiki/manual', '_blank');
	});

	onClick($('tutorials'), _ => {
		State.modal.open('tutorials');
		const items = [...$$$('#tutorialsModal main')];
		const removers = items.map(el =>
			onClick(el, (_, target) => {
				const tut = target.dataset && target.dataset.ansi;
				if (tut) {
					fetchTutorial(tut);
				}
			}));

		State.modal.onClose(() => {
			removers.forEach(remove => remove());
		});

		onClick($('tutorialsCancel'), _ => {
			State.modal.close();
		});
	});

	onClick($('update'), _ => {
		State.modal.open('update');
	});
	onClick(reload, _ => {
		if (swRegistration?.waiting) {
			// normal update path: activate the waiting worker and reload on
			// controllerchange; settings and caches survive
			updateAccepted = true;
			swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
			return;
		}
		// no update pending (modal opened from the menu): scorched-earth
		// refresh as a manual recovery tool
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

	const palettePreview = createPalettePreview($('palettePreview'));
	palettePicker = createPalettePicker($('palettePicker'));

	onFileChange(openFile, openHandler);
	createDragDropController(openHandler, $('dragdrop'));

	onClick(navSauce, () => {
		State.menus.close();
		State.modal.open('sauce');
	});

	onClick(sauceDone, () => {
		State.title = sauceTitle.value;
		// collab peers hear SAUCE edits (type 12 persists server-side)
		State.network?.sendSauce?.({
			title: sauceTitle.value,
			author: sauceAuthor.value,
			group: sauceGroup.value,
			comments: sauceComments.value,
		});
		State.modal.close();
	});

	sauceComments.addEventListener('input', enforceMaxBytes);
	onReturn(sauceTitle, sauceDone);
	onReturn(sauceGroup, sauceDone);
	onReturn(sauceAuthor, sauceDone);
	onReturn(sauceComments, sauceDone);
	const paintShortcuts = createPaintShortcuts({
		d: $('defaultColor'),
		q: swapColors,
		k: $('keyboard'),
		f: $('brushes'),
		b: $('characterBrush'),
		n: $('fill'),
		a: $('attrib'),
		g: $('navGrid'),
		i: $('navICE'),
		m: $('mirror'),
	});
	// the settings window must exist before any tool enables: the
	// keyboard tool boots enabled below and hides it
	State.toolSettings = createToolSettings();

	const keyboard = createKeyboardController();
	Toolbar.add(
		$('keyboard'),
		() => {
			paintShortcuts.disable();
			State.menus.close();
			keyboard.enable();
			State.toolSettings.hide();
			$('keyboardToolbar').classList.remove('hide');
		},
		() => {
			paintShortcuts.enable();
			keyboard.disable();
			State.menus.close();
			$('keyboardToolbar').classList.add('hide');
		},
	).enable();
	Toolbar.add(
		$('selection'),
		() => {
			paintShortcuts.disable();
			State.menus.close();
			State.selectionTool.enable();
			State.toolSettings.hide();
			$('selectionToolbar').classList.remove('hide');
		},
		() => {
			paintShortcuts.enable();
			State.selectionTool.disable();
			$('selectionToolbar').classList.add('hide');
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
			if (
				columnsValue > magicNumbers.MAX_COLUMNS ||
				rowsValue > magicNumbers.MAX_ROWS
			) {
				alert(
					`Canvas too large. Maximum size is ${magicNumbers.MAX_COLUMNS} columns by ${magicNumbers.MAX_ROWS} rows.`,
				);
				return;
			}
			if (
				columnsValue * rowsValue > magicNumbers.RESIZE_WARN_CELLS &&
				!confirm(
					`A ${columnsValue}x${rowsValue} canvas is very large: it uses more memory, autosaves get big, and joining collab sessions gets slow. Resize anyway?`,
				)
			) {
				return;
			}
			State.textArtCanvas.resize(columnsValue, rowsValue);
			State.network?.sendResize?.(columnsValue, rowsValue);
			State.modal.close();
		}
	});
	onReturn(columnsInput, resizeApply);
	onReturn(rowsInput, resizeApply);

	// Edit action menu items
	onClick($('insertRow'), keyboard.insertRow);
	onClick($('deleteRow'), keyboard.deleteRow);
	onClick($('insertColumn'), keyboard.insertColumn);
	onClick($('deleteColumn'), keyboard.deleteColumn);
	onClick($('eraseRow'), keyboard.eraseRow);
	onClick($('eraseRowStart'), keyboard.eraseToStartOfRow);
	onClick($('eraseRowEnd'), keyboard.eraseToEndOfRow);
	onClick($('eraseColumn'), keyboard.eraseColumn);
	onClick($('eraseColumnStart'), keyboard.eraseToStartOfColumn);
	onClick($('eraseColumnEnd'), keyboard.eraseToEndOfColumn);
	onClick(navFullscreen, toggleFullscreen);

	onClick($('defaultColor'), () => {
		State.palette.setForegroundColor(7);
		State.palette.setBackgroundColor(0);
	});
	onClick(swapColors, () => {
		const tempForeground = State.palette.getForegroundColor();
		State.palette.setForegroundColor(State.palette.getBackgroundColor());
		State.palette.setBackgroundColor(tempForeground);
	});
	onClick($('palettePreview'), () => {
		const tempForeground = State.palette.getForegroundColor();
		State.palette.setForegroundColor(State.palette.getBackgroundColor());
		State.palette.setBackgroundColor(tempForeground);
	});

	const navICE = createSettingToggle(
		$('navICE'),
		State.textArtCanvas.getIceColors,
		newIceColors => {
			State.textArtCanvas.setIceColors(newIceColors);
			State.network?.sendIceColorsChange?.(newIceColors);
		},
	);

	const nav9pt = createSettingToggle(
		$('nav9pt'),
		State.font.getLetterSpacing,
		newLetterSpacing => {
			State.font.setLetterSpacing(newLetterSpacing);
			State.network?.sendLetterSpacingChange?.(newLetterSpacing);
		},
	);

	fontSelect = createFontSelect(
		$('fontSelect'),
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
	const syncFavStar = () => {
		$('fontFavToggle').innerHTML = fontSelect.isFavorite()
			? '&#9733;'
			: '&#9734;';
	};
	onClick(changeFont, async () => {
		State.menus.close();
		State.modal.open('fonts');
		fontSelect.focus();
		syncFavStar();
	});
	onClick($('fontFavToggle'), () => {
		fontSelect.toggleFavorite();
		syncFavStar();
	});
	$('fontSelect').addEventListener('click', syncFavStar);
	$('fontSelect').addEventListener('keydown', () => {
		// selection moves on arrows; reflect it after the handler runs
		setTimeout(syncFavStar, 0);
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

	// everything past the default keyboard mode lazy-loads on first click
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

	const ensureBrushesLoaded = async () => {
		if (!shadeBrush) {
			const { createShadingController, createShadingPanel } = await import(
				'./freehandTools.js'
			);
			shadeBrush = createShadingController(await createShadingPanel(), false);
		}
		if (!characterBrush) {
			const { createShadingController, createCharacterBrushPanel } =
				await import('./freehandTools.js');
			characterBrush = createShadingController(
				await createCharacterBrushPanel(),
				true,
			);
		}
		return { shadeBrush, characterBrush };
	};

	Toolbar.addLazy($('shadingBrush'), async () => {
		await ensureBrushesLoaded();
		return {
			onFocus: shadeBrush.enable,
			onBlur: shadeBrush.disable,
			enable: shadeBrush.enable,
			ignore: shadeBrush.ignore,
			unignore: shadeBrush.unignore,
		};
	});

	Toolbar.addLazy($('characterBrush'), async () => {
		await ensureBrushesLoaded();
		return {
			onFocus: characterBrush.enable,
			onBlur: characterBrush.disable,
			enable: characterBrush.enable,
			ignore: characterBrush.ignore,
			unignore: characterBrush.unignore,
		};
	});

	Toolbar.addLazy($('asciiBrush'), async () => {
		const { createAsciiBrushController } = await import('./asciiBrush.js');
		const asciiBrush = createAsciiBrushController();
		return {
			onFocus: asciiBrush.enable,
			onBlur: asciiBrush.disable,
			enable: asciiBrush.enable,
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

	// the generic controllers stay window-agnostic; the hide calls for
	// these settings-less tools wrap their registrations instead
	const withHide = enable => () => {
		State.toolSettings.hide();
		enable();
	};
	const fonts = createGenericController($('fontToolbar'), $('fonts'));
	Toolbar.add($('fonts'), withHide(fonts.enable), fonts.disable);
	const clipboard = createGenericController(
		$('clipboardToolbar'),
		$('clipboard'),
	);

	const view = createViewportController($('viewportToolbar'));
	Toolbar.add($('navView'), withHide(view.enable), view.disable);

	Toolbar.add($('clipboard'), withHide(clipboard.enable), clipboard.disable);

	Toolbar.addLazy($('sample'), async () => {
		const { createSampleTool } = await import('./freehandTools.js');
		await ensureBrushesLoaded();

		State.sampleTool = await createSampleTool(
			shadeBrush,
			$('shadingBrush'),
			characterBrush,
			$('characterBrush'),
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
			if (shadeBrush && shadeBrush.unignore) {
				shadeBrush.unignore();
			}
			if (characterBrush && characterBrush.unignore) {
				characterBrush.unignore();
			}
		},
	);

	updateFontDisplay();

	viewportTap(viewport);

	// Initialize chat before creating network handler
	State.chat = createChatController(
		$('chatButton'),
		$('chatWindow'),
		$('messageWindow'),
		$('userList'),
		$('handleInput'),
		$('messageInput'),
		$('messageSend'),
		$('notificationCheckbox'),
		() => {
			keyboard.ignore();
			paintShortcuts.ignore();
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
			if (shadeBrush && shadeBrush.unignore) {
				shadeBrush.unignore();
			}
			if (characterBrush && characterBrush.unignore) {
				characterBrush.unignore();
			}
		},
	);
	createSettingToggle($('chatButton'), State.chat.isEnabled, State.chat.toggle);
	State.network = createWorkerHandler($('handleInput'));

	const darkToggle = () => {
		htmlDoc.classList.toggle('dark');
		const isDark = htmlDoc.classList.contains('dark');
		navDarkmode.setAttribute('aria-pressed', isDark);
		metaTheme.setAttribute('content', isDark ? '#333333' : '#4f4f4f');
		lblDarkmode.innerText = isDark ? 'Night' : 'Light';
	};
	onClick(navDarkmode, darkToggle);
	window.matchMedia('(prefers-color-scheme: dark)').matches && darkToggle();

	document.addEventListener('onTextCanvasUp', save);
	document.addEventListener('keypress', save);
	document.addEventListener('onFontChange', save);
	document.addEventListener('onPaletteChange', save);
	document.addEventListener('onLetterSpacingChange', save);
	document.addEventListener('onIceColorsChange', save);
	document.addEventListener('onOpenedFile', save);

	// the idle undo save may not have fired before the page goes away
	document.addEventListener('visibilitychange', () => {
		if (document.hidden) {
			State.saveUndoHistory();
		}
	});
	window.addEventListener('pagehide', () => {
		State.saveUndoHistory();
	});

	if (pendingFile) {
		openHandler(pendingFile);
		pendingFile = null;
		return; // a launch file preempts share-target handling
	}

	const urlParams = new URLSearchParams(window.location.search);
	const source = urlParams.get('source');
	if (source === 'share') {
		const sharedFileData = await handleFileShare();
		if (sharedFileData) {
			console.log(`[Share] Opening shared file: ${sharedFileData.filename}`);
			openHandler(sharedFileData.file);
			caches
				.open(CACHE_ID)
				.then(cache => cache.delete(CACHE_DATA))
				.catch(error =>
					console.error('[Error] Failed to cleanup shared file cache:', error));
		}
	}
};

// imported so the build bundles the stylesheet and manifest images
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
