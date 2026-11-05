import { describe, it, expect, vi } from 'vitest';
import { createHistoryLabels } from '../../src/js/client/historyLabels.js';

vi.mock('../../src/js/client/state.js', () => ({ default: {} }));
vi.mock('../../src/js/client/toolbar.js', () => ({ default: { getCurrentTool: vi.fn(() => 'keyboard') } }));

describe('history labels', () => {
	it('labels rows from the pend placed before the stroke opened', () => {
		const labels = createHistoryLabels();
		labels.pend('Fill');
		labels.opened();
		labels.committed();
		expect(labels.steps().map(s => s.label)).toEqual(['Fill']);
	});

	it('a pend for the NEXT stroke survives the prior flush commit', () => {
		const labels = createHistoryLabels();
		// stroke A opens with its own label and flushes lazily
		labels.pend('Shading brush');
		labels.opened();
		// the user already picked the next tool and pended its label
		// BEFORE A's async flush commits
		labels.pend('Fill');
		labels.committed(); // A's flush lands
		labels.opened(); // B opens: must wear 'Fill', not the fallback
		labels.committed();
		expect(labels.steps().map(s => s.label)).toEqual([
			'Shading brush',
			'Fill',
		]);
	});

	it('a commit with no snapshot still consumes its own pend', () => {
		const labels = createHistoryLabels();
		labels.pend('Selection edit');
		labels.committed(); // no opened(): pend is for THIS row
		labels.committed(); // next commit falls back to the tool label
		expect(labels.steps().map(s => s.label)).toEqual([
			'Selection edit',
			'Type',
		]);
	});

	it('a named commit leaves the open stroke its own label', () => {
		const labels = createHistoryLabels();
		labels.pend('Fill');
		labels.opened(); // the stroke opens, then a resize lands first
		labels.committed('Resize 100x30');
		labels.committed();
		expect(labels.steps().map(s => s.label)).toEqual(['Resize 100x30', 'Fill']);
	});

	it('a cleared history drops every row', () => {
		const labels = createHistoryLabels();
		const listener = vi.fn();
		labels.onChange(listener);
		labels.committed();
		labels.committed();
		labels.undone();
		labels.cleared();
		expect(labels.steps()).toEqual([]);
		expect(labels.depth()).toBe(0);
		expect(labels.count()).toBe(0);
		expect(listener).toHaveBeenCalledTimes(4);
	});
});
