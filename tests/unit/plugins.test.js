/**
 * Plugin surface (durdraw lineage): the run(api) contract (reads
 * snapshot the document at plugin start, writes buffer into ONE
 * undoable batch, bounds clamp), plus module-shape validation and
 * the manager's run/report flow.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	createPluginApi,
	createPluginManager,
	validatePlugin,
} from '../../src/js/client/plugins.js';
import State from '../../src/js/client/state.js';

vi.mock('../../src/js/client/state.js', () => ({
	default: {
		modal: { open: vi.fn(), close: vi.fn() },
		palette: {
			getForegroundColor: () => 7,
			getBackgroundColor: () => 0,
		},
		textArtCanvas: null,
	},
}));

const makeCanvas = () => {
	const cells = new Map();
	return {
		getColumns: () => 4,
		getRows: () => 2,
		// the u16 mirror the eager snapshot copies: blank = space on 7/0
		getImageData: () => new Uint16Array(8).fill((32 << 8) | 7),
		getBlock: vi.fn((x, y) => ({
			charCode: cells.get(`${x},${y}`)?.[0] ?? 32,
			foregroundColor: 7,
			backgroundColor: 0,
		})),
		startUndo: vi.fn(),
		draw: vi.fn((callback, _optimise) => {
			callback((code, fg, bg, x, y) => {
				cells.set(`${x},${y}`, [code, fg, bg]);
			});
		}),
		cells,
	};
};

describe('createPluginApi', () => {
	it('reads snapshot at start; writes flush as one batch', () => {
		const canvas = makeCanvas();
		const { api, flush } = createPluginApi(canvas);
		expect(api.columns).toBe(4);
		expect(api.get(1, 0).code).toBe(32);
		api.put(1, 0, 219, 4, 0);
		// the snapshot read is stable even after the put
		expect(api.get(1, 0).code).toBe(32);
		api.put(2, 0, 176, 0x800000c8, 0xff8800);
		expect(flush()).toBe(2);
		expect(canvas.startUndo).toHaveBeenCalledTimes(1);
		expect(canvas.draw).toHaveBeenCalledTimes(1);
		expect(canvas.cells.get('1,0')).toEqual([219, 4, 0]);
		expect(canvas.cells.get('2,0')).toEqual([176, 0x800000c8, 0xff8800]);
	});

	it('ignores out-of-bounds and junk writes; empty flush skips undo', () => {
		const canvas = makeCanvas();
		const { api, flush } = createPluginApi(canvas);
		api.put(-1, 0, 65, 7, 0);
		api.put(0, 9, 65, 7, 0);
		api.put(0.5, 0, 65, 7, 0);
		api.put(0, 0, 'A', 7, 0);
		expect(flush()).toBe(0);
		expect(canvas.startUndo).not.toHaveBeenCalled();
		expect(api.get(-5, 0)).toEqual({ code: 32, fg: 7, bg: 0 });
	});
});

describe('validatePlugin', () => {
	it('accepts { name, run } defaults and rejects everything else', () => {
		const good = { default: { name: 'x', run: () => {} } };
		expect(validatePlugin(good).name).toBe('x');
		expect(() => validatePlugin({})).toThrow(/default-export/);
		expect(() => validatePlugin({ default: { name: 'x' } })).toThrow();
		expect(() => validatePlugin({ default: { run: () => {} } })).toThrow();
	});
});

describe('plugin manager', () => {
	beforeEach(() => {
		document.body.innerHTML = `
			<div id="pluginList"></div>
			<p id="pluginStatus" class="hide"></p>
			<button id="pluginLoadFile"></button>
			<input id="pluginFileInput" type="file"/>
			<input id="pluginUrlInput" type="url"/>
			<button id="pluginLoadUrl"></button>
			<button id="pluginClose"></button>
		`;
		State.textArtCanvas = makeCanvas();
		localStorage.removeItem('pluginUrls');
	});

	it('runs a plugin against the live canvas and reports the write count', async () => {
		const manager = createPluginManager();
		await manager.runPlugin({
			name: 'stamp',
			run: api => {
				api.put(0, 0, 219, 1, 0);
				api.put(1, 0, 219, 2, 0);
			},
		});
		expect(document.getElementById('pluginStatus').textContent).toContain(
			'2 cells written',
		);
		expect(State.textArtCanvas.cells.size).toBe(2);
	});

	it('surfaces a plugin crash without writing anything', async () => {
		const manager = createPluginManager();
		await manager.runPlugin({
			name: 'boom',
			run: api => {
				api.put(0, 0, 219, 1, 0);
				throw new Error('nope');
			},
		});
		expect(document.getElementById('pluginStatus').textContent).toContain(
			'boom failed: nope',
		);
		expect(State.textArtCanvas.cells.size).toBe(0);
	});
});
