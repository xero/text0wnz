/**
 * Native archive opens: File > Open, drag-drop, and PWA file launches
 * can hand the editor a zip or an amiga lha/lzh colly. A lone openable
 * entry opens straight away; several raise the picker modal. Amiga
 * archives open the way the arena browser opens them, latin-1 bytes in
 * Topaz, while zip entries keep the editor's cp437 defaults.
 */
import State from './state.js';
import { $ } from './ui.js';
import { makeSay, button, amigaImportHints } from './browserKit.js';
import {
	extractLhaEntry,
	extractZipEntry,
	readLhaEntries,
	readZipEntries,
} from '../core/index';

const ARCHIVE = /\.(zip|lha|lzh)$/i;
/** every format Load.file decodes, plus the bare file_id */
const OPENABLE = /\.(ans|ansi|asc|diz|nfo|txt|utf8ans|bin|xb|xbin|tnd|dur|0wnz)$/i;

const baseName = name => name.split('/').pop();
const isOpenable = name =>
	OPENABLE.test(name) || (/^file_id$/i).test(baseName(name));

const isArchiveFile = file => ARCHIVE.test(file.name);

const createArchiveOpener = ({ openFile }) => {
	const list = $('archiveList');
	const title = $('archiveTitle');
	const status = $('archiveStatus');
	if (!list) {
		return null;
	}
	const say = makeSay(status);

	// errors land in the picker modal itself: the editor has no
	// free-standing error dialog
	const fail = message => {
		list.textContent = '';
		say(message, true);
		if (State.modal.current() !== 'archive') {
			State.modal.open('archive');
		}
	};

	const openEntry = async (bytes, entry, isZip) => {
		try {
			const data = isZip
				? await extractZipEntry(bytes, entry)
				: extractLhaEntry(bytes, entry);
			if (State.modal.current() === 'archive') {
				State.modal.close();
			}
			openFile(
				new File([data], baseName(entry.name)),
				isZip ? {} : amigaImportHints(data),
			);
		} catch (error) {
			say(`could not open ${baseName(entry.name)}: ${error.message}`, true);
			if (State.modal.current() !== 'archive') {
				State.modal.open('archive');
			}
		}
	};

	const open = async file => {
		title.textContent = file.name;
		const isZip = (/\.zip$/i).test(file.name);
		let bytes;
		let entries;
		try {
			bytes = new Uint8Array(await file.arrayBuffer());
			entries = (isZip ? readZipEntries : readLhaEntries)(bytes).filter(e =>
				isOpenable(e.name));
		} catch (error) {
			fail(`could not read ${file.name}: ${error.message}`);
			return;
		}
		if (!entries.length) {
			fail(`nothing in ${file.name} opens in the editor`);
			return;
		}
		if (entries.length === 1) {
			openEntry(bytes, entries[0], isZip);
			return;
		}
		say(null);
		list.textContent = '';
		list.dataset.view = 'archive';
		for (const entry of entries) {
			list.appendChild(
				button(baseName(entry.name), () => openEntry(bytes, entry, isZip)),
			);
		}
		State.modal.open('archive');
	};

	$('archiveClose')?.addEventListener('click', () => State.modal.close());

	return { open };
};

export { createArchiveOpener, isArchiveFile };
