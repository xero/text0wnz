/**
 * lha/lzh is the amiga packer, so those entries open the way the arena
 * browser opens them, latin-1 bytes in Topaz, while zip entries keep
 * the editor's cp437 defaults.
 */
import State from './state.js';
import { $ } from './ui.js';
import {
	makeSay,
	button,
	amigaImportHints,
	baseName,
	isOpenableName,
	isArchiveName,
} from './browserKit.js';
import {
	extractLhaEntry,
	extractZipEntry,
	readLhaEntries,
	readZipEntries,
} from '../core/index';

const isArchiveFile = file => isArchiveName(file.name);

const createArchiveOpener = ({ openFile }) => {
	const list = $('archiveList');
	const title = $('archiveTitle');
	const status = $('archiveStatus');
	if (!list) {
		return null;
	}
	const say = makeSay(status);

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
				isOpenableName(e.name));
		} catch (error) {
			fail(`could not read ${file.name}: ${error.message}`);
			return;
		}
		if (!entries.length) {
			fail(`nothing in ${file.name} opens in the editor`);
			return;
		}
		if (entries.length === 1) {
			// awaited so callers observe the whole open, not just the parse
			await openEntry(bytes, entries[0], isZip);
			return;
		}
		say(null);
		list.textContent = '';
		list.dataset.view = 'archive';
		list.scrollTop = 0;
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
