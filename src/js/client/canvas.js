import State from './state.js';
import { createCanvas } from './ui.js';
import { loadFontFromImage, loadFontFromXBData } from './font.js';
import { createPalette, createDefaultPalette } from './palette.js';
import { createGLRenderer } from './glRenderer.js';
import { createHexFontPages } from './hexFontPages.js';
import {
	cellFromPoint,
	clampCell,
	cp437ToUnicode,
	createDocV3,
	createEditorCore,
	createJournal,
	createPatchArena,
	encodeStrokeRecord,
	replayJournal,
	paletteColor,
	snapOrigin,
	unicodeToCp437Strict,
	v3ToU16,
	v3ToU16Lossy,
} from '../core/index';
import { createJournalStore } from './journalStore.js';
import { createPointerInput } from './pointer.js';
import { isInteractiveZoom } from './zoom.js';
import magicNumbers from './magicNumbers.js';

const createTextArtCanvas = (canvasContainer, callback) => {
	let columns = 80,
			rows = 25,
			imageData = new Uint16Array(columns * rows),
			canvases,
			redrawing = false,
			ctxs,
			blinkOn = false,
			drawHistory = [],
			currentFontName = magicNumbers.DEFAULT_FONT,
			dirtyRegions = [],
			processingDirtyRegions = false,
			xbFontData = null,
			dirtyRegionScheduled = false,
			activeChunks = new Set();

	// The three-plane v3 doc + editor core own the document and undo;
	// `imageData` is a u16 MIRROR fed by onWrite for the chunk fallback
	// renderer and the vanilla collab protocol.
	const doc = createDocV3({ columns, rows });

	// OPFS autosave journal: committed strokes append live;
	// doc-level changes and undo/redo write a debounced fresh keyframe.
	// Collab sessions never journal; the server owns that doc.
	const journal = createJournalStore();
	let keyframeTimer = null;
	// The first keyframe of a session supersedes whatever the journal
	// held before (a previous session, a torn tail): strokes may only
	// replay on top of a keyframe written by THIS session.
	let sessionKeyframeWritten = false;
	const scheduleJournalKeyframe = () => {
		if (keyframeTimer !== null) {
			clearTimeout(keyframeTimer);
		}
		keyframeTimer = setTimeout(async () => {
			keyframeTimer = null;
			if (State.network?.isConnected?.()) {
				return;
			}
			try {
				await journal.rewrite(
					await createJournal(
						doc,
						xbFontData
							? { fontBytes: xbFontData.bytes, fontHeight: xbFontData.height }
							: {},
					),
				);
				sessionKeyframeWritten = true;
			} catch (error) {
				console.warn('[Canvas] journal keyframe failed:', error);
			}
		}, magicNumbers.JOURNAL_KEYFRAME_DEBOUNCE_MS);
	};
	const arena = createPatchArena({
		onCommit: stroke => {
			if (State.network?.isConnected?.()) {
				return;
			}
			if (!sessionKeyframeWritten) {
				// a rewrite is already pending or due; it captures this
				// stroke's effect, so appending too stays consistent
				scheduleJournalKeyframe();
			}
			journal
				.appendStroke(encodeStrokeRecord(stroke))
				.then(compactionDue => {
					if (compactionDue) {
						scheduleJournalKeyframe();
					}
				})
				.catch(error =>
					console.warn('[Canvas] journal append failed:', error));
		},
	});

	const editor = createEditorCore(doc, {
		arena,
		onFrameChange: frameIndex => handleFrameChange(frameIndex),
		onWrite: ({ index, x, y, word, history }) => {
			imageData[index] = word;
			if (onionSkin && onionPlanes) {
				updateOnionIndex(index);
			}
			if (history) {
				// Wire cells carry unpacked coordinates (no signed index<<16
				// row cap). The ext payload is full fidelity straight off the
				// planes; network.js sends it in ext sessions and strips it
				// for vanilla ones.
				const frame = doc.frames[editor.getCurrentFrame()];
				const glyphValue = frame.glyph[index];
				const glyphId = glyphValue & 0xffff;
				drawHistory.push({
					x,
					y,
					block: {
						code: word >> 8,
						fg: word & 15,
						bg: (word >> 4) & 15,
					},
					ext: {
						u:
							doc.glyphTable.get(glyphId)?.codepoint ??
							cp437ToUnicode(glyphId & 0xff),
						a: (glyphValue >>> 16) & 0xff,
						fg: frame.fg[index] >>> 0,
						bg: frame.bg[index] >>> 0,
					},
				});
				enqueueDirtyCell(x, y);
				return;
			}
			// network quickDraw path keeps the chunk renderer's bookkeeping
			if (glRenderer) {
				enqueueDirtyCell(x, y);
				return;
			}
			const chunkIndex = Math.floor(y / chunkSize);
			const chunk = canvasChunks.get(chunkIndex);
			if (chunk && activeChunks.has(chunkIndex)) {
				enqueueDirtyCell(x, y);
			} else if (chunk) {
				chunk.rendered = false;
			}
		},
	});
	const iceColorsNow = () => doc.getIceColors();

	// ---- frames: onion-skin compose + current-frame mirror ----------
	// Onion skin is a DATA-level ghost, GL-only (the chunk fallback's u16
	// mirror always reflects the real frame): blank cells of the current
	// frame show the previous frame dimmed to 35%, blink stripped.
	let onionSkin = false;
	/** @type {{glyph: Uint32Array, fg: Uint32Array, bg: Uint32Array} | null} */
	let onionPlanes = null;
	const BLANK_BG = paletteColor(0);

	const dimWord = word => {
		const [r, g, b] = State.palette.getRGBAColor(word);
		return (
			((Math.floor(r * 0.35) & 0xff) << 16) |
			((Math.floor(g * 0.35) & 0xff) << 8) |
			(Math.floor(b * 0.35) & 0xff)
		);
	};

	const composeOnionIndex = (prev, cur, i) => {
		const glyphId = cur.glyph[i] & 0xffff;
		// same blank rule as the paste modes and move mode: an empty
		// glyph (nul, space, or nbsp) on black
		const blank =
			(glyphId === 0 || glyphId === 32 || glyphId === 255) &&
			cur.bg[i] === BLANK_BG;
		if (!blank || !prev) {
			onionPlanes.glyph[i] = cur.glyph[i];
			onionPlanes.fg[i] = cur.fg[i];
			onionPlanes.bg[i] = cur.bg[i];
		} else {
			onionPlanes.glyph[i] = prev.glyph[i] & 0xffff; // blink stripped
			onionPlanes.fg[i] = dimWord(prev.fg[i]);
			onionPlanes.bg[i] = dimWord(prev.bg[i]);
		}
	};

	const updateOnionIndex = index => {
		const frameIndex = editor.getCurrentFrame();
		composeOnionIndex(
			frameIndex > 0 ? doc.frames[frameIndex - 1] : null,
			doc.frames[frameIndex],
			index,
		);
	};

	const rebuildOnionPlanes = () => {
		const frameIndex = editor.getCurrentFrame();
		const cur = doc.frames[frameIndex];
		const prev = frameIndex > 0 ? doc.frames[frameIndex - 1] : null;
		if (!onionPlanes || onionPlanes.glyph.length !== cur.glyph.length) {
			onionPlanes = {
				glyph: new Uint32Array(cur.glyph.length),
				fg: new Uint32Array(cur.glyph.length),
				bg: new Uint32Array(cur.glyph.length),
			};
		}
		for (let i = 0; i < cur.glyph.length; i++) {
			composeOnionIndex(prev, cur, i);
		}
	};

	// Baud preview: reveal the current frame in encoded-byte order at a
	// chosen line rate; another data-level compose, GL-only.
	/** @type {{glyph: Uint32Array, fg: Uint32Array, bg: Uint32Array} | null} */
	let baudPlanes = null;
	let baudReveal = -1;

	/**
	 * Cumulative estimated ANSI byte cost per cell of the current frame
	 * (glyph byte + ~11 bytes per SGR change + CRLF per row): honest
	 * enough pacing without replaying the real encoder.
	 */
	const getBaudOffsets = () => {
		const mirror = v3ToU16Lossy(doc, editor.getCurrentFrame()).imageData;
		const offsets = new Float64Array(mirror.length);
		let total = 0;
		let prevFg = 7;
		let prevBg = 0;
		for (let i = 0; i < mirror.length; i++) {
			const word = mirror[i];
			const fg = word & 15;
			const bg = (word >> 4) & 15;
			if (fg !== prevFg || bg !== prevBg) {
				total += 11;
				prevFg = fg;
				prevBg = bg;
			}
			total += 1;
			if ((i + 1) % columns === 0) {
				total += 2;
			}
			offsets[i] = total;
		}
		return offsets;
	};

	/** @param {number | null} count cells revealed; null ends the preview */
	const setBaudReveal = count => {
		if (count === null || count < 0) {
			baudReveal = -1;
			baudPlanes = null;
			redrawEntireImage();
			return;
		}
		const frame = doc.frames[editor.getCurrentFrame()];
		const size = frame.glyph.length;
		if (!baudPlanes || baudPlanes.glyph.length !== size) {
			baudPlanes = {
				glyph: new Uint32Array(size),
				fg: new Uint32Array(size),
				bg: new Uint32Array(size),
			};
		}
		const limit = Math.min(count, size);
		baudPlanes.glyph.set(frame.glyph.subarray(0, limit));
		baudPlanes.fg.set(frame.fg.subarray(0, limit));
		baudPlanes.bg.set(frame.bg.subarray(0, limit));
		baudPlanes.glyph.fill(0, limit);
		baudPlanes.fg.fill(BLANK_BG, limit);
		baudPlanes.bg.fill(BLANK_BG, limit);
		baudReveal = limit;
		redrawEntireImage();
	};

	/** re-mirror + repaint + tell the UI; fired by editor navigation */
	const handleFrameChange = frameIndex => {
		imageData = v3ToU16Lossy(doc, frameIndex).imageData;
		if (onionSkin) {
			rebuildOnionPlanes();
		}
		redrawEntireImage();
		document.dispatchEvent(
			new CustomEvent('onFrameChange', {
				detail: { frame: frameIndex, count: doc.frames.length },
				bubbles: true,
				cancelable: false,
			}),
		);
	};

	const chunkSize = 25,
				viewportState = {
					scrollTop: 0,
					scrollLeft: 0,
					containerHeight: 0,
					containerWidth: 0,
					visibleStartRow: 0,
					visibleEndRow: 0,
				},
				canvasChunks = new Map();

	// GL is the default renderer. All paint paths delegate to it when
	// active; the doc model is shared. ?renderer=2d forces the legacy
	// chunk renderer below, which is also the automatic fallback
	// wherever webgl2 is unavailable.
	let glRenderer = null;
	// unicode glyph pages: created on the first glyph id >= 256, so
	// classic docs never fetch the manifest or any block
	let hexPages = null;
	const ensureHexPages = () => {
		if (!hexPages) {
			hexPages = createHexFontPages({
				baseUrl: `${State.fontDir}u`,
				onBlocksLoaded: () => {
					if (glRenderer) {
						glRenderer.redraw();
					}
					// the F-key bar and charset picker re-render from this
					document.dispatchEvent(new CustomEvent('onHexBlocksLoaded'));
				},
			});
		}
		return hexPages;
	};
	if (
		typeof window !== 'undefined' &&
		new URLSearchParams(window.location.search).get('renderer') !== '2d'
	) {
		try {
			glRenderer = createGLRenderer(canvasContainer, {
				getColumns: () => columns,
				getRows: () => rows,
				// GL renders the v3 planes directly (tag-bit colors, attr
				// blink); the u16 mirror stays for the chunk fallback +
				// collab. Frames: the current frame renders; onion mode
				// substitutes the composed ghost planes (GL-only)
				getPlanes: () => {
					if (baudReveal >= 0 && baudPlanes) {
						return baudPlanes;
					}
					return onionSkin && onionPlanes
						? onionPlanes
						: doc.frames[editor.getCurrentFrame()];
				},
				// exports read the REAL document, never the onion/baud
				// composites
				getDocPlanes: () => doc.frames[editor.getCurrentFrame()],
				getIceColors: iceColorsNow,
				getGlyphDef: glyphId => doc.glyphTable.get(glyphId),
				getHexPages: ensureHexPages,
				getPalette: () => doc.palette,
			});
		} catch (error) {
			console.warn('[Canvas] GL renderer init failed', error);
			glRenderer = null;
		}
		if (!glRenderer) {
			console.warn('[Canvas] webgl2 unavailable; using the chunk renderer');
		}
	}

	const enqueueDirtyRegion = (x, y, w, h) => {
		if (x < 0) {
			w += x;
			x = 0;
		}
		if (y < 0) {
			h += y;
			y = 0;
		}
		if (x >= columns || y >= rows || w <= 0 || h <= 0) {
			return;
		}
		if (x + w > columns) {
			w = columns - x;
		}
		if (y + h > rows) {
			h = rows - y;
		}
		dirtyRegions.push({ x: x, y: y, w: w, h: h });
	};

	const enqueueDirtyCell = (x, y) => {
		enqueueDirtyRegion(x, y, 1, 1);
	};

	const drawRegion = (x, y, w, h) => {
		if (x < 0) {
			w += x;
			x = 0;
		}
		if (y < 0) {
			h += y;
			y = 0;
		}
		if (x >= columns || y >= rows || w <= 0 || h <= 0) {
			return;
		}
		if (x + w > columns) {
			w = columns - x;
		}
		if (y + h > rows) {
			h = rows - y;
		}

		if (glRenderer) {
			glRenderer.drawRegion(x, y, w, h);
			return;
		}

		for (let regionY = y; regionY < y + h; regionY++) {
			for (let regionX = x; regionX < x + w; regionX++) {
				const index = regionY * columns + regionX;
				redrawGlyph(index, regionX, regionY);
			}
		}
	};

	const processDirtyRegions = () => {
		if (processingDirtyRegions || dirtyRegions.length === 0) {
			return;
		}

		// Throttle with RAF for smooth rendering
		if (!dirtyRegionScheduled) {
			dirtyRegionScheduled = true;
			requestAnimationFrame(() => {
				processingDirtyRegions = true;
				const coalescedRegions = coalesceRegions(dirtyRegions);
				dirtyRegions = [];
				for (let i = 0; i < coalescedRegions.length; i++) {
					const region = coalescedRegions[i];
					drawRegion(region.x, region.y, region.w, region.h);
				}
				processingDirtyRegions = false;
				dirtyRegionScheduled = false;
			});
		}
	};

	const redrawGlyph = (index, x, y) => {
		if (glRenderer) {
			glRenderer.drawCell(x, y);
			return;
		}
		const chunkIndex = Math.floor(y / chunkSize);
		const chunk = canvasChunks.get(chunkIndex);
		if (!chunk || !activeChunks.has(chunkIndex)) {
			// Chunk not visible, skip rendering but mark as dirty if it exists
			if (chunk) {
				chunk.rendered = false;
			}
			return;
		}
		redrawGlyphInChunk(index, x, y, chunk);
	};

	const redrawEntireImage = (onProgress, onComplete) => {
		if (glRenderer) {
			// Coverage repaints are sub-frame; progressive pacing collapses
			// to one paint with the same completion contract
			glRenderer.redraw(onProgress, onComplete);
			return;
		}
		// For small canvases, direct render is fine
		if (rows * columns < 5000) {
			drawRegion(0, 0, columns, rows);
			if (onComplete) {
				requestAnimationFrame(onComplete);
			}
			return;
		}

		const totalCells = rows * columns;
		let batchSize;

		if (totalCells < 10000) {
			batchSize = 10; // Small: 10 rows per frame
		} else if (totalCells < 50000) {
			batchSize = 5; // Medium: 5 rows per frame
		} else {
			batchSize = 3; // Large: 3 rows per frame
		}
		progressiveRedraw(0, batchSize, rows, onProgress, onComplete);
	};

	const progressiveRedraw = (
		startRow,
		batchSize,
		totalRows,
		onProgress,
		onComplete,
	) => {
		const frameStart = performance.now();
		const endRow = Math.min(startRow + batchSize, totalRows || rows);

		drawRegion(0, startRow, columns, endRow - startRow);

		if (onProgress) {
			const progress = (endRow / (totalRows || rows)) * 100;
			onProgress(progress);
		}

		if (endRow < (totalRows || rows)) {
			requestAnimationFrame(() => {
				const frameTime = performance.now() - frameStart;
				let nextBatchSize = batchSize;

				// Adjust batch size to maintain snappy fps
				if (frameTime < 10) {
					nextBatchSize = Math.min(batchSize * 2, 25);
				} else if (frameTime > 16) {
					nextBatchSize = Math.max(Math.floor(batchSize / 2), 1);
				}
				progressiveRedraw(
					endRow,
					nextBatchSize,
					totalRows,
					onProgress,
					onComplete,
				);
			});
		} else {
			if (onComplete) {
				onComplete();
			}
			document.dispatchEvent(new CustomEvent('onCanvasRenderComplete'));
		}
	};

	const coalesceRegions = regions => {
		if (regions.length <= 1) {
			return regions;
		}

		const gridCellSize = 10; // 10x10 cells
		const gridWidth = Math.ceil(columns / gridCellSize);
		const gridHeight = Math.ceil(rows / gridCellSize);
		const grid = Array(gridHeight)
			.fill()
			.map(() => Array(gridWidth).fill(false));

		regions.forEach(region => {
			const startGridX = Math.floor(region.x / gridCellSize);
			const startGridY = Math.floor(region.y / gridCellSize);
			const endGridX = Math.min(
				Math.floor((region.x + region.w - 1) / gridCellSize),
				gridWidth - 1,
			);
			const endGridY = Math.min(
				Math.floor((region.y + region.h - 1) / gridCellSize),
				gridHeight - 1,
			);
			for (let y = startGridY; y <= endGridY; y++) {
				for (let x = startGridX; x <= endGridX; x++) {
					grid[y][x] = true;
				}
			}
		});

		const result = [];
		for (let y = 0; y < gridHeight; y++) {
			let start = -1;
			for (let x = 0; x < gridWidth; x++) {
				if (grid[y][x] && start === -1) {
					start = x;
				} else if (!grid[y][x] && start !== -1) {
					result.push({
						x: start * gridCellSize,
						y: y * gridCellSize,
						w: (x - start) * gridCellSize,
						h: gridCellSize,
					});
					start = -1;
				}
			}
			if (start !== -1) {
				result.push({
					x: start * gridCellSize,
					y: y * gridCellSize,
					w: (gridWidth - start) * gridCellSize,
					h: gridCellSize,
				});
			}
		}
		return combineVerticalRegions(result);
	};

	const combineVerticalRegions = regions => {
		regions.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y));

		const result = [];
		for (let i = 0; i < regions.length; i++) {
			const current = regions[i];
			let combined = false;

			for (let j = 0; j < result.length; j++) {
				const existing = result[j];
				if (
					existing.x === current.x &&
					existing.w === current.w &&
					existing.y + existing.h === current.y
				) {
					existing.h += current.h;
					combined = true;
					break;
				}
			}
			if (!combined) {
				result.push({ ...current });
			}
		}
		return result;
	};

	let blinkStop = false;

	const blink = () => {
		// Only blink active (visible) chunks
		blinkOn = !blinkOn;

		activeChunks.forEach(chunkIndex => {
			const chunk = canvasChunks.get(chunkIndex);
			if (!chunk || chunk.blinkCells.size === 0) {
				return;
			}

			chunk.blinkCells.forEach(index => {
				const x = index % columns;
				const y = Math.floor(index / columns);

				if (y >= chunk.startRow && y < chunk.endRow) {
					const localY = y - chunk.startRow;
					const charCode = imageData[index] >> 8;
					const foreground = imageData[index] & 15;
					let background = (imageData[index] >> 4) & 15;
					if (background >= 8) {
						background -= 8;
						State.font.draw(
							charCode,
							blinkOn ? background : foreground,
							background,
							chunk.ctx,
							x,
							localY,
						);
					} else {
						chunk.blinkCells.delete(index);
					}
				}
			});
		});
	};

	let blinkTimerMutex = Promise.resolve();

	const acquireBlinkTimerMutex = async () => {
		await blinkTimerMutex;
		let release;
		const hold = new Promise(resolve => (release = resolve));
		blinkTimerMutex = hold;
		return release;
	};

	const updateBlinkTimer = async () => {
		const releaseMutex = await acquireBlinkTimerMutex();
		try {
			if (blinkTimerRunning) {
				return;
			}
			blinkTimerRunning = true;
			blinkStop = false;

			if (!iceColorsNow()) {
				blinkOn = false;
				try {
					while (!blinkStop) {
						blink();
						await new Promise(resolve => setTimeout(resolve, 500));
					}
				} catch (error) {
					console.error('[Canvas] Blink timer error:', error);
				}
			}
		} finally {
			blinkTimerRunning = false;
			releaseMutex();
		}
	};

	let blinkTimerRunning = false;

	const stopBlinkTimer = () => {
		blinkStop = true;
		// Wait for timer to actually stop
		setTimeout(() => {
			blinkTimerRunning = false;
		}, 10);
	};

	const calculateVisibleChunks = () => {
		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
		const totalChunks = Math.ceil(rows / chunkSize);
		const viewportElement = document.getElementById('viewport');
		if (!viewportElement) {
			console.warn('[Canvas] #viewport not found, rendering all chunks');
			return {
				startChunk: 0,
				endChunk: totalChunks - 1,
				totalChunks,
				visibleStartRow: 0,
				visibleEndRow: rows,
			};
		}

		const viewportHeight = viewportElement.clientHeight || window.innerHeight;

		// buffer rows above and below the viewport for smooth scrolling
		const bufferRows = chunkSize * 2;
		const viewportTop = viewportState.scrollTop;
		const viewportBottom = viewportTop + viewportHeight;

		const bufferedTop = Math.max(0, viewportTop - bufferRows * fontHeight);
		const bufferedBottom = Math.min(
			rows * fontHeight,
			viewportBottom + bufferRows * fontHeight,
		);
		const startChunk = Math.floor(bufferedTop / (chunkSize * fontHeight));
		const endChunk = Math.min(
			totalChunks - 1,
			Math.floor(bufferedBottom / (chunkSize * fontHeight)),
		);

		return {
			startChunk,
			endChunk,
			totalChunks,
			visibleStartRow: Math.floor(viewportTop / fontHeight),
			visibleEndRow: Math.ceil(viewportBottom / fontHeight),
		};
	};

	const updateViewportState = () => {
		const viewportElement = document.getElementById('viewport');
		if (!viewportElement) {
			console.warn('[Canvas] #viewport element not found');
			return;
		}

		viewportState.scrollTop = viewportElement.scrollTop;
		viewportState.scrollLeft = viewportElement.scrollLeft;
		viewportState.containerHeight = viewportElement.clientHeight;
		viewportState.containerWidth = viewportElement.clientWidth;

		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
		viewportState.visibleStartRow = Math.floor(
			viewportState.scrollTop / fontHeight,
		);
		viewportState.visibleEndRow = Math.min(
			rows,
			Math.ceil(
				(viewportState.scrollTop + viewportState.containerHeight) / fontHeight,
			),
		);
	};

	const getOrCreateCanvasChunk = chunkIndex => {
		if (canvasChunks.has(chunkIndex)) {
			return canvasChunks.get(chunkIndex);
		}

		const fontWidth = State.font.getWidth() || magicNumbers.DEFAULT_FONT_WIDTH;
		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;

		const chunkStartRow = chunkIndex * chunkSize;
		const chunkEndRow = Math.min((chunkIndex + 1) * chunkSize, rows);
		const chunkHeight = chunkEndRow - chunkStartRow;

		const canvasWidth = fontWidth * columns;
		const canvasHeight = fontHeight * chunkHeight;

		// Create main canvas with a background color to avoid flash
		const canvas = createCanvas(canvasWidth, canvasHeight);
		canvas.style.position = 'absolute';
		canvas.style.top = chunkStartRow * fontHeight + 'px';
		canvas.style.left = '0px';
		canvas.style.backgroundColor = '#000';

		const chunk = {
			canvas: canvas,
			ctx: canvas.getContext('2d'),
			rendered: false,
			chunkIndex: chunkIndex,
			startRow: chunkStartRow,
			endRow: chunkEndRow,
			blinkCells: new Set(),
		};

		canvasChunks.set(chunkIndex, chunk);
		return chunk;
	};

	/** async batches the initial render via RAF */
	const renderChunk = (chunk, async = false) => {
		if (!chunk) {
			return;
		}

		const doRender = () => {
			const fontWidth =
				State.font.getWidth() || magicNumbers.DEFAULT_FONT_WIDTH;
			const fontHeight =
				State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
			const { startRow, endRow, ctx } = chunk;
			const chunkHeight = (endRow - startRow) * fontHeight;
			const canvasWidth = fontWidth * columns;

			ctx.clearRect(0, 0, canvasWidth, chunkHeight);
			chunk.blinkCells.clear();

			for (let y = startRow; y < endRow; y++) {
				for (let x = 0; x < columns; x++) {
					const index = y * columns + x;
					redrawGlyphInChunk(index, x, y, chunk);
				}
			}
			chunk.rendered = true;
		};

		if (async) {
			requestAnimationFrame(doRender);
		} else {
			doRender();
		}
	};

	const redrawGlyphInChunk = (index, x, y, chunk) => {
		const localY = y - chunk.startRow;
		const charCode = imageData[index] >> 8;
		let background = (imageData[index] >> 4) & 15;
		const foreground = imageData[index] & 15;
		const isBlinkBackground = background >= 8;

		if (iceColorsNow()) {
			State.font.draw(charCode, foreground, background, chunk.ctx, x, localY);
			chunk.blinkCells.delete(index);
		} else {
			if (isBlinkBackground) {
				chunk.blinkCells.add(index);
				background -= 8;
				State.font.draw(
					charCode,
					blinkOn ? background : foreground,
					background,
					chunk.ctx,
					x,
					localY,
				);
			} else {
				State.font.draw(charCode, foreground, background, chunk.ctx, x, localY);
				chunk.blinkCells.delete(index);
			}
		}
	};

	const updateLegacyArrays = () => {
		canvases = [];
		ctxs = [];

		const totalChunks = Math.ceil(rows / chunkSize);
		for (let i = 0; i < totalChunks; i++) {
			const chunk = canvasChunks.get(i);
			if (chunk) {
				canvases.push(chunk.canvas);
				ctxs.push(chunk.ctx);
			}
		}
	};

	const renderVisibleChunks = () => {
		if (!canvasContainer) {
			console.error('[Canvas] canvasContainer is null, cannot render chunks');
			return;
		}

		const { startChunk, endChunk } = calculateVisibleChunks();
		const newActiveChunks = new Set();

		activeChunks.forEach(chunkIndex => {
			if (chunkIndex < startChunk || chunkIndex > endChunk) {
				const chunk = canvasChunks.get(chunkIndex);
				if (chunk && chunk.canvas.parentNode) {
					canvasContainer.removeChild(chunk.canvas);
				}
			}
		});

		// Evict chunks far outside the viewport to bound canvas memory;
		// evicted chunks are recreated unrendered and redrawn on return
		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
		const viewportChunks = Math.max(
			1,
			Math.ceil(viewportState.containerHeight / (fontHeight * chunkSize)),
		);
		const evictionMargin = viewportChunks * 4;
		canvasChunks.forEach((chunk, chunkIndex) => {
			if (
				chunkIndex < startChunk - evictionMargin ||
				chunkIndex > endChunk + evictionMargin
			) {
				if (chunk.canvas.parentNode) {
					canvasContainer.removeChild(chunk.canvas);
				}
				canvasChunks.delete(chunkIndex);
			}
		});

		for (let chunkIndex = startChunk; chunkIndex <= endChunk; chunkIndex++) {
			newActiveChunks.add(chunkIndex);
			let chunk = canvasChunks.get(chunkIndex);
			if (!chunk) {
				chunk = getOrCreateCanvasChunk(chunkIndex);
			}
			if (!chunk.canvas.parentNode) {
				canvasContainer.appendChild(chunk.canvas);
			}
			if (!chunk.rendered) {
				renderChunk(chunk);
			}
		}
		activeChunks = newActiveChunks;
		updateLegacyArrays();
	};

	// trailing throttle: a scroll during the RAF pass schedules one more
	let scrollScheduled = false;
	let pendingScrollUpdate = false;

	const handleScroll = () => {
		pendingScrollUpdate = true;

		if (scrollScheduled) {
			return;
		}

		scrollScheduled = true;
		requestAnimationFrame(() => {
			updateViewportState();
			renderVisibleChunks();

			scrollScheduled = false;

			// If more scroll events came in, schedule another update
			if (pendingScrollUpdate) {
				pendingScrollUpdate = false;
				handleScroll();
			}
		});
	};

	let resizeScheduled = false;
	const handleResize = () => {
		if (resizeScheduled) {
			return;
		}
		resizeScheduled = true;
		requestAnimationFrame(() => {
			updateViewportState();
			renderVisibleChunks();
			resizeScheduled = false;
		});
	};

	const initViewportListeners = () => {
		const viewportElement = document.getElementById('viewport');
		if (!viewportElement) {
			console.warn(
				'[Canvas] #viewport element not found, scroll virtualization disabled',
			);
			return;
		}
		// Remove existing listeners to avoid duplicates
		viewportElement.removeEventListener('scroll', handleScroll);
		window.removeEventListener('resize', handleResize);
		viewportElement.addEventListener('scroll', handleScroll, { passive: true });
		window.addEventListener('resize', handleResize, { passive: true });
	};

	const createCanvases = () => {
		if (!canvasContainer) {
			console.error('[Canvas] canvasContainer is null, cannot create canvases');
			return;
		}
		if (glRenderer) {
			// Geometry/font/palette changed: atlas + layout rebuild, sub-frame
			redrawing = true;
			glRenderer.rebuild();
			redrawing = false;
			updateTimer();
			return;
		}
		redrawing = true;

		canvasChunks.forEach(chunk => {
			if (chunk.canvas && chunk.canvas.parentNode) {
				canvasContainer.removeChild(chunk.canvas);
			}
		});

		canvasChunks.clear();
		activeChunks.clear();

		canvases = [];
		ctxs = [];

		const fontWidth = State.font.getWidth() || magicNumbers.DEFAULT_FONT_WIDTH;
		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
		const totalHeight = fontHeight * rows;
		const totalWidth = fontWidth * columns;

		canvasContainer.style.width = totalWidth + 'px';
		canvasContainer.style.height = totalHeight + 'px';
		canvasContainer.style.position = 'relative';

		updateViewportState();

		const { startChunk, endChunk } = calculateVisibleChunks();
		const viewportElement = document.getElementById('viewport');
		const viewportHeight = viewportElement
			? viewportElement.clientHeight
			: window.innerHeight;
		const visibleChunkCount = Math.ceil(
			viewportHeight / (fontHeight * chunkSize),
		);
		const preRenderEndChunk = Math.min(
			Math.ceil(rows / chunkSize) - 1,
			endChunk + visibleChunkCount * 4,
		);

		// Create and render visible chunks + pre-rendered buffer below
		for (
			let chunkIndex = startChunk;
			chunkIndex <= preRenderEndChunk;
			chunkIndex++
		) {
			const chunk = getOrCreateCanvasChunk(chunkIndex);
			// Only attach visible chunks to DOM
			if (chunkIndex <= endChunk) {
				canvasContainer.appendChild(chunk.canvas);
				activeChunks.add(chunkIndex);
			}
			if (!chunk.rendered) {
				renderChunk(chunk);
			}
		}
		updateLegacyArrays();
		initViewportListeners();
		redrawing = false;
		stopBlinkTimer();
		updateTimer();
	};

	const updateTimer = () => {
		if (glRenderer) {
			glRenderer.updateBlink();
			return;
		}
		stopBlinkTimer();
		if (!iceColorsNow()) {
			blinkOn = false;
			updateBlinkTimer().catch(console.error);
		}
	};

	// stillWanted lets a racing caller disown the swap after the async
	// font load: a superseded file open must not restyle the document
	// that beat it
	const setFont = async (fontName, callback, scaleFactor, stillWanted) => {
		try {
			const effectiveScaleFactor =
				scaleFactor ?? State.font?.getScaleFactor?.() ?? 1;

			if (fontName === 'XBIN' && xbFontData) {
				const font = await loadFontFromXBData(
					xbFontData.bytes,
					xbFontData.width,
					xbFontData.height,
					xbFontData.letterSpacing,
					State.palette,
					effectiveScaleFactor,
				);
				if (stillWanted && !stillWanted()) {
					return;
				}
				State.font = font;
				currentFontName = fontName;

				createCanvases();
				updateTimer();
				redrawEntireImage();
				document.dispatchEvent(
					new CustomEvent('onFontChange', { detail: fontName }),
				);

				if (callback) {
					callback();
				}
			} else if (fontName === 'XBIN' && !xbFontData) {
				console.warn(
					`[Canvas] XBIN selected but no embedded font data available, falling back to: ${magicNumbers.DEFAULT_FONT}`,
				);

				const fallbackFont = magicNumbers.DEFAULT_FONT;
				const font = await loadFontFromImage(
					fallbackFont,
					false,
					State.palette,
					effectiveScaleFactor,
				);
				if (stillWanted && !stillWanted()) {
					return;
				}
				State.font = font;
				currentFontName = fallbackFont;

				createCanvases();
				updateTimer();
				redrawEntireImage();
				document.dispatchEvent(
					new CustomEvent('onFontChange', { detail: fallbackFont }),
				);

				if (callback) {
					callback();
				}
			} else {
				const spacing = State.font ? State.font.getLetterSpacing() : false;
				const font = await loadFontFromImage(
					fontName,
					spacing,
					State.palette,
					effectiveScaleFactor,
				);
				if (stillWanted && !stillWanted()) {
					return;
				}
				State.font = font;
				currentFontName = fontName;

				createCanvases();
				updateTimer();
				redrawEntireImage();
				document.dispatchEvent(
					new CustomEvent('onFontChange', { detail: fontName }),
				);

				if (callback) {
					callback();
				}
			}
		} catch (error) {
			console.error('[Canvas] Failed to load font:', error);

			const effectiveScaleFactor =
				scaleFactor ?? State.font?.getScaleFactor?.() ?? 1;

			const fallbackFont = magicNumbers.DEFAULT_FONT;
			try {
				const font = await loadFontFromImage(
					fallbackFont,
					false,
					State.palette,
					effectiveScaleFactor,
				);
				if (stillWanted && !stillWanted()) {
					return;
				}
				State.font = font;
				currentFontName = fallbackFont;

				createCanvases();
				updateTimer();
				redrawEntireImage();
				document.dispatchEvent(
					new CustomEvent('onFontChange', { detail: fallbackFont }),
				);

				if (callback) {
					callback();
				}
			} catch (fallbackError) {
				console.error('[Canvas] Failed to load fallback font:', fallbackError);
				// the previous font is still live, so the caller's flow
				// must continue: XB opens hang their whole load on this
				// callback and a swallowed one wedges the open state
				if (callback) {
					callback();
				}
			}
		}
	};

	const resize = (newColumnValue, newRowValue) => {
		if (
			(newColumnValue !== columns || newRowValue !== rows) &&
			newColumnValue > 0 &&
			newRowValue > 0
		) {
			editor.resize(newColumnValue, newRowValue);
			columns = newColumnValue;
			rows = newRowValue;
			// LOSSY projection, current frame: the strict one throws on
			// unicode glyphs and RGB words, and the mirror is lossy by
			// contract
			imageData = v3ToU16Lossy(doc, editor.getCurrentFrame()).imageData;
			if (onionSkin) {
				rebuildOnionPlanes();
			}
			scheduleJournalKeyframe();
			createCanvases();
			updateTimer();
			redrawEntireImage();
			document.dispatchEvent(
				new CustomEvent('onTextCanvasSizeChange', { detail: { columns: columns, rows: rows } }),
			);
		}
	};

	const getIceColors = () => {
		return doc.getIceColors();
	};

	const setIceColors = newIceColors => {
		if (doc.getIceColors() !== newIceColors) {
			// Refolds the planes (u16 mirror words are invariant under it)
			editor.setIceColors(newIceColors);
			scheduleJournalKeyframe();
			updateTimer();
			redrawEntireImage();
		}
	};

	// Serialized with trailing coalescing: interactive zoom can fire
	// scale changes faster than a relayout completes, and overlapping
	// runs double-create canvases and consume the zoom controller's
	// focal anchor with the wrong metrics
	let criticalRunning = false;
	let criticalDirty = false;
	const onCriticalChange = async _ => {
		criticalDirty = true;
		if (criticalRunning) {
			return;
		}
		criticalRunning = true;
		// collapse every same-task trigger (e.g. letter spacing + zoom
		// set back to back) into ONE relayout at the final metrics
		await Promise.resolve();
		const waitForRedrawing = () =>
			new Promise(resolve => {
				// Fast path: don't pay a 50ms poll tick when already idle
				if (!redrawing) {
					resolve();
					return;
				}
				const intervalId = setInterval(() => {
					if (!redrawing) {
						clearInterval(intervalId);
						resolve();
					}
				}, 50);
			});
		do {
			criticalDirty = false;
			// continuous zoom (pinch, wheel) relayouts every frame on GL;
			// flashing the settings modal per frame would be unusable
			const interactive = isInteractiveZoom();
			if (!interactive) {
				State.modal.loading('Updating editor with new settings...');
			}
			stopBlinkTimer();
			await waitForRedrawing();
			createCanvases();
			// the zoom controller corrects scroll for focal anchoring once
			// the container has its new size
			document.dispatchEvent(new CustomEvent('onCanvasLayoutChange', {}));
			await new Promise(resolve => {
				redrawEntireImage(null, () => {
					updateTimer();
					if (!interactive && !State.loadingFromStorage) {
						State.modal.close();
					}
					resolve();
				});
			});
		} while (criticalDirty);
		criticalRunning = false;
	};

	const getImage = () => {
		if (glRenderer) {
			return glRenderer.getImage();
		}
		const fontWidth = State.font.getWidth() || magicNumbers.DEFAULT_FONT_WIDTH;
		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
		const completeCanvas = createCanvas(fontWidth * columns, fontHeight * rows);
		const ctx = completeCanvas.getContext('2d');

		const wasBlinkOn = blinkOn;
		blinkOn = false;

		// Ensure all chunks exist and are rendered for export
		const totalChunks = Math.ceil(rows / chunkSize);

		for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
			let chunk = canvasChunks.get(chunkIndex);
			if (!chunk) {
				chunk = getOrCreateCanvasChunk(chunkIndex);
			}
			if (!chunk.rendered) {
				renderChunk(chunk);
				chunk.rendered = true;
			}
			const yPosition = chunkIndex * chunkSize * fontHeight;
			ctx.drawImage(chunk.canvas, 0, yPosition);
		}
		blinkOn = wasBlinkOn;

		return completeCanvas;
	};

	const getImageRGBA = () => {
		if (glRenderer) {
			return glRenderer.getImageRGBA();
		}
		// Chunk-strip export that never composites one tall canvas, so tall
		// documents stay under the iOS Safari canvas area cap
		const fontWidth = State.font.getWidth() || magicNumbers.DEFAULT_FONT_WIDTH;
		const fontHeight =
			State.font.getHeight() || magicNumbers.DEFAULT_FONT_HEIGHT;
		const width = fontWidth * columns;
		const height = fontHeight * rows;
		const data = new Uint8ClampedArray(width * height * 4);

		const wasBlinkOn = blinkOn;
		blinkOn = false;

		const totalChunks = Math.ceil(rows / chunkSize);
		for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
			let chunk = canvasChunks.get(chunkIndex);
			if (!chunk) {
				chunk = getOrCreateCanvasChunk(chunkIndex);
			}
			if (!chunk.rendered) {
				renderChunk(chunk);
			}
			const chunkData = chunk.ctx.getImageData(
				0,
				0,
				chunk.canvas.width,
				chunk.canvas.height,
			).data;
			data.set(chunkData, chunkIndex * chunkSize * fontHeight * width * 4);
		}
		blinkOn = wasBlinkOn;

		return { width: width, height: height, data: data };
	};

	const getImageData = () => {
		return imageData;
	};

	const setImageData = (
		newColumnValue,
		newRowValue,
		newImageData,
		newIceColors,
		onProgress,
		onComplete,
	) => {
		editor.loadU16(newImageData, newColumnValue, newRowValue, newIceColors);
		columns = newColumnValue;
		rows = newRowValue;
		// Adopt the caller's array as the mirror
		imageData = newImageData;
		scheduleJournalKeyframe();
		createCanvases();
		updateTimer();

		redrawEntireImage(onProgress, () => {
			document.dispatchEvent(new CustomEvent('onOpenedFile'));
			if (onComplete) {
				onComplete();
			}
		});
	};

	/**
	 * Plane-native load for tnd/dur/envelope docs (content the u16 path
	 * cannot carry). The mirror becomes the lossy projection - the chunk
	 * fallback, collab packets, and the tools' classic16 reads quantize -
	 * while the GL renderer shows the planes faithfully.
	 */
	const setDocData = (sourceDoc, onComplete) => {
		editor.loadDoc(sourceDoc);
		columns = doc.getColumns();
		rows = doc.getRows();
		imageData = editor.toU16Lossy().imageData;
		// start every hex block this doc needs now, so scrolling and PNG
		// exports meet loaded glyphs instead of substitute boxes
		if (doc.glyphTable.size() > 256) {
			ensureHexPages().preload(doc.glyphTable.entries());
		}
		scheduleJournalKeyframe();
		createCanvases();
		updateTimer();
		if (onionSkin) {
			rebuildOnionPlanes();
		}
		redrawEntireImage(null, () => {
			document.dispatchEvent(new CustomEvent('onOpenedFile'));
			// the frame count may have changed (.dur / envelope imports)
			document.dispatchEvent(
				new CustomEvent('onFrameChange', {
					detail: { frame: 0, count: doc.frames.length },
					bubbles: true,
					cancelable: false,
				}),
			);
			if (onComplete) {
				onComplete();
			}
		});
	};

	const getColumns = () => {
		return columns;
	};

	const getRows = () => {
		return rows;
	};

	// --- document mutations live in the v3 editor core -------------------
	// (cell algebra: src/js/core/cellops.ts; stroke/undo: core/editor.ts;
	// identity vs the frozen v2 reference pinned by engineParity.test.js)

	const clear = () => {
		State.title = '';
		editor.clear(); // blank planes, history gone, ice back to default
		imageData = new Uint16Array(columns * rows);
		scheduleJournalKeyframe();
		updateTimer(); // Restart blink timer if needed
		redrawEntireImage();
	};

	const getMirrorX = x => editor.getMirrorX(x);

	const setMirrorMode = enabled => {
		editor.setMirrorMode(enabled);
	};

	const getMirrorMode = () => {
		return editor.getMirrorMode();
	};

	/**
	 * Single-cell write shim kept only for the exported surface. Writes
	 * without joining an undo group, mirroring none.
	 */
	const patchBufferAndEnqueueDirty = (
		index,
		charCode,
		foreground,
		background,
		x,
		y,
		_addToUndo = true,
	) => {
		editor.quickDrawU16([[index, ((charCode & 0xff) << 8) | ((background & 15) << 4) | (foreground & 15), x, y]]);
	};

	const getBlock = (x, y) => editor.getBlock(x, y);

	const getHalfBlock = (x, y) => editor.getHalfBlockAt(x, y);

	document.addEventListener('onLetterSpacingChange', onCriticalChange);
	document.addEventListener('onPaletteChange', onCriticalChange);
	document.addEventListener('onScaleFactorChange', onCriticalChange);

	// The ONE mapping (core/mapping.ts): hit-testing shares its formula
	// with drawing and the fuzz gates. Zoom is baked into the scaled
	// cell size the font reports; drags are clamped because pointer
	// capture keeps delivering moves after the pointer leaves the canvas.
	const mapPointToCell = (clientX, clientY, clamp) => {
		const cellWidth = State.font.getWidth();
		const cellHeight = State.font.getHeight();
		if (!(cellWidth > 0) || !(cellHeight > 0)) {
			// font swap in flight: skip the event rather than throw inside
			// a pointer handler
			return null;
		}
		const rect = canvasContainer.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		const cell = cellFromPoint(clientX, clientY, {
			cellWidth,
			cellHeight,
			originX: snapOrigin(rect.left, dpr),
			originY: snapOrigin(rect.top, dpr),
		});
		return clamp ? clampCell(cell, columns, rows) : cell;
	};

	createPointerInput(canvasContainer, {
		map: mapPointToCell,
		sample: (x, halfBlockY) => {
			if (State.sampleTool && State.sampleTool.sample) {
				State.sampleTool.sample(x, halfBlockY);
			}
		},
		undo: () => undo(),
		redo: () => redo(),
	});

	const sendDrawHistory = () => {
		State.network?.draw?.(drawHistory);
		drawHistory = [];
	};

	const undo = () => {
		if (editor.undo()) {
			processDirtyRegions();
			sendDrawHistory();
			scheduleJournalKeyframe();
			State.saveToLocalStorage();
		}
	};

	const redo = () => {
		if (editor.redo()) {
			processDirtyRegions();
			sendDrawHistory();
			scheduleJournalKeyframe();
			State.saveToLocalStorage();
		}
	};

	const startUndo = () => {
		editor.startUndo();
	};

	const drawEntryPoint = (callback, optimise) => {
		editor.drawBlocks(callback, optimise);
		processDirtyRegions();
		sendDrawHistory();
	};

	const drawHalfBlockEntryPoint = callback => {
		editor.drawHalfBlocks(callback);
		processDirtyRegions();
		sendDrawHistory();
	};

	const deleteArea = (x, y, width, height, background) => {
		editor.deleteArea(x, y, width, height, background);
		processDirtyRegions();
		sendDrawHistory();
	};

	const getArea = (x, y, width, height) => editor.getAreaU16(x, y, width, height);

	const setArea = (area, x, y) => {
		editor.setAreaU16(area, x, y);
		processDirtyRegions();
		sendDrawHistory();
	};

	// ---- frames API (timeline UI drives these) ----------------------
	// Collab sessions are single-frame by policy: no frame op exists in
	// the protocol, so navigation and structure changes refuse while
	// connected (the timeline UI says why).
	const framesLocked = () => State.network?.isConnected?.() === true;

	const setCurrentFrame = index => {
		if (framesLocked()) {
			return false;
		}
		return editor.setCurrentFrame(index);
	};

	const addFrame = options => {
		if (framesLocked()) {
			return -1;
		}
		const index = editor.addFrame(options);
		scheduleJournalKeyframe();
		State.saveToLocalStorage();
		document.dispatchEvent(
			new CustomEvent('onFrameChange', {
				detail: { frame: editor.getCurrentFrame(), count: doc.frames.length },
				bubbles: true,
				cancelable: false,
			}),
		);
		return index;
	};

	const removeFrame = index => {
		if (framesLocked() || doc.frames.length === 1) {
			return false;
		}
		editor.removeFrame(index); // fires onFrameChange -> remirror+repaint
		scheduleJournalKeyframe();
		State.saveToLocalStorage();
		return true;
	};

	const setFrameDelay = (index, delayMs) => {
		const frame = doc.frames[index];
		if (!frame) {
			return;
		}
		frame.delayMs = delayMs;
		scheduleJournalKeyframe();
	};

	const setOnionSkin = enabled => {
		onionSkin = enabled === true;
		if (onionSkin) {
			rebuildOnionPlanes();
		}
		redrawEntireImage();
	};

	// Network changes: repaint without entering undo or the draw history
	const quickDraw = blocks => {
		editor.quickDrawU16(blocks);
		processDirtyRegions();
	};

	/**
	 * Remote full-fidelity cells (collab extension suite): resolve
	 * codepoints exactly like paste does (cp437 identity first, hex font
	 * slots for the rest), then write the planes without undo/history.
	 * @param {{x: number, y: number, u: number, a: number, fg: number, bg: number}[]} cells
	 */
	const drawRemoteExtCells = async cells => {
		const unresolved = new Set();
		for (const cell of cells) {
			if (unicodeToCp437Strict(cell.u) === undefined) {
				unresolved.add(cell.u);
			}
		}
		const resolved =
			unresolved.size > 0 ? await resolveUnicode(unresolved) : new Map();
		// bounds re-check AFTER the await: a resize during the hex block
		// fetch must not misplace writes
		const writes = [];
		for (const cell of cells) {
			if (cell.x >= columns || cell.y >= rows) {
				continue;
			}
			const byte = unicodeToCp437Strict(cell.u);
			const glyphId = byte !== undefined ? byte : (resolved.get(cell.u) ?? 63);
			writes.push({
				index: cell.y * columns + cell.x,
				glyph: ((cell.a & 0xff) << 16) | (glyphId & 0xffff),
				fg: cell.fg,
				bg: cell.bg,
			});
		}
		if (writes.length > 0) {
			editor.quickDrawExt(writes);
			processDirtyRegions();
		}
	};


	const getDefaultFontName = () => magicNumbers.DEFAULT_FONT;

	const getCurrentFontName = () => currentFontName;

	const setXBFontData = (fontBytes, fontWidth, fontHeight) => {
		if (!fontWidth || fontWidth <= 0) {
			console.warn(
				`[Canvas] Invalid XB font width: ${fontWidth}, defaulting to ${magicNumbers.DEFAULT_FONT_WIDTH}px`,
			);
			fontWidth = magicNumbers.DEFAULT_FONT_WIDTH;
		}
		if (!fontHeight || fontHeight <= 0) {
			console.warn(
				`[Canvas] Invalid XB font height: ${fontHeight}, defaulting to ${magicNumbers.DEFAULT_FONT_HEIGHT}px`,
			);

			fontHeight = magicNumbers.DEFAULT_FONT_HEIGHT;
		}
		if (!fontBytes || fontBytes.length === 0) {
			console.error('[Canvas] No XB font data provided');
			return false;
		}

		xbFontData = {
			bytes: fontBytes,
			width: fontWidth,
			height: fontHeight,
		};
		scheduleJournalKeyframe();
		return true;
	};

	const setXBPaletteData = paletteBytes => {
		if (
			!paletteBytes ||
			!(paletteBytes instanceof Uint8Array) ||
			paletteBytes.length < 48
		) {
			console.error(
				`[Canvas] Invalid data sent to setXBPaletteData; Expected: Uint8Array of 48 bytes; Received: ${paletteBytes?.constructor?.name || 'null'} with length ${paletteBytes?.length || 0}`,
			);
			return;
		}
		// Convert XB palette (6-bit RGB values)
		const rgb6BitPalette = [];
		for (let i = 0; i < 16; i++) {
			const offset = i * 3;
			rgb6BitPalette.push([
				paletteBytes[offset],
				paletteBytes[offset + 1],
				paletteBytes[offset + 2],
			]);
		}
		State.palette = createPalette(rgb6BitPalette);

		// Force regeneration of font glyphs with new palette
		if (State.font && State.font.setLetterSpacing) {
			State.font.setLetterSpacing(State.font.getLetterSpacing());
		}
		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);
	};

	const clearXBData = callback => {
		xbFontData = null;
		scheduleJournalKeyframe();
		State.palette = createDefaultPalette();
		document.dispatchEvent(
			new CustomEvent('onPaletteChange', {
				detail: State.palette,
				bubbles: true,
				cancelable: false,
			}),
		);
		if (State.font && State.font.setLetterSpacing) {
			State.font.setLetterSpacing(State.font.getLetterSpacing());
		}
		if (callback) {
			callback();
		}
	};

	const getXBPaletteData = () => {
		if (!State.palette) {
			return null;
		}

		// Convert current palette to XB format (6-bit RGB values)
		const paletteBytes = new Uint8Array(48);
		for (let i = 0; i < 16; i++) {
			const rgba = State.palette.getRGBAColor(i);
			const offset = i * 3;
			// Convert and clamp 8-bit to 6-bit RGB values
			paletteBytes[offset] = Math.min(rgba[0] >> 2, 63);
			paletteBytes[offset + 1] = Math.min(rgba[1] >> 2, 63);
			paletteBytes[offset + 2] = Math.min(rgba[2] >> 2, 63);
		}
		return paletteBytes;
	};

	const getXBFontData = () => xbFontData;

	/**
	 * Undo persists in the OPFS journal only. Legacy IndexedDB autosaves
	 * restore their content; their undo stacks are deliberately dropped
	 * (see core/migrate.ts).
	 */
	/**
	 * Restore source for state.js: replay the autosave journal into v2
	 * shapes. Returns null when the journal is empty, unreadable, or
	 * holds a doc the u16 model cannot express yet (then the legacy
	 * IndexedDB snapshot is the fallback, and its restore re-seeds the
	 * journal through setImageData's keyframe trigger).
	 */
	const loadJournalSnapshot = async () => {
		try {
			const bytes = await journal.open();
			if (!bytes || bytes.length === 0) {
				return null;
			}
			const replay = await replayJournal(bytes);
			const u16 = v3ToU16(replay.doc);
			return {
				columns: u16.columns,
				rows: u16.rows,
				imageData: u16.imageData,
				iceColors: u16.iceColors,
				letterSpacing: u16.letterSpacing,
				fontBytes: replay.fontBytes,
				fontHeight: replay.fontHeight,
			};
		} catch (error) {
			console.warn('[Canvas] journal restore failed:', error);
			return null;
		}
	};

	const getUndoHistory = () => null;

	const setUndoHistory = _history => {};

	const loadXBFileSequential = (imageData, finalCallback) => {
		clearXBData(() => {
			if (imageData.paletteData) {
				setXBPaletteData(imageData.paletteData);
			}
			if (imageData.fontData) {
				const fontDataValid = setXBFontData(
					imageData.fontData.bytes,
					imageData.fontData.width,
					imageData.fontData.height,
				);
				if (fontDataValid) {
					setFont('XBIN', () => {
						finalCallback(
							imageData.columns,
							imageData.rows,
							imageData.data,
							imageData.iceColors,
							imageData.letterSpacing,
							imageData.fontName,
						);
					});
				} else {
					const fallbackFont = magicNumbers.DEFAULT_FONT;
					setFont(fallbackFont, () => {
						finalCallback(
							imageData.columns,
							imageData.rows,
							imageData.data,
							imageData.iceColors,
							imageData.letterSpacing,
							fallbackFont,
						);
					});
				}
			} else {
				const fallbackFont = magicNumbers.DEFAULT_FONT;
				setFont(fallbackFont, () => {
					finalCallback(
						imageData.columns,
						imageData.rows,
						imageData.data,
						imageData.iceColors,
						imageData.letterSpacing,
						fallbackFont,
					);
				});
			}
		});
	};

	setFont(currentFontName, _ => {
		callback();
	});

	/**
	 * Resolve codepoints outside CP437 to doc glyph ids for paste/import:
	 * picks a hex font slot per the v1 width policy and interns into the
	 * glyph table. null marks a codepoint that must substitute (no
	 * coverage, or wide/emoji/combining under single-width v1).
	 *
	 * @param {Iterable<number>} codepoints
	 * @returns {Promise<Map<number, number|null>>}
	 */
	const resolveUnicode = async codepoints => {
		const resolved = new Map();
		// collab lockout (visible in the charset UI): the vanilla Moebius
		// dialect cannot carry unicode cells, and an apply-locally sender
		// would silently diverge from every peer. The t0wnz extension
		// suite (ids 23+) lifts it: when the server negotiated the suite,
		// unicode cells travel natively and nothing substitutes.
		const locked =
			State.network?.isConnected?.() === true &&
			State.network?.extCollab?.() !== true;
		const unique = [...new Set(codepoints)];
		if (locked) {
			for (const codepoint of unique) {
				resolved.set(codepoint, null);
			}
			return resolved;
		}
		// slots resolve in parallel (block fetches dedupe inside the
		// pages manager); interning stays synchronous afterwards
		const slots = await Promise.all(
			unique.map(codepoint => ensureHexPages().pickSlot(codepoint)),
		);
		unique.forEach((codepoint, i) => {
			resolved.set(
				codepoint,
				slots[i] === null ? null : doc.glyphTable.idFor(slots[i], codepoint),
			);
		});
		return resolved;
	};

	return {
		resize: resize,
		redrawEntireImage: redrawEntireImage,
		getRendererId: () =>
			glRenderer ? 'webgl2-slack-buffer' : 'canvas2d-chunks',
		resolveUnicode: resolveUnicode,
		// preview-only (never interns); tri-state like glyphBits
		unicodeGlyphBits: (codepoint, fontW, fontH) =>
			ensureHexPages().previewBits(codepoint, fontW, fontH),
		setFont: setFont,
		getIceColors: getIceColors,
		setIceColors: setIceColors,
		getImage: getImage,
		getImageRGBA: getImageRGBA,
		getImageData: getImageData,
		setImageData: setImageData,
		setDocData: setDocData,
		getDoc: () => doc,
		getColumns: getColumns,
		getRows: getRows,
		clear: clear,
		draw: drawEntryPoint,
		getBlock: getBlock,
		getHalfBlock: getHalfBlock,
		drawHalfBlock: drawHalfBlockEntryPoint,
		startUndo: startUndo,
		undo: undo,
		redo: redo,
		getUndoHistory: getUndoHistory,
		setUndoHistory: setUndoHistory,
		deleteArea: deleteArea,
		getArea: getArea,
		setArea: setArea,
		quickDraw: quickDraw,
		drawRemoteExtCells: drawRemoteExtCells,
		getFrameCount: () => doc.frames.length,
		getCurrentFrame: () => editor.getCurrentFrame(),
		setCurrentFrame: setCurrentFrame,
		addFrame: addFrame,
		removeFrame: removeFrame,
		canAddFrame: () => doc.canAddFrame(),
		getFrameDelay: index => doc.frames[index]?.delayMs,
		setFrameDelay: setFrameDelay,
		getGlobalDelayMs: () => doc.getGlobalDelayMs(),
		setGlobalDelayMs: ms => {
			doc.setGlobalDelayMs(ms);
			scheduleJournalKeyframe();
		},
		setOnionSkin: setOnionSkin,
		getOnionSkin: () => onionSkin,
		getBaudOffsets: getBaudOffsets,
		setBaudReveal: setBaudReveal,
		loadJournalSnapshot: loadJournalSnapshot,
		journalKeyframe: scheduleJournalKeyframe,
		setMirrorMode: setMirrorMode,
		getMirrorMode: getMirrorMode,
		getMirrorX: getMirrorX,
		getCurrentFontName: getCurrentFontName,
		getDefaultFontName: getDefaultFontName,
		setXBFontData: setXBFontData,
		setXBPaletteData: setXBPaletteData,
		clearXBData: clearXBData,
		getXBPaletteData: getXBPaletteData,
		getXBFontData: getXBFontData,
		loadXBFileSequential: loadXBFileSequential,
		drawRegion: drawRegion,
		enqueueDirtyRegion: enqueueDirtyRegion,
		enqueueDirtyCell: enqueueDirtyCell,
		processDirtyRegions: processDirtyRegions,
		patchBufferAndEnqueueDirty: patchBufferAndEnqueueDirty,
		coalesceRegions: coalesceRegions,
	};
};
export { createTextArtCanvas };
export default { createTextArtCanvas };
