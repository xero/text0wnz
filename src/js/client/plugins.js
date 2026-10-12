/**
 * ES-module plugin surface (durdraw lineage): a plugin is
 * one ES module whose default export is { name, description?, run }.
 * run(api) receives a small stable surface over the current frame and
 * may be async. Writes buffer and apply as ONE undoable stroke when
 * run resolves; reads always see the document as it was when the
 * plugin started (documented contract, keeps the batch atomic).
 *
 * Loading is explicit user action only (a local .js file imported
 * through a blob: URL, or a typed URL), and the modal says plainly
 * that a plugin runs with full page access, like durdraw's warning.
 * Nothing loads automatically, nothing persists except the list of
 * URLs the user chose to keep.
 *
 * Example plugin:
 *   export default {
 *     name: 'invert',
 *     run(api) {
 *       for (let y = 0; y < api.rows; y++) {
 *         for (let x = 0; x < api.columns; x++) {
 *           const cell = api.get(x, y);
 *           api.put(x, y, cell.code, cell.bg & 15, cell.fg & 15);
 *         }
 *       }
 *     },
 *   };
 */
import State from './state.js';
import { $ } from './ui.js';

const STORAGE_KEY = 'pluginUrls';

/**
 * The stable surface a plugin's run() receives. Reads come from a
 * frozen snapshot; puts buffer and flush as one undoable batch.
 * @param {object} canvas State.textArtCanvas
 */
const createPluginApi = canvas => {
	const columns = canvas.getColumns();
	const rows = canvas.getRows();
	// snapshot reads so a plugin's gets are stable while it writes
	const before = new Map();
	const keyOf = (x, y) => y * columns + x;
	const inBounds = (x, y) =>
		Number.isInteger(x) &&
		Number.isInteger(y) &&
		x >= 0 &&
		y >= 0 &&
		x < columns &&
		y < rows;
	/** @type {Array<[number, number, number, number, number]>} */
	const writes = [];
	const api = {
		columns,
		rows,
		/** foreground/background of the UI strip, for palette-aware art */
		foreground: State.palette?.getForegroundColor?.() ?? 7,
		background: State.palette?.getBackgroundColor?.() ?? 0,
		/**
		 * @param {number} x @param {number} y
		 * @returns {{code: number, fg: number, bg: number}} the cell as
		 *   the document stood when the plugin started
		 */
		get: (x, y) => {
			if (!inBounds(x, y)) {
				return { code: 32, fg: 7, bg: 0 };
			}
			const key = keyOf(x, y);
			if (!before.has(key)) {
				const block = canvas.getBlock(x, y);
				before.set(key, {
					code: block.charCode,
					fg: block.foregroundColor ?? block.fg ?? 7,
					bg: block.backgroundColor ?? block.bg ?? 0,
				});
			}
			return { ...before.get(key) };
		},
		/**
		 * Buffer one cell write; glyph ids 0-255 are CP437, colors are
		 * classic 0-15 or full v3 color words. Flushes as one undo step.
		 */
		put: (x, y, code, fg, bg) => {
			if (inBounds(x, y) && Number.isInteger(code)) {
				// CP437 codes only: ids past 255 would bypass glyph-table
				// interning and reverse-map wrong on the collab wire
				writes.push([x, y, code & 0xff, fg >>> 0, bg >>> 0]);
			}
		},
	};
	const flush = () => {
		if (writes.length === 0) {
			return 0;
		}
		canvas.startUndo();
		canvas.draw(draw => {
			for (const [x, y, code, fg, bg] of writes) {
				draw(code, fg, bg, x, y);
			}
		}, false);
		return writes.length;
	};
	return { api, flush };
};

const validatePlugin = module => {
	const plugin = module?.default;
	if (
		!plugin ||
		typeof plugin !== 'object' ||
		typeof plugin.name !== 'string' ||
		typeof plugin.run !== 'function'
	) {
		throw new Error(
			'a plugin module must default-export { name, run(api) }',
		);
	}
	return plugin;
};

const createPluginManager = () => {
	const list = $('pluginList');
	const status = $('pluginStatus');
	if (!list) {
		return null;
	}
	/** @type {Array<{name: string, description: string, run: Function, origin: string}>} */
	const plugins = [];

	const say = text => {
		status.textContent = text ?? '';
		status.classList.toggle('hide', !text);
	};

	const savedUrls = () => {
		try {
			const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
			return Array.isArray(parsed)
				? parsed.filter(url => typeof url === 'string')
				: [];
		} catch {
			return [];
		}
	};

	const rememberUrl = url => {
		const urls = savedUrls();
		if (!urls.includes(url)) {
			urls.push(url);
			try {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(urls));
			} catch {
				// storage full/blocked: the plugin still runs this session
			}
		}
	};

	const render = () => {
		list.textContent = '';
		for (const plugin of plugins) {
			const row = document.createElement('div');
			row.className = 'pluginRow';
			const label = document.createElement('span');
			label.textContent = plugin.description
				? `${plugin.name} — ${plugin.description}`
				: plugin.name;
			const runButton = document.createElement('button');
			runButton.textContent = 'run';
			runButton.addEventListener('click', () => runPlugin(plugin));
			row.appendChild(runButton);
			row.appendChild(label);
			list.appendChild(row);
		}
		const remembered = savedUrls();
		if (remembered.length > 0 && plugins.length === 0) {
			for (const url of remembered) {
				const row = document.createElement('div');
				row.className = 'pluginRow';
				const loadButton = document.createElement('button');
				loadButton.textContent = 'load';
				loadButton.addEventListener('click', () => loadFromUrl(url));
				row.appendChild(loadButton);
				row.appendChild(
					Object.assign(document.createElement('span'), { textContent: url }),
				);
				list.appendChild(row);
			}
		}
	};

	const register = (plugin, origin) => {
		plugins.push({
			name: plugin.name,
			description:
				typeof plugin.description === 'string' ? plugin.description : '',
			run: plugin.run,
			origin,
		});
		say(null);
		render();
	};

	const runPlugin = async plugin => {
		say(`running ${plugin.name}...`);
		const { api, flush } = createPluginApi(State.textArtCanvas);
		try {
			await plugin.run(api);
			const cells = flush();
			say(`${plugin.name}: ${cells} cells written`);
		} catch (error) {
			console.error('[Plugins]', plugin.name, error);
			say(`${plugin.name} failed: ${error.message}`);
		}
	};

	const loadFromUrl = async url => {
		say(`loading ${url}...`);
		try {
			const module = await import(/* @vite-ignore */ url);
			register(validatePlugin(module), url);
			if (url.startsWith('http')) {
				rememberUrl(url);
			}
		} catch (error) {
			say(`load failed: ${error.message}`);
		}
	};

	const loadFromFile = async file => {
		const url = URL.createObjectURL(
			new Blob([await file.text()], { type: 'text/javascript' }),
		);
		try {
			const module = await import(/* @vite-ignore */ url);
			register(validatePlugin(module), file.name);
		} catch (error) {
			say(`load failed: ${error.message}`);
		} finally {
			URL.revokeObjectURL(url);
		}
	};

	$('pluginLoadFile')?.addEventListener('click', () => {
		$('pluginFileInput')?.click();
	});
	$('pluginFileInput')?.addEventListener('change', event => {
		const file = event.target.files?.[0];
		if (file) {
			loadFromFile(file);
			event.target.value = '';
		}
	});
	$('pluginLoadUrl')?.addEventListener('click', () => {
		const url = $('pluginUrlInput')?.value?.trim();
		if (url) {
			loadFromUrl(url);
		}
	});
	$('pluginClose')?.addEventListener('click', () => State.modal.close());

	const show = () => {
		State.modal.open('plugin');
		render();
	};

	return { show, loadFromUrl, loadFromFile, runPlugin, createPluginApi };
};

export { createPluginManager, createPluginApi, validatePlugin };
