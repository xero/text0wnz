/**
 * Client-side undo history labels. Core strokes stay label-free (a
 * label in StrokeMeta would bump the T0WJ journal format and touch the
 * collab path), so this table mirrors the arena stroke by stroke: one
 * row per commit, truncated with the redo tail, evicted with the ring.
 * Tools with a better name than their rail id register it just before
 * they draw; everything else labels from the active tool.
 *
 * Typing groups at display level only: consecutive Type rows within
 * 2.5 seconds render as one step whose jump undoes them all.
 */
import State from './state.js';
import Toolbar from './toolbar.js';

const TYPE_GROUP_MS = 2500;

const TOOL_LABELS = {
	keyboard: 'Type',
	halfblock: 'Block brush',
	shadingBrush: 'Shading brush',
	asciiBrush: 'Ascii brush',
	characterBrush: 'Character brush',
	attrib: 'Color brush',
	fill: 'Fill',
	line: 'Line',
	square: 'Square',
	circle: 'Circle',
	selection: 'Selection edit',
	sample: 'Sample',
};

const ago = time => {
	const seconds = Math.floor((Date.now() - time) / 1000);
	if (seconds < 5) {
		return 'now';
	}
	if (seconds < 60) {
		return `${seconds}s`;
	}
	if (seconds < 3600) {
		return `${Math.floor(seconds / 60)}m`;
	}
	return `${Math.floor(seconds / 3600)}h`;
};

const createHistoryLabels = () => {
	const rows = [];
	// rows applied so far; everything above is the redo tail
	let cursor = 0;
	let pending = null;
	const listeners = new Set();

	const notify = () => {
		for (const listener of listeners) {
			listener();
		}
	};

	const fallbackLabel = () => {
		const tool = Toolbar.getCurrentTool();
		return TOOL_LABELS[tool] ?? 'Edit';
	};

	/** a menu or bar action names its stroke before it draws */
	const pend = label => {
		pending = label;
	};

	// strokes commit lazily at the NEXT flush point, so a row stamped at
	// commit time would wear the next stroke's tool and clock; the
	// snapshot is taken when the stroke opens instead
	let snapshot = null;
	const opened = () => {
		snapshot = { label: pending ?? fallbackLabel(), time: Date.now() };
		pending = null;
	};

	const committed = () => {
		rows.splice(cursor);
		if (snapshot) {
			rows.push(snapshot);
			snapshot = null;
			// pending stays: it belongs to the NEXT stroke, pended before
			// startUndo; the prior stroke's async flush used to wipe it
			// and the history row wore the previous tool's label
		} else {
			rows.push({ label: pending ?? fallbackLabel(), time: Date.now() });
			pending = null;
		}
		cursor = rows.length;
		notify();
	};

	const undone = () => {
		cursor = Math.max(0, cursor - 1);
		notify();
	};

	const redone = () => {
		cursor = Math.min(rows.length, cursor + 1);
		notify();
	};

	const redoCleared = () => {
		if (rows.length > cursor) {
			rows.splice(cursor);
			notify();
		}
	};

	const evicted = () => {
		if (rows.length) {
			rows.shift();
			cursor = Math.max(0, cursor - 1);
			notify();
		}
	};

	/**
	 * Display steps: step.at is the cursor position reached by jumping
	 * to it, so consecutive grouped Type rows share one step whose
	 * position is the group's last stroke.
	 */
	const steps = () => {
		const out = [];
		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			const last = out[out.length - 1];
			if (
				row.label === 'Type' &&
				last?.label === 'Type' &&
				row.time - last.time < TYPE_GROUP_MS &&
				// a group never straddles the undo cursor, or jumping to
				// the step could silently cross it
				last.at !== cursor
			) {
				last.at = i + 1;
				last.time = row.time;
				last.count++;
				continue;
			}
			out.push({ label: row.label, time: row.time, at: i + 1, count: 1 });
		}
		return out;
	};

	const jump = at => {
		const target = Math.max(0, Math.min(rows.length, at));
		// each call re-syncs cursor through undone/redone, so loop from
		// live state instead of a counted for
		let guard = rows.length + 1;
		while (cursor > target && guard-- > 0) {
			State.textArtCanvas.undo();
		}
		while (cursor < target && guard-- > 0) {
			State.textArtCanvas.redo();
		}
	};

	const render = listEl => {
		if (!listEl) {
			return;
		}
		listEl.replaceChildren();
		const addStep = (label, time, at, count) => {
			const item = document.createElement('BUTTON');
			item.type = 'button';
			item.className = 'historyStep';
			item.classList.toggle('current', at === cursor);
			item.classList.toggle('future', at > cursor);
			const name = document.createElement('SPAN');
			name.textContent = count > 1 ? `${label} x${count}` : label;
			item.appendChild(name);
			if (time) {
				const when = document.createElement('EM');
				when.textContent = ago(time);
				item.appendChild(when);
			}
			item.addEventListener('click', () => jump(at));
			listEl.appendChild(item);
		};
		addStep(`Opened ${State.title || 'canvas'}`, 0, 0, 1);
		for (const step of steps()) {
			addStep(step.label, step.time, step.at, step.count);
		}
		const current = listEl.querySelector('.current');
		if (current) {
			listEl.scrollTop =
				current.offsetTop - listEl.clientHeight / 2 + current.offsetHeight;
		}
	};

	const onChange = listener => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	};

	return {
		pend,
		opened,
		committed,
		undone,
		redone,
		redoCleared,
		evicted,
		steps,
		jump,
		render,
		onChange,
		depth: () => cursor,
		count: () => rows.length,
	};
};

export { createHistoryLabels };
export default { createHistoryLabels };
