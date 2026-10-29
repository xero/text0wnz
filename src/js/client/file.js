import { encode as encodePng } from 'fast-png';
import State from './state.js';
import magicNumbers from './magicNumbers.js';
import { $, enforceMaxBytes } from './ui.js';
import {
	CodecError,
	decodeAns,
	decodeBin,
	decodeDur,
	decodeEnvelope,
	decodeTundra,
	encodeAnsimation,
	encodeDur,
	timelapseToDoc,
	encodeEnvelope,
	encodeTundra,
	encodeUtf8,
	describeIssue,
	lintDocForFormat,
	decodeXBin,
	encodeAns,
	encodeBin,
	encodeXBin,
	v3ToU16Lossy,
} from '../core/index';

// SAUCE §ANSiFlags round trip (sauceMetaWithFont): the AR bits and an
// LS "no preference" from an opened file survive a resave verbatim,
// never a forced AR 10 / LS 01 that rewrites author intent. An LS the
// artist touches after open writes the explicit bit instead. Module
// scope: the Load side stashes, the Save side reads.
let openedSauceFlags = null;
let lsTouchedSinceOpen = false;
// optional chain: test harnesses stub document with createElement only
document.addEventListener?.('onLetterSpacingChange', () => {
	lsTouchedSinceOpen = true;
});

// SAUCE §ANSiFlags, LS bits (flags >> 1): 10 forces 9px, 01 forces
// 8px, 00 or a missing record states no preference, so opens leave
// the session toggle alone (the appliers act on booleans only). Every
// loader maps flags through here; hand-collapsed bits force the toggle
// on files that state no preference
const lsFromSauceFlags = flags => {
	const bits = ((flags ?? 0) >> 1) & 0x03;
	if (bits === 2) {
		return true;
	}
	if (bits === 1) {
		return false;
	}
	return undefined;
};

// SAUCE §Layout note 6: a record of unknown version states no flags,
// so its file resaves like one without SAUCE
const flagsToStash = sauce => (sauce?.version === '00' ? sauce.flags : null);

// File New and other whole-doc replacements owe nothing to the last
// opened file's SAUCE flags
const resetSauceFlags = () => {
	openedSauceFlags = null;
	lsTouchedSinceOpen = false;
};

const loadModule = () => {
	/**
	 * The font an opened file should switch to, or null to keep the
	 * current one. The author's SAUCE record outranks everything. Most
	 * scene NFOs and DIZs carry no font in their SAUCE and were drawn in
	 * Topaz-437, so they fall back to it; an archive browser's hint beats
	 * that fallback (an amiga diz wants Topaz, not Topaz-437). XB files
	 * carry their own font and ignore both.
	 * @param {string} fileName
	 * @param {string | undefined} sauceFontName
	 * @param {string | undefined} hint
	 */
	const fontForFile = (fileName, sauceFontName, hint) => {
		const lower = fileName.toLowerCase();
		const ext = lower.split('.').pop();
		if (ext === 'xb' || ext === 'xbin') {
			return null;
		}
		const fromSauce = sauceToAppFont(sauceFontName?.trim());
		if (fromSauce) {
			return fromSauce;
		}
		if (hint) {
			return hint;
		}
		if (lower.endsWith('.nfo') || lower.endsWith('.diz')) {
			return magicNumbers.NFO_FONT;
		}
		return null;
	};

	const sauceToAppFont = sauceFontName => {
		if (!sauceFontName) {
			return null;
		}

		switch (sauceFontName) {
			case 'IBM VGA':
				return 'CP437 8x16';
			case 'IBM VGA50':
				return 'CP437 8x8';
			case 'IBM VGA25G':
				return 'CP437 8x19';
			case 'IBM EGA':
				return 'CP437 8x14';
			case 'IBM EGA43':
				return 'CP437 8x8';

			case 'IBM VGA 437':
				return 'CP437 8x16';
			case 'IBM VGA50 437':
				return 'CP437 8x8';
			case 'IBM VGA25G 437':
				return 'CP437 8x19';
			case 'IBM EGA 437':
				return 'CP437 8x14';
			case 'IBM EGA43 437':
				return 'CP437 8x8';

			case 'IBM VGA 850':
				return 'CP850 8x16';
			case 'IBM VGA50 850':
				return 'CP850 8x8';
			case 'IBM VGA25G 850':
				return 'CP850 8x19';
			case 'IBM EGA 850':
				return 'CP850 8x14';
			case 'IBM EGA43 850':
				return 'CP850 8x8';

			case 'IBM VGA 852':
				return 'CP852 8x16';
			case 'IBM VGA50 852':
				return 'CP852 8x8';
			case 'IBM VGA25G 852':
				return 'CP852 8x19';
			case 'IBM EGA 852':
				return 'CP852 8x14';
			case 'IBM EGA43 852':
				return 'CP852 8x8';

			case 'Amiga Topaz 1':
				return 'Topaz 500 8x16';
			case 'Amiga Topaz 1+':
				return 'Topaz+ 500 8x16';
			case 'Amiga Topaz 2':
				return 'Topaz 1200 8x16';
			case 'Amiga Topaz 2+':
				return 'Topaz+ 1200 8x16';
			case 'Amiga MicroKnight':
				return 'MicroKnight 8x16';
			case 'Amiga MicroKnight+':
				return 'MicroKnight+ 8x16';
			case 'Amiga P0T-NOoDLE':
				return 'P0t-NOoDLE 8x16';
			case 'Amiga mOsOul':
				return 'mO\'sOul 8x16';

			case 'C64 PETSCII unshifted':
				return 'C64 PETSCII unshifted 8x8';
			case 'C64 PETSCII shifted':
				return 'C64 PETSCII shifted 8x8';

			case 'TOPAZ_437':
			case 'Topaz-437':
			case 'Topaz_437':
			case 'Topaz 437':
				return 'Topaz-437 8x16';
			case 'Human Fossil':
			case 'NewSchool_hf':
				return 'Human Fossil 8x16';
			case 'Structures':
				return 'Structures 8x16';
			case 'TES-SYM5':
				return 'TES-SYM5 8x16';
			case 'TES-SYM6':
				return 'TES-SYM6 8x16';
			case 'Calce':
				return 'Calce 8x32';
			case 'FrogBlock':
				return 'FrogBlock 8x8';
			case 'Blobz+':
				return 'Blobz+ 8x16';
			case 'BLOODY':
				return 'BLOODY 8x16';
			case 'C64-DiskMaster':
				return 'C64-DiskMaster 8x16';
			case 'DSS8_2x':
				return 'DSS8 8x16';
			case 'DSS8':
				return 'DSS8 8x8';
			case 'FM-TOWNS_2x':
				return 'FM-TOWNS 8x16';
			case 'FM-TOWNSx':
				return 'FM-TOWNS 8x8';
			case 'Glitch':
				return 'Glitch 8x20';
			case 'GJSCI-X':
				return 'GJSCI-X 8x16';
			case 'Hack_2x':
				return 'Hack 8x16';
			case 'Hack':
				return 'Hack 8x8';
			case 'Line_2x':
				return 'Line 8x16';
			case 'Line':
				return 'Line 8x8';
			case 'Megaball':
				return 'Megaball 8x16';
			case 'NIMBUS':
				return 'NIMBUS 8x20';
			case 'p0t-noodle_2x':
				return 'p0t-noodle 8x20';
			case 'DOS-J700C-V':
				return 'DOS-J700C-V 8x19';
			case 'Perihelion':
				return 'Perihelion 8x16';
			case 'Song_Logo_2x':
				return 'Song_Logo 8x16';
			case 'Song_Logo':
				return 'Song_Logo 8x8';
			case 'Teletext_2x':
				return 'Teletext 8x18';
			case 'Teletext':
				return 'Teletext 8x9';
			case 'TES-GIGR':
				return 'TES-GIGR 8x16';
			case 'Zoids_2x':
				return 'Zoids 8x16';
			case 'Zoids 8x8':
				return 'Zoids 8x8';

			// XBin embedded font
			case 'XBIN':
				return 'XBIN';

			default:
				return null;
		}
	};

	const appToSauceFont = appFontName => {
		if (!appFontName) {
			return 'IBM VGA';
		}

		switch (appFontName) {
			case 'CP437 8x16':
				return 'IBM VGA';
			case 'CP437 8x8':
				return 'IBM VGA50';
			case 'CP437 8x19':
				return 'IBM VGA25G';
			case 'CP437 8x14':
				return 'IBM EGA';

			case 'CP850 8x16':
				return 'IBM VGA 850';
			case 'CP850 8x8':
				return 'IBM VGA50 850';
			case 'CP850 8x19':
				return 'IBM VGA25G 850';
			case 'CP850 8x14':
				return 'IBM EGA 850';

			case 'CP852 8x16':
				return 'IBM VGA 852';
			case 'CP852 8x8':
				return 'IBM VGA50 852';
			case 'CP852 8x19':
				return 'IBM VGA25G 852';
			case 'CP852 8x14':
				return 'IBM EGA 852';

			case 'Topaz 500 8x16':
				return 'Amiga Topaz 1';
			case 'Topaz+ 500 8x16':
				return 'Amiga Topaz 1+';
			case 'Topaz 1200 8x16':
				return 'Amiga Topaz 2';
			case 'Topaz+ 1200 8x16':
				return 'Amiga Topaz 2+';
			case 'MicroKnight 8x16':
				return 'Amiga MicroKnight';
			case 'MicroKnight+ 8x16':
				return 'Amiga MicroKnight+';
			case 'P0t-NOoDLE 8x16':
				return 'Amiga P0T-NOoDLE';
			case 'mO\'sOul 8x16':
				return 'Amiga mOsOul';

			case 'C64 PETSCII unshifted 8x8':
				return 'C64 PETSCII unshifted';
			case 'C64 PETSCII shifted 8x8':
				return 'C64 PETSCII shifted';

			case 'Topaz-437 8x16':
				return 'Topaz-437';
			case 'Human Fossil 8x16':
				return 'NewSchool_hf';
			case 'Structures 8x16':
				return 'Structures';
			case 'TES-SYM5 8x16':
				return 'TES-SYM5';
			case 'TES-SYM6 8x16':
				return 'TES-SYM6';
			case 'Calce 8x32':
				return 'Calce';
			case 'FrogBlock 8x8':
				return 'FrogBlock';
			case 'Blobz+ 8x16':
				return 'Blobz+';
			case 'BLOODY 8x16':
				return 'BLOODY';
			case 'C64-DiskMaster 8x16':
				return 'C64-DiskMaster';
			case 'DSS8 8x16':
				return 'DSS8_2x';
			case 'DSS8 8x8':
				return 'DSS8';
			case 'FM-TOWNS 8x16':
				return 'FM-TOWNS_2x';
			case 'FM-TOWNS 8x8':
				return 'FM-TOWNS';
			case 'Glitch 8x20':
				return 'Glitch';
			case 'GJSCI-X 8x16':
				return 'GJSCI-X';
			case 'Hack 8x16':
				return 'Hack_2x';
			case 'Hack 8x8':
				return 'Hack';
			case 'Line 8x16':
				return 'Line_2x';
			case 'Line 8x8':
				return 'Line';
			case 'Megaball 8x16':
				return 'Megaball';
			case 'NIMBUS 8x20':
				return 'NIMBUS';
			case 'p0t-noodle 8x20':
				return 'p0t-noodle_2x';
			case 'DOS-J700C-V 8x19':
				return 'DOS-J700C-V';
			case 'Perihelion 8x16':
				return 'Perihelion';
			case 'Song_Logo 8x16':
				return 'Song_Logo_2x';
			case 'Song_Logo 8x8':
				return 'Song_Logo';
			case 'Teletext 8x18':
				return 'Teletext_2x';
			case 'Teletext 8x9':
				return 'Teletext';
			case 'TES-GIGR 8x16':
				return 'TES-GIGR';
			case 'Zoids 8x16':
				return 'Zoids_2x';
			case 'Zoids 8x8':
				return 'Zoids';

			// XBin embedded font
			case 'XBIN':
				return 'XBIN';

			default:
				return 'IBM VGA';
		}
	};

	const checkUTF8 = file => file.endsWith('.utf8.ans') || file.endsWith('.txt');

	const updateSauceModal = (meta, sauceFlags = null) => {
		$('sauceTitle').value = meta.title || '';
		$('sauceGroup').value = meta.group || '';
		$('sauceAuthor').value = meta.author || '';
		$('sauceComments').value = meta.comments || '';
		openedSauceFlags = sauceFlags;
		lsTouchedSinceOpen = false;
		enforceMaxBytes();
	};

	const file = (file, callback, opts = {}) => {
		const reader = new FileReader();
		// a corrupt file must surface instead of silently eating the
		// callback: the caller holds load-state that would wedge
		const fail = error => {
			console.error('[Load] failed to parse file:', error);
			opts.onError?.(error);
		};
		// clearXBData fires its callback synchronously and drops the
		// returned promise, so async decoders need their own net or a
		// throw becomes an unhandled rejection fail never sees
		const guarded = fn => async () => {
			try {
				await fn();
			} catch (error) {
				fail(error);
			}
		};
		// load registers first: test harnesses treat listener zero as
		// the load handler
		reader.addEventListener('load', _e => {
			try {
				parse(new Uint8Array(reader.result));
			} catch (error) {
				fail(error);
			}
		});
		reader.addEventListener('error', () => fail(reader.error));
		// ANSI and BIN land alike: the doc rides the plane-native slot
		// so PabloDraw t colors reach the canvas, and the lossy u16 view
		// feeds legacy consumers
		const openSauced = result => {
			updateSauceModal(result.meta, flagsToStash(result.sauce));
			const u16 = v3ToU16Lossy(result.doc);
			callback(
				u16.columns,
				u16.rows,
				u16.imageData,
				u16.iceColors,
				lsFromSauceFlags(result.sauce?.flags),
				result.meta.fontName?.trim() || undefined,
				result.doc,
			);
		};
		const parse = data => {
			switch (file.name.split('.').pop().toLowerCase()) {
				case 'xb':
				case 'xbin': {
					// the doc rides the plane-native callback slot, and
					// 512-glyph fonts keep their bytes
					const result = decodeXBin(data);
					updateSauceModal(result.meta, flagsToStash(result.sauce));
					State.textArtCanvas.clearXBData(async () => {
						if (result.palette6) {
							State.textArtCanvas.setXBPaletteData(result.palette6);
						}
						if (result.fontBytes) {
							const fontValid = State.textArtCanvas.setXBFontData(
								result.fontBytes,
								8,
								result.fontHeight || 16,
							);
							if (fontValid) {
								await new Promise(resolve =>
									State.textArtCanvas.setFont('XBIN', resolve));
							}
						}
						document.dispatchEvent(new CustomEvent('onXBFontLoaded'));
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							undefined, // SAUCE §FileType: XBin flags are 0, no LS
							undefined,
							result.doc,
						);
					});
					break;
				}
				case 'bin':
					// clears any previous XB palette so it does not persist.
					// SAUCE §FileType: BinaryText carries ANSiFlags and a
					// FontName, so BIN joins the modal, the round-trip stash,
					// and font selection like ans
					State.textArtCanvas.clearXBData(() => openSauced(decodeBin(data)));
					break;
				case 'tnd':
					// TundraDraw: 24-bit colors ride the v3 planes; the lossy
					// u16 projection feeds legacy consumers
					State.textArtCanvas.clearXBData(() => {
						const result = decodeTundra(data);
						// SAUCE §FileType gives TundraDraw Flags 0, but the .tnd
						// writer stores ANSiFlags, so the stash round-trips them
						// like an .ans open would
						updateSauceModal(
							{
								title: result.meta.title,
								group: result.meta.group,
								author: result.meta.author,
								comments: result.meta.comments,
							},
							flagsToStash(result.sauce),
						);
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							lsFromSauceFlags(result.sauce?.flags),
							undefined,
							result.doc,
						);
					});
					break;
				case 'dur':
					State.textArtCanvas.clearXBData(guarded(async () => {
						const result = await decodeDur(data);
						updateSauceModal({
							title: result.meta.title,
							author: result.meta.author,
						});
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							undefined, // durdraw has no spacing concept
							undefined,
							result.doc,
						);
					}));
					break;
				case '0wnz':
					State.textArtCanvas.clearXBData(guarded(async () => {
						const result = await decodeEnvelope(data);
						if (result.fontBytes) {
							const fontValid = State.textArtCanvas.setXBFontData(
								result.fontBytes,
								8,
								result.fontHeight || 16,
							);
							if (fontValid) {
								await new Promise(resolve =>
									State.textArtCanvas.setFont('XBIN', resolve));
							}
						}
						updateSauceModal({
							title: result.meta.title,
							group: result.meta.group,
							author: result.meta.author,
							comments: result.meta.comments,
						});
						const u16 = v3ToU16Lossy(result.doc);
						callback(
							u16.columns,
							u16.rows,
							u16.imageData,
							u16.iceColors,
							u16.letterSpacing,
							undefined,
							result.doc,
						);
					}));
					break;
				case 'ans':
				case 'diz':
				case 'nfo':
				case 'txt':
				default:
					State.textArtCanvas.clearXBData(() => {
						let result;
						// callers that know the bytes are scene art (the
						// asciiarena browser mirrors the site's own decode
						// rule) skip the UTF-8 reader outright
						if (checkUTF8(file.name.toLowerCase()) && !opts.preferBytes) {
							try {
								// the core reader builds v3 planes natively (glyph
								// table, extended colors, LF after wrap)
								result = decodeAns(data, { utf8: true });
							} catch (error) {
								// invalid UTF-8 means raw scene bytes (amiga
								// latin-1 txt), not a broken file: fall through
								// to the CP437 read, where every byte is a glyph
								if (!(error instanceof CodecError)) {
									throw error;
								}
							}
						}
						openSauced(result ?? decodeAns(data));
					});
					break;
			}
		};
		reader.readAsArrayBuffer(file);
	};

	return {
		file: file,
		sauceToAppFont: sauceToAppFont,
		fontForFile,
		appToSauceFont: appToSauceFont,
		resetSauceFlags: resetSauceFlags,
	};
};

const Load = loadModule();

const saveModule = () => {
	const saveFile = async (bytes, sauce, filename) => {
		let outputBytes;
		if (sauce !== undefined) {
			outputBytes = new Uint8Array(bytes.length + 1 + sauce.length);
			outputBytes.set(bytes, 0);
			outputBytes[bytes.length] = 0x1a; // EOF marker / separator
			outputBytes.set(sauce, bytes.length + 1);
		} else {
			outputBytes = new Uint8Array(bytes.length);
			outputBytes.set(bytes, 0);
		}

		try {
			if ('showSaveFilePicker' in window) {
				const handle = await window.showSaveFilePicker({
					suggestedName: filename,
					types: [
						{
							description: 'Text Art',
							accept: {
								'application/octet-stream': [
									'.ans',
									'.bin',
									'.xb',
									'.diz',
									'.tnd',
									'.dur',
									'.0wnz',
								],
								'text/plain': ['.txt'],
								'image/png': ['.png'],
							},
						},
					],
				});
				const writable = await handle.createWritable();
				await writable.write(outputBytes);
				await writable.close();
			} else {
				const isSafari =
					navigator.userAgent.indexOf('Chrome') === -1 &&
					navigator.userAgent.indexOf('Safari') !== -1;
				if (isSafari) {
					let base64String = '';
					for (let i = 0; i < outputBytes.length; i += 1) {
						base64String += String.fromCharCode(outputBytes[i]);
					}
					const downloadLink = document.createElement('a');
					downloadLink.href =
						'data:application/octet-stream;base64,' + btoa(base64String);
					downloadLink.download = filename;
					downloadLink.click();
				} else {
					const downloadLink = document.createElement('a');
					const blob = new Blob([outputBytes], { type: 'application/octet-stream' });
					downloadLink.href = URL.createObjectURL(blob);
					downloadLink.download = filename;
					downloadLink.click();
					setTimeout(() => URL.revokeObjectURL(downloadLink.href), 100);
				}
			}
		} catch (error) {
			if (error.name === 'AbortError') {
				// user cancelled the picker
			} else {
				throw error;
			}
		}
	};

	// XBin always shows the export modal, because the RLE checkbox
	// lives there; with no modal infrastructure (unit tests, headless
	// embeds) every save proceeds silently
	const confirmExport = (format, label, { compressToggle = false } = {}) =>
		new Promise(resolve => {
			const modal = State.modal;
			const doc = State.textArtCanvas.getDoc?.();
			const report = doc
				? lintDocForFormat(doc, format)
				: { ok: true, issues: []};
			if ((report.ok && !compressToggle) || !modal?.open) {
				resolve({ proceed: true, compress: true });
				return;
			}
			$('exportFormatLabel').textContent = label;
			const list = $('exportIssues');
			list.replaceChildren();
			for (const issue of report.issues) {
				const item = document.createElement('li');
				item.textContent = describeIssue(issue);
				list.appendChild(item);
			}
			$('exportIssuesIntro').classList.toggle('hide', report.ok);
			$('exportCompressLabel').classList.toggle('hide', !compressToggle);
			let settled = false;
			const finish = proceed => {
				if (!settled) {
					settled = true;
					resolve({ proceed, compress: !!$('exportCompress').checked });
				}
			};
			const confirmOnce = () => {
				finish(true);
				modal.close();
			};
			const cancelOnce = () => {
				modal.close();
			};
			$('exportConfirm').addEventListener('click', confirmOnce);
			$('exportCancel').addEventListener('click', cancelOnce);
			modal.open('export');
			modal.onClose(() => {
				$('exportConfirm').removeEventListener('click', confirmOnce);
				$('exportCancel').removeEventListener('click', cancelOnce);
				finish(false);
			});
		});

	const ans = async () => {
		if (!(await confirmExport('ans', 'ANSi')).proceed) {
			return;
		}
		// lossy per the modal's warnings; 24-bit plane colors ride
		// PabloDraw t sequences over the SGR base
		const bytes = encodeAns(State.textArtCanvas.getDoc(), {
			lossy: true,
			frameIndex: State.textArtCanvas.getCurrentFrame?.() ?? 0,
			meta: sauceMetaWithFont(),
		});
		await saveFile(bytes, undefined, State.title + '.ans');
	};

	const utf8 = async () => {
		// the default ice presentation drops blink over extended
		// backgrounds; the lint names it, the artist decides.
		// utf8Blink skips the confirm: its writer keeps the attr
		if (!(await confirmExport('utf8', 'UTF-8 ANSi')).proceed) {
			return;
		}
		const bytes = encodeUtf8(State.textArtCanvas.getDoc(), { meta: sauceMeta() });
		await saveFile(bytes, undefined, State.title + '.utf8.ans');
	};

	const utf8Blink = async () => {
		const bytes = encodeUtf8(State.textArtCanvas.getDoc(), {
			blinkMode: 'blink',
			meta: sauceMeta(),
		});
		await saveFile(bytes, undefined, State.title + '.utf8.ans');
	};

	const plainText = async () => {
		if (!(await confirmExport('txt', 'Plain Text')).proceed) {
			return;
		}
		const bytes = encodeUtf8(State.textArtCanvas.getDoc(), { plain: true });
		await saveFile(bytes, undefined, State.title + '.txt');
	};

	const bin = async () => {
		if (!(await confirmExport('bin', 'Binary Text')).proceed) {
			return;
		}
		try {
			const bytes = encodeBin(State.textArtCanvas.getDoc(), {
				meta: sauceMetaWithFont(),
				frameIndex: State.textArtCanvas.getCurrentFrame?.() ?? 0,
			});
			await saveFile(bytes, undefined, State.title + '.bin');
		} catch (error) {
			if (error instanceof CodecError) {
				// a refused shape (odd or >510 width, the cell ceiling) must
				// not fail silently after the confirm
				alert(`BIN export failed: ${error.message}`);
				return;
			}
			throw error;
		}
	};

	const xb = async compress => {
		// programmatic escape hatch: only a real boolean skips the
		// export modal, because ui.js onClick hands menu clicks the
		// click event as the first argument
		if (typeof compress === 'boolean') {
			await writeXb(compress);
			return;
		}
		const choice = await confirmExport('xbin', 'XBin', { compressToggle: true });
		if (choice.proceed) {
			await writeXb(choice.compress);
		}
	};

	const writeXb = async (compress = true) => {
		// prefer the original embedded XB font bytes (full 512-glyph
		// fonts survive); the live font object only holds the 256
		// renderable glyphs
		const embeddedFont =
			State.textArtCanvas.getCurrentFontName() === 'XBIN'
				? State.textArtCanvas.getXBFontData?.()
				: null;
		const liveFontData = State.font.getData();
		const fontBytes =
			(embeddedFont && embeddedFont.bytes) ||
			(liveFontData && liveFontData.data) ||
			null;
		// header wants the UNSCALED glyph height; getHeight() is zoom-scaled
		const fontHeight =
			(embeddedFont && embeddedFont.height) ||
			(liveFontData && liveFontData.height) ||
			State.font.getHeight();
		try {
			const bytes = encodeXBin(State.textArtCanvas.getDoc(), {
				palette6: State.textArtCanvas.getXBPaletteData(),
				fontBytes: fontBytes,
				fontHeight: fontHeight,
				compress: compress,
				frameIndex: State.textArtCanvas.getCurrentFrame?.() ?? 0,
				meta: sauceMeta(),
			});
			await saveFile(bytes, undefined, State.title + '.xb');
		} catch (error) {
			if (error instanceof CodecError) {
				// the zoom-scaled getHeight fallback can hand the encoder a
				// height the header byte cannot hold; refuse loudly like bin
				alert(`XBin export failed: ${error.message}`);
				return;
			}
			throw error;
		}
	};

	const dataUrlToBytes = dataURL => {
		const base64Index = dataURL.indexOf(';base64,') + 8;
		const byteChars = atob(dataURL.slice(base64Index));
		const bytes = new Uint8Array(byteChars.length);
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] = byteChars.charCodeAt(i);
		}
		return bytes;
	};

	const sauceMeta = () => ({
		title: $('sauceTitle').value,
		group: $('sauceGroup').value,
		author: $('sauceAuthor').value,
		comments: $('sauceComments').value.trim() || undefined,
	});

	const sauceMetaWithFont = () => {
		const lsNoPreference =
			openedSauceFlags !== null &&
			((openedSauceFlags >> 1) & 0x03) === 0 &&
			!lsTouchedSinceOpen;
		return {
			...sauceMeta(),
			fontName:
				Load.appToSauceFont(State.textArtCanvas.getCurrentFontName()) ||
				undefined,
			aspect:
				openedSauceFlags !== null ? (openedSauceFlags >> 3) & 0x03 : 0,
			// the doc's spacing can predate the artist's toggle, so the
			// explicit bit reads the live font state instead
			letterSpacingMode: lsNoPreference
				? 0
				: State.font.getLetterSpacing()
					? 2
					: 1,
		};
	};

	const tnd = async () => {
		// the linter fronts what encodeTundra degrades (unicode glyphs
		// voice '?', blink drops, chars 1-6 blank): the artist decides first
		if (!(await confirmExport('tnd', 'TundraDraw')).proceed) {
			return;
		}
		// anything still throwing is a real failure the artist must see,
		// not a console whisper
		try {
			const bytes = encodeTundra(State.textArtCanvas.getDoc(), { meta: sauceMeta() });
			await saveFile(bytes, undefined, State.title + '.tnd');
		} catch (error) {
			console.error('[Save] tundra:', error);
			alert(`Tundra export failed: ${error.message}`);
		}
	};

	const ansimation = async () => {
		if (!(await confirmExport('ans', 'ANSimation')).proceed) {
			return;
		}
		const bytes = encodeAnsimation(State.textArtCanvas.getDoc(), { meta: sauceMeta() });
		await saveFile(bytes, undefined, State.title + '.ans');
	};

	const dur = async () => {
		const bytes = await encodeDur(State.textArtCanvas.getDoc(), sauceMeta());
		await saveFile(bytes, undefined, State.title + '.dur');
	};

	const timelapse = async () => {
		if (State.network?.extCollab?.() !== true) {
			alert(
				'Session timelapse needs a live collab session on a teXt0wnz server.',
			);
			return;
		}
		const payload = await State.network.requestTimelapse();
		if (!payload) {
			alert('The server did not answer the timelapse request.');
			return;
		}
		try {
			const { doc } = timelapseToDoc(payload);
			const bytes = await encodeDur(doc, sauceMeta());
			await saveFile(
				bytes,
				undefined,
				(State.title || 'session') + '.timelapse.dur',
			);
		} catch (error) {
			console.error('[Save] timelapse:', error);
			alert('Timelapse replay failed.');
		}
	};

	const ownz = async () => {
		const xbData = State.textArtCanvas.getXBFontData();
		const bytes = await encodeEnvelope(State.textArtCanvas.getDoc(), {
			meta: sauceMeta(),
			fontBytes: xbData ? xbData.bytes : null,
			fontHeight: xbData ? xbData.height : undefined,
		});
		await saveFile(bytes, undefined, State.title + '.0wnz');
	};

	const png = async () => {
		const fname = State.title;
		const fontWidth = State.font.getWidth();
		const fontHeight = State.font.getHeight();
		const width = State.textArtCanvas.getColumns() * fontWidth;
		const height = State.textArtCanvas.getRows() * fontHeight;
		if (width * height > magicNumbers.MAX_CANVAS_AREA) {
			// tall documents exceed the iOS Safari canvas area cap, so encode
			// from chunk strips without compositing one full-size canvas
			const image = State.textArtCanvas.getImageRGBA();
			await saveFile(
				encodePng({
					width: image.width,
					height: image.height,
					data: image.data,
					channels: 4,
				}),
				undefined,
				fname + '.png',
			);
		} else {
			await saveFile(
				dataUrlToBytes(State.textArtCanvas.getImage().toDataURL()),
				undefined,
				fname + '.png',
			);
		}
	};

	return {
		ans: ans,
		ansimation: ansimation,
		bin: bin,
		dur: dur,
		ownz: ownz,
		plainText: plainText,
		png: png,
		timelapse: timelapse,
		tnd: tnd,
		utf8: utf8,
		utf8Blink: utf8Blink,
		xb: xb,
	};
};
const Save = saveModule();

export { Load, Save };
export default { Load, Save };
